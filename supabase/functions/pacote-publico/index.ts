// nTeam · pacote-publico
// Abre um pacote de documentos de obra a partir do link + código de 6 dígitos.
// Sem login: a proteção é o link secreto, o código, a validade, o bloqueio por tentativas
// e o encerramento manual. Os arquivos saem como URLs assinadas de 10 minutos. Atestados nunca entram.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORIGENS = new Set(["https://nteam.vercel.app"]);
const admin = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(origem: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origem && ORIGENS.has(origem) ? origem : "null",
    "Access-Control-Allow-Headers": "apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Cache-Control": "no-store",
  };
}
const resp = (status: number, corpo: unknown, origem: string | null) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(origem), "Content-Type": "application/json" } });

// Guarda só o prefixo do IP (LGPD).
function origemCurta(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.split(".").slice(0, 3).join(".") + ".x";
  if (ip.includes(":")) return ip.split(":").slice(0, 3).join(":") + "::x";
  return "desconhecida";
}

const MSG: Record<string, [number, string]> = {
  nao_encontrado: [404, "Link inválido. Confira o endereço recebido."],
  revogado: [410, "Este link foi encerrado por quem o compartilhou."],
  expirado: [410, "Este link venceu. Peça um novo a quem o compartilhou."],
  bloqueado: [429, "Muitas tentativas com código errado. Aguarde 15 minutos e tente de novo."],
  codigo: [401, "Código incorreto."],
};

Deno.serve(async (req) => {
  const origem = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origem) });
  if (req.method !== "POST") return resp(405, { ok: false, mensagem: "Método não permitido." }, origem);
  if (!origem || !ORIGENS.has(origem)) return resp(403, { ok: false, mensagem: "Origem não permitida." }, origem);

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return resp(400, { ok: false, mensagem: "Pedido inválido." }, origem); }
  const token = String(corpo.token || "").toLowerCase().slice(0, 64);
  const codigo = String(corpo.codigo || "").replace(/\D/g, "").slice(0, 6);

  try {
    const { data, error } = await admin.rpc("abrir_pacote", { p_token: token, p_codigo: codigo, p_origem: origemCurta(req) });
    if (error) throw error;
    const r = data as Record<string, unknown>;
    if (!r?.ok) {
      const [st, msg] = MSG[String(r?.erro)] || [400, "Não foi possível abrir o pacote."];
      return resp(st, { ok: false, erro: r?.erro, mensagem: msg, restantes: r?.restantes ?? null }, origem);
    }
    const itens = (r.itens as Array<Record<string, unknown>>) || [];
    const caminhos = itens.map((i) => String(i.caminho));
    const urls: Record<string, string> = {};
    for (let k = 0; k < caminhos.length; k += 100) {
      const lote = caminhos.slice(k, k + 100);
      const { data: s, error: es } = await admin.storage.from("documentos").createSignedUrls(lote, 600);
      if (es) throw es;
      for (const x of s || []) if (x.path && x.signedUrl) urls[x.path] = x.signedUrl;
    }
    const saida = itens.map((i) => ({
      colaborador: i.colaborador ?? null,
      categoria: i.categoria,
      documento: i.documento,
      mime: i.mime,
      tamanho: i.tamanho,
      validade: i.validade ?? null,
      url: urls[String(i.caminho)] || null,
    }));
    return resp(200, { ok: true, titulo: r.titulo, obra: r.obra, periodo: r.periodo, expira_em: r.expira_em, itens: saida }, origem);
  } catch (e) {
    console.error(JSON.stringify({ nivel: "erro", etapa: "abrir_pacote", detalhe: String((e as Error)?.message || e) }));
    return resp(500, { ok: false, mensagem: "Erro inesperado. Tente de novo em instantes." }, origem);
  }
});

// nTeam · gerir-acesso
// Cria acessos com senha temporária, redefine senha, desativa e reativa usuários.
// Só RH e Diretoria ativos. Perfil Diretoria só é concedido ou alterado pela Diretoria.
// Toda ação vai para a auditoria. Nenhuma senha é registrada em log ou auditoria.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Origens do app: domínios da Vercel do projeto nteam.
const ORIGEM_OK = (o: string | null) => !!o && (/^https:\/\/nteam[a-z0-9-]*\.vercel\.app$/.test(o));
const PERFIS = ["rh", "sst", "dir", "gestor", "enc"];
const NOME_PERFIL: Record<string, string> = { rh: "Analista de RH", sst: "Segurança do trabalho", dir: "Diretoria", gestor: "Gestor da obra", enc: "Encarregado de obra" };

const admin = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(origem: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": ORIGEM_OK(origem) ? origem! : "null",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const resp = (status: number, corpo: unknown, origem: string | null) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors(origem), "Content-Type": "application/json" } });
const erro = (status: number, codigo: string, mensagem: string, origem: string | null) => resp(status, { ok: false, erro: codigo, mensagem }, origem);

function senhaTemporaria(): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digitos = "23456789";
  const todos = letras + digitos;
  const buf = new Uint32Array(12);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < 12; i++) s += (i % 4 === 3 ? digitos : todos)[buf[i] % (i % 4 === 3 ? digitos.length : todos.length)];
  return s;
}

async function auditar(autor: { id: string; nome: string; perfil: string }, acao: string, evento: Record<string, unknown>) {
  const { error } = await admin.from("auditoria").insert({
    autor_id: autor.id, autor_nome: autor.nome, autor_perfil: autor.perfil,
    modulo: "Configurações · acessos", acao, evento: { acao, ...evento },
  });
  if (error) console.error(JSON.stringify({ nivel: "erro", etapa: "auditoria", acao, detalhe: error.message }));
}

Deno.serve(async (req) => {
  const origem = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origem) });
  if (req.method !== "POST") return erro(405, "metodo", "Método não permitido.", origem);

  // 1. Quem está chamando (token do usuário logado).
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: eu } = await admin.auth.getUser(token);
  if (eu || !u?.user) return erro(401, "sessao", "Sessão expirada. Entre novamente.", origem);
  const { data: eu2 } = await admin.from("perfis").select("user_id,nome,perfil,ativo").eq("user_id", u.user.id).maybeSingle();
  if (!eu2 || !eu2.ativo || !["rh", "dir"].includes(eu2.perfil)) return erro(403, "sem_permissao", "Só RH e Diretoria gerenciam acessos.", origem);
  const autor = { id: eu2.user_id, nome: eu2.nome, perfil: eu2.perfil };

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return erro(400, "corpo", "Pedido inválido.", origem); }
  const acao = String(corpo.acao || "");

  try {
    if (acao === "criar") {
      const email = String(corpo.email || "").trim().toLowerCase();
      const nome = String(corpo.nome || "").trim().slice(0, 120);
      const perfil = String(corpo.perfil || "");
      const obras = Array.isArray(corpo.obras) ? corpo.obras.map(String).filter((x) => /^[\w-]{1,40}$/.test(x)).slice(0, 50) : [];
      const pessoa_id = corpo.pessoa_id ? String(corpo.pessoa_id).slice(0, 60) : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return erro(400, "email", "Informe um e-mail válido.", origem);
      if (!nome) return erro(400, "nome", "Informe o nome.", origem);
      if (!PERFIS.includes(perfil)) return erro(400, "perfil", "Perfil inválido.", origem);
      if (perfil === "dir" && autor.perfil !== "dir") return erro(403, "so_diretoria", "Só a Diretoria cria acesso com perfil Diretoria.", origem);

      const senha = senhaTemporaria();
      const { data: novo, error: ec } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
      if (ec || !novo?.user) {
        const existe = /already|registered|exists/i.test(ec?.message || "");
        return erro(existe ? 409 : 500, existe ? "existe" : "auth", existe ? "Já existe um acesso com este e-mail." : "Não foi possível criar o acesso. Tente de novo.", origem);
      }
      const { error: ep } = await admin.from("perfis").insert({ user_id: novo.user.id, nome, email, perfil, obras, pessoa_id, criado_por: autor.id, trocar_senha: true });
      if (ep) {
        await admin.auth.admin.deleteUser(novo.user.id); // desfaz para não deixar conta sem perfil
        console.error(JSON.stringify({ nivel: "erro", etapa: "perfis.insert", detalhe: ep.message }));
        return erro(500, "perfil", "Não foi possível registrar o perfil. Nada foi criado.", origem);
      }
      const { error: et } = await admin.rpc("registrar_senha_temporaria", { p_user: novo.user.id });
      if (et) {
        await admin.auth.admin.deleteUser(novo.user.id); // desfaz: o perfil sai junto (cascade)
        console.error(JSON.stringify({ nivel: "erro", etapa: "registrar_senha_temporaria", detalhe: et.message }));
        return erro(500, "perfil", "Não foi possível concluir o acesso. Nada foi criado.", origem);
      }
      await auditar(autor, "Criou acesso", { alvo: email, nome, perfil: NOME_PERFIL[perfil], obras });
      return resp(200, { ok: true, user_id: novo.user.id, senha_temporaria: senha }, origem);
    }

    if (["redefinir", "desativar", "reativar"].includes(acao)) {
      const alvoId = String(corpo.user_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(alvoId)) return erro(400, "alvo", "Usuário inválido.", origem);
      if (alvoId === autor.id) return erro(400, "proprio", "Use “Trocar minha senha” para a sua conta; não é possível desativar a si mesmo.", origem);
      const { data: alvo } = await admin.from("perfis").select("user_id,email,nome,perfil,ativo,admin_total").eq("user_id", alvoId).maybeSingle();
      if (!alvo) return erro(404, "alvo", "Usuário não encontrado.", origem);
      if (alvo.perfil === "dir" && autor.perfil !== "dir") return erro(403, "so_diretoria", "Só a Diretoria altera contas da Diretoria.", origem);
      const { data: chamador } = await admin.from("perfis").select("admin_total").eq("user_id", autor.id).maybeSingle();
      if (alvo.admin_total && !chamador?.admin_total) return erro(403, "so_administrador", "Só o administrador total altera esta conta.", origem);

      if (acao === "redefinir") {
        const senha = senhaTemporaria();
        const { error } = await admin.auth.admin.updateUserById(alvoId, { password: senha });
        if (error) return erro(500, "auth", "Não foi possível redefinir a senha.", origem);
        const { error: et } = await admin.rpc("registrar_senha_temporaria", { p_user: alvoId });
        if (et) { console.error(JSON.stringify({ nivel: "erro", etapa: "registrar_senha_temporaria", detalhe: et.message })); return erro(500, "perfil", "A senha foi trocada, mas não foi possível exigir a troca no 1º acesso. Tente redefinir de novo.", origem); }
        await auditar(autor, "Redefiniu senha", { alvo: alvo.email, nome: alvo.nome });
        return resp(200, { ok: true, senha_temporaria: senha }, origem);
      }
      const ativo = acao === "reativar";
      const { error } = await admin.auth.admin.updateUserById(alvoId, { ban_duration: ativo ? "none" : "876000h" });
      if (error) return erro(500, "auth", "Não foi possível alterar o acesso.", origem);
      const { error: ea } = await admin.from("perfis").update({ ativo }).eq("user_id", alvoId);
      if (ea) {
        await admin.auth.admin.updateUserById(alvoId, { ban_duration: ativo ? "876000h" : "none" }); // desfaz para não divergir
        console.error(JSON.stringify({ nivel: "erro", etapa: "perfis.ativo", detalhe: ea.message }));
        return erro(500, "perfil", "Não foi possível alterar o acesso. Nada foi mudado.", origem);
      }
      await auditar(autor, ativo ? "Reativou acesso" : "Desativou acesso", { alvo: alvo.email, nome: alvo.nome });
      return resp(200, { ok: true }, origem);
    }
    return erro(400, "acao", "Ação desconhecida.", origem);
  } catch (e) {
    console.error(JSON.stringify({ nivel: "erro", acao, detalhe: String((e as Error)?.message || e) }));
    return erro(500, "interno", "Erro inesperado. Tente de novo.", origem);
  }
});

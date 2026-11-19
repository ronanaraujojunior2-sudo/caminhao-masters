// =====================================================================
// CAMINHÃO MASTERS — Edge Function "enviar-push" (OPCIONAL)
// Envia notificação push (celular/computador) sempre que uma linha é criada
// na tabela "notificacoes". Acionada por um Database Webhook do Supabase.
//
// Configuração (ver docs/MANUAL_IMPLANTACAO.md, etapa "Push"):
//   Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:ti@masters.com.br),
//            PUSH_WEBHOOK_SECRET (texto aleatório; o mesmo vai no cabeçalho do webhook)
//   "Verify JWT with legacy secret" = DESLIGADO.
// Sem esta função, as notificações continuam funcionando dentro do sistema
// (sino + contador) e como aviso do navegador enquanto o sistema está aberto.
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const URL_SB = Deno.env.get("SUPABASE_URL")!;
const SERVICE = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("CM_SERVICE_ROLE_KEY"))!;
const SEGREDO = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
const PUB = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const PRIV = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const SUBJ = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.invalid";

const admin = createClient(URL_SB, SERVICE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  if (!SEGREDO || req.headers.get("x-webhook-secret") !== SEGREDO) {
    return new Response("não autorizado", { status: 401 });
  }
  if (!PUB || !PRIV) return new Response("VAPID não configurado", { status: 503 });
  webpush.setVapidDetails(SUBJ, PUB, PRIV);

  const corpo = await req.json().catch(() => null);
  const n = corpo?.record;
  if (!n?.usuario_id) return new Response("ignorado", { status: 200 });

  const { data: inscricoes } = await admin.from("push_inscricoes").select("*").eq("usuario_id", n.usuario_id);
  const payload = JSON.stringify({ titulo: n.titulo, mensagem: n.mensagem ?? "", link: n.link ?? "#/notificacoes" });
  let enviados = 0;
  for (const s of inscricoes ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      enviados++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from("push_inscricoes").delete().eq("id", s.id); // aparelho desinscrito
      else console.error("push falhou", status);
    }
  }
  return new Response(JSON.stringify({ enviados }), { headers: { "Content-Type": "application/json" } });
});

// Gera web/js/config.js a partir das variáveis de ambiente.
// - Opcional: o config.js publicado já vem preenchido com a chave pública.
// - No computador: usa o arquivo .env, se existir.
// Uso: node scripts/gerar-config.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const arqEnv = new URL('../.env', import.meta.url);
const doArquivo = existsSync(arqEnv)
  ? Object.fromEntries(readFileSync(arqEnv, 'utf8').split(/\r?\n/).filter((l) => /^\s*[A-Z_]+=/.test(l))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
const v = (k) => (process.env[k] || doArquivo[k] || '').trim();
const cfg = { SUPABASE_URL: v('SUPABASE_URL'), SUPABASE_KEY: v('SUPABASE_KEY'),
  AUTH_EMAIL_DOMAIN: v('AUTH_EMAIL_DOMAIN') || 'caminhaomasters.local', VAPID_PUBLIC_KEY: v('VAPID_PUBLIC_KEY') };
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(cfg.SUPABASE_URL)) { console.error('ERRO: SUPABASE_URL ausente ou inválida (ex.: https://abcdefgh.supabase.co).'); process.exit(1); }
if (!cfg.SUPABASE_KEY) { console.error('ERRO: SUPABASE_KEY ausente.'); process.exit(1); }
if (/sb_secret_|service_role/i.test(cfg.SUPABASE_KEY)) { console.error('PERIGO: SUPABASE_KEY é a chave SECRETA. Use a Publishable key.'); process.exit(1); }
cfg.SUPABASE_URL = cfg.SUPABASE_URL.replace(/\/$/, '');
writeFileSync(new URL('../web/js/config.js', import.meta.url),
  `// Gerado automaticamente por scripts/gerar-config.mjs em ${new Date().toISOString()}\nexport const CONFIG = ${JSON.stringify(cfg, null, 2)};\n`);
console.log('OK: web/js/config.js gerado para', cfg.SUPABASE_URL);

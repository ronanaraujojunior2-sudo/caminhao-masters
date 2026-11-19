// Service Worker do Caminhão Masters: funciona offline e recebe notificações push.
// Ao publicar uma nova versão, aumente o número abaixo.
const VERSAO = 'cm-v1.4.0';
const ARQUIVOS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/tema.js', './js/abertura.js', './js/busca-obra.js', './js/lib/busca-texto.js', './js/app.js', './js/api.js', './js/ui.js', './js/sync.js', './js/config.js',
  './js/lib/regras.js', './js/lib/fila.js', './js/lib/xlsx.js', './js/lib/checklists.js',
  './js/paginas/login.js', './js/paginas/primeiro-acesso.js', './js/paginas/recuperar.js', './js/paginas/chave.js',
  './js/paginas/motorista.js', './js/paginas/agenda.js', './js/paginas/diario.js', './js/paginas/documentos.js',
  './js/paginas/notificacoes.js', './js/paginas/conta.js', './js/paginas/solicitar.js', './js/paginas/solicitacoes.js',
  './assets/icones/icone-192.png', './assets/caminhao-munck.svg', './assets/logo-masters.png',
  './js/paginas/diario-forms.js', './js/paginas/painel.js', './js/lib/checklists.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => Promise.allSettled(ARQUIVOS.map((a) => c.add(a)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;                 // dados: sempre do servidor
  const ehApp = url.origin === self.location.origin;
  if (ehApp) {
    // rede primeiro (pega atualizações); sem rede, usa a cópia guardada
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html'))));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((resp) => {
      const copia = resp.clone(); caches.open(VERSAO).then((c) => c.put(req, copia)); return resp;
    })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titulo: 'Caminhão Masters', mensagem: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Caminhão Masters', {
    body: d.mensagem || '', icon: 'assets/icones/icone-192.png', badge: 'assets/icones/icone-192.png',
    data: { link: d.link || '#/notificacoes' }, tag: d.link || undefined,
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = e.notification.data?.link || '#/notificacoes';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.focus(); c.postMessage({ link }); return; }
    return self.clients.openWindow('./index.html' + link);
  }));
});

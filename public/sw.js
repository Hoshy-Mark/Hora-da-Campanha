// Service worker mínimo — existe principalmente pra satisfazer o
// critério de instalabilidade do Chrome/Android (manifest + service
// worker registrado). Este app depende de conexão em tempo real com o
// Supabase pra funcionar de verdade (fichas, dados, mapa — nada disso
// faz sentido offline), então não tenta prometer uso sem internet — só
// evita uma tela de erro feia se a rede cair bem na hora de abrir,
// servindo a última versão do documento principal que conseguiu
// carregar. Não faz cache de JS/CSS (os nomes têm hash a cada build;
// cachear isso ficaria velho rápido e sem jeito fácil de invalidar).
const SHELL_CACHE = 'mesa-rpg-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

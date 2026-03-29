// ==================== SERVICE WORKER ====================
const CACHE_NAME = 'financeiro-pwa-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Recursos para cache imediato (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// Recursos externos para cache
const EXTERNAL_RESOURCES = [
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// ── INSTALL ──────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker...');
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      console.log('[SW] Cacheando App Shell');
      return cache.addAll(APP_SHELL);
    }).then(() => {
      // Cachear recursos externos separadamente (sem falhar o install se offline)
      return caches.open(DYNAMIC_CACHE).then(cache => {
        return Promise.allSettled(
          EXTERNAL_RESOURCES.map(url =>
            fetch(url).then(res => cache.put(url, res)).catch(() => {})
          )
        );
      });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Ativando Service Worker...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map(k => {
            console.log('[SW] Removendo cache antigo:', k);
            return caches.delete(k);
          })
      )
    )
  );
  self.clients.claim();
});

// ── FETCH ─────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requisições não-GET e Chrome extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Estratégia: Cache First para app shell, Network First para o resto
  if (APP_SHELL.some(path => request.url.endsWith(path.replace('./', '')))) {
    // Cache First para App Shell
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetchAndCache(request, STATIC_CACHE);
      })
    );
  } else if (EXTERNAL_RESOURCES.some(r => request.url.startsWith(r.split('?')[0]))) {
    // Cache First para libs externas (CDN)
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetchAndCache(request, DYNAMIC_CACHE);
      })
    );
  } else {
    // Network First para outros recursos
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});

function fetchAndCache(request, cacheName) {
  return fetch(request).then(response => {
    if (!response || response.status !== 200) return response;
    const clone = response.clone();
    caches.open(cacheName).then(cache => cache.put(request, clone));
    return response;
  });
}

// ── BACKGROUND SYNC ──────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-financeiro') {
    console.log('[SW] Background sync: financeiro');
    event.waitUntil(syncFinanceiro());
  }
});

async function syncFinanceiro() {
  // Notifica clientes sobre sincronização pendente
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ type: 'SYNC_TRIGGERED', tag: 'financeiro' });
  });
}

// ── PUSH NOTIFICATIONS ───────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'Nova notificação do Sistema Financeiro',
    icon: './icons/icon-192x192.png',
    badge: './icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: data
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'Financeiro', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('./')
  );
});

// ── MESSAGES ─────────────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

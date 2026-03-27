// Service Worker - Sistema Financeiro PWA
const CACHE_NAME = 'financeiro-pwa-v1.0.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia: Network First, depois Cache
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se a resposta é válida, clone e armazene no cache
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhar, busque do cache
        return caches.match(event.request).then(response => {
          if (response) {
            return response;
          }
          // Se não houver no cache, retorne página offline básica
          if (event.request.destination === 'document') {
            return caches.match('/');
          }
        });
      })
  );
});

// Sincronização em background
self.addEventListener('sync', event => {
  if (event.tag === 'sync-financeiro') {
    event.waitUntil(syncFinanceiro());
  }
});

async function syncFinanceiro() {
  try {
    const sheetUrl = await getSheetUrl();
    if (!sheetUrl) return;
    
    const dados = await getDadosLocais();
    
    await fetch(sheetUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        ...dados
      })
    });
    
    console.log('Sincronização em background concluída');
  } catch (error) {
    console.error('Erro na sincronização em background:', error);
  }
}

async function getSheetUrl() {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    const response = await client.postMessage({ type: 'GET_SHEET_URL' });
    if (response) return response;
  }
  return null;
}

async function getDadosLocais() {
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    const response = await client.postMessage({ type: 'GET_DADOS' });
    if (response) return response;
  }
  return {};
}

// Notificações Push (opcional)
self.addEventListener('push', event => {
  const options = {
    body: event.data ? event.data.text() : 'Nova notificação',
    icon: 'icon-192.png',
    badge: 'icon-72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Abrir App'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification('Sistema Financeiro', options)
  );
});

// Clique na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

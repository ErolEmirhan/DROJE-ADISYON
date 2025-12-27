// Service Worker - Cache kontrolü için
const CACHE_NAME = 'yakasgrill-admin-v2.4.8';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/patron.png',
  '/logo.png'
];

// Install event - Cache'e ekle
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker v2.4.8...');
  // Yeni service worker'ı hemen aktif et (beklemeden)
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Opened cache:', CACHE_NAME);
        // Cache'e ekle ama hata olsa bile devam et
        return cache.addAll(urlsToCache).catch((error) => {
          console.warn('[SW] Some files failed to cache:', error);
        });
      })
      .then(() => {
        // Cache işlemi tamamlandı, hemen aktif et
        return self.skipWaiting();
      })
  );
});

// Activate event - Eski cache'leri temizle
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker v2.4.8...');
  event.waitUntil(
    Promise.all([
      // Eski cache'leri temizle
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Tüm client'lara hemen kontrol et (beklemeden)
      self.clients.claim()
    ]).then(() => {
      // Tüm client'lara yeni versiyon mesajı gönder
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: '2.4.8',
            message: 'Yeni versiyon yüklendi! Sayfa yenileniyor...'
          });
        });
      });
    })
  );
});

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Sadece GET istekleri için cache kullan
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Network'ten başarılı yanıt geldi, cache'e ekle
        const responseToCache = response.clone();
        caches.open(CACHE_NAME)
          .then((cache) => {
            cache.put(event.request, responseToCache);
          });
        return response;
      })
      .catch(() => {
        // Network hatası, cache'den dene
        return caches.match(event.request)
          .then((response) => {
            if (response) {
              return response;
            }
            // Cache'de de yoksa, index.html döndür (SPA için)
            if (event.request.mode === 'navigate') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// Message event - Client'tan gelen mesajları dinle
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW] Cache cleared');
    });
  }
});


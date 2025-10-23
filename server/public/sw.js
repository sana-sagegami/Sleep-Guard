const CACHE_NAME = "classguard-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/app.js",
  "/styles.css",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// インストール時
self.addEventListener("install", (event) => {
  console.log("📦 Service Worker インストール");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("✅ キャッシュを開く");
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// アクティベーション時
self.addEventListener("activate", (event) => {
  console.log("🔄 Service Worker アクティベーション");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("🗑️ 古いキャッシュを削除:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

// フェッチ時（ネットワーク優先）
self.addEventListener("fetch", (event) => {
  // Socket.ioやAPIリクエストはキャッシュしない
  if (
    event.request.url.includes("/socket.io/") ||
    event.request.url.includes("/api/") ||
    event.request.method !== "GET"
  ) {
    return; // ネットワークに任せる
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // レスポンスをクローンしてキャッシュに保存
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return response;
      })
      .catch(() => {
        // ネットワークエラー時はキャッシュから取得
        return caches.match(event.request);
      })
  );
});

// 禾木纸管报价器 Service Worker — v3 超强缓存版
// 策略：安装时全量预缓存 → 缓存优先返回 → 后台静默更新（仅成功响应才写入缓存）

const CACHE_NAME = 'hemu-tube-calc-v3';
const ASSETS = [
  './',
  './index.html',
  './icon-192.png',
  './icon-512.png'
];

// ========== 安装：预缓存所有资源 ==========
self.addEventListener('install', (event) => {
  console.log('[SW v3] 开始预缓存...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW v3] 缓存失败（非致命）:', url, err.message);
          })
        )
      );
    }).then(() => {
      console.log('[SW v3] 预缓存完成，立即接管');
      return self.skipWaiting();
    })
  );
});

// ========== 激活：清理旧缓存，接管页面 ==========
self.addEventListener('activate', (event) => {
  console.log('[SW v3] 激活，清理旧缓存...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => {
          console.log('[SW v3] 删除旧缓存:', key);
          return caches.delete(key);
        })
      );
    }).then(() => {
      console.log('[SW v3] 已接管所有页面');
      return self.clients.claim();
    })
  );
});

// ========== 请求拦截：缓存优先 + 静默更新 ==========
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 对 sw.js 本身不做拦截，让浏览器用原生 HTTP 缓存
  if (event.request.url.includes('sw.js')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // 已有缓存：立即返回，后台静默更新
        fetch(event.request).then((resp) => {
          if (resp && resp.ok && resp.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, resp.clone());
            });
          }
        }).catch(() => { /* 静默失败 */ });
        return cached;
      }

      // 无缓存：尝试网络
      return fetch(event.request).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return resp;
      }).catch(() => {
        // 网络失败：尝试用 index.html 兜底
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html') || caches.match('./');
        }
        return new Response('', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// ========== 消息处理：支持手动刷新缓存 ==========
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      console.log('[SW v3] 缓存已手动清除');
    });
  }
});

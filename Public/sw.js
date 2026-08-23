const CACHE_NAME = "time-rule-v4.5";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./config.js",
    "./manifest.json",
    "./offline.html"
    "./resetTemplate.html",
    "./assets/brand-logo.png",
    "./assets/icon-192.png",
    "./assets/icon-512.png"
];

// Install
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activate
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// Fetch
self.addEventListener("fetch", event => {
    const request = event.request;

    // Only handle GET requests
    if (request.method !== "GET") return;

    event.respondWith(
        caches.match(request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(request)
                    .then(networkResponse => {

                        // Don't cache invalid responses
                        if (
                            !networkResponse ||
                            networkResponse.status !== 200 ||
                            networkResponse.type === "opaque"
                        ) {
                            return networkResponse;
                        }

                        const responseClone = networkResponse.clone();

                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(request, responseClone);
                        });

                        return networkResponse;
                    })
                    .catch(() => {
                        // Offline fallback for page navigation
                        if (request.mode === "navigate") {
                            return caches.match("./offline.html");
                        }

                        return new Response(
                            "You are offline.",
                            {
                                status: 503,
                                headers: {
                                    "Content-Type": "text/plain"
                                }
                            }
                        );
                    });
            })
    );
});

// ==========================================
// TIME & RULE - Service Worker (Cache + FCM)
// ==========================================

// Import Firebase compat scripts for background push handling
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase in Service Worker
firebase.initializeApp({
    apiKey: "AIzaSyAwU_sFlcbr-Rrf0eHRWepD2BzCSvgNoDw",
    authDomain: "projectsms-88bb1.firebaseapp.com",
    databaseURL: "projectsms-88bb1-default-rtdb.firebaseio.com",
    projectId: "projectsms-88bb1",
    storageBucket: "projectsms-88bb1.firebasestorage.app",
    messagingSenderId: "699855651165",
    appId: "1:699855651165:web:69e3cab86592fe3b2e68b4"
});

const messaging = firebase.messaging();

// Handle background push notifications when app is closed/in background
messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message: ', payload);
    const notificationTitle = payload.notification ? payload.notification.title : "TIME & RULE Alert";
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : "You have a new update.",
        icon: './assets/icon-192.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = "time-rule-v6.5";

const APP_SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./config.js",
    "./manifest.json",
    "./offline.html",
    "./resetTemplate.html",
    "./assets/brand-logo.png",
    "./assets/icon-192.png",
    "./assets/icon-512.png"
];

// Install Event
self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

// Activate Event
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

// Fetch Event
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

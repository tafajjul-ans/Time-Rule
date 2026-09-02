// ==========================================
// Firebase Messaging Service Worker
// ==========================================
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

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

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message: ', payload);
    const notificationTitle = payload.notification ? payload.notification.title : "TIME & RULE Alert";
    const notificationOptions = {
        body: payload.notification ? payload.notification.body : "You have a new update.",
        icon: './assets/icon-192.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});


// ==========================================
// TIME & RULE - Firebase Configuration & Initialization
// ==========================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js";

// Replace with your actual Firebase project credentials
const firebaseConfig = {
    apiKey: "AIzaSyAwU_sFlcbr-Rrf0eHRWepD2BzCSvgNoDw",
    authDomain: "projectsms-88bb1.firebaseapp.com",
    databaseURL: "https://projectsms-88bb1-default-rtdb.firebaseio.com",
    projectId: "projectsms-88bb1",
    storageBucket: "projectsms-88bb1.firebasestorage.app",
    messagingSenderId: "699855651165",
    appId: "1:699855651165:web:69e3cab86592fe3b2e68b4"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const messaging = getMessaging(app);

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// SUAS CHAVES AQUI
const firebaseConfig = {
    apiKey: "AIzaSyAL7KBIX-1FEWvHgyx0GZUGbgUBnsb70d0",
    authDomain: "fretefleet.firebaseapp.com",
    projectId: "fretefleet",
    storageBucket: "fretefleet.firebasestorage.app",
    messagingSenderId: "151487871880",
    appId: "1:151487871880:web:70bcc43d976f734961183d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
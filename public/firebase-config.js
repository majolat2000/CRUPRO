// firebase-config.js
// Firebase SDK loaded from CDN via ES modules
// This file initialises Firebase and exports shared instances.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

// TODO: Replace with your actual Firebase config from `npx -y firebase-tools@latest apps:sdkconfig`
const firebaseConfig = {
  apiKey: "PLACEHOLDER",
  authDomain: "cruprosite.firebaseapp.com",
  projectId: "cruprosite",
  storageBucket: "cruprosite.firebasestorage.app",
  messagingSenderId: "PLACEHOLDER",
  appId: "PLACEHOLDER"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyBKJLG1UQ9feOjIxoxEQwMRpCF31ghCNFs",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "agency-system-ae768.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "agency-system-ae768",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "agency-system-ae768.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "572019440450",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:572019440450:web:e999e6f815947767aee6db"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;


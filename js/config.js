// ============================================================
//  FIREBASE CONFIG — fill this in with your project's values
//  See README.md for step-by-step setup instructions
// ============================================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBd4kbtOuzL_G1lmk2o_gWe52ObHQk2JJA",
  authDomain: "book-scanner-1123a.firebaseapp.com",
  projectId: "book-scanner-1123a",
  storageBucket: "book-scanner-1123a.firebasestorage.app",
  messagingSenderId: "113188770883",
  appId: "1:113188770883:web:f45e6f0dff55dbf87fb0f6",
  measurementId: "G-VEN41YD3PX"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export default firebaseConfig;

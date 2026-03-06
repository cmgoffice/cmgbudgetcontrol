// @ts-nocheck
// Shared Firebase initialisation — imported by contexts and views.
// App.tsx imports from here too, so initializeApp is called only once.
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const USER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a",
  measurementId: "G-YSPY0MTZG1",
};

const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : USER_FIREBASE_CONFIG;

// Guard: only initialise once (HMR safe)
const firebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(firebaseApp);
export const db   = getFirestore(firebaseApp);
export const appId =
  typeof __app_id !== "undefined" ? __app_id : "cmg-budget-control-default";

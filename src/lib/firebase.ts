// @ts-nocheck
// Shared Firebase initialisation — imported by contexts and views.
// App.tsx imports from here too, so initializeApp is called only once.
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

// ถ้าลบ Storage bucket ไปแล้ว: ไปที่ Firebase Console → Storage → กด "Get started" หรือ "สร้าง bucket"
// จะได้ bucket ใหม่ (มักเป็น default ชื่อโปรเจกต์) แล้วแอปจะใช้ storageBucket ด้านล่างอัตโนมัติ
// ถ้าสร้าง bucket ชื่ออื่น ให้ใส่ URL bucket ตรง STORAGE_BUCKET_OVERRIDE (เช่น "cmg-budget-control.appspot.com")
const STORAGE_BUCKET_OVERRIDE = ""; // เช่น "cmg-budget-control.appspot.com" ถ้า bucket ใหม่คนละชื่อ

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
export const storage = STORAGE_BUCKET_OVERRIDE
  ? getStorage(firebaseApp, `gs://${STORAGE_BUCKET_OVERRIDE.replace(/^gs:\/\//, "")}`)
  : getStorage(firebaseApp);

/**
 * Storage Rules (Firebase Console → Storage → Rules):
 * ถ้า PO สร้างแล้วแต่ไม่มีไฟล์ PDF ใน Storage แปลว่ากฎอาจไม่อนุญาตให้เขียน
 * ใช้กฎตัวอย่างด้านล่าง (ให้ผู้ใช้ที่ล็อกอินแล้ว อ่าน/เขียน path ที่แอปใช้):
 *
 * rules_version = '2';
 * service firebase.storage {
 *   match /b/{bucket}/o {
 *     match /{allPaths=**} {
 *       allow read, write: if request.auth != null;
 *     }
 *   }
 * }
 *
 * หรือจำกัดเฉพาะ path: match /generated/{all=**}, /forms/{all=**}, /signatures/{all=**} { allow read, write: if request.auth != null; }
 */
export const FORM_TEMPLATE_PATHS = {
  pr: "forms/pr-form-lib.pdf",
  po: "forms/po-form-lib.pdf",
} as const;

export const appId =
  typeof __app_id !== "undefined" ? __app_id : "cmg-budget-control-default";

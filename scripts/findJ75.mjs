import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a",
  measurementId: "G-YSPY0MTZG1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = "cmg-budget-control-default";

async function run() {
  const projectsSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "projects"));
  projectsSnap.forEach(doc => {
    const data = doc.data();
    if (data.name?.includes('75') || data.jobNo?.includes('75') || doc.id.includes('75')) {
      console.log('Project:', doc.id, data.name, data.jobNo);
    }
  });
  process.exit(0);
}

run().catch(console.error);

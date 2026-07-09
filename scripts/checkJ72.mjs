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
  let j72Id = null;
  projectsSnap.forEach(doc => {
    const data = doc.data();
    if (data.name?.includes('J72') || data.jobNo === 'J72' || doc.id.includes('J72')) {
      j72Id = doc.id;
      console.log('Found J72:', j72Id, data.name, data.jobNo);
    }
  });

  if (!j72Id) return console.log('J72 not found');

  const budgetsSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "budgets"));
  const budgets007 = [];
  budgetsSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === j72Id && data.code === '007') {
         budgets007.push({id: doc.id, ...data});
     }
  });
  console.log('Budgets 007 count:', budgets007.length);

  const poSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "pos"));
  const pos = [];
  poSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === j72Id) pos.push({id: doc.id, ...data});
  });

  const invSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "invoices"));
  const invoices = [];
  invSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === j72Id) invoices.push({id: doc.id, ...data});
  });
  
  const paySnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "payments"));
  const payments = [];
  paySnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === j72Id) payments.push({id: doc.id, ...data});
  });
  
  console.log(`Found ${pos.length} POs, ${invoices.length} invoices, ${payments.length} payments`);

  // Analyze payments for 007
  let totalSp = 0;
  payments.forEach(p => {
     if (p.paymentType === 'SP') totalSp += Number(p.amount) || 0;
  });
  console.log('Total SP Payment amount for J72:', totalSp);
  
  // Try to find if there are payments linked to PRs in 007
  
  process.exit(0);
}

run().catch(console.error);

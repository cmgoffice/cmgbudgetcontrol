import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
  const j75Id = 'J-75';
  
  const budgetsSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "budgets"));
  const budgets004002 = [];
  budgetsSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === j75Id && data.code === '004002') {
         budgets004002.push({id: doc.id, ...data});
     }
  });
  
  console.log('Budgets 004002 count:', budgets004002.length);
  if (budgets004002.length > 0) {
      const b = budgets004002[0];
      console.log('Budget Amount:', b.amount);
      console.log('Balance:', b.balance);
      console.log('SubItems count:', (b.subItems || []).length);
      (b.subItems || []).forEach(sub => {
          console.log(`SubItem ${sub.name}: Qty ${sub.quantity}, Price ${sub.price}, Amount ${sub.amount}`);
      });
  }

  process.exit(0);
}

run().catch(console.error);

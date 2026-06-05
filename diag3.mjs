import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function main() {
  const prsRef = collection(db, "artifacts", "cmg-budget-control-default", "public", "data", "prs");
  const prsSnap = await getDocs(prsRef);
  const prs = prsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const budgetCode = "007011";
  const projectId = "J-01-2026-CMG Head office";
  const budgetId = "J-01-2026-CMG Head office-007011-GSB - ดอกเบี้ยจ่ายธนาคาร";
  
  const relatedPRs = prs.filter(pr => pr.projectId === projectId && pr.status !== "Rejected" && (pr.costCode === budgetCode || pr.budgetId === budgetId));

  console.log("=== All PRs related to 007011 ===");
  let total = 0;
  relatedPRs.forEach(pr => {
    let subtotal = 0;
    if (pr.items) {
       pr.items.forEach(i => subtotal += Number(i.amount || (i.price * i.quantity) || 0));
    }
    console.log(`PR No: ${pr.prNo}, Total: ${pr.totalAmount}, Subtotal Items: ${subtotal}, BudgetId: ${pr.budgetId}`);
    if (pr.items) {
      pr.items.forEach((i, idx) => {
         console.log(`  Item ${idx}: subItemId=${i.subItemId}, budgetSubItemId=${i.budgetSubItemId}, budgetId=${i.budgetId}`);
      });
    }
    total += Number(pr.totalAmount);
  });
  
  console.log(`\nTotal amount: ${total}`);
  process.exit(0);
}

main().catch(console.error);

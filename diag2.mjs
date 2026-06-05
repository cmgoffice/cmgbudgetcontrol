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

  const budgetId = "J-01-2026-CMG Head office-007011-GSB - ดอกเบี้ยจ่ายธนาคาร";
  
  const badPRs = prs.filter(pr => {
    if (pr.status === "Rejected") return false;
    if (!pr.items) return false;
    return pr.items.some(i => i.budgetId === budgetId && !i.budgetSubItemId && !i.subItemId);
  });

  console.log("=== PRs bound to Main ID (without sub-item) ===");
  badPRs.forEach(pr => {
    console.log(`PR No: ${pr.prNo}, Total: ${pr.totalAmount}, Status: ${pr.status}`);
  });
  
  const totalBad = badPRs.reduce((sum, pr) => sum + Number(pr.totalAmount || 0), 0);
  console.log(`\nTotal amount of these PRs: ${totalBad}`);
  process.exit(0);
}

main().catch(console.error);

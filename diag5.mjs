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

  const projectId = "J-01-2026-CMG Head office";
  const budgetDocId = "J-01-2026-CMG Head office-007011-GSB - ดอกเบี้ยจ่ายธนาคาร";
  const budgetCode = "007011";
  
  // This mimics itemBelongsToBudget
  const subItemIds = new Set([
     "c3b05735-d7c3-4ea9-9cb5-4f359814e989", // Jan
     "0812dcf8-629c-46e1-89f0-d233ac659d65", // Feb
     "4704da28-c833-4af2-873b-22ff356aa4d2", // Mar
     "66c28426-4858-47bc-b93b-6d78e2b7a1bc", // Apr
     // Assume others are not relevant or don't have PRs yet
  ]);

  let prTotal = 0;
  console.log("=== Matching PRs ===");
  prs.forEach(pr => {
    if (pr.projectId !== projectId) return;
    if (pr.status === "Rejected") return;
    if (!pr.items || pr.items.length === 0) return;

    // Check if any item matches
    let subtotal = 0;
    let includedItems = [];
    pr.items.forEach(item => {
        let isMatch = false;
        if (item.budgetId && item.budgetId === budgetDocId) isMatch = true;
        if (item.budgetSubItemId && subItemIds.has(item.budgetSubItemId)) isMatch = true;
        if (item.subItemId && subItemIds.has(item.subItemId)) isMatch = true;
        
        // DANGER FALLBACK
        if (Array.isArray(item.disPrAllocations) && item.disPrAllocations.length > 0) {
           item.disPrAllocations.forEach(alloc => {
               // ... simplified
               isMatch = true;
           });
        }
        
        if (isMatch) {
            const amt = Number(item.amount || (item.price * item.quantity) || 0);
            subtotal += amt;
            includedItems.push({desc: item.description, amt});
        }
    });

    if (subtotal > 0) {
        console.log(`PR No: ${pr.prNo}, Final Amount Added: ${subtotal}, Items: ${JSON.stringify(includedItems)}`);
        prTotal += subtotal; // Simplified (ignoring proportional discount for now)
    }
  });
  
  console.log(`\nTotal Calculated: ${prTotal}`);
  process.exit(0);
}

main().catch(console.error);

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    const env = {};
    lines.forEach((line) => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
    return env;
  } catch {
    return process.env;
  }
}
const env = loadEnv();
const firebaseConfig = {
  apiKey:            env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.REACT_APP_FIREBASE_APP_ID,
};
const APP_ID = env.REACT_APP_APP_ID || "cmg-budget-control-default";
const BUDGET_CODE = "007011";

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  
  const budgetsRef = collection(db, "artifacts", APP_ID, "public", "data", "budgets");
  const prsRef = collection(db, "artifacts", APP_ID, "public", "data", "prs");

  const budgetsSnap = await getDocs(budgetsRef);
  const budgets = budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.code === BUDGET_CODE);
  
  const prsSnap = await getDocs(prsRef);
  const prs = prsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const budget of budgets) {
    console.log(`Budget: ${budget.code} (ID: ${budget.id})`);
    console.log(`Amount: ${budget.amount}`);
    if (budget.subItems) {
      console.log(`SubItems:`);
      budget.subItems.forEach((s, idx) => console.log(`  ${idx+1}. ID: ${s.id}, Amt: ${s.amount || (s.quantity * s.unitPrice)}, Desc: ${s.description}`));
    }
    
    // Find PRs that have items linking to this budget or subitems
    let prTotal = 0;
    for (const pr of prs) {
      if (pr.status === "Rejected") continue;
      if (!pr.items || pr.items.length === 0) continue;
      
      let prItemTotalForBudget = 0;
      let linkedItems = [];
      pr.items.forEach((item, idx) => {
        let isLinked = false;
        if (item.budgetId === budget.id) isLinked = true;
        if (item.budgetSubItemId && budget.subItems && budget.subItems.find(s => s.id === item.budgetSubItemId)) isLinked = true;
        if (item.subItemId && budget.subItems && budget.subItems.find(s => s.id === item.subItemId)) isLinked = true;
        
        if (isLinked) {
            const amt = Number(item.amount || (Number(item.quantity||0) * Number(item.price||0)));
            prItemTotalForBudget += amt;
            linkedItems.push({
                idx,
                desc: item.description,
                amt,
                budgetId: item.budgetId,
                budgetSubItemId: item.budgetSubItemId,
                subItemId: item.subItemId
            });
        }
      });
      
      if (prItemTotalForBudget > 0) {
        console.log(`\n  PR: ${pr.prNo} (ID: ${pr.id})`);
        console.log(`  PR Status: ${pr.status}`);
        console.log(`  Linked PR Items:`);
        linkedItems.forEach(li => console.log(`    - [${li.idx}] ${li.desc}: ${li.amt} (budgetId: ${li.budgetId}, budgetSubItemId: ${li.budgetSubItemId}, subItemId: ${li.subItemId})`));
        
        // Calculate proportional discount like in BudgetView
        const prSubtotal = pr.items.reduce((s, i) => s + Number(i.amount || (Number(i.quantity||0) * Number(i.price||0))), 0);
        const itemRatio = prSubtotal > 0 ? prItemTotalForBudget / prSubtotal : 0;
        const discount = Number(pr.discount || 0);
        const proportionalDiscount = discount * itemRatio;
        const finalPrAmount = Math.max(0, prItemTotalForBudget - proportionalDiscount);
        
        console.log(`  => Subtotal for this PR: ${prItemTotalForBudget}, Discount: ${proportionalDiscount}, Final PR Amount: ${finalPrAmount}`);
        
        prTotal += finalPrAmount;
      }
    }
    console.log(`\n=> Calculated PR Total for budget ${budget.code}: ${prTotal}`);
  }

  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });

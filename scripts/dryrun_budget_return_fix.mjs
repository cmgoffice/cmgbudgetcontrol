import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  } catch (e) {
    console.warn("Could not load .env file, continuing with existing env vars");
  }
}
loadEnv();

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const appId = "cmg-budget-control-default";

async function main() {
  console.log("Starting dry-run for budget remediation...\n");
  
  const budgetsRef = collection(db, "artifacts", appId, "public", "data", "budgets");
  const snapshot = await getDocs(budgetsRef);
  
  let affectedBudgetsCount = 0;
  
  for (const docSnap of snapshot.docs) {
    const budget = docSnap.data();
    const notifications = budget.budgetReturnNotifications || [];
    
    // Find accepted notifications
    const acceptedNotifs = notifications.filter(n => n.status === "accepted");
    if (acceptedNotifs.length === 0) continue;
    
    let subItemRestores = {};
    let mainBudgetRestore = 0;
    
    for (const n of acceptedNotifs) {
      const amt = Number(n.amount || 0);
      if (amt <= 0) continue;
      
      if (n.subItemId) {
        subItemRestores[n.subItemId] = (subItemRestores[n.subItemId] || 0) + amt;
      } else {
        mainBudgetRestore += amt;
      }
    }
    
    if (Object.keys(subItemRestores).length === 0 && mainBudgetRestore === 0) continue;
    
    let needsFix = false;
    let proposedChanges = [];
    
    // Check Sub-items
    const subItems = budget.subItems || [];
    for (const sub of subItems) {
      if (subItemRestores[sub.id]) {
        const currentAmount = Number(sub.amount || 0);
        // We propose adding the returned amount back
        const newAmount = currentAmount + subItemRestores[sub.id];
        proposedChanges.push(`  - Sub-Item "${sub.description}" (ID: ${sub.id}):\n    Current Amount: ${currentAmount} -> Proposed New Amount: ${newAmount}`);
        needsFix = true;
      }
    }
    
    // Check Main Budget
    if (mainBudgetRestore > 0) {
      const currentMain = Number(budget.amount || 0);
      // The bug added the returned amount, so we propose subtracting it
      const newMain = currentMain - mainBudgetRestore;
      proposedChanges.push(`  - Main Budget Limit:\n    Current Amount: ${currentMain} -> Proposed New Amount: ${newMain}`);
      needsFix = true;
    }
    
    if (needsFix) {
      affectedBudgetsCount++;
      console.log(`====================================================`);
      console.log(`Budget ID: ${docSnap.id}`);
      console.log(`Project: ${budget.projectId}, Cost Code: ${budget.code}`);
      console.log(`Proposed Fixes:`);
      console.log(proposedChanges.join("\n"));
    }
  }
  
  console.log(`\n====================================================`);
  console.log(`Dry-run complete. Found ${affectedBudgetsCount} budgets affected by the bug.`);
  console.log(`No data was actually modified. Review the proposed changes above.`);
}

main().catch(console.error);

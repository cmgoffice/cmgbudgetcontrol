import { initializeApp } from "firebase/app";
import { initializeFirestore, collection, getDocs } from "firebase/firestore";
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
const BUDGET_CODE = "004002001";
const TARGET_DESC = "Pipe&Cables Supports";

async function main() {
  const app = initializeApp(firebaseConfig);
  // Force long polling to bypass gRPC/WebSocket errors in Node.js
  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  
  const budgetsRef = collection(db, "artifacts", APP_ID, "public", "data", "budgets");
  const prsRef = collection(db, "artifacts", APP_ID, "public", "data", "prs");

  console.log("Fetching budgets (with Long Polling)...");
  const budgetsSnap = await getDocs(budgetsRef);
  const budgets = budgetsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(b => b.code === BUDGET_CODE);
  
  let targetSubItemId = null;
  for (const budget of budgets) {
    console.log(`Budget Found: ${budget.code} (ID: ${budget.id}), Project: ${budget.projectId}`);
    if (budget.subItems) {
      budget.subItems.forEach((s) => {
        if (s.description === TARGET_DESC || s.description.includes("Pipe")) {
           console.log(`  -> SubItem ID: ${s.id}, Qty: ${s.quantity}, Price: ${s.unitPrice}, Desc: ${s.description}`);
           if (s.description === TARGET_DESC) {
               targetSubItemId = s.id;
           }
        }
      });
    }
  }

  console.log("\nFetching PRs...");
  const prsSnap = await getDocs(prsRef);
  const prs = prsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let totalPrAmount = 0;

  for (const pr of prs) {
    if (pr.status === "Rejected") continue;
    if (!pr.items || pr.items.length === 0) continue;
    
    let isLinked = false;
    let linkedItems = [];
    
    pr.items.forEach((item, idx) => {
      let matched = false;
      if (targetSubItemId && (item.subItemId === targetSubItemId || item.budgetSubItemId === targetSubItemId)) {
          matched = true;
      }
      if (item.costCode === BUDGET_CODE && item.description === TARGET_DESC) {
          matched = true;
      }
      
      if (matched) {
          isLinked = true;
          const amt = Number(item.amount || (Number(item.quantity||0) * Number(item.price||0)));
          linkedItems.push({
              idx,
              desc: item.description,
              qty: item.quantity,
              price: item.price,
              amt,
              costCode: item.costCode,
              subItemId: item.subItemId || item.budgetSubItemId
          });
      }
    });
    
    if (isLinked) {
      console.log(`\nFound PR: ${pr.prNo} (ID: ${pr.id})`);
      console.log(`  Project: ${pr.projectId}, Status: ${pr.status}, PR Total: ${pr.totalAmount || pr.amount}`);
      let prItemTotal = 0;
      linkedItems.forEach(li => {
          console.log(`  - Item [${li.idx}]: ${li.desc} (Qty: ${li.qty}, Price: ${li.price}) = ${li.amt}`);
          prItemTotal += li.amt;
      });
      totalPrAmount += prItemTotal;
    }
  }

  console.log(`\n=============================================`);
  console.log(`Total PR Amount Used for '${TARGET_DESC}': ${totalPrAmount}`);
  console.log(`=============================================`);

  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

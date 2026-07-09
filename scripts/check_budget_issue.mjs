import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc } from "firebase/firestore";
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
    console.warn("ไม่พบไฟล์ .env — ใช้ process.env แทน");
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

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log("APP_ID:", APP_ID);

  console.log("Fetching budgets...");
  const budgetsRef = collection(db, "budgets");
  const budgetsSnap = await getDocs(budgetsRef);
  let targetBudget = null;
  budgetsSnap.forEach(doc => {
    const data = doc.data();
    if (data.appId === APP_ID && data.code === "004002001") {
      targetBudget = { id: doc.id, ...data };
    }
  });

  if (!targetBudget) {
    console.log("Target budget not found.");
  } else {
    console.log("Budget Found:", targetBudget.id, targetBudget.code);
    console.log("Sub-items:");
    targetBudget.subItems?.forEach(sub => {
      if (sub.description === "Pipe&Cables Supports") {
        console.log("- ", sub);
      }
    });
  }

  console.log("\nFetching PRs...");
  const prsRef = collection(db, "prs");
  const prsSnap = await getDocs(prsRef);
  const relevantPrs = [];
  prsSnap.forEach(doc => {
    const data = doc.data();
    if (data.appId !== APP_ID) return;
    
    let isRelevant = false;
    let relevantItems = [];
    
    (data.items || []).forEach(item => {
      if (item.costCode === "004002001" || item.budgetId === targetBudget?.id || item.description === "Pipe&Cables Supports") {
         isRelevant = true;
         relevantItems.push(item);
      }
    });

    if (isRelevant) {
      relevantPrs.push({
        id: doc.id,
        prNo: data.prNo,
        status: data.status,
        items: relevantItems,
        total: data.total
      });
    }
  });

  console.log("Relevant PRs found:", relevantPrs.length);
  relevantPrs.forEach(pr => {
    console.log(`PR: ${pr.prNo} (Status: ${pr.status}), Total: ${pr.total}`);
    pr.items.forEach(item => {
       if (item.description === "Pipe&Cables Supports") {
          console.log(`  -> Item: ${item.description}, Qty: ${item.quantity}, Unit Price: ${item.unitPrice}, Amount: ${item.amount || (item.quantity*item.unitPrice)}`);
       }
    });
  });

  process.exit(0);
}

main().catch(console.error);

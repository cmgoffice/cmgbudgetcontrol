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

async function main() {
  const app = initializeApp(firebaseConfig);
  const db = initializeFirestore(app, { experimentalForceLongPolling: true });
  
  const prsRef = collection(db, "artifacts", APP_ID, "public", "data", "prs");
  const posRef = collection(db, "artifacts", APP_ID, "public", "data", "pos");

  const prsSnap = await getDocs(prsRef);
  const posSnap = await getDocs(posRef);

  const prs = prsSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(pr => pr.projectId === 'J-72');
  const pos = posSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(po => po.projectId === 'J-72');

  let prTotal = 0;
  for (const pr of prs) {
    if (pr.status === "Rejected") continue;
    let items = pr.items || [];
    for (const item of items) {
      if (item.costCode === "007001001" && item.description.includes("Addition Work")) {
        console.log("Found PR item in  ():  - ");
        prTotal += Number(item.amount || (item.quantity * item.price));
      }
    }
  }

  let poTotal = 0;
  for (const po of pos) {
    if (po.status === "Rejected") continue;
    let items = po.items || [];
    for (const item of items) {
      if (item.costCode === "007001001" && item.description.includes("Addition Work")) {
        console.log("Found PO item in  ():  - ");
        poTotal += Number(item.amount || (item.quantity * item.price));
      }
    }
  }

  console.log("Total PR: , Total PO: ");
  process.exit(0);
}
main().catch(console.error);

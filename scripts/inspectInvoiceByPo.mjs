import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";

const TARGET_PO = String(process.argv[2] || "PO26J01A-DC0014").trim();
const OLD_REPORT_IDS = new Set([
  "43nBpWhwnXZbxIH2EJry",
  "AjDDKtJjYSdxy9h4xx5R",
]);

function loadEnv() {
  const env = { ...process.env };
  try {
    const envText = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    envText.split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
      if (!match) return;
      const [, key, value] = match;
      if (env[key] === undefined) env[key] = value.replace(/^['"]|['"]$/g, "");
    });
  } catch {
    // Environment variables are sufficient when .env is not present.
  }
  return env;
}

const env = loadEnv();
const requiredConfig = {
  apiKey: env.REACT_APP_FIREBASE_API_KEY,
  authDomain: env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.REACT_APP_FIREBASE_APP_ID,
};

if (Object.values(requiredConfig).some((value) => !value)) {
  throw new Error("Missing REACT_APP_FIREBASE_* values in .env or environment.");
}

const app = initializeApp(requiredConfig);
const db = getFirestore(app);
const appId = env.REACT_APP_APP_ID || "cmg-budget-control-default";
const dataCollection = (name) => collection(db, "artifacts", appId, "public", "data", name);

const normalize = (value) => String(value || "").trim().toLowerCase();
const getPoNo = (invoice) => invoice?.poNo || invoice?.poRef || "";
const getAmount = (invoice) =>
  Number(invoice?.amount) ||
  Number(invoice?.invoiceQty || 0) * Number(invoice?.price || 0) ||
  0;
const isSpent = (invoice) =>
  ["paid", "invcredit"].includes(
    String(invoice?.status || invoice?.statusNow || "").trim().toLowerCase()
  );

function printInvoice(invoice, projectById, poByNo) {
  const projectId = invoice.projectId || poByNo.get(normalize(getPoNo(invoice)))?.projectId || "";
  const project = projectById.get(String(projectId));
  const displayProject = project
    ? [project.jobNo, project.name].filter(Boolean).join(" - ")
    : "-";
  console.log(
    [
      `  documentId=${invoice.id}`,
      `invNo=${invoice.invNo || invoice.invoiceNo || invoice.docNo || "-"}`,
      `poNo=${getPoNo(invoice) || "-"}`,
      `projectId=${projectId || "-"}`,
      `project=${displayProject}`,
      `status=${invoice.status || invoice.statusNow || "-"}`,
      `paymentType=${invoice.paymentType || "-"}`,
      `amount=${getAmount(invoice).toFixed(2)}`,
      `invDate=${invoice.invDate || invoice.receiveDate || "-"}`,
      `createdAt=${invoice.createdAt || "-"}`,
    ].join(" | ")
  );
}

async function run() {
  if (!TARGET_PO) throw new Error("Usage: node scripts\\inspectInvoiceByPo.mjs <PO_NO>");

  console.log(`Checking live Firestore data for PO: ${TARGET_PO}`);
  console.log(`Path: artifacts/${appId}/public/data/invoices`);

  const [invoiceSnap, projectSnap, poSnap] = await Promise.all([
    getDocs(dataCollection("invoices")),
    getDocs(dataCollection("projects")),
    getDocs(dataCollection("pos")),
  ]);

  if (invoiceSnap.metadata?.fromCache || projectSnap.metadata?.fromCache || poSnap.metadata?.fromCache) {
    throw new Error("Firestore returned cached/offline data. Inspection aborted; result is not live.");
  }

  const invoices = invoiceSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const projects = projectSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const pos = poSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const projectById = new Map(projects.map((project) => [String(project.id), project]));
  const poByNo = new Map(
    pos
      .map((po) => [normalize(po.poNo || po.paymentNo), po])
      .filter(([poNo]) => poNo)
  );
  const matches = invoices.filter((invoice) => normalize(getPoNo(invoice)) === normalize(TARGET_PO));
  const spentMatches = matches.filter(isSpent);

  console.log(`Live invoice documents scanned: ${invoices.length}`);
  console.log(`Exact PO matches: ${matches.length}`);
  console.log(`Spent matches (paid/Invcredit): ${spentMatches.length}`);
  matches.forEach((invoice) => printInvoice(invoice, projectById, poByNo));

  console.log("\nOld report IDs:");
  OLD_REPORT_IDS.forEach((id) => {
    const invoice = invoices.find((item) => item.id === id);
    console.log(`  ${id}: ${invoice ? "FOUND in live data" : "NOT FOUND in live data"}`);
    if (invoice) printInvoice(invoice, projectById, poByNo);
  });

  if (matches.length === 0) {
    console.log("\nConclusion: this PO has no exact match in the current live invoice collection.");
  } else if (spentMatches.length < 2) {
    console.log("\nConclusion: current live data does not show two spent invoices for this PO.");
  } else {
    console.log("\nConclusion: current live data has at least two spent invoices; compare documentId and projectId before any deletion.");
  }
  console.log("No data was changed.");
}

run().catch((error) => {
  console.error(`INSPECTION ABORTED: ${error?.message || error}`);
  process.exitCode = 1;
});

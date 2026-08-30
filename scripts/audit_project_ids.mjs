import { initializeApp } from "firebase/app";
import { collection, getDocsFromServer, getFirestore, terminate } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a",
  measurementId: "G-YSPY0MTZG1",
};

const appId = "cmg-budget-control-default";
const auditedCollections = ["prs", "pos", "invoices", "payments", "pays"];
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const basePath = ["artifacts", appId, "public", "data"];

const clean = (value) => typeof value === "string" ? value.trim() : "";

const displayNumber = (collectionName, data, id) => {
  const keysByCollection = {
    prs: ["prNo", "prNumber"],
    pos: ["poNo", "poNumber"],
    invoices: ["invoiceNo", "invNo"],
    payments: ["paymentNo"],
    pays: ["payNo", "paymentNo", "billingNo"],
  };
  for (const key of keysByCollection[collectionName] || []) {
    if (clean(data[key])) return clean(data[key]);
  }
  return id;
};

async function readCollection(name) {
  const snapshot = await getDocsFromServer(collection(db, ...basePath, name));
  return snapshot.docs.map((item) => ({ id: item.id, data: item.data() }));
}

async function run() {
  console.log("READ-ONLY audit: no Firestore documents will be changed.\n");

  const [projectDocs, ...businessGroups] = await Promise.all([
    readCollection("projects"),
    ...auditedCollections.map(readCollection),
  ]);

  const projectIds = new Set(projectDocs.map((item) => item.id));
  const projectAliases = new Map();
  for (const { id, data } of projectDocs) {
    for (const value of [id, data.jobNo, data.code, data.projectId]) {
      if (clean(value)) projectAliases.set(clean(value), id);
    }
  }

  const result = {
    auditedAt: new Date().toISOString(),
    firebaseProject: firebaseConfig.projectId,
    appId,
    firestoreWrites: 0,
    projectCount: projectDocs.length,
    summary: {},
    issues: [],
  };

  auditedCollections.forEach((collectionName, index) => {
    const documents = businessGroups[index];
    let valid = 0;
    let missing = 0;
    let unknown = 0;
    let aliasOnly = 0;

    for (const { id, data } of documents) {
      const projectId = clean(data.projectId);
      if (!projectId) {
        missing += 1;
        result.issues.push({
          collection: collectionName,
          id,
          documentNo: displayNumber(collectionName, data, id),
          issue: "missing_projectId",
        });
      } else if (projectIds.has(projectId)) {
        valid += 1;
      } else if (projectAliases.has(projectId)) {
        aliasOnly += 1;
        result.issues.push({
          collection: collectionName,
          id,
          documentNo: displayNumber(collectionName, data, id),
          issue: "projectId_is_alias_not_document_id",
          projectId,
          expectedProjectId: projectAliases.get(projectId),
        });
      } else {
        unknown += 1;
        result.issues.push({
          collection: collectionName,
          id,
          documentNo: displayNumber(collectionName, data, id),
          issue: "unknown_projectId",
          projectId,
        });
      }
    }

    result.summary[collectionName] = {
      total: documents.length,
      valid,
      missing,
      aliasOnly,
      unknown,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await terminate(db);
}

run().catch(async (error) => {
  console.error("Audit failed:", error?.code || error?.message || error);
  try { await terminate(db); } catch {}
  process.exitCode = 1;
});

// Run against the local Firestore emulator only; never production.
// java -jar <firestore-emulator.jar> --host 127.0.0.1 --port 8187
//   --project_id demo-payment-invoice --rules firestore.rules
// node scripts/verifyPaymentInvoiceRules.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const origin = "http://127.0.0.1:8187";
const project = "demo-payment-invoice";
const database = `projects/${project}/databases/(default)`;
const base = `${database}/documents/artifacts/test-app/public/data`;
const url = `${origin}/v1/${database}/documents`;
const encoded = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = `${encoded({ alg: "none", typ: "JWT" })}.${encoded({
  iss: `https://securetoken.google.com/${project}`, aud: project,
  sub: "invoice-staff", user_id: "invoice-staff", iat: now, exp: now + 3600,
  firebase: { sign_in_provider: "custom", identities: {} },
})}.`;
const field = (value) => typeof value === "string" ? { stringValue: value }
  : typeof value === "number" ? { integerValue: String(value) }
  : { arrayValue: { values: value.map(field) } };
const fields = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, field(value)]));
async function request(path, options = {}, auth = token) {
  const response = await fetch(`${origin}/v1/${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json();
  return { status: response.status, body };
}
async function seed(path, data) {
  const result = await request(`${base}/${path}`, { method: "PATCH", body: JSON.stringify({ fields: fields(data) }) }, "owner");
  assert.equal(result.status, 200, JSON.stringify(result.body));
}
await seed("users/invoice-staff", { role: "Staff", assignedProjectIds: ["J-72"] });
await seed("payments/local-payment", { projectId: "J-72", status: "Wait Pay", amount: 60000 });
await seed("payments/foreign-payment", { projectId: "J-99", status: "Wait Pay", amount: 60000 });
await seed("invoices/legacy-local", { projectId: "J-72", poId: "local-payment", amount: 60000, status: "Draft" });
await seed("invoices/legacy-foreign", { projectId: "J-99", poId: "foreign-payment", amount: 60000, status: "Draft" });
// Reset only this synthetic emulator Draft so this check is repeatable.
await request(`${base}/invoices/payment-invoice-local-payment`, { method: "DELETE" }, "owner");

assert.equal((await request(`${base}/invoices/payment-invoice-local-payment`)).status, 404);
assert.equal((await request(`${base}/invoices/payment-invoice-foreign-payment`)).status, 403);
assert.equal((await request(`${base}/invoices/payment-invoice-no-such-payment`)).status, 403);
assert.equal((await request(`${base}/invoices/arbitrary-missing`)).status, 403);
assert.equal((await request(`${base}/invoices/payment-invoice-local-payment`, {}, null)).status, 403);
assert.equal((await request(`${base}/invoices/legacy-local`)).status, 200);
assert.equal((await request(`${base}/invoices/legacy-foreign`)).status, 403);
console.log("PASS: missing Draft get scoped to authenticated users assigned to the parent Payment project; legacy read rules unchanged");

const invoiceName = `${base}/invoices/payment-invoice-local-payment`;
const transaction = await request(`${database}/documents:beginTransaction`, { method: "POST", body: "{}" });
assert.equal(transaction.status, 200, JSON.stringify(transaction.body));
const read = await request(`${database}/documents:batchGet`, {
  method: "POST", body: JSON.stringify({ documents: [invoiceName], transaction: transaction.body.transaction }),
});
assert.equal(read.status, 200, JSON.stringify(read.body));
const commit = await request(`${database}/documents:commit`, {
  method: "POST", body: JSON.stringify({ transaction: transaction.body.transaction, writes: [{
    update: { name: invoiceName, fields: fields({
      projectId: "J-72", sourceType: "payment", poId: "local-payment", paymentId: "local-payment", amount: 60000, status: "Draft",
    }) }, currentDocument: { exists: false },
  }] }),
});
assert.equal(commit.status, 200, JSON.stringify(commit.body));
assert.equal((await request(invoiceName)).status, 200);
console.log("PASS: Staff can read missing deterministic Draft and create it in a Firestore transaction");

const legacy = await request(`${base}/invoices/legacy-local`);
assert.equal(legacy.body.fields.amount.integerValue, "60000");
const payment = await request(`${base}/payments/local-payment`);
assert.equal(payment.body.fields.amount.integerValue, "60000");
console.log("PASS: legacy invoice and Payment values remain unchanged");

// Execute the actual TypeScript helper with two separate Firestore clients.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { initializeApp, deleteApp } = require("firebase/app");
const { getFirestore, connectFirestoreEmulator, terminate } = require("firebase/firestore");
const helperExports = {};
const visibilityExports = {};
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/lib/invoiceDuplicateVisibility.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
).outputText, { exports: visibilityExports });
vm.runInNewContext(ts.transpileModule(
  readFileSync(new URL("../src/lib/paymentInvoiceDraft.ts", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } },
).outputText, { require: (name) => name === "./invoiceDuplicateVisibility" ? visibilityExports : require(name), exports: helperExports });
await seed("payments/race-payment", { projectId: "J-72", status: "Wait Pay", amount: 60000 });
await request(`${base}/invoices/payment-invoice-race-payment`, { method: "DELETE" }, "owner");
const apps = ["draft-client-a", "draft-client-b"].map((name) => initializeApp({ projectId: project, apiKey: "emulator-key" }, name));
const clients = apps.map((app) => {
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8187, { mockUserToken: token });
  return db;
});
try {
  const payload = { projectId: "J-72", poId: "race-payment", paymentId: "race-payment", sourceType: "payment", status: "Draft", amount: 60000 };
  const ids = await Promise.all(clients.map((db) => helperExports.ensurePaymentInvoiceDraft(db, "test-app", payload)));
  assert.deepEqual(ids, ["payment-invoice-race-payment", "payment-invoice-race-payment"]);
  const lookup = await request(`${base}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "invoices" }], where: { fieldFilter: { field: { fieldPath: "poId" }, op: "EQUAL", value: field("race-payment") } },
  } }) }, "owner");
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.filter((row) => row.document).length, 1);
  await seed(`invoices/${ids[0]}`, { ...payload, status: "paid", amount: 60000, invNo: "SAVED-INVOICE" });
  assert.equal(await helperExports.ensurePaymentInvoiceDraft(clients[0], "test-app", { ...payload, amount: 99999 }), ids[0]);
  const persisted = await request(`${base}/invoices/${ids[0]}`);
  assert.equal(persisted.body.fields.status.stringValue, "paid");
  assert.equal(persisted.body.fields.amount.integerValue, "60000");
  assert.equal(persisted.body.fields.invNo.stringValue, "SAVED-INVOICE");
  console.log("PASS: actual helper with two concurrent clients creates one Draft and preserves a completed invoice on later calls");
  const hiddenFields = fields({ ...payload, amount: 60000 });
  hiddenFields.isDuplicateArchived = { booleanValue: true };
  hiddenFields.duplicateOfInvoiceId = field(ids[0]);
  const hidden = await request(`${base}/invoices/hidden-local`, { method: "PATCH", body: JSON.stringify({ fields: hiddenFields }) }, "owner");
  assert.equal(hidden.status, 200);
  assert.equal(await helperExports.ensurePaymentInvoiceDraft(clients[0], "test-app", payload), ids[0]);
  const restored = await request(`${base}/invoices/hidden-local?updateMask.fieldPaths=isDuplicateArchived`, {
    method: "PATCH", body: JSON.stringify({ fields: { isDuplicateArchived: { booleanValue: false } } }),
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.fields.status.stringValue, "Draft");
  assert.equal(restored.body.fields.amount.integerValue, "60000");
  assert.equal(restored.body.fields.duplicateOfInvoiceId.stringValue, ids[0]);
  assert.equal(restored.body.fields.isDuplicateArchived.booleanValue, false);
  console.log("PASS: hidden Draft is skipped for primary selection and restoring its flag preserves status, amount and primary reference");
} finally {
  await Promise.all(clients.map(terminate));
  await Promise.all(apps.map(deleteApp));
}
console.log(`Verified only synthetic emulator data at ${url}`);

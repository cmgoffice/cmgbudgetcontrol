// Only adds visibility metadata to the 20 reviewed Drafts. No delete/status/amount writes.
// Default = read-only preflight; --apply = explicit metadata-only atomic commit.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const cfg = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
const api = require(join(process.env.APPDATA, "npm/node_modules/firebase-tools/lib/api.js"));
const audit = JSON.parse(readFileSync("output/payment-invoice-audit-2026-10-05/audit.json", "utf8"));
const evidence = JSON.parse(readFileSync("output/payment-invoice-audit-2026-10-05/source-snapshots.json", "utf8"));
const groups = audit.groups.filter((g) => g.proposedKeepId && g.proposedArchiveIds.length);
const archiveIds = groups.flatMap((g) => g.proposedArchiveIds);
assert.equal(archiveIds.length, 20, "Reviewed plan must contain exactly 20 Drafts");
assert.equal(new Set(archiveIds).size, 20);
const protectedIds = [...new Set(groups.map((g) => g.proposedKeepId))];
assert(archiveIds.every((id) => !protectedIds.includes(id)));
const base = "projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data";
const origin = "https://firestore.googleapis.com/v1/";
let token = cfg.tokens.access_token;
async function request(path, body) {
  const r = await fetch(origin + path, { method: body ? "POST" : "GET", headers: {
    Authorization: `Bearer ${token}`, "Content-Type": "application/json",
  }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45000) });
  const data = await r.json();
  if (!r.ok) throw new Error(`Firestore ${r.status}: ${data.error?.message}`);
  return data;
}
const decode = (v) => "stringValue" in v ? v.stringValue : "integerValue" in v ? Number(v.integerValue)
  : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : "timestampValue" in v ? v.timestampValue
    : "nullValue" in v ? null : v.arrayValue ? (v.arrayValue.values || []).map(decode)
      : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])) : v;
const values = (d) => Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)]));
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
const same = (a, b) => assert.deepEqual(canonical(a), canonical(b));
async function docs(collection, ids) {
  const result = [];
  for (let i = 0; i < ids.length; i += 10) result.push(...await Promise.all(ids.slice(i, i + 10).map((id) => request(`${base}/${collection}/${id}`))));
  return new Map(result.map((d) => [d.name.split("/").pop(), d]));
}
async function query(collection, fields) {
  const result = await request(`${base}:runQuery`, { structuredQuery: { from: [{ collectionId: collection }],
    select: { fields: fields.map((fieldPath) => ({ fieldPath })) } } });
  return result.filter((r) => r.document).map((r) => r.document);
}
if (Number(cfg.tokens.expires_at) <= Date.now() + 60000) {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: api.clientId(), client_secret: api.clientSecret(), refresh_token: cfg.tokens.refresh_token, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20000) });
  const j = await r.json(); if (!r.ok) throw new Error(`OAuth ${r.status}`); token = j.access_token;
}
const current = await docs("invoices", [...archiveIds, ...protectedIds]);
const payments = await docs("payments", [...new Set(groups.map((g) => g.paymentId))]);
const rawById = new Map(evidence.invoices.map((d) => [d.id, d]));
for (const g of groups) for (const id of [g.proposedKeepId, ...g.proposedArchiveIds]) {
  const raw = current.get(id); const data = values(raw); const previous = rawById.get(id);
  assert.equal(raw.updateTime, previous._updateTime, `Invoice changed since audit: ${id}`);
  assert.equal(data.projectId, g.projectId);
  assert.equal(data.paymentId || data.poId, g.paymentId);
  assert.equal(Number(data.amount), Number(values(payments.get(g.paymentId)).amount));
  if (id === g.proposedKeepId) continue;
  assert.equal(data.status, "Draft"); assert(!data.statusNow || data.statusNow === "Draft");
  assert(!data.invNo && !data.invoiceNo && !data.isDeposit && !data.isDuplicateArchived);
  assert.equal((data.invoiceAttachments || []).length, 0);
}
const referenceFields = ["projectId", "invoiceIds", "invoiceId", "selectedInvoiceIds", "sourceInvoiceIds", "billingIds", "billings",
  "poRef", "poNo", "paymentId", "paymentNo", "sourceType", "amount", "status"];
const strings = (v) => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(strings)
  : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
const references = {};
for (const collection of ["billings", "pays", "receives"]) {
  references[collection] = await query(collection, referenceFields);
  for (const raw of references[collection]) {
    const data = values(raw); const refs = new Set(strings(data));
    assert(!archiveIds.some((id) => refs.has(id)), `New ${collection} reference to duplicate Draft`);
    assert(!groups.some((g) => data.projectId === g.projectId && (refs.has(g.paymentId) || refs.has(g.paymentNo))), `New ${collection} reference to Payment`);
  }
}
const financeFields = ["projectId", "amount", "status", "statusNow", "poId", "paymentId"];
const financeBefore = await query("invoices", financeFields);
const when = new Date().toISOString();
const output = resolve(`output/duplicate-visibility-2026-10-05/${when.replace(/[:.]/g, "-")}`);
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "backup-before.json"), JSON.stringify({ when, invoices: [...current.values()], payments: [...payments.values()], references, financeBefore }, null, 2));
const metadata = ["isDuplicateArchived", "duplicateOfInvoiceId", "duplicateArchivedAt", "duplicateArchivedBy", "duplicateArchivedReason"];
const writes = groups.flatMap((g) => g.proposedArchiveIds.map((id) => ({ update: { name: current.get(id).name, fields: {
  isDuplicateArchived: { booleanValue: true }, duplicateOfInvoiceId: { stringValue: g.proposedKeepId },
  duplicateArchivedAt: { stringValue: when }, duplicateArchivedBy: { stringValue: cfg.user.email },
  duplicateArchivedReason: { stringValue: "ซ่อน Draft ซ้ำจาก Payment เดียวกันตามผลตรวจ 5 ต.ค. 2569; คงสถานะ ยอด รายการ และไฟล์แนบเดิม" },
} }, updateMask: { fieldPaths: metadata }, currentDocument: { updateTime: current.get(id).updateTime } })));
writeFileSync(join(output, "reviewed-write-plan.json"), JSON.stringify({ archiveIds, protectedIds, writes }, null, 2));
console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "apply" : "preflight-read-only", output,
  metadataOnlyTargets: writes.length, protectedInvoices: protectedIds.length, invoiceCountBefore: financeBefore.length, backupCreated: true }));
if (process.argv.includes("--apply")) {
  assert(writes.every((w) => w.updateMask.fieldPaths.every((f) => metadata.includes(f)) && !w.delete && !w.transform));
  const result = await request("projects/cmg-budget-control/databases/(default)/documents:commit", { writes });
  writeFileSync(join(output, "commit-result.json"), JSON.stringify(result, null, 2));
  const after = await docs("invoices", [...archiveIds, ...protectedIds]);
  for (const id of archiveIds) {
    const updated = values(after.get(id));
    assert.equal(updated.isDuplicateArchived, true);
    const before = values(current.get(id));
    for (const key of metadata) { delete updated[key]; delete before[key]; }
    same(updated, before);
  }
  for (const id of protectedIds) { same(after.get(id), current.get(id)); }
  const paymentsAfter = await docs("payments", [...payments.keys()]);
  for (const [id, previous] of payments) same(paymentsAfter.get(id), previous);
  const financeAfter = await query("invoices", financeFields);
  const normalizeRows = (rows) => rows.map((r) => ({ name: r.name, fields: r.fields })).sort((a, b) => a.name.localeCompare(b.name));
  same(normalizeRows(financeAfter), normalizeRows(financeBefore));
  const outcome = { marked: archiveIds.length, documentDeletes: 0, originalInvoiceFieldsPreserved: true,
    protectedInvoicesUnchanged: true, paymentsUnchanged: true, invoiceCountBefore: financeBefore.length, invoiceCountAfter: financeAfter.length,
    allInvoiceFinancialFieldsUnchanged: true, completedUTC: new Date().toISOString() };
  writeFileSync(join(output, "verification.json"), JSON.stringify(outcome, null, 2));
  console.log(JSON.stringify(outcome));
}

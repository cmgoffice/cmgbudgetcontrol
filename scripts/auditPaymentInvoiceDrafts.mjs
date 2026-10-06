// Production inspection only: OAuth refresh + Firestore read APIs. No writes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const cliApi = require(join(process.env.APPDATA, "npm/node_modules/firebase-tools/lib/api.js"));
const config = JSON.parse(readFileSync(join(homedir(), ".config/configstore/firebase-tools.json"), "utf8"));
let token = config.tokens.access_token;
const root = "https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data";
const output = resolve("output/payment-invoice-audit-2026-10-05");
const decode = (v) => "stringValue" in v ? v.stringValue
  : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue
    : "booleanValue" in v ? v.booleanValue : "timestampValue" in v ? v.timestampValue
      : "nullValue" in v ? null : v.arrayValue ? (v.arrayValue.values || []).map(decode)
        : v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, decode(x)])) : v;
const document = (d) => ({ ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])),
  id: d.name.split("/").pop(), _createTime: d.createTime, _updateTime: d.updateTime });
async function authorize() {
  if (Number(config.tokens.expires_at) > Date.now() + 60000) return;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: cliApi.clientId(), client_secret: cliApi.clientSecret(),
      refresh_token: config.tokens.refresh_token, grant_type: "refresh_token" }), signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`OAuth refresh ${response.status}: ${data.error}`);
  token = data.access_token;
}
async function query(collectionId, where, select) {
  const response = await fetch(`${root}:runQuery`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], ...(where ? { where } : {}),
      ...(select ? { select: { fields: select.map((fieldPath) => ({ fieldPath })) } } : {}) } }),
    signal: AbortSignal.timeout(45000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${collectionId} read ${response.status}: ${data.error?.message}`);
  return data.filter((row) => row.document).map((row) => document(row.document));
}
const equal = (field, value) => ({ fieldFilter: { field: { fieldPath: field }, op: "EQUAL", value: { stringValue: value } } });
const included = (field, values) => ({ fieldFilter: { field: { fieldPath: field }, op: "IN", value: { arrayValue: {
  values: values.map((value) => field === "__name__" ? { referenceValue: value } : { stringValue: value }),
} } } });
const chunks = (values) => Array.from({ length: Math.ceil(values.length / 30) }, (_, i) => values.slice(i * 30, i * 30 + 30));
const unique = (rows) => [...new Map(rows.map((r) => [r.id, r])).values()];
const allStrings = (v) => typeof v === "string" ? [v] : Array.isArray(v) ? v.flatMap(allStrings)
  : v && typeof v === "object" ? Object.values(v).flatMap(allStrings) : [];
const normalized = (v) => typeof v === "string" ? v.trim() : Array.isArray(v) ? v.map(normalized)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalized(v[k])])) : v;
const signature = (v) => createHash("sha256").update(JSON.stringify(normalized(v))).digest("hex");
const lineTotal = (invoice) => (invoice.items || []).reduce((s, i) => s + Number(i.amount ?? (Number(i.quantity ?? i.invoiceQty ?? 0) * Number(i.price || 0))), 0);
const attachments = (invoice) => [invoice.invoiceAttachments, invoice.attachments, invoice.files].flatMap((a) => Array.isArray(a) ? a : []);
const summary = (i) => ({ id: i.id, poNo: i.poNo || i.poRef, status: i.status, statusNow: i.statusNow,
  invNo: i.invNo || "", amount: i.amount, lineTotal: lineTotal(i), createdAt: i._createTime,
  updatedAt: i._updateTime, createdBy: i.createdBy || "", attachmentCount: attachments(i).length });

await authorize();
const start = new Date().toISOString();
const drafts = await query("invoices", equal("status", "Draft"));
console.log(`Read ${drafts.length} Draft invoices across all projects.`);
const paymentDrafts = drafts.filter((d) => d.sourceType === "payment" || d.invoiceMode === "payment_subcontract" || d.paymentId);
const paymentIds = [...new Set(paymentDrafts.map((d) => String(d.paymentId || d.poId || "")).filter(Boolean))];
const invoices = [...drafts];
for (const batch of chunks(paymentIds)) {
  const results = await Promise.all([query("invoices", included("paymentId", batch)), query("invoices", included("poId", batch))]);
  invoices.push(...results.flat());
}
const payments = [];
for (const batch of chunks(paymentIds)) payments.push(...await query("payments", included("__name__", batch.map((id) =>
  `projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/payments/${id}`))));
const refFields = ["projectId", "invoiceIds", "invoiceId", "selectedInvoiceIds", "sourceInvoiceIds", "billingIds", "billings",
  "poRef", "poNo", "paymentId", "paymentNo", "amount", "status", "statusNow", "docNo", "billingNo", "payNo", "sourceType"];
const references = {};
for (const collection of ["billings", "pays", "receives"]) {
  references[collection] = await query(collection, null, refFields);
  console.log(`Read references from ${references[collection].length} ${collection} records.`);
}
const paymentById = new Map(payments.map((p) => [p.id, p]));
const paymentByNo = new Map(payments.map((p) => [`${p.projectId}|${p.paymentNo}`, p]));
const allInvoices = unique(invoices);
const groups = new Map();
for (const invoice of allInvoices) {
  const payment = paymentById.get(String(invoice.paymentId || invoice.poId || "")) || paymentByNo.get(`${invoice.projectId}|${invoice.paymentNo || invoice.poNo || invoice.poRef}`);
  const key = `${invoice.projectId}|${payment?.id || invoice.paymentId || invoice.poId || ""}`;
  if (!paymentDrafts.some((d) => `${d.projectId}|${d.paymentId || d.poId || ""}` === key)) continue;
  const group = groups.get(key) || { key, projectId: invoice.projectId, paymentId: payment?.id || invoice.paymentId || invoice.poId,
    paymentNo: payment?.paymentNo || invoice.paymentNo || invoice.poNo, payment, invoices: [] };
  group.invoices.push(invoice);
  groups.set(key, group);
}
const financial = (i) => {
  const { statusBeforeInvoice, ...snapshot } = i.paymentPeriodSnapshot || {};
  return { amount: Number(i.amount), originalAmount: Number(i.originalAmount || 0), remainingAmount: Number(i.remainingAmount || 0),
    items: (i.items || []).map((item, index) => ({ poItemIndex: item.poItemIndex ?? index, materialNo: item.materialNo,
      description: item.description, unit: item.unit, quantity: Number(item.quantity ?? item.invoiceQty ?? 0),
      price: Number(item.price || 0), amount: Number(item.amount ?? (Number(item.quantity ?? item.invoiceQty ?? 0) * Number(item.price || 0))) })),
    isDeposit: Boolean(i.isDeposit), depositAmount: Number(i.depositAmount || 0), vendorId: i.vendorId, snapshot };
};
const critical = (i) => ({ financial: financial(i), paymentType: i.paymentType, bankAccountNo: i.bankAccountNo || "",
  note: i.note || "", description: i.description });
const results = [];
for (const group of groups.values()) {
  const groupDrafts = group.invoices.filter((i) => i.status === "Draft");
  if (group.invoices.length < 2) continue;
  const ids = new Set(group.invoices.map((i) => i.id));
  const linked = [];
  const indirect = [];
  for (const [collection, records] of Object.entries(references)) for (const record of records) {
    const strings = new Set(allStrings(record));
    const matches = [...ids].filter((id) => strings.has(id));
    const brief = { collection, id: record.id, projectId: record.projectId, status: record.status, amount: record.amount };
    if (matches.length) linked.push({ ...brief, invoiceIds: matches });
    else if (record.projectId === group.projectId && (strings.has(group.paymentId) || strings.has(group.paymentNo))) indirect.push(brief);
  }
  const issues = [];
  const notes = [];
  const completed = group.invoices.filter((i) => i.status !== "Draft");
  if (!group.payment) issues.push("ไม่พบ Payment ต้นทาง");
  if (group.payment && group.payment.projectId !== group.projectId) issues.push("โครงการ Payment และ Invoice ไม่ตรงกัน");
  if (completed.length > 1) issues.push("มีเอกสารพ้น Draft หลายใบ ต้องตรวจด้วยมือ");
  if (completed.length === 1 && !completed[0].invNo && !completed[0].invoiceNo) issues.push("เอกสารพ้น Draft ไม่มีเลข Invoice ต้องตรวจด้วยมือ");
  if (groupDrafts.some((i) => i.invNo || i.invoiceNo || i.isDeposit ||
    [i.status, i.statusNow].some((s) => ["paid", "invcredit", "inpay", "deposit"].includes(String(s || "").toLowerCase())))) issues.push("Draft มีเลข Invoice/สถานะทางการเงิน/มัดจำ ต้องตรวจด้วยมือ");
  const draftIds = new Set(groupDrafts.map((i) => i.id));
  if (indirect.length || linked.some((r) => r.invoiceIds.some((id) => draftIds.has(id)))) issues.push("มีเอกสารปลายทางอ้างอิง Draft ID หรือ Payment ต้องตรวจด้วยมือ");
  if (new Set(group.invoices.map((i) => signature(financial(i)))).size > 1) issues.push("ข้อมูลยอด/รายการหรือ snapshot ผลงานไม่เหมือนกัน");
  if (new Set(groupDrafts.map((i) => signature(critical(i)))).size > 1) issues.push("รายละเอียดหรือวิธีจ่ายของ Draft ไม่เหมือนกัน");
  if (new Set(group.invoices.map((i) => i.paymentPeriodSnapshot?.statusBeforeInvoice)).size > 1) notes.push("ต่างเฉพาะประวัติ statusBeforeInvoice: ใบสร้างตอนอนุมัติเทียบกับใบสร้างเมื่อ Wait Pay; คงประวัติทุกใบไว้ในหลักฐาน");
  if (completed.length === 1) notes.push("เสนอเก็บเอกสารที่บันทึกแล้ว พร้อมเลข Invoice/ไฟล์แนบ/วิธีจ่ายเดิม; เสนอเก็บถาวรเฉพาะ Draft ที่ตกค้าง");
  if (group.payment && group.invoices.some((i) => !Number.isFinite(Number(i.amount)) ||
    Math.abs(Number(i.amount) - Number(group.payment.amount)) > 0.01 || Math.abs(lineTotal(i) - Number(i.amount)) > 0.01)) issues.push("ยอด Invoice/ผลรวมรายการ/Payment ไม่ตรงกัน");
  const withAttachments = group.invoices.filter((i) => attachments(i).length > 0);
  if (withAttachments.length > 1 && new Set(withAttachments.map((i) => signature(attachments(i)))).size > 1) issues.push("มีไฟล์แนบต่างกันหลายใบ ต้องรักษาไฟล์ทุกใบก่อน");
  const sorted = [...group.invoices].sort((a, b) => attachments(b).length - attachments(a).length ||
    String(a._createTime).localeCompare(String(b._createTime)) || a.id.localeCompare(b.id));
  if (completed.length === 1 && groupDrafts.some((i) => attachments(i).length > 0 && signature(attachments(i)) !== signature(attachments(completed[0])))) issues.push("Draft มีไฟล์แนบที่ต่างจากใบที่บันทึกแล้ว ต้องรักษาไฟล์ก่อน");
  const keep = issues.length ? null : (completed[0] || sorted[0]);
  results.push({ projectId: group.projectId, paymentId: group.paymentId, paymentNo: group.paymentNo,
    paymentAmount: group.payment?.amount, paymentStatus: group.payment?.status, totalInvoices: group.invoices.length,
    draftCount: groupDrafts.length, totalStoredAmount: group.invoices.reduce((s, i) => s + Number(i.amount || 0), 0),
    issues, notes, recommendation: keep ? (completed.length ? "เก็บ Invoice ที่บันทึกแล้ว; เสนอเก็บถาวรเฉพาะ Draft ที่ตกค้าง" : "เสนอเก็บใบที่มีไฟล์แนบครบที่สุด แล้วเลือกใบเก่าที่สุดเมื่อข้อมูลเท่ากัน; ใบอื่นเป็นผู้สมัครเก็บถาวร") : "หยุดไว้เพื่อตรวจด้วยมือ",
    proposedKeepId: keep?.id || null, proposedArchiveIds: keep ? sorted.filter((i) => i.id !== keep.id && i.status === "Draft").map((i) => i.id) : [],
    linked, indirect, invoices: sorted.map(summary) });
}
results.sort((a, b) => String(a.projectId).localeCompare(String(b.projectId)) || String(a.paymentNo).localeCompare(String(b.paymentNo)));
const summaryData = {
  readStartedUTC: start, readFinishedUTC: new Date().toISOString(), mode: "read-only", databaseWrites: 0,
  scope: "Invoice status=Draft ทุกโครงการ; ตรวจ Invoice อื่นที่ใช้ Payment ID เดียวกัน และอ่าน references Billing/Pay/Receive ทุกโครงการ",
  totalDraftInvoices: drafts.length, paymentDraftInvoices: paymentDrafts.length, paymentRecordsFound: payments.length,
  duplicateGroups: results.length, duplicateInvoiceCount: results.reduce((s, g) => s + g.totalInvoices, 0),
  candidateGroups: results.filter((g) => g.proposedKeepId).length,
  candidateArchiveCount: results.reduce((s, g) => s + g.proposedArchiveIds.length, 0),
  manualReviewGroups: results.filter((g) => !g.proposedKeepId).length,
  unresolvedPaymentDrafts: paymentDrafts.filter((d) => !paymentById.has(String(d.paymentId || d.poId || ""))).map(summary),
  referencesScanned: Object.fromEntries(Object.entries(references).map(([k, rows]) => [k, rows.length])),
  groups: results,
};
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "audit.json"), JSON.stringify(summaryData, null, 2), "utf8");
// Evidence snapshots are local files; no production document is modified.
writeFileSync(join(output, "source-snapshots.json"), JSON.stringify({ readStartedUTC: start,
  readFinishedUTC: summaryData.readFinishedUTC, invoices: allInvoices, payments, references }, null, 2), "utf8");
const localTime = (v) => v ? new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", timeStyle: "medium" }).format(new Date(v)) : "-";
const money = (v) => Number(v || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const md = ["# รายงานตรวจ Invoice Draft ซ้ำจาก Payment — 5 ตุลาคม 2569", "",
  `ตรวจข้อมูลจริงผ่าน Firestore REST API ตั้งแต่ ${localTime(start)} ถึง ${localTime(summaryData.readFinishedUTC)} (ประเทศไทย)`, "",
  "สถานะ: ข้อเสนอสำหรับตรวจสอบก่อนเปลี่ยนข้อมูลจริง ยังไม่ยกเลิก/เก็บถาวร/ลบเอกสาร และไม่ได้ deploy", "",
  `- Draft ทั้งหมด ${drafts.length} ใบ; Draft จาก Payment ${paymentDrafts.length} ใบ`,
  `- พบกลุ่มที่มีหลาย Invoice อ้างถึง Payment เดียวกัน ${results.length} กลุ่ม รวม ${summaryData.duplicateInvoiceCount} ใบ`,
  `- กลุ่มที่เสนอเลือกใบหลักได้ ${summaryData.candidateGroups} กลุ่ม; ใบซ้ำที่เสนอเก็บถาวร ${summaryData.candidateArchiveCount} ใบ`,
  `- กลุ่มที่ต้องตรวจด้วยมือ ${summaryData.manualReviewGroups} กลุ่ม; Draft ที่หา Payment ตาม ID ไม่พบ ${summaryData.unresolvedPaymentDrafts.length} ใบ`,
  `- อ่านการอ้างอิง ${Object.entries(summaryData.referencesScanned).map(([k, n]) => `${k} ${n} ใบ`).join(", ")}`, "",
  "## เกณฑ์เสนอใบหลัก", "",
  "กรณีทุกใบเป็น Draft: ต้องไม่มีเลข Invoice/มัดจำ ไม่มีการอ้างอิงปลายทางที่พบ ยอด/รายการ/วิธีจ่ายเหมือนกัน และยอดตรงกับ Payment/ผลรวมรายการ เลือกใบที่มีไฟล์แนบครบที่สุดก่อน แล้วเลือกใบเก่าที่สุดเมื่อข้อมูลเท่ากัน", "",
  "กรณีมีใบที่บันทึกแล้วเพียงหนึ่งใบ: เสนอเก็บใบนั้นไว้พร้อมเลข Invoice/ไฟล์แนบ/วิธีจ่ายเดิม และเสนอเก็บถาวรเฉพาะ Draft ตกค้างที่ยอดและรายการตรงกันและไม่มีการอ้างอิง; ไม่เปลี่ยนเอกสารที่บันทึกแล้ว", "",
  "statusBeforeInvoice เป็นประวัติขั้นตอนตอนสร้าง ซึ่งต่างได้ระหว่างหน้าตรวจอนุมัติและหน้าซ่อม Draft ไม่ใช่ยอดหรือผลงาน จึงแสดงเป็นข้อสังเกตแทนการถือว่ายอดต่างกัน ประวัติเดิมทุกใบอยู่ใน source-snapshots.json", "",
  "คำว่าเสนอเก็บถาวรเป็นเพียงข้อเสนอ ยังต้องตรวจผลของสถานะเก็บถาวรต่อหน้าจอ/รายงานและทดสอบก่อนใช้งาน ไม่มีใบใดถูกเปลี่ยนสถานะ", "",
  "## ผลแยกตาม Payment", "",
  "| โครงการ | Payment | ยอดงวด | จำนวน Invoice | เสนอเก็บ ID | จำนวนใบซ้ำที่เสนอ | ข้อสังเกต |",
  "|---|---|---:|---:|---|---:|---|",
  ...results.map((g) => `| ${g.projectId} | ${g.paymentNo} | ${money(g.paymentAmount)} | ${g.totalInvoices} | ${g.proposedKeepId || "รอตรวจด้วยมือ"} | ${g.proposedArchiveIds.length} | ${g.issues.join("; ") || "ผ่านเกณฑ์เสนอเลือกใบหลัก"} |`), "",
  ...results.flatMap((g) => [`### ${g.projectId} / ${g.paymentNo}`, "", `Payment ID: \`${g.paymentId}\`; สถานะ ${g.paymentStatus || "-"}; ยอดงวด ${money(g.paymentAmount)} บาท`, "",
    `เสนอเก็บ: ${g.proposedKeepId ? `\`${g.proposedKeepId}\`` : "ยังไม่เลือก"}`, "",
    `ใบที่เสนอเก็บถาวร: ${g.proposedArchiveIds.length ? g.proposedArchiveIds.map((id) => `\`${id}\``).join(", ") : "ยังไม่มีข้อเสนอ"}`, "",
    ...(g.issues.length ? [`เหตุที่รอตรวจ: ${g.issues.join("; ")}`, ""] : []),
    ...(g.notes.length ? [`ข้อสังเกต: ${g.notes.join("; ")}`, ""] : []),
    "| Document ID | ยอด | สถานะ | สร้างเมื่อ (ไทย) | ไฟล์แนบ |", "|---|---:|---|---|---:|",
    ...g.invoices.map((i) => `| ${i.id} | ${money(i.amount)} | ${i.status} | ${localTime(i.createdAt)} | ${i.attachmentCount} |`), ""]),
  "## ขอบเขตและข้อจำกัด", "",
  "- ตรวจ Payment Draft ที่มี sourceType/paymentId/invoiceMode ระบุความเชื่อมโยง; Draft จาก PO ปกติอาจเป็นคนละใบรับของหรือคนละงวด จึงไม่ถือว่าซ้ำจากเลข PO อย่างเดียว",
  "- API อ่านแต่ละชุดคนละเวลา ข้อมูลอาจเปลี่ยนได้หลังรายงานนี้ ต้องอ่านยืนยันและตรวจ updateTime อีกครั้งก่อนทำรายการจริง",
  "- ตรวจ references เฉพาะ collections/ฟิลด์ที่ระบบใช้ตามรายการใน audit.json; ไม่ใช่การรับรองว่าไม่มีการอ้างอิงจากระบบภายนอก",
  "- source-snapshots.json เป็นหลักฐานข้อมูลที่อ่านครั้งนี้ ไม่ใช่ backup ล่าสุดก่อนการเปลี่ยนแปลงในอนาคต",
  "- ไม่มีการเปิดหน้า Invoice production เพราะหน้าเดิมอาจสร้าง Draft อัตโนมัติ; ไม่ได้ทดสอบการสร้าง/บันทึกเอกสารบน production",
  "- โค้ดหน้าประวัติ Invoice ปัจจุบันรับสถานะที่ไม่ใช่ Draft; การเพิ่มสถานะ Archived/ArchivedDuplicate โดยตรงอาจทำให้ใบซ้ำไปปรากฏในประวัติ ต้องรองรับตัวกรองและการเลือกใบหลักใน helper ก่อนเปลี่ยนข้อมูลจริง",
  "- ไม่เปลี่ยนสูตรยอดงวด, PO, มัดจำ, ส่วนลด, งบประมาณ หรือ Billing/Pay", ""];
writeFileSync(join(output, "รายงานตรวจ Draft ซ้ำ.md"), md.join("\n"), "utf8");
console.log(JSON.stringify({ output, ...Object.fromEntries(Object.entries(summaryData).filter(([k]) => !["groups", "unresolvedPaymentDrafts"].includes(k))),
  groupSummary: results.map((g) => ({ projectId: g.projectId, paymentNo: g.paymentNo, count: g.totalInvoices,
    proposedKeepId: g.proposedKeepId, archiveCandidates: g.proposedArchiveIds.length, issues: g.issues })) }, null, 2));

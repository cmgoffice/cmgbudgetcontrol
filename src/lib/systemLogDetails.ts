const DEFAULT_TEXT_LIMIT = 80;

const FIELD_LABELS: Record<string, string> = {
  status: "สถานะ",
  statusNow: "สถานะปัจจุบัน",
  amount: "มูลค่า",
  totalAmount: "มูลค่า",
  grandTotal: "มูลค่ารวม",
  subtotal: "ยอดก่อน VAT",
  discount: "ส่วนลด",
  paymentType: "ประเภทจ่าย",
  poType: "ประเภท PO",
  receiveType: "รูปแบบรับของ",
  vendorName: "ผู้ขาย",
  vendorCode: "รหัสผู้ขาย",
  contractorName: "ผู้รับเหมา",
  contractTitle: "ชื่อสัญญา",
  description: "รายละเอียด",
  note: "หมายเหตุ",
  reason: "เหตุผล",
  location: "สถานที่",
  requiredDate: "วันที่ต้องการใช้",
  poDate: "วันที่เอกสาร",
  invDate: "วันที่เอกสาร",
  docDate: "วันที่เอกสาร",
  receiveNo: "เลขที่ Receive",
  rpNo: "เลขที่ Receive",
  invNo: "เลขที่ Invoice",
  poNo: "เลขที่ PO",
  prNo: "เลขที่ PR",
  paymentNo: "เลขที่ Payment",
  docNo: "เลขที่เอกสาร",
  projectId: "โครงการ",
  billingCycle: "รอบวางบิล",
  periodNo: "งวด",
  bankAccountNo: "เลขบัญชี",
  rejectReason: "เหตุผลปฏิเสธ",
  revisionNote: "เหตุผลขอแก้ไข",
  holdReason: "เหตุผล Hold",
  attachments: "ไฟล์แนบ",
  paymentAttachments: "ไฟล์แนบ",
  items: "รายการ",
  selectedPrIds: "PR ที่อ้างอิง",
  invoiceIds: "Invoice ที่อ้างอิง",
  billingIds: "Billing ที่อ้างอิง",
};

const HIDDEN_UPDATE_KEYS = new Set([
  "updatedAt",
  "createdAt",
  "approvedAt",
  "approvedBy",
  "submittedAt",
  "submittedBy",
  "rejectedAt",
  "rejectedBy",
  "revisionRequestedAt",
  "revisionRequestedBy",
  "revisionApprovedAt",
  "revisionApprovedBy",
  "activatedAt",
  "activatedBy",
  "createdBy",
  "createdByUid",
  "createdByEmail",
  "createdByName",
  "createdByFirstName",
  "createdByLastName",
  "activatedByUid",
  "activatedByEmail",
  "creatorSignatureDataUrl",
  "creatorSignatureUrl",
  "pcmSignatureDataUrl",
  "pcmSignatureUrl",
  "gmSignatureDataUrl",
  "gmSignatureUrl",
  "signature1UserUid",
  "signature1UserEmail",
  "signature1UserName",
  "signature2UserUid",
  "signature2UserEmail",
  "signature2UserName",
  "signature3UserUid",
  "signature3UserEmail",
  "signature3UserName",
  "pcmApprovedByUid",
  "pcmApprovedByEmail",
  "pcmApprovedByName",
  "pcmApprovedBy",
  "gmApprovedByUid",
  "gmApprovedByEmail",
  "gmApprovedByName",
  "gmApprovedBy",
  "cmApprovedByUid",
  "cmApprovedByEmail",
  "cmApprovedByName",
  "pmApprovedByUid",
  "pmApprovedByEmail",
  "pmApprovedByName",
  "periodPreparedByUid",
  "periodPreparedByEmail",
  "periodCheckedByUid",
  "periodCheckedByEmail",
  "periodApprovedByUid",
  "periodApprovedByEmail",
  "pdfUrl",
  "pdfPath",
  "paySlipUrl",
  "paySlipPath",
]);

function toNumber(value: any): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function isMeaningful(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function truncateLogText(value: any, max = DEFAULT_TEXT_LIMIT): string {
  if (!isMeaningful(value)) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

export function formatLogCurrency(value: any): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return `฿${num.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDateValue(value: any): string {
  if (!isMeaningful(value)) return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return truncateLogText(value, 40);
  return date.toLocaleDateString("th-TH");
}

function sumItemField(items: any[], keys: string[]): number {
  return (items || []).reduce((sum: number, item: any) => {
    const key = keys.find((candidate) => item?.[candidate] != null);
    return sum + toNumber(key ? item?.[key] : 0);
  }, 0);
}

function getPrimaryAmount(record: any): number {
  if (!record || typeof record !== "object") return 0;
  const directKeys = ["amountAfterVat", "grandTotal", "totalAmount", "amount", "depositAmount"];
  for (const key of directKeys) {
    if (record[key] != null && Number.isFinite(Number(record[key]))) {
      return Number(record[key]);
    }
  }
  const items = Array.isArray(record.items) ? record.items : [];
  if (items.length > 0) {
    const total = items.reduce((sum: number, item: any) => {
      const lineAmount = item?.amount
        ?? item?.contractAmount
        ?? item?.thisPeriodAmount
        ?? ((Number(item?.quantity ?? item?.contractQty ?? item?.receivedQty ?? 0) || 0) * (Number(item?.price ?? item?.contractPrice ?? 0) || 0));
      return sum + toNumber(lineAmount);
    }, 0);
    if (total > 0) return total;
  }
  return 0;
}

function compactPart(label: string, value: any, options: { currency?: boolean; date?: boolean; max?: number } = {}): string | null {
  if (!isMeaningful(value)) return null;
  const rendered = options.currency
    ? formatLogCurrency(value)
    : options.date
      ? formatDateValue(value)
      : truncateLogText(value, options.max || DEFAULT_TEXT_LIMIT);
  if (!rendered) return null;
  return `${label}: ${rendered}`;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" | ");
}

function buildGenericSummary(record: any, fallbackId = ""): string {
  if (!record || typeof record !== "object") return fallbackId ? `ID: ${fallbackId}` : "";
  const candidates = Object.entries(record)
    .filter(([key, value]) =>
      !HIDDEN_UPDATE_KEYS.has(key) &&
      !Array.isArray(value) &&
      typeof value !== "object" &&
      isMeaningful(value)
    )
    .slice(0, 6)
    .map(([key, value]) => `${FIELD_LABELS[key] || key}: ${truncateLogText(value, 48)}`);
  if (fallbackId) candidates.unshift(`ID: ${fallbackId}`);
  return candidates.join(" | ");
}

export function buildRecordSummary(collectionName: string, record: any, fallbackId = ""): string {
  const data = record && typeof record === "object" ? record : {};
  const items = Array.isArray(data.items) ? data.items : [];
  const itemCount = items.length;
  const itemQty = sumItemField(items, ["quantity", "receivedQty", "invoiceQty", "contractQty", "thisPeriodQty"]);
  const amount = getPrimaryAmount(data);

  switch (collectionName) {
    case "projects":
      return joinParts([
        compactPart("Job", data.jobNo || fallbackId),
        compactPart("ชื่อโครงการ", data.name, { max: 90 }),
        compactPart("ลูกค้า", data.customerName || data.customer, { max: 70 }),
        compactPart("สถานที่", data.location, { max: 70 }),
        compactPart("งบรวม", data.budgetTotal, { currency: true }),
      ]);
    case "budgets":
      return joinParts([
        compactPart("Budget", data.code || fallbackId),
        compactPart("รายละเอียด", data.description, { max: 90 }),
        compactPart("หมวด", data.category),
        compactPart("วงเงิน", data.amount, { currency: true }),
        compactPart("สถานะ", data.status),
      ]);
    case "vendors":
      return joinParts([
        compactPart("Vendor", data.code || fallbackId),
        compactPart("ชื่อ", data.name || data.vendorName, { max: 90 }),
        compactPart("ประเภท", data.type || data.vendorType),
        compactPart("Tax ID", data.taxId || data.taxNo),
        compactPart("โทร", data.phone || data.tel),
      ]);
    case "materials":
      return joinParts([
        compactPart("Material", data.code || fallbackId),
        compactPart("ชื่อ", data.name || data.materialName, { max: 90 }),
        compactPart("หน่วย", data.unit),
        compactPart("ราคา", data.price || data.unitPrice, { currency: true }),
        compactPart("หมวด", data.category),
      ]);
    case "prs":
      return joinParts([
        compactPart("PR", data.prNo || fallbackId),
        compactPart("ประเภท", data.purchaseType),
        compactPart("Cost Code", data.costCode),
        compactPart("รายการ", itemCount ? `${itemCount} รายการ` : ""),
        compactPart("มูลค่า", amount, { currency: true }),
        compactPart("สถานะ", data.status),
      ]);
    case "pos":
      return joinParts([
        compactPart("PO", data.poNo || fallbackId),
        compactPart("ประเภท", data.poType),
        compactPart("ผู้ขาย", data.vendorName || data.vendorCode || data.vendorId, { max: 90 }),
        compactPart("PR", Array.isArray(data.selectedPrIds) ? `${data.selectedPrIds.length} รายการ` : data.prNo),
        compactPart("รายการ", itemCount ? `${itemCount} รายการ` : ""),
        compactPart("มูลค่า", amount, { currency: true }),
        compactPart("สถานะ", data.statusNow || data.status),
      ]);
    case "payments":
      return joinParts([
        compactPart("Payment", data.paymentNo || fallbackId),
        compactPart("ประเภท", data.paymentType),
        compactPart("ผู้รับเหมา", data.contractorName || data.contractorCode || data.contractorId, { max: 90 }),
        compactPart("ชื่อสัญญา", data.contractTitle, { max: 90 }),
        compactPart("งวด", data.periodNo),
        compactPart("มูลค่า", amount, { currency: true }),
        compactPart("สถานะ", data.status),
      ]);
    case "invoices":
      return joinParts([
        compactPart("Invoice", data.invNo || fallbackId),
        compactPart("PO/Ref", data.poNo || data.poRef || data.poId),
        compactPart("ผู้ขาย", data.vendorName || data.vendorId, { max: 90 }),
        compactPart("รายการ", itemCount ? `${itemCount} รายการ` : ""),
        compactPart("มูลค่า", amount, { currency: true }),
        compactPart("ประเภทจ่าย", data.paymentType),
        compactPart("สถานะ", data.status),
      ]);
    case "receives":
      return joinParts([
        compactPart("Receive", data.rpNo || data.receiveNo || fallbackId),
        compactPart("PO", data.poNo || data.poId),
        compactPart("ผู้ขาย", data.vendorName, { max: 90 }),
        compactPart("รายการ", itemCount ? `${itemCount} รายการ` : ""),
        compactPart("จำนวนรับ", itemQty ? `${itemQty.toLocaleString("th-TH")} หน่วย` : ""),
        compactPart("วันที่รับ", data.receivedDate, { date: true }),
      ]);
    case "billings":
      return joinParts([
        compactPart("Billing", data.docNo || fallbackId),
        compactPart("ผู้ขาย", data.vendorName || data.vendorId, { max: 90 }),
        compactPart("Ref", data.poRef),
        compactPart("Invoice", Array.isArray(data.invoiceRefs) ? `${data.invoiceRefs.length} รายการ` : ""),
        compactPart("มูลค่า", data.amountAfterVat ?? data.amount, { currency: true }),
        compactPart("สถานะ", data.status),
      ]);
    case "pays":
      return joinParts([
        compactPart("Pay", data.docNo || fallbackId),
        compactPart("ผู้ขาย", data.vendorName || data.vendorId, { max: 90 }),
        compactPart("Ref", data.poRef),
        compactPart("Billing", Array.isArray(data.billingRefs) ? `${data.billingRefs.length} รายการ` : ""),
        compactPart("มูลค่า", data.amountAfterVat ?? data.amount, { currency: true }),
        compactPart("สถานะ", data.status),
      ]);
    default:
      return buildGenericSummary(data, fallbackId);
  }
}

function formatChangedValue(key: string, value: any): string {
  if (value == null) return "-";
  if (Array.isArray(value)) return `${value.length} รายการ`;
  if (typeof value === "object") return "updated";
  const lowered = key.toLowerCase();
  if (lowered.includes("date")) return formatDateValue(value);
  if (
    lowered.includes("amount") ||
    lowered.includes("price") ||
    lowered.includes("total") ||
    lowered.includes("discount") ||
    lowered.includes("vat")
  ) {
    return formatLogCurrency(value) || truncateLogText(value, 40);
  }
  return truncateLogText(value, 48);
}

export function buildChangedFieldsSummary(patch: any): string {
  if (!patch || typeof patch !== "object") return "";
  const parts = Object.keys(patch)
    .filter((key) => !HIDDEN_UPDATE_KEYS.has(key))
    .slice(0, 6)
    .map((key) => `${FIELD_LABELS[key] || key}: ${formatChangedValue(key, patch[key])}`);
  return parts.length > 0 ? `เปลี่ยนค่า ${parts.join(", ")}` : "";
}

export function buildCreateLogDetails(collectionName: string, record: any, newId = ""): string {
  const summary = buildRecordSummary(collectionName, record, newId);
  return summary ? `สร้าง ${summary}` : `สร้าง ${collectionName} ${newId}`.trim();
}

export function buildUpdateLogDetails(collectionName: string, beforeRecord: any, patch: any, id = ""): string {
  const merged = beforeRecord && typeof beforeRecord === "object"
    ? { ...beforeRecord, ...patch }
    : { ...(patch || {}) };
  const summary = buildRecordSummary(collectionName, merged, id);
  const changed = buildChangedFieldsSummary(patch);
  return joinParts([
    "อัปเดตรายการ",
    summary,
    changed,
  ]);
}

export function buildDeleteLogDetails(collectionName: string, record: any, id = ""): string {
  const summary = buildRecordSummary(collectionName, record, id);
  return summary ? `ลบ ${summary}` : `ลบ ${collectionName} ${id}`.trim();
}

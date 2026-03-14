// @ts-nocheck
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getDownloadURL, ref, uploadBytes, getBytes } from "firebase/storage";
import { storage, FORM_TEMPLATE_PATHS } from "./firebase";

const nf2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const fmtMoney = (n: any) => nf2.format(Number(n || 0));
const fmtQty = (n: any) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return Number.isInteger(num) ? nf0.format(num) : String(num);
};

function safeDate(dateLike: any) {
  if (!dateLike) return "";
  try {
    const d = typeof dateLike === "string" && dateLike.includes("T") ? new Date(dateLike) : new Date(dateLike);
    if (Number.isNaN(d.getTime())) return String(dateLike);
    return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return String(dateLike);
  }
}

function setTextIfExists(form: any, fieldNames: string[], value: any) {
  const v = value == null ? "" : String(value);
  for (const name of fieldNames) {
    try {
      const f = form.getTextField(name);
      f.setText(v);
      return true;
    } catch (_) {
      // ignore missing fields
    }
  }
  return false;
}

function setMultilineIfExists(form: any, fieldNames: string[], value: any) {
  const v = value == null ? "" : String(value);
  for (const name of fieldNames) {
    try {
      const f = form.getTextField(name);
      // best-effort: multiline flags differ by creator; pdf-lib supports this call
      try { f.enableMultiline(); } catch (_) {}
      f.setText(v);
      return true;
    } catch (_) {}
  }
  return false;
}

async function tryLoadPdfFromUrl(url: string, timeoutMs = 6000): Promise<ArrayBuffer | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch (_) {
    return null;
  }
}

async function loadTemplate(kind: "pr" | "po"): Promise<{ pdfDoc: any; hasForm: boolean }> {
  const base = kind === "pr" ? "pr-form-lib" : "po-form-lib";

  // ลำดับที่ลอง: public root (ทั้ง .pdf และ .pdf.pdf), public/forms/, Firebase Storage
  const localCandidates = [
    `/${base}.pdf`,
    `/${base}.pdf.pdf`,
    `/forms/${base}.pdf`,
    `/forms/${base}.pdf.pdf`,
  ];

  let arrayBuffer: ArrayBuffer | null = null;

  // 1) ลองดึงจาก public/ ก่อน (ไม่มีปัญหา CORS หรือ Storage Rules)
  for (const url of localCandidates) {
    arrayBuffer = await tryLoadPdfFromUrl(url, 4000);
    if (arrayBuffer) break;
  }

  // 2) ถ้าไม่มีใน public/ ลอง Firebase Storage
  if (!arrayBuffer) {
    try {
      const storageRef = ref(storage, FORM_TEMPLATE_PATHS[kind]);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("storage timeout")), 5000)
      );
      arrayBuffer = await Promise.race([
        getBytes(storageRef).then((b) => b as ArrayBuffer),
        timeoutPromise,
      ]);
    } catch (_) {}
  }

  if (arrayBuffer) {
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      try {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        pdfDoc.getForm().updateFieldAppearances(font);
      } catch (_) {}
      return { pdfDoc, hasForm: true };
    } catch (_) {}
  }

  // 3) Fallback: สร้าง PDF พื้นฐาน
  const pdfDoc = await PDFDocument.create();
  return { pdfDoc, hasForm: false };
}

// สร้างหน้า PDF พื้นฐาน (fallback ไม่มี template)
async function buildBasicPage(pdfDoc: any, lines: string[]) {
  const page = pdfDoc.addPage([595, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let y = 800;
  for (const line of lines) {
    if (y < 40) break;
    const isBold = line.startsWith("##");
    const text = line.replace(/^##\s*/, "");
    page.drawText(text || " ", {
      x: 40,
      y,
      size: isBold ? 13 : 10,
      font: isBold ? boldFont : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= isBold ? 20 : 14;
  }
}

function fillItemsTable(form: any, items: any[], maxRows = 20) {
  for (let i = 1; i <= maxRows; i++) {
    const idx2 = String(i).padStart(2, "0");
    const item = items[i - 1];
    // Support both recommended names and legacy fill_.. names (จากตัวอย่างในรูป)
    setTextIfExists(form, [`item_no_${idx2}`, `no_${idx2}`, `fill_no_${idx2}`, `fill_${8 + i}`], item ? String(i) : "");
    setTextIfExists(form, [`item_material_no_${idx2}`, `material_${idx2}`, `product_code_${idx2}`, `fill_${13 + i}`], item?.materialNo || "");
    setTextIfExists(form, [`item_desc_${idx2}`, `desc_${idx2}`, `description_${idx2}`, `fill_${14 + i}`], item?.description || "");
    setTextIfExists(form, [`item_qty_${idx2}`, `qty_${idx2}`, `quantity_${idx2}`, `fill_${15 + i}`], item ? fmtQty(item.quantity) : "");
    setTextIfExists(form, [`item_unit_${idx2}`, `unit_${idx2}`, `fill_${16 + i}`], item?.unit || "");
    setTextIfExists(form, [`item_unit_price_${idx2}`, `unit_price_${idx2}`, `price_${idx2}`, `fill_${17 + i}`], item ? fmtMoney(item.price) : "");
    setTextIfExists(form, [`item_discount_${idx2}`, `discount_${idx2}`, `fill_${18 + i}`], item?.discount ? fmtMoney(item.discount) : "");
    setTextIfExists(form, [`item_amount_${idx2}`, `amount_${idx2}`, `fill_${19 + i}`], item ? fmtMoney(item.amount ?? (Number(item.quantity) * Number(item.price))) : "");
  }
}

export async function generatePRPdfBytes(pr: any, { projectName = "", budgetDesc = "" } = {}) {
  const { pdfDoc, hasForm, customFont } = await loadTemplate("pr");

  const items = (pr.items || []).map((it: any) => ({
    materialNo: it.materialNo || it.material || "",
    description: it.description || "",
    quantity: it.quantity ?? "",
    unit: it.unit || "",
    price: it.price ?? 0,
    amount: it.amount ?? (Number(it.quantity || 0) * Number(it.price || 0)),
  }));
  const totalAmount = pr.totalAmount ?? items.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);

  if (hasForm) {
    const form = pdfDoc.getForm();
    setTextIfExists(form, ["pr_no", "prNo", "prno"], pr.prNo || pr.id || "", customFont);
    setTextIfExists(form, ["request_date", "pr_date", "date"], safeDate(pr.requestDate), customFont);
    setTextIfExists(form, ["project_name", "project", "proj"], projectName, customFont);
    setTextIfExists(form, ["cost_code", "costCode"], pr.costCode || "", customFont);
    setTextIfExists(form, ["budget_desc", "budgetDesc"], budgetDesc, customFont);
    setTextIfExists(form, ["requestor", "requester"], pr.requestor || "", customFont);
    setTextIfExists(form, ["requestor_email", "requester_email"], pr.requestorEmail || "", customFont);
    setTextIfExists(form, ["purchase_type", "type"], pr.purchaseType || "", customFont);
    setTextIfExists(form, ["delivery_location", "location"], pr.deliveryLocation || "", customFont);
    fillItemsTable(form, items, 20, customFont);
    setTextIfExists(form, ["total_amount", "total", "net_total", "fill_7"], fmtMoney(totalAmount), customFont);
    try { form.flatten(); } catch (_) {}
  } else {
    // Fallback: สร้าง PDF พื้นฐาน
    const lines: string[] = [
      `## Purchase Request`, ``,
      `PR No.        : ${pr.prNo || pr.id || "-"}`,
      `วันที่         : ${safeDate(pr.requestDate)}`,
      `โครงการ       : ${projectName}`,
      `Cost Code     : ${pr.costCode || "-"}`,
      `งบประมาณ      : ${budgetDesc}`,
      `ผู้ขอ         : ${pr.requestor || "-"}`,
      `ประเภท        : ${pr.purchaseType || "-"}`,
      ``,
      `## รายการสินค้า`,
      `${"No.".padEnd(4)} ${"รายการ".padEnd(30)} ${"จำนวน".padEnd(8)} ${"หน่วย".padEnd(8)} ${"ราคา/หน่วย".padEnd(12)} ${"รวม"}`,
      `${"-".repeat(80)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.description).substring(0, 28).padEnd(30)} ${String(it.quantity).padEnd(8)} ${String(it.unit).padEnd(8)} ${fmtMoney(it.price).padEnd(12)} ${fmtMoney(it.amount)}`
      ),
      `${"-".repeat(80)}`,
      ``,
      `## ยอดรวม : ${fmtMoney(totalAmount)} บาท`,
      ``,
      `* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด PR Form ในหน้า Admin → แบบฟอร์ม PDF`,
    ];
    await buildBasicPage(pdfDoc, lines, customFont);
  }

  return await pdfDoc.save();
}

export async function generatePOPdfBytes(po: any, { vendor = null, project = null }: { vendor?: any; project?: any } = {}) {
  const { pdfDoc, hasForm, customFont } = await loadTemplate("po");

  const vendorName = vendor?.name || po.vendorName || "";
  const vendorAddress = vendor?.address || po.vendorAddress || "";
  const vendorTel = vendor?.tel || "";
  const vendorCredit = vendor?.creditTerm || "";

  const items = (po.items || []).map((it: any) => ({
    materialNo: it.materialNo || "",
    description: it.description || "",
    quantity: it.quantity ?? "",
    unit: it.unit || "",
    price: it.price ?? 0,
    amount: it.amount ?? (Number(it.quantity || 0) * Number(it.price || 0)),
    discount: it.discount ?? 0,
  }));

  const subtotal = items.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
  const discount = Number(po.discount || 0);
  const subTotalAfterDiscount = Math.max(0, subtotal - discount);
  const manualVat = po.manualVat != null ? Number(po.manualVat) : null;
  const vat = manualVat != null && !Number.isNaN(manualVat) ? manualVat : (po.vatType === "ex-vat" ? subTotalAfterDiscount * 0.07 : 0);
  const netTotal = po.grandTotal != null ? Number(po.grandTotal) : (po.amount != null ? Number(po.amount) : (subTotalAfterDiscount + vat));

  if (hasForm) {
    const form = pdfDoc.getForm();
    setTextIfExists(form, ["po_no", "poNo", "pono"], po.poNo || po.id || "", customFont);
    setTextIfExists(form, ["po_date", "date"], safeDate(po.poDate || po.createdDate), customFont);
    setTextIfExists(form, ["receive_date", "receivedate", "due_date"], safeDate(po.requiredDate), customFont);
    setTextIfExists(form, ["location", "remark"], project?.location || project?.name || "", customFont);
    setTextIfExists(form, ["vendor_name", "vendorname"], vendorName, customFont);
    setTextIfExists(form, ["vendor_tel", "vendortel"], vendorTel, customFont);
    setTextIfExists(form, ["vendor_credit_term", "vendorcredit", "vendorco"], vendorCredit, customFont);
    setMultilineIfExists(form, ["vendor_address", "vendoraddress"], vendorAddress, customFont);
    setTextIfExists(form, ["vendor_contact", "vendorcontract", "contact"], vendor?.contact || "", customFont);
    fillItemsTable(form, items, 20, customFont);
    setTextIfExists(form, ["total_amount", "amount", "fill_10"], fmtMoney(subtotal), customFont);
    setTextIfExists(form, ["discount", "fill_11"], fmtMoney(discount), customFont);
    setTextIfExists(form, ["sub_total", "subtotal", "fill_12"], fmtMoney(subTotalAfterDiscount), customFont);
    setTextIfExists(form, ["vat_7", "vat7", "fill_13"], fmtMoney(vat), customFont);
    setTextIfExists(form, ["net_total", "total", "fill_7"], fmtMoney(netTotal), customFont);
    try { form.flatten(); } catch (_) {}
  } else {
    // Fallback: สร้าง PDF พื้นฐาน
    const lines: string[] = [
      `## Purchase Order`, ``,
      `PO No.        : ${po.poNo || po.id || "-"}`,
      `วันที่         : ${safeDate(po.poDate || po.createdDate)}`,
      `โครงการ       : ${project?.name || "-"}`,
      `PO Type       : ${po.poType || "-"}`,
      `Receive Type  : ${po.receiveType || "-"}`,
      ``,
      `## Vendor`,
      `ชื่อ          : ${vendorName || "-"}`,
      `ที่อยู่        : ${vendorAddress || "-"}`,
      `โทร          : ${vendorTel || "-"}`,
      `เครดิตเทอม    : ${vendorCredit || "-"}`,
      ``,
      `## รายการสินค้า`,
      `${"No.".padEnd(4)} ${"รายการ".padEnd(30)} ${"จำนวน".padEnd(8)} ${"หน่วย".padEnd(8)} ${"ราคา/หน่วย".padEnd(12)} ${"รวม"}`,
      `${"-".repeat(80)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.description).substring(0, 28).padEnd(30)} ${String(it.quantity).padEnd(8)} ${String(it.unit).padEnd(8)} ${fmtMoney(it.price).padEnd(12)} ${fmtMoney(it.amount)}`
      ),
      `${"-".repeat(80)}`,
      ``,
      `ยอดรวม        : ${fmtMoney(subtotal)} บาท`,
      discount > 0 ? `ส่วนลด        : ${fmtMoney(discount)} บาท` : "",
      vat > 0 ? `VAT (7%)      : ${fmtMoney(vat)} บาท` : "",
      `## ยอดสุทธิ   : ${fmtMoney(netTotal)} บาท`,
      ``,
      `* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด PO Form ในหน้า Admin → แบบฟอร์ม PDF`,
    ].filter(l => l !== undefined);
    await buildBasicPage(pdfDoc, lines as string[]);
  }

  return await pdfDoc.save();
}

/**
 * Stamp a signature image onto an existing PDF bytes.
 * @param pdfBytes - The existing PDF as Uint8Array
 * @param signatureImageUrl - URL or data-URL of the signature image (PNG/JPG)
 * @param options - Position & size for stamp placement
 */
export async function stampSignatureToPdf(
  pdfBytes: Uint8Array,
  signatureImageUrl: string,
  options: { x: number; y: number; width?: number; height?: number; pageIndex?: number } = { x: 0, y: 0 }
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  // Fetch the signature image
  let imgBytes: ArrayBuffer;
  if (signatureImageUrl.startsWith("data:")) {
    // data-URL: decode base64
    const base64 = signatureImageUrl.split(",")[1];
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    imgBytes = arr.buffer;
  } else {
    const res = await fetch(signatureImageUrl);
    if (!res.ok) throw new Error(`Cannot fetch signature: ${res.status}`);
    imgBytes = await res.arrayBuffer();
  }

  // Embed image (try PNG first, fallback JPG)
  let embeddedImg: any;
  try {
    embeddedImg = await pdfDoc.embedPng(imgBytes);
  } catch (_) {
    embeddedImg = await pdfDoc.embedJpg(imgBytes);
  }

  const pageIdx = options.pageIndex ?? 0;
  const pages = pdfDoc.getPages();
  if (pageIdx >= pages.length) throw new Error("Page index out of range");
  const page = pages[pageIdx];

  const w = options.width ?? 120;
  const h = options.height ?? 50;

  page.drawImage(embeddedImg, {
    x: options.x,
    y: options.y,
    width: w,
    height: h,
    opacity: 0.85,
  });

  return await pdfDoc.save();
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function uploadGeneratedPdf(bytes: Uint8Array, path: string) {
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, bytes, { contentType: "application/pdf" } as any);
  return await getDownloadURL(storageRef);
}


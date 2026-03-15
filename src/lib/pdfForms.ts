// @ts-nocheck
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getDownloadURL, ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
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

function setTextIfExists(form: any, fieldNames: string[], value: any, customFont?: any) {
  const v = value == null ? "" : String(value);
  for (const name of fieldNames) {
    try {
      const f = form.getTextField(name);
      f.setText(v);
      if (customFont) try { f.updateAppearances(customFont); } catch (_) {}
      return true;
    } catch (_) {
      // ignore missing fields
    }
  }
  return false;
}

function setMultilineIfExists(form: any, fieldNames: string[], value: any, customFont?: any) {
  const v = value == null ? "" : String(value);
  for (const name of fieldNames) {
    try {
      const f = form.getTextField(name);
      try { f.enableMultiline(); } catch (_) {}
      f.setText(v);
      if (customFont) try { f.updateAppearances(customFont); } catch (_) {}
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

async function loadTemplate(kind: "pr" | "po"): Promise<{ pdfDoc: any; hasForm: boolean; customFont?: any }> {
  const base = kind === "pr" ? "pr-form-lib" : "po-form-lib";

  const localCandidates = [
    `/${base}.pdf`,
    `/${base}.pdf.pdf`,
    `/forms/${base}.pdf`,
    `/forms/${base}.pdf.pdf`,
  ];

  let arrayBuffer: ArrayBuffer | null = null;
  for (const url of localCandidates) {
    arrayBuffer = await tryLoadPdfFromUrl(url, 4000);
    if (arrayBuffer) break;
  }

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

  let customFont: any;
  if (arrayBuffer) {
    try {
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      pdfDoc.registerFontkit(fontkit);
      try {
        const fontRes = await fetch("/fonts/THSarabunNew.ttf");
        if (fontRes.ok) {
          const fontBytes = await fontRes.arrayBuffer();
          customFont = await pdfDoc.embedFont(fontBytes);
        }
      } catch (_) {}
      if (!customFont) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        pdfDoc.getForm().updateFieldAppearances(font);
      }
      return { pdfDoc, hasForm: true, customFont };
    } catch (_) {}
  }

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

function fillItemsTable(form: any, items: any[], maxRows = 20, customFont?: any) {
  for (let i = 1; i <= maxRows; i++) {
    const idx2 = String(i).padStart(2, "0");
    const item = items[i - 1];
    setTextIfExists(form, [`item_no_${idx2}`, `no_${idx2}`, `fill_no_${idx2}`, `fill_${8 + i}`], item ? String(i) : "", customFont);
    // item_material_XX = Material No.
    setTextIfExists(form, [`item_material_${idx2}`, `item_material_no_${idx2}`, `material_${idx2}`, `product_code_${idx2}`, `fill_${13 + i}`], item?.materialNo || "", customFont);
    setTextIfExists(form, [`item_desc_${idx2}`, `desc_${idx2}`, `description_${idx2}`, `fill_${14 + i}`], item?.description || "", customFont);
    setTextIfExists(form, [`item_qty_${idx2}`, `qty_${idx2}`, `quantity_${idx2}`, `fill_${15 + i}`], item ? fmtQty(item.quantity) : "", customFont);
    setTextIfExists(form, [`item_unit_${idx2}`, `unit_${idx2}`, `fill_${16 + i}`], item?.unit || "", customFont);
    setTextIfExists(form, [`item_unit_price_${idx2}`, `unit_price_${idx2}`, `price_${idx2}`, `fill_${17 + i}`], item ? fmtMoney(item.price) : "", customFont);
    setTextIfExists(form, [`item_discount_${idx2}`, `discount_${idx2}`, `fill_${18 + i}`], item?.discount ? fmtMoney(item.discount) : "", customFont);
    setTextIfExists(form, [`item_amount_${idx2}`, `amount_${idx2}`, `fill_${19 + i}`], item ? fmtMoney(item.amount ?? (Number(item.quantity) * Number(item.price))) : "", customFont);
  }
}

export async function generatePRPdfBytes(pr: any, { projectName = "", budgetDesc = "" } = {}) {
  const { pdfDoc, hasForm, customFont } = await loadTemplate("pr");

  const items = (pr.items || []).map((it: any) => ({
    description: it.description || "",
    quantity: it.quantity ?? "",
    unit: it.unit || "",
    note: it.note || "",
    price: it.price ?? 0,
    amount: it.amount ?? (Number(it.quantity || 0) * Number(it.price || 0)),
  }));
  const totalAmount = pr.totalAmount ?? items.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);

  // job_no = 3 ตัวแรกของ PR No. (เช่น "J99-EQM-001" → "J99")
  const jobNo = (pr.prNo || pr.id || "").split("-")[0] || "";

  if (hasForm) {
    const form = pdfDoc.getForm();

    // Debug: log ทุก field ใน PR template
    try {
      console.log("[PR PDF] Form fields:", form.getFields().map((f: any) => f.getName()));
    } catch (_) {}

    // Header fields
    setTextIfExists(form, ["pr_no"], pr.prNo || pr.id || "", customFont);
    setTextIfExists(form, ["pr_date"], safeDate(pr.requestDate), customFont);
    setTextIfExists(form, ["pr_name"], pr.requestor || "", customFont);
    setTextIfExists(form, ["job_no"], jobNo, customFont);
    setTextIfExists(form, ["pr_type"], pr.purchaseType || "", customFont);
    setTextIfExists(form, ["pr_location", "Text1"], pr.deliveryLocation || "", customFont);

    // Approver emails (ใส่เมื่อมีข้อมูล)
    if (pr.cmApproverEmail) setTextIfExists(form, ["pr_cm"], pr.cmApproverEmail, customFont);
    if (pr.pmApproverEmail) setTextIfExists(form, ["pr_pm"], pr.pmApproverEmail, customFont);

    // Item rows (สูงสุด 5 แถวตาม template pr-form-lib.pdf)
    const MAX_ROWS = 5;
    for (let i = 1; i <= MAX_ROWS; i++) {
      const idx2 = String(i).padStart(2, "0");
      const item = items[i - 1];
      // Cost code — แถวแรกใช้จาก pr.costCode, แถวอื่นใช้จาก item.costCode ถ้ามี
      const costCode = i === 1 ? (pr.costCode || item?.costCode || "") : (item?.costCode || "");
      setTextIfExists(form, [`pr_costcode${idx2}`, `pr_costcode`], item ? costCode : (i === 1 ? (pr.costCode || "") : ""), customFont);
      setTextIfExists(form, [`pr_detail${idx2}`], item?.description || "", customFont);
      setTextIfExists(form, [`pr_qty${idx2}`], item ? fmtQty(item.quantity) : "", customFont);
      setTextIfExists(form, [`pr_unit${idx2}`], item?.unit || "", customFont);
      setTextIfExists(form, [`pr_text${idx2}`], item?.note || "", customFont);
    }

    // บันทึก rect ของ Signature fields ก่อน flatten
    const prSigRects: Record<string, { x: number; y: number; width: number; height: number; page: number }> = {};
    ["Signature1", "Signature2", "Signature3"].forEach(name => {
      try {
        const sigField = form.getField(name);
        const widgets = sigField.acroField.getWidgets();
        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle();
          let pageIdx = 0;
          const pages = pdfDoc.getPages();
          outerPR: for (let pi = 0; pi < pages.length; pi++) {
            try {
              const annots = pages[pi].node.Annots();
              if (annots) {
                for (const r of annots.asArray()) {
                  if (r.tag === "ref" && r.objectNumber === widgets[0].ref.objectNumber) {
                    pageIdx = pi; break outerPR;
                  }
                }
              }
            } catch (_) {}
          }
          prSigRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: pageIdx };
        }
      } catch (_) {}
    });

    try { form.flatten(); } catch (_) {}

    // Re-embed sig rects เป็น hidden field "_sigRects"
    if (Object.keys(prSigRects).length > 0) {
      try {
        const newForm = pdfDoc.getForm();
        const metaField = newForm.createTextField("_sigRects");
        metaField.setText(JSON.stringify(prSigRects));
        const metaPage = pdfDoc.getPages()[0];
        metaField.addToPage(metaPage, { x: -200, y: -200, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
  } else {
    const lines: string[] = [
      `## Purchase Request`, ``,
      `PR No.        : ${pr.prNo || pr.id || "-"}`,
      `วันที่         : ${safeDate(pr.requestDate)}`,
      `Job No.       : ${jobNo}`,
      `ผู้ขอซื้อ      : ${pr.requestor || "-"}`,
      `ประเภท        : ${pr.purchaseType || "-"}`,
      `สถานที่        : ${pr.deliveryLocation || "-"}`,
      `Cost Code     : ${pr.costCode || "-"}`,
      ``,
      `## รายการ`,
      `${"No.".padEnd(4)} ${"รายการ".padEnd(30)} ${"จำนวน".padEnd(8)} ${"หน่วย".padEnd(8)}`,
      `${"-".repeat(60)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.description).substring(0, 28).padEnd(30)} ${String(it.quantity).padEnd(8)} ${String(it.unit).padEnd(8)}`
      ),
      `${"-".repeat(60)}`,
      ``,
      `* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด PR Form ในหน้า Admin → แบบฟอร์ม PDF`,
    ];
    await buildBasicPage(pdfDoc, lines, customFont);
  }

  return await pdfDoc.save();
}

export async function generatePOPdfBytes(po: any, { vendor = null, project = null }: { vendor?: any; project?: any } = {}) {
  const { pdfDoc, hasForm, customFont } = await loadTemplate("po");

  const vendorCode    = vendor?.code    || po.vendorCode    || "";
  const vendorName    = vendor?.name    || po.vendorName    || "";
  const vendorAddress = vendor?.address || po.vendorAddress || "";
  const vendorTel     = vendor?.tel     || po.vendorTel     || "";
  // vendor_credit_term — ส่งเฉพาะตัวเลข ตัดคำว่า "วัน" หรือหน่วยอื่นออก
  const rawCredit     = vendor?.creditTerm ?? po.vendorCreditTerm ?? "";
  const vendorCredit  = rawCredit !== "" ? String(rawCredit).replace(/[^\d.]/g, "").replace(/\.$/, "") : "";

  // vendor_address = ที่อยู่ + โทร รวมในฟิลด์เดียว
  const vendorAddressWithTel = [vendorAddress, vendorTel ? `โทร: ${vendorTel}` : ""].filter(Boolean).join("\n");

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

    // Debug: แสดงชื่อ field ทั้งหมดใน PDF template (ดูใน console เพื่อตรวจสอบชื่อ field จริง)
    try {
      const allFields = form.getFields().map((f: any) => f.getName());
      console.log("[PO PDF] Form fields:", allFields);
    } catch (_) {}

    // Header
    setTextIfExists(form, ["po_no", "poNo", "pono", "PONo", "PO_NO"], po.poNo || po.id || "", customFont);

    // po_date = วันที่เปิด PO (po.poDate เป็น ISO string จาก Firestore)
    const poDateValue = safeDate(po.poDate || po.poOpenDate || po.createdDate);
    setTextIfExists(form, ["po_date", "poDate", "po_open_date", "open_date", "date", "PO_DATE"], poDateValue, customFont);
    setTextIfExists(form, ["receive_date", "receivedate", "due_date"], safeDate(po.requiredDate), customFont);

    // location = สถานที่จัดส่ง (จาก project.location หรือ project.name)
    setTextIfExists(form, ["location", "remark"], project?.location || project?.name || po.location || "", customFont);

    // Vendor fields
    // vendor_contact = รหัส Vendor
    setTextIfExists(form, ["vendor_contact", "vendorcontact", "vendorcode", "vendor_code"], vendorCode, customFont);
    // vendor_name = ชื่อ Vendor
    setTextIfExists(form, ["vendor_name", "vendorname"], vendorName, customFont);
    // vendor_address = ที่อยู่ + โทร (รวม)
    setMultilineIfExists(form, ["vendor_address", "vendoraddress"], vendorAddressWithTel, customFont);
    // vendor_credit_term = เครดิต (template ใช้ชื่อ "vendor")
    setTextIfExists(form, ["vendor_credit_term", "vendor", "vendorcredit", "vendorco"], vendorCredit, customFont);

    // Items table — item_material_XX = Material No.
    fillItemsTable(form, items, 20, customFont);

    // Summary
    setTextIfExists(form, ["total_amount", "amount", "fill_10"], fmtMoney(subtotal), customFont);
    setTextIfExists(form, ["discount", "fill_11"], fmtMoney(discount), customFont);
    setTextIfExists(form, ["sub_total", "subtotal", "fill_12"], fmtMoney(subTotalAfterDiscount), customFont);
    setTextIfExists(form, ["vat_7", "vat7", "fill_13"], fmtMoney(vat), customFont);
    setTextIfExists(form, ["net_total", "total", "fill_7"], fmtMoney(netTotal), customFont);

    // บันทึก rect ของ Signature fields ก่อน flatten (pdf-lib มีแค่ form.flatten() ไม่มี flattenFields)
    const sigRects: Record<string, { x: number; y: number; width: number; height: number; page: number }> = {};
    ["Signature1", "Signature2", "Signature3"].forEach(name => {
      try {
        const sigField = form.getField(name);
        const widgets = sigField.acroField.getWidgets();
        if (widgets.length > 0) {
          const rect = widgets[0].getRectangle();
          // หา page index ของ widget
          let pageIdx = 0;
          const pages = pdfDoc.getPages();
          outer2: for (let pi = 0; pi < pages.length; pi++) {
            try {
              const annots = pages[pi].node.Annots();
              if (annots) {
                for (const r of annots.asArray()) {
                  if (r.tag === "ref" && r.objectNumber === widgets[0].ref.objectNumber) {
                    pageIdx = pi; break outer2;
                  }
                }
              }
            } catch (_) {}
          }
          sigRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: pageIdx };
        }
      } catch (_) {}
    });
    console.log("[PO PDF] Signature rects saved:", sigRects);

    // Flatten ทั้งหมด (รวม Signature fields)
    try { form.flatten(); } catch (_) {}

    // Re-embed sig rects เป็น hidden text field "_sigRects" เพื่อให้ stampSignatureToField ใช้
    if (Object.keys(sigRects).length > 0) {
      try {
        const newForm = pdfDoc.getForm();
        const metaField = newForm.createTextField("_sigRects");
        metaField.setText(JSON.stringify(sigRects));
        const metaPage = pdfDoc.getPages()[0];
        metaField.addToPage(metaPage, { x: -200, y: -200, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
  } else {
    const lines: string[] = [
      `## Purchase Order`, ``,
      `PO No.        : ${po.poNo || po.id || "-"}`,
      `วันที่         : ${safeDate(po.poDate || po.poOpenDate || po.createdDate)}`,
      `โครงการ       : ${project?.name || "-"}`,
      `PO Type       : ${po.poType || "-"}`,
      `Receive Type  : ${po.receiveType || "-"}`,
      ``,
      `## Vendor`,
      `รหัส          : ${vendorCode || "-"}`,
      `ชื่อ          : ${vendorName || "-"}`,
      `ที่อยู่        : ${vendorAddress || "-"}`,
      `โทร          : ${vendorTel || "-"}`,
      `เครดิตเทอม    : ${vendorCredit || "-"}`,
      ``,
      `## รายการสินค้า`,
      `${"No.".padEnd(4)} ${"Material No.".padEnd(16)} ${"รายการ".padEnd(28)} ${"จำนวน".padEnd(8)} ${"หน่วย".padEnd(8)} ${"ราคา/หน่วย".padEnd(12)} ${"รวม"}`,
      `${"-".repeat(90)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.materialNo || "").substring(0, 14).padEnd(16)} ${String(it.description).substring(0, 26).padEnd(28)} ${String(it.quantity).padEnd(8)} ${String(it.unit).padEnd(8)} ${fmtMoney(it.price).padEnd(12)} ${fmtMoney(it.amount)}`
      ),
      `${"-".repeat(90)}`,
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
 * Stamp a signature image at the location of a named PDF form field.
 *
 * Field mapping:
 *   Signature1 = ลายเซ็นผู้สร้าง PO (Creator)
 *   Signature2 = ลายเซ็นผู้ Approve Step 1 (PCM)
 *   Signature3 = ลายเซ็นผู้ Approve Step 2 (GM)
 *
 * @param pdfBytes - The existing PDF as Uint8Array
 * @param signatureImageUrl - URL or data-URL of signature image (PNG/JPG)
 * @param fieldName - PDF form field name: "Signature1" | "Signature2" | "Signature3"
 * @param padding - Optional inset (px) to shrink stamp inside the field rect
 */
export async function stampSignatureToField(
  pdfBytes: Uint8Array,
  signatureImageUrl: string,
  fieldName: "Signature1" | "Signature2" | "Signature3",
  padding = 4
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);

  let imgBytes: ArrayBuffer;
  if (signatureImageUrl.startsWith("data:")) {
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

  let embeddedImg: any;
  try { embeddedImg = await pdfDoc.embedPng(imgBytes); }
  catch (_) { embeddedImg = await pdfDoc.embedJpg(imgBytes); }

  let placed = false;
  const pages = pdfDoc.getPages();

  // Step 1: ลอง stamp จาก Signature field ที่ยังมีอยู่ (กรณี PDF ไม่ได้ flatten)
  try {
    const form = pdfDoc.getForm();
    const existingFields = form.getFields().map((f: any) => f.getName());
    console.log(`[stampSignatureToField] ${fieldName} — fields in PDF:`, existingFields);

    const field = form.getField(fieldName);
    const widgets = field.acroField.getWidgets();
    if (widgets.length > 0) {
      const rect = widgets[0].getRectangle();
      let targetPage = pages[0];
      outer: for (let pi = 0; pi < pages.length; pi++) {
        try {
          const annots = pages[pi].node.Annots();
          if (annots) {
            for (const r of annots.asArray()) {
              if (r.tag === "ref" && r.objectNumber === widgets[0].ref.objectNumber) {
                targetPage = pages[pi]; break outer;
              }
            }
          }
        } catch (_) {}
      }
      targetPage.drawImage(embeddedImg, {
        x: rect.x + padding, y: rect.y + padding,
        width: rect.width - padding * 2, height: rect.height - padding * 2, opacity: 0.9,
      });
      try { form.removeField(field); } catch (_) {}
      placed = true;
      console.log(`[stampSignatureToField] ${fieldName} stamped from live field at`, rect);
    }
  } catch (_) {}

  // Step 2: อ่าน rect จาก hidden _sigRects field (บันทึกไว้ก่อน flatten)
  if (!placed) {
    try {
      const form = pdfDoc.getForm();
      const metaField = form.getTextField("_sigRects");
      const rects = JSON.parse(metaField.getText() || "{}");
      const r = rects[fieldName];
      if (r) {
        const targetPage = pages[r.page] ?? pages[pages.length - 1];
        targetPage.drawImage(embeddedImg, {
          x: r.x + padding, y: r.y + padding,
          width: r.width - padding * 2, height: r.height - padding * 2, opacity: 0.9,
        });
        placed = true;
        console.log(`[stampSignatureToField] ${fieldName} stamped from saved rect at`, r);
      }
    } catch (_) {}
  }

  // Step 3: Fallback hardcoded — แถวลายเซ็น 3 คนเรียงแนวนอนล่างหน้า
  if (!placed) {
    console.warn(`[stampSignatureToField] Using hardcoded fallback for ${fieldName}`);
    const page = pages[pages.length - 1];
    const { width: pw } = page.getSize();
    const fp: Record<string, { x: number; y: number; w: number; h: number }> = {
      Signature1: { x: 40,          y: 60, w: 130, h: 50 },
      Signature2: { x: pw/2 - 65,   y: 60, w: 130, h: 50 },
      Signature3: { x: pw - 170,    y: 60, w: 130, h: 50 },
    };
    const pos = fp[fieldName] ?? { x: 40, y: 60, w: 130, h: 50 };
    page.drawImage(embeddedImg, { x: pos.x, y: pos.y, width: pos.w, height: pos.h, opacity: 0.9 });
  }

  return await pdfDoc.save();
}

/**
 * Stamp a signature image onto an existing PDF bytes at arbitrary x,y.
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

/** ลบไฟล์ PDF ออกจาก Storage (ใช้เมื่อลบ PO) — path ต้องตรงกับที่ใช้ upload เช่น generated/pos/{projectId}/{poNo}.pdf */
export async function deleteGeneratedPdf(path: string): Promise<void> {
  if (!path) return;
  try {
    const storageRef = ref(storage, path);
    await deleteObject(storageRef);
  } catch (e) {
    if (e?.code === "storage/object-not-found") return;
    console.warn("[deleteGeneratedPdf]", e);
  }
}


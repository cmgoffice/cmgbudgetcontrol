// @ts-nocheck
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { getDownloadURL, ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";
import { storage, FORM_TEMPLATE_PATHS } from "./firebase";

const nf2 = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });
const fmtMoney = (n: any) => nf2.format(Number(n || 0));
const fmtQty = (n: any) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return "";
  return Number.isInteger(num) ? nf0.format(num) : nf2.format(num);
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

function setMultilineIfExists(form: any, fieldNames: string[], value: any) {
  const v = value == null ? "" : String(value);
  for (const name of fieldNames) {
    try {
      const f = form.getTextField(name);
      // Only enable multiline if not already set in template — prevents pdf-lib
      // from corrupting fields that were already configured as multiline in Acrobat.
      let alreadyMultiline = false;
      try {
        const flags = f.acroField.getFlags();
        if (flags) alreadyMultiline = (flags.value() & (1 << 12)) !== 0;
      } catch (_) {}
      if (!alreadyMultiline) {
        try { f.enableMultiline(); } catch (_) {}
      }
      f.setText(v);
      // NEVER updateAppearances — let the PDF reader use the template's own formatting
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

let globalFontBytes: ArrayBuffer | null = null;

async function loadTemplate(kind: "pr" | "po" | "rp" | "payment"): Promise<{ pdfDoc: any; hasForm: boolean; customFont?: any; templateBytes?: ArrayBuffer }> {
  const base =
    kind === "pr" ? "pr-form-lib" :
    kind === "rp" ? "rp-form-lib" :
    kind === "payment" ? "payment-lib" :
    "po-form-lib";

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
      const rpPath = FORM_TEMPLATE_PATHS[kind as keyof typeof FORM_TEMPLATE_PATHS];
      const storageRef = ref(storage, rpPath);
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
        if (!globalFontBytes) {
          const fontRes = await fetch("/fonts/THSarabunNew.ttf");
          if (fontRes.ok) {
            globalFontBytes = await fontRes.arrayBuffer();
          }
        }
        if (globalFontBytes) {
          customFont = await pdfDoc.embedFont(globalFontBytes);
        }
      } catch (_) {}
      if (!customFont) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        pdfDoc.getForm().updateFieldAppearances(font);
      }
      return { pdfDoc, hasForm: true, customFont, templateBytes: arrayBuffer };
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

function fillItemsTable(form: any, items: any[], maxRows = 20, customFont?: any, startIndex = 1) {
  for (let i = 1; i <= maxRows; i++) {
    const idx2 = String(i).padStart(2, "0");
    const item = items[i - 1];
    const displayNum = item ? String(startIndex + i - 1) : "";
    setTextIfExists(form, [`item_no_${idx2}`, `no_${idx2}`, `fill_no_${idx2}`, `fill_${8 + i}`], displayNum, customFont);
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

function safePct(num: number, den: number) {
  if (den <= 0) return "";
  return String(Math.round((num / den) * 10000) / 100) + "%";
}

function fillPaymentRow(
  form: any,
  rowIndex: number,
  item: any,
  displayNum: string,
  customFont?: any
) {
  const idx = String(rowIndex);

  setTextIfExists(form, [`No${idx}`, `no${idx}`, `item_no_${idx}`, `fill_no_${idx}`, `No0`, `no0`, `item_no_0`, `fill_no_0`], displayNum, customFont);

  setTextIfExists(form, [`description${idx}`, `desc${idx}`, `item_desc_${idx}`, `description_${idx}`, `description0`, `desc0`, `item_desc_0`, `description_0`], item?.description || "", customFont);

  setTextIfExists(form, [`unit${idx}`, `item_unit_${idx}`, `unit_${idx}`, `unit0`, `item_unit_0`, `unit_0`], item?.unit || "", customFont);

  setTextIfExists(form, [`qty${idx}`, `item_qty_${idx}`, `quantity_${idx}`, `qty0`, `item_qty_0`, `quantity_0`], item ? fmtQty(item.contractQty) : "", customFont);

  setTextIfExists(form, [`price${idx}`, `item_price_${idx}`, `unit_price_${idx}`, `price0`, `item_price_0`, `unit_price_0`], item ? fmtMoney(item.contractPrice) : "", customFont);

  setTextIfExists(form, [`amount${idx}`, `item_amount_${idx}`, `amount0`, `item_amount_0`], item ? fmtMoney(item.contractAmount) : "", customFont);

  const sumQty = item ? (item.prevAccumQty + item.thisPeriodQty) : 0;
  setTextIfExists(form, [`sumtotalqty${idx}`, `sum_total_qty_${idx}`, `sum_qty_${idx}`, `sumtotalqty0`, `sum_total_qty_0`, `sum_qty_0`], item ? fmtQty(sumQty) : "", customFont);

  const sumAmt = item ? (item.prevAccumAmount + item.thisPeriodAmount) : 0;
  setTextIfExists(form, [`sumamount${idx}`, `sum_amount_${idx}`, `sum_amt_${idx}`, `sumamount`, `sum_amount`, `sum_amt`], item ? fmtMoney(sumAmt) : "", customFont);

  const sumProgress = item ? safePct(sumAmt, item.contractAmount) : "";
  setTextIfExists(form, [`sumprogress${idx}`, `sum_progress_${idx}`, `progress_${idx}`, `sumprogress0`, `sum_progress_0`, `progress_0`], sumProgress, customFont);

  setTextIfExists(form, [`preqty${idx}`, `prev_qty_${idx}`, `pre_qty_${idx}`, `preqty0`, `prev_qty_0`, `pre_qty_0`], item ? fmtQty(item.prevAccumQty) : "", customFont);

  setTextIfExists(form, [`preamount${idx}`, `prev_amount_${idx}`, `pre_amount_${idx}`, `preamount0`, `prev_amount_0`, `pre_amount_0`], item ? fmtMoney(item.prevAccumAmount) : "", customFont);

  const prevProgress = item ? safePct(item.prevAccumAmount, item.contractAmount) : "";
  setTextIfExists(form, [`prev${idx}`, `prev_progress_${idx}`, `prev0`, `prev_progress_0`], prevProgress, customFont);

  setTextIfExists(form, [`nowqty${idx}`, `now_qty_${idx}`, `curr_qty_${idx}`, `nowqty0`, `now_qty_0`, `curr_qty_0`], item ? fmtQty(item.thisPeriodQty) : "", customFont);

  setTextIfExists(form, [`nowamount${idx}`, `now_amount_${idx}`, `curr_amount_${idx}`, `nowamount0`, `now_amount_0`, `curr_amount_0`], item ? fmtMoney(item.thisPeriodAmount) : "", customFont);

  setTextIfExists(form, [`nowcurr${idx}`, `now_curr_${idx}`, `curr_progress_${idx}`, `nowcurr0`, `now_curr_0`, `curr_progress_0`], item ? (String(item.thisPeriodPct) + "%") : "", customFont);
}

export async function generatePRPdfBytes(pr: any, { projectName = "", budgetDesc = "" } = {}) {
  const { pdfDoc: initialDoc, hasForm, customFont, templateBytes } = await loadTemplate("pr");

  const items = (pr.items || []).map((it: any) => ({
    description: it.description || "",
    quantity: it.quantity ?? "",
    unit: it.unit || "",
    note: it.note || "",
    price: it.price ?? 0,
    amount: it.amount ?? (Number(it.quantity || 0) * Number(it.price || 0)),
  }));
  const totalAmount = pr.totalAmount ?? items.reduce((s: number, x: any) => s + Number(x.amount || 0), 0);
  const jobNo = (pr.prNo || pr.id || "").split("-")[0] || "";

  if (hasForm) {
    const mergedPdf = await PDFDocument.create();
    const MAX_ROWS = 5;
    const itemChunks = [];
    if (items.length === 0) itemChunks.push([]);
    else {
      for (let i = 0; i < items.length; i += MAX_ROWS) itemChunks.push(items.slice(i, i + MAX_ROWS));
    }

    const prSigRects: Record<string, any> = {};
    const prFieldRects: Record<string, any> = {};

    for (let c = 0; c < itemChunks.length; c++) {
      const chunk = itemChunks[c];
      
      let pdfDoc = c === 0 ? initialDoc : await PDFDocument.load(templateBytes as ArrayBuffer);
      let pageCustomFont = customFont;
      
      if (c > 0) {
        pdfDoc.registerFontkit(fontkit);
        if (globalFontBytes) pageCustomFont = await pdfDoc.embedFont(globalFontBytes);
        else {
          pageCustomFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
          pdfDoc.getForm().updateFieldAppearances(pageCustomFont);
        }
      }

      const form = pdfDoc.getForm();

      setTextIfExists(form, ["pr_no"], pr.prNo || pr.id || "", pageCustomFont);
      setTextIfExists(form, ["pr_date"], safeDate(pr.requestDate), pageCustomFont);
      setTextIfExists(form, ["pr_name"], pr.requestor || "", pageCustomFont);
      setTextIfExists(form, ["job_no"], jobNo, pageCustomFont);
      setTextIfExists(form, ["pr_type"], (pr.purchaseType || "").split(">")[0].trim(), pageCustomFont);
      setTextIfExists(form, ["pr_urgency"], pr.urgency === "Urgent" ? "ด่วน" : "ปกติ", pageCustomFont);
      setTextIfExists(form, ["pr_location", "Text1"], pr.deliveryLocation || "", pageCustomFont);

      if (pr.cmApproverEmail) setTextIfExists(form, ["prcm", "pr_cm", "prCM", "pr_cm_email", "pr_cm_mail"], pr.cmApproverEmail, pageCustomFont);
      if (pr.pmApproverEmail) setTextIfExists(form, ["prpm", "pr_pm", "prPM", "pr_pm_email", "pr_pm_mail"], pr.pmApproverEmail, pageCustomFont);

      for (let i = 1; i <= MAX_ROWS; i++) {
        const idx2 = String(i).padStart(2, "0");
        const item = chunk[i - 1];
        const absoluteIndex = (c * MAX_ROWS) + i - 1;
        const mainCostCode = absoluteIndex === 0 ? (pr.costCode || item?.costCode || "") : (item?.costCode || "");
        setTextIfExists(form, [`pr_costcode${idx2}`, `pr_costcode`], item ? mainCostCode : (i === 1 && absoluteIndex === 0 ? (pr.costCode || "") : ""), pageCustomFont);
        setTextIfExists(form, [`pr_detail${idx2}`], item?.description || "", pageCustomFont);
        setTextIfExists(form, [`pr_qty${idx2}`], item ? fmtQty(item.quantity) : "", pageCustomFont);
        setTextIfExists(form, [`pr_unit${idx2}`], item?.unit || "", pageCustomFont);
        setTextIfExists(form, [`pr_text${idx2}`], item?.note || "", pageCustomFont);
      }

      const saveFieldRect = (name: string) => {
        try {
          const f = form.getField(name);
          const widgets = f.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            prFieldRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: c };
          }
        } catch (_) {}
      };

      ["Signature1", "Signature2", "Signature3"].forEach((name) => {
        saveFieldRect(name);
        if (prFieldRects[name]) prSigRects[name] = prFieldRects[name];
      });
      ["prcm", "prpm", "pr_cm", "pr_pm"].forEach(saveFieldRect);

      try { form.flatten(); } catch (_) {}
      const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
      mergedPdf.addPage(copiedPage);
    }

    try { mergedPdf.getForm(); } catch (_) {}

    if (Object.keys(prSigRects).length > 0) {
      try {
        const newForm = mergedPdf.getForm();
        const metaField = newForm.createTextField("_sigRects");
        metaField.setText(JSON.stringify(prSigRects));
        metaField.addToPage(mergedPdf.getPages()[0], { x: -200, y: -200, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
    if (Object.keys(prFieldRects).length > 0) {
      try {
        const newForm = mergedPdf.getForm();
        const metaField = newForm.createTextField("_fieldRects");
        metaField.setText(JSON.stringify(prFieldRects));
        metaField.addToPage(mergedPdf.getPages()[0], { x: -200, y: -201, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
    return await mergedPdf.save();
  } else {
    const lines: string[] = [
      `## Purchase Request`, ``,
      `PR No.        : ${pr.prNo || pr.id || "-"}`,
      `วันที่         : ${safeDate(pr.requestDate)}`,
      `Job No.       : ${jobNo}`,
      `ผู้ขอซื้อ      : ${pr.requestor || "-"}`,
      `ประเภท        : ${(pr.purchaseType || "-").split(">")[0].trim()}`,
      `ความเร่งด่วน   : ${pr.urgency === "Urgent" ? "ด่วน" : "ปกติ"}`,
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
    await buildBasicPage(initialDoc, lines, customFont);
    return await initialDoc.save();
  }
}

export async function generatePOPdfBytes(po: any, { vendor = null, project = null }: { vendor?: any; project?: any } = {}) {
  const { pdfDoc: initialDoc, hasForm, customFont, templateBytes } = await loadTemplate("po");

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
    const mergedPdf = await PDFDocument.create();
    const MAX_ROWS = 10;
    const itemChunks = [];
    if (items.length === 0) itemChunks.push([]);
    else {
      for (let i = 0; i < items.length; i += MAX_ROWS) itemChunks.push(items.slice(i, i + MAX_ROWS));
    }

    const sigRects: Record<string, any> = {};
    const fieldRects: Record<string, any> = {};

    for (let c = 0; c < itemChunks.length; c++) {
      const chunk = itemChunks[c];
      let pdfDoc = c === 0 ? initialDoc : await PDFDocument.load(templateBytes as ArrayBuffer);
      let pageCustomFont = customFont;
      
      if (c > 0) {
        pdfDoc.registerFontkit(fontkit);
        if (globalFontBytes) pageCustomFont = await pdfDoc.embedFont(globalFontBytes);
        else {
          pageCustomFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
          pdfDoc.getForm().updateFieldAppearances(pageCustomFont);
        }
      }

      const form = pdfDoc.getForm();

      try {
        const allFields = form.getFields().map((f: any) => f.getName());
        console.log("[PO PDF] Form fields:", allFields);
      } catch (_) {}

      setTextIfExists(form, ["po_no", "poNo", "pono", "PONo", "PO_NO"], po.poNo || po.id || "", pageCustomFont);
      const poDateValue = safeDate(po.poDate || po.poOpenDate || po.createdDate);
      setTextIfExists(form, ["po_date", "poDate", "po_open_date", "open_date", "date", "PO_DATE"], poDateValue, pageCustomFont);
      setTextIfExists(form, ["receive_date", "receivedate", "due_date"], safeDate(po.requiredDate), pageCustomFont);
      setTextIfExists(form, ["location_receive", "location", "remark"], po.location || "", pageCustomFont);
      setMultilineIfExists(form, ["reason", "Reason", "po_reason", "poReason"], po.reason || "", pageCustomFont);
      const createDateStr = safeDate(po.createdDate || po.poDate || po.poOpenDate);
      setTextIfExists(form, ["createdate", "create_date", "date_create", "sig1date"], createDateStr, pageCustomFont);
      if (po.pcmdate) setTextIfExists(form, ["pcmdate", "pcm_date", "PCMDate"], po.pcmdate, pageCustomFont);
      if (po.gmdate)  setTextIfExists(form, ["gmdate",  "gm_date",  "GMDate"],  po.gmdate,  pageCustomFont);
      setTextIfExists(form, ["vendor_contact", "vendorcontact", "vendorcode", "vendor_code"], vendorCode, pageCustomFont);
      setTextIfExists(form, ["vendor_name", "vendorname"], vendorName, pageCustomFont);
      setMultilineIfExists(form, ["vendor_address", "vendoraddress"], vendorAddressWithTel, pageCustomFont);
      setTextIfExists(form, ["vendor_credit_term", "vendor", "vendorcredit", "vendorco"], vendorCredit, pageCustomFont);

      const startIndex = (c * MAX_ROWS) + 1;
      fillItemsTable(form, chunk, MAX_ROWS, pageCustomFont, startIndex);

      setTextIfExists(form, ["total_amount", "amount", "fill_10"], fmtMoney(subtotal), pageCustomFont);
      setTextIfExists(form, ["discount", "fill_11"], fmtMoney(discount), pageCustomFont);
      setTextIfExists(form, ["sub_total", "subtotal", "fill_12"], fmtMoney(subTotalAfterDiscount), pageCustomFont);
      setTextIfExists(form, ["vat_7", "vat7", "fill_13"], fmtMoney(vat), pageCustomFont);
      setTextIfExists(form, ["net_total", "total", "fill_7"], fmtMoney(netTotal), pageCustomFont);

      const saveFieldRect = (name: string) => {
        try {
          const f = form.getField(name);
          const widgets = f.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            fieldRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: c };
          }
        } catch (_) {}
      };

      ["Signature1", "Signature2", "Signature3"].forEach((name) => {
        saveFieldRect(name);
        if (fieldRects[name]) sigRects[name] = fieldRects[name];
      });
      ["pcmdate", "gmdate", "reason", "createdate", "create_date", "date_create", "sig1date"].forEach(saveFieldRect);

      try { form.flatten(); } catch (_) {}
      const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
      mergedPdf.addPage(copiedPage);
    }

    try { mergedPdf.getForm(); } catch (_) {}
    if (Object.keys(sigRects).length > 0) {
      try {
        const newForm = mergedPdf.getForm();
        const metaField = newForm.createTextField("_sigRects");
        metaField.setText(JSON.stringify(sigRects));
        metaField.addToPage(mergedPdf.getPages()[0], { x: -200, y: -200, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
    if (Object.keys(fieldRects).length > 0) {
      try {
        const newForm = mergedPdf.getForm();
        const metaField = newForm.createTextField("_fieldRects");
        metaField.setText(JSON.stringify(fieldRects));
        metaField.addToPage(mergedPdf.getPages()[0], { x: -200, y: -201, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
    return await mergedPdf.save();
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
    await buildBasicPage(initialDoc, lines as string[]);
    return await initialDoc.save();
  }
}

/**
 * Generate Payment Application PDF bytes from payment-lib.pdf template.
 *
 * Form field names (from template):
 *   projects, contractname, pono, contract, due, attachment,
 *   payno, preiod, month, today, createdate, cmdate, pmdate
 *   No1..No5, description1..description5, unit1..unit5,
 *   qty1..qty5, price1..price5, amount1..amount5,
 *   sumtotalqty1..sumtotalqty5, sumamount1..sumamount5, sumprogress1..sumprogress5,
 *   preqty1..preqty5, preamount1..preamount5, prev1..prev5,
 *   nowqty1..nowqty5, nowamount1..nowamount5, nowcurr1..nowcurr5
 *   (also supports legacy 0-index field names)
 */
export async function generatePaymentPdfBytes(
  payment: any,
  { project = null, contractor = null, pos = [] }: { project?: any; contractor?: any; pos?: any[] } = {}
): Promise<Uint8Array> {
  const { pdfDoc: initialDoc, hasForm, customFont, templateBytes } = await loadTemplate("payment");

  const items = (payment.items || []).map((it: any) => ({
    description: it.description || "",
    unit: it.unit || "",
    contractQty: Number(it.contractQty) || 0,
    contractPrice: Number(it.contractPrice) || 0,
    contractAmount: (Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0),
    prevAccumQty: Number(it.prevAccumQty) || 0,
    prevAccumAmount: Number(it.prevAccumAmount) || 0,
    thisPeriodQty: Number(it.thisPeriodQty) || 0,
    thisPeriodAmount: Number(it.thisPeriodAmount) || 0,
    thisPeriodPct: Number(it.thisPeriodPct) || 0,
  }));

  const poNos = (payment.selectedPrIds || [])
    .map((id: string) => {
      const po = (pos || []).find((p: any) => p.id === id);
      return po?.poNo || "";
    })
    .filter(Boolean)
    .join(", ");

  const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const todayDate = new Date();
  const monthValue = payment.billingCycle
    ? payment.billingCycle
    : `${thaiMonths[todayDate.getMonth()]} ${todayDate.getFullYear() + 543}`;

  const headerData = {
    projects: project?.name || payment.projectId || "",
    contractname: contractor?.name || payment.contractorName || "",
    pono: poNos || payment.poNo || "",
    contract: payment.contractTitle || "",
    due: payment.billingCycle || "",
    attachment: (payment.paymentAttachments || []).length > 0 ? String((payment.paymentAttachments || []).length) : "",
    payno: payment.paymentNo || payment.id || "",
    preiod: payment.periodNo || "1",
    month: monthValue,
    today: safeDate(payment.createdAt || new Date().toISOString()),
    createdate: safeDate(payment.createdAt || new Date().toISOString()),
    cmdate: safeDate(payment.cmApprovedAt || payment.cmApprovedDate || ""),
    pmdate: safeDate(payment.pmApprovedAt || payment.pmApprovedDate || ""),
  };

  if (hasForm) {
    const mergedPdf = await PDFDocument.create();
    const MAX_ROWS = 17;

    // Estimate how many "line units" an item consumes based on description length
    function estimateLineCost(description: string): number {
      const len = (description || "").length;
      if (len <= 40) return 1;
      if (len <= 80) return 2;
      return 3;
    }

    const itemChunks: any[][] = [];
    if (items.length === 0) {
      itemChunks.push([]);
    } else {
      let currentChunk: any[] = [];
      let currentLines = 0;
      for (const item of items) {
        const cost = estimateLineCost(item.description);
        if (currentLines + cost > MAX_ROWS && currentChunk.length > 0) {
          itemChunks.push(currentChunk);
          currentChunk = [item];
          currentLines = cost;
        } else {
          currentChunk.push(item);
          currentLines += cost;
        }
      }
      if (currentChunk.length > 0) itemChunks.push(currentChunk);
    }

    let itemsFilled = 0;
    for (let c = 0; c < itemChunks.length; c++) {
      const chunk = itemChunks[c];
      let pdfDoc = c === 0 ? initialDoc : await PDFDocument.load(templateBytes as ArrayBuffer);
      let pageCustomFont = customFont;

      if (c > 0) {
        pdfDoc.registerFontkit(fontkit);
        if (globalFontBytes) pageCustomFont = await pdfDoc.embedFont(globalFontBytes);
        else {
          pageCustomFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
        }
      }

      const form = pdfDoc.getForm();

      // 1. Fill item rows
      const startIndex = itemsFilled + 1;
      for (let r = 0; r < MAX_ROWS; r++) {
        const item = chunk[r] || null;
        const displayNum = item ? String(startIndex + r) : "";
        fillPaymentRow(form, r + 1, item, displayNum, pageCustomFont);
      }
      itemsFilled += chunk.length;

      // 2. Fill header fields
      setTextIfExists(form, ["projects"], headerData.projects, pageCustomFont);
      setTextIfExists(form, ["contractname"], headerData.contractname, pageCustomFont);
      setTextIfExists(form, ["pono"], headerData.pono, pageCustomFont);
      setTextIfExists(form, ["contract"], headerData.contract, pageCustomFont);
      setTextIfExists(form, ["due"], headerData.due, pageCustomFont);
      setTextIfExists(form, ["attachment"], headerData.attachment, pageCustomFont);
      setTextIfExists(form, ["payno"], headerData.payno, pageCustomFont);
      setTextIfExists(form, ["preiod"], headerData.preiod, pageCustomFont);
      setTextIfExists(form, ["month"], headerData.month, pageCustomFont);
      setTextIfExists(form, ["today"], headerData.today, pageCustomFont);
      setTextIfExists(form, ["createdate"], headerData.createdate, pageCustomFont);
      setTextIfExists(form, ["cmdate"], headerData.cmdate, pageCustomFont);
      setTextIfExists(form, ["pmdate"], headerData.pmdate, pageCustomFont);

      // 3. Fill grand total fields
      const totalContractAmount = items.reduce((s: number, it: any) => s + Number(it.contractAmount || 0), 0);
      const totalAccumQty       = items.reduce((s: number, it: any) => s + (Number(it.prevAccumQty || 0) + Number(it.thisPeriodQty || 0)), 0);
      const totalAccumAmount    = items.reduce((s: number, it: any) => s + (Number(it.prevAccumAmount || 0) + Number(it.thisPeriodAmount || 0)), 0);
      const totalPrevAmount     = items.reduce((s: number, it: any) => s + Number(it.prevAccumAmount || 0), 0);
      const totalThisAmount     = items.reduce((s: number, it: any) => s + Number(it.thisPeriodAmount || 0), 0);

      setTextIfExists(form, ["grandamount"], fmtMoney(totalContractAmount), pageCustomFont);
      setTextIfExists(form, ["grandtotal"], fmtMoney(totalAccumAmount), pageCustomFont);
      setTextIfExists(form, ["grandprogress", "grandprog"], safePct(totalAccumAmount, totalContractAmount), pageCustomFont);
      setTextIfExists(form, ["grandprev"], fmtMoney(totalPrevAmount), pageCustomFont);
      setTextIfExists(form, ["grandpercentprev", "grandperc"], safePct(totalPrevAmount, totalContractAmount), pageCustomFont);
      setTextIfExists(form, ["grandcurr"], fmtMoney(totalThisAmount), pageCustomFont);
      setTextIfExists(form, ["grandpercentcurr", "grandper"], safePct(totalThisAmount, totalContractAmount), pageCustomFont);

      try { form.flatten(); } catch (_) {}

      const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
      mergedPdf.addPage(copiedPage);
    }

    return await mergedPdf.save();
  } else {
    const lines: string[] = [
      `## แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION`, ``,
      `เลขที่เบิก      : ${payment.paymentNo || payment.id || "-"}`,
      `โครงการ        : ${headerData.projects}`,
      `ผู้รับเหมา      : ${headerData.contractname}`,
      `ชื่อสัญญา      : ${headerData.contract}`,
      `รอบวางบิล      : ${headerData.due}`,
      `งวดงาน        : ${headerData.preiod}`,
      `วันที่          : ${headerData.today}`,
      ``,
      `## รายการ`,
      `${"No.".padEnd(4)} ${"รายการ".padEnd(30)} ${"หน่วย".padEnd(8)} ${"ปริมาณ".padEnd(12)} ${"ราคา/หน่วย".padEnd(12)} ${"จำนวนเงิน"}`,
      `${"-".repeat(80)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.description).substring(0, 28).padEnd(30)} ${String(it.unit).padEnd(8)} ${fmtQty(it.contractQty).padEnd(12)} ${fmtMoney(it.contractPrice).padEnd(12)} ${fmtMoney(it.contractAmount)}`
      ),
      `${"-".repeat(80)}`,
      ``,
      `* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด Payment Form ในหน้า Admin → แบบฟอร์ม PDF`,
    ];
    await buildBasicPage(initialDoc, lines);
    return await initialDoc.save();
  }
}

/**
 * Generate RP (Receive Product) PDF bytes from rp-form-lib.pdf template.
 *
 * Form field names (from template):
 *   rpno        — RP No.
 *   recievedate — วันที่รับสินค้า
 *   jobno       — สินค้าของโครงการ (job/project code เช่น J74)
 *   location    — สถานที่รับเข้า
 *   prno        — อ้างอิงใบขอซื้อ (PR No.)
 *   pono        — อ้างอิงใบสั่งซื้อ (PO No.)
 *   docno       — เลขที่ใบแจ้งหนี้/ใบส่งของ/ใบกำกับภาษี
 *   vendor      — ผู้จำหน่าย (vendor name)
 *   user        — ผู้จัดทำ (stamp ลายเซ็น)
 *   no_N        — ลำดับรายการ (1-7)
 *   code_N      — รหัสสินค้า
 *   list_N      — รายการ/description
 *   qty_N       — จำนวน
 *   unit_N      — หน่วย
 *   rateunit_N  — ราคาต่อหน่วย
 *   price_N     — จำนวนเงิน
 */
export async function generateRPPdfBytes(
  rp: any,
  opts: { signatureUrl?: string } = {}
): Promise<Uint8Array> {
  const { pdfDoc: initialDoc, hasForm, customFont, templateBytes } = await loadTemplate("rp");

  const items = (rp.items || []).map((it: any) => ({
    materialNo: it.materialNo || "",
    description: it.description || "",
    receivedQty: it.receivedQty ?? it.quantity ?? "",
    unit: it.unit || "",
    price: it.price ?? 0,
    amount: it.amount ?? (Number(it.receivedQty ?? it.quantity ?? 0) * Number(it.price ?? 0)),
  }));

  let bytes: Uint8Array;

  if (hasForm) {
    const mergedPdf = await PDFDocument.create();
    const MAX_ROWS = 7;
    const itemChunks = [];
    if (items.length === 0) itemChunks.push([]);
    else {
      for (let i = 0; i < items.length; i += MAX_ROWS) itemChunks.push(items.slice(i, i + MAX_ROWS));
    }

    const rpFieldRects: Record<string, any> = {};

    for (let c = 0; c < itemChunks.length; c++) {
      const chunk = itemChunks[c];
      let pdfDoc = c === 0 ? initialDoc : await PDFDocument.load(templateBytes as ArrayBuffer);
      let pageCustomFont = customFont;
      
      if (c > 0) {
        pdfDoc.registerFontkit(fontkit);
        if (globalFontBytes) pageCustomFont = await pdfDoc.embedFont(globalFontBytes);
        else {
          pageCustomFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
          pdfDoc.getForm().updateFieldAppearances(pageCustomFont);
        }
      }

      const form = pdfDoc.getForm();

      try {
        console.log("[RP PDF] Form fields:", form.getFields().map((f: any) => f.getName()));
      } catch (_) {}

      setTextIfExists(form, ["rpno", "rp_no", "RP_NO"], rp.rpNo || rp.receiveNo || "", pageCustomFont);
      setTextIfExists(form, ["recievedate", "receivedate", "receive_date"], safeDate(rp.receivedDate || rp.createdAt), pageCustomFont);
      setTextIfExists(form, ["jobno", "job_no", "jobNo"], rp.projectItemCode || rp.jobNo || "", pageCustomFont);
      setTextIfExists(form, ["location", "Location"], rp.location || "", pageCustomFont);
      setTextIfExists(form, ["prno", "pr_no", "PR_NO"], rp.prNo || "", pageCustomFont);
      setTextIfExists(form, ["pono", "po_no", "PO_NO"], rp.poNo || "", pageCustomFont);
      setTextIfExists(form, ["docno", "doc_no", "DOC_NO"], rp.documentNo || "", pageCustomFont);
      setTextIfExists(form, ["vendor", "Vendor", "vendor_name", "vendorname", "supplier", "suppliername"], rp.vendorName || "", pageCustomFont);

      for (let i = 1; i <= MAX_ROWS; i++) {
        const item = chunk[i - 1];
        const absoluteIndex = (c * MAX_ROWS) + i;
        setTextIfExists(form, [`no_${i}`, `item_no_${i}`], item ? String(absoluteIndex) : "", pageCustomFont);
        setTextIfExists(form, [`code_${i}`, `item_code_${i}`], item?.materialNo || "", pageCustomFont);
        setTextIfExists(form, [`list_${i}`, `item_list_${i}`, `desc_${i}`], item?.description || "", pageCustomFont);
        setTextIfExists(form, [`qty_${i}`, `item_qty_${i}`], item ? fmtQty(item.receivedQty) : "", pageCustomFont);
        setTextIfExists(form, [`unit_${i}`, `item_unit_${i}`], item?.unit || "", pageCustomFont);
        setTextIfExists(form, [`rateunit_${i}`, `rate_unit_${i}`, `item_price_${i}`], item ? fmtMoney(item.price) : "", pageCustomFont);
        setTextIfExists(form, [`price_${i}`, `item_amount_${i}`, `amount_${i}`], item ? fmtMoney(item.amount) : "", pageCustomFont);
      }

      setTextIfExists(form, ["user", "User", "creator", "creatorname"], rp.receivedByName || "", pageCustomFont);

      const saveFieldRect = (name: string) => {
        try {
          const f = form.getField(name);
          const widgets = f.acroField.getWidgets();
          if (widgets.length > 0) {
            const rect = widgets[0].getRectangle();
            rpFieldRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: c };
          }
        } catch (_) {}
      };

      ["user", "User", "Signature1"].forEach(saveFieldRect);

      try { form.flatten(); } catch (_) {}
      const [copiedPage] = await mergedPdf.copyPages(pdfDoc, [0]);
      mergedPdf.addPage(copiedPage);
    }

    try { mergedPdf.getForm(); } catch (_) {}

    if (Object.keys(rpFieldRects).length > 0) {
      try {
        const newForm = mergedPdf.getForm();
        const metaField = newForm.createTextField("_fieldRects");
        metaField.setText(JSON.stringify(rpFieldRects));
        metaField.addToPage(mergedPdf.getPages()[0], { x: -200, y: -201, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }

    bytes = await mergedPdf.save();
  } else {
    const lines: string[] = [
      `## ใบตรวจรับสินค้า`, ``,
      `RP No.            : ${rp.rpNo || rp.receiveNo || "-"}`,
      `วันที่รับสินค้า   : ${safeDate(rp.receivedDate || rp.createdAt)}`,
      `สินค้าของโครงการ  : ${rp.projectItemCode || rp.jobNo || "-"}`,
      `ผู้จำหน่าย        : ${rp.vendorName || "-"}`,
      `อ้างอิงใบขอซื้อ   : ${rp.prNo || "-"}`,
      `อ้างอิงใบสั่งซื้อ : ${rp.poNo || "-"}`,
      `เลขที่เอกสาร      : ${rp.documentNo || "-"}`,
      `ผู้จัดทำ          : ${rp.receivedByName || "-"}`,
      ``,
      `## รายการสินค้า`,
      `${"No.".padEnd(4)} ${"รหัสสินค้า".padEnd(14)} ${"รายการ".padEnd(28)} ${"จำนวน".padEnd(8)} ${"หน่วย"}`,
      `${"-".repeat(66)}`,
      ...items.map((it: any, i: number) =>
        `${String(i + 1).padEnd(4)} ${String(it.materialNo || "").substring(0, 12).padEnd(14)} ${String(it.description).substring(0, 26).padEnd(28)} ${String(it.receivedQty).padEnd(8)} ${String(it.unit)}`
      ),
      `${"-".repeat(66)}`,
      ``,
      `* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด RP Form ในหน้า Admin → แบบฟอร์ม PDF`,
    ];
    await buildBasicPage(initialDoc, lines);
    bytes = await initialDoc.save();
  }

  // Stamp signature image at "user" field position (หลัง flatten)
  if (opts.signatureUrl) {
    try {
      bytes = await stampSignatureToFieldByName(bytes, opts.signatureUrl, "user");
    } catch (e) {
      console.warn("[generateRPPdfBytes] Cannot stamp signature:", e);
    }
  }

  return bytes;
}

/**
 * Stamp signature image at a named field rect (lookup from _fieldRects).
 * Internal helper for RP — similar to stampSignatureToField but accepts arbitrary field name.
 */
async function stampSignatureToFieldByName(
  pdfBytes: Uint8Array,
  signatureImageUrl: string,
  fieldName: string,
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
  try { embeddedImg = await pdfDoc.embedPng(imgBytes); } catch (_) {
    try { embeddedImg = await pdfDoc.embedJpg(imgBytes); } catch (e2) {
      throw new Error("Unsupported signature image format. Please upload PNG or JPG.");
    }
  }

  const pages = pdfDoc.getPages();
  let placed = false;

  // Step 1: try live field
  try {
    const form = pdfDoc.getForm();
    const field = form.getField(fieldName);
    const widgets = field.acroField.getWidgets();
    if (widgets.length > 0) {
      const rect = widgets[0].getRectangle();
      for (const targetPage of pages) {
        targetPage.drawImage(embeddedImg, {
          x: rect.x + padding, y: rect.y + padding,
          width: rect.width - padding * 2, height: rect.height - padding * 2, opacity: 0.9,
        });
      }
      try { form.removeField(field); } catch (_) {}
      placed = true;
    }
  } catch (_) {}

  // Step 2: read from _fieldRects
  if (!placed) {
    try {
      const form = pdfDoc.getForm();
      let rects: any = {};
      try {
        const meta = form.getTextField("_fieldRects");
        rects = JSON.parse(meta.getText() || "{}");
      } catch (_) {}
      const r = rects[fieldName];
      if (r) {
        for (const targetPage of pages) {
          targetPage.drawImage(embeddedImg, {
            x: r.x + padding, y: r.y + padding,
            width: r.width - padding * 2, height: r.height - padding * 2, opacity: 0.9,
          });
        }
        placed = true;
      }
    } catch (_) {}
  }

  // Step 3: fallback hardcoded bottom-center
  if (!placed) {
    for (const targetPage of pages) {
      const { width: pw } = targetPage.getSize();
      targetPage.drawImage(embeddedImg, {
        x: pw / 2 - 65, y: 50, width: 130, height: 50, opacity: 0.9,
      });
    }
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
  try {
    embeddedImg = await pdfDoc.embedPng(imgBytes);
  } catch (_) {
    try {
      embeddedImg = await pdfDoc.embedJpg(imgBytes);
    } catch (e2) {
      // Likely WEBP/unsupported — bail with clearer error
      throw new Error("Unsupported signature image format. Please upload PNG or JPG.");
    }
  }

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
      for (const targetPage of pages) {
        targetPage.drawImage(embeddedImg, {
          x: rect.x + padding, y: rect.y + padding,
          width: rect.width - padding * 2, height: rect.height - padding * 2, opacity: 0.9,
        });
      }
      try { form.removeField(field); } catch (_) {}
      placed = true;
      console.log(`[stampSignatureToField] ${fieldName} stamped from live field on all pages`);
    }
  } catch (_) {}

  // Step 2: อ่าน rect จาก hidden _sigRects field (บันทึกไว้ก่อน flatten)
  if (!placed) {
    try {
      const form = pdfDoc.getForm();
      let rects: any = {};
      try {
        const metaField = form.getTextField("_sigRects");
        rects = JSON.parse(metaField.getText() || "{}");
      } catch (_) {}
      if (!rects || Object.keys(rects).length === 0) {
        try {
          const metaField2 = form.getTextField("_fieldRects");
          rects = JSON.parse(metaField2.getText() || "{}");
        } catch (_) {}
      }
      const r = rects[fieldName];
      if (r) {
        for (const targetPage of pages) {
          targetPage.drawImage(embeddedImg, {
            x: r.x + padding, y: r.y + padding,
            width: r.width - padding * 2, height: r.height - padding * 2, opacity: 0.9,
          });
        }
        placed = true;
        console.log(`[stampSignatureToField] ${fieldName} stamped from saved rect on all pages`);
      }
    } catch (_) {}
  }

  // Step 3: Fallback hardcoded — แถวลายเซ็น 3 คนเรียงแนวนอนล่างหน้า
  if (!placed) {
    console.warn(`[stampSignatureToField] Using hardcoded fallback for ${fieldName}`);
    for (const targetPage of pages) {
      const { width: pw } = targetPage.getSize();
      const fp: Record<string, { x: number; y: number; w: number; h: number }> = {
        Signature1: { x: 40,          y: 60, w: 130, h: 50 },
        Signature2: { x: pw/2 - 65,   y: 60, w: 130, h: 50 },
        Signature3: { x: pw - 170,    y: 60, w: 130, h: 50 },
      };
      const pos = fp[fieldName] ?? { x: 40, y: 60, w: 130, h: 50 };
      targetPage.drawImage(embeddedImg, { x: pos.x, y: pos.y, width: pos.w, height: pos.h, opacity: 0.9 });
    }
  }

  return await pdfDoc.save();
}

// Stamp text into a named field rect (works after flatten via _fieldRects)
export async function stampTextToFieldRect(
  pdfBytes: Uint8Array,
  text: string,
  fieldName: string,
  opts: { fontSize?: number; padding?: number } = {}
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();
  const padding = opts.padding ?? 3;
  const fontSize = opts.fontSize ?? (fieldName === "reason" ? 10 : 9);

  // Try embed Thai font (if available)
  let font: any = null;
  try {
    pdfDoc.registerFontkit(fontkit);
    const res = await fetch("/fonts/THSarabunNew.ttf");
    if (res.ok) {
      const bytes = await res.arrayBuffer();
      font = await pdfDoc.embedFont(bytes);
    }
  } catch (_) {}
  if (!font) font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // If live field exists (unflattened) try setText
  try {
    const form = pdfDoc.getForm();
    const f = form.getTextField(fieldName);
    f.setText(text || "");
    try { f.updateAppearances(font); } catch (_) {}
    return await pdfDoc.save();
  } catch (_) {}

  // Read rect from _fieldRects
  let rects: any = {};
  try {
    const form = pdfDoc.getForm();
    const meta = form.getTextField("_fieldRects");
    rects = JSON.parse(meta.getText() || "{}");
  } catch (_) {}
  const r = rects?.[fieldName];
  if (!r) return await pdfDoc.save();

  const boxW = Math.max(10, r.width - padding * 2);
  const boxH = Math.max(10, r.height - padding * 2);
  const x0 = r.x + padding;
  let y0 = r.y + padding;

  const value = String(text || "");
  if (fieldName !== "reason") {
    // center vertically for date fields
    const y = y0 + boxH / 2 - fontSize / 2 + 1;
    for (const page of pages) {
      page.drawText(value, { x: x0, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    }
    return await pdfDoc.save();
  }

  // reason: multiline wrap
  const maxLines = Math.max(1, Math.floor(boxH / (fontSize + 2)));
  const approxCharsPerLine = Math.max(8, Math.floor(boxW / (fontSize * 0.55)));
  const lines: string[] = [];
  let cur = "";
  for (const ch of value) {
    cur += ch;
    if (cur.length >= approxCharsPerLine) {
      lines.push(cur);
      cur = "";
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  // draw from top
  const startY = r.y + r.height - padding - (fontSize + 1);
  for (const page of pages) {
    for (let i = 0; i < lines.length; i++) {
      const y = startY - i * (fontSize + 2);
      page.drawText(lines[i], { x: x0, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
    }
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


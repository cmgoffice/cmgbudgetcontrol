const fs = require('fs');

const path = 'src/lib/pdfForms.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. loadTemplate and globalFontBytes
const loadTemplateOld = `async function loadTemplate(kind: "pr" | "po" | "rp"): Promise<{ pdfDoc: any; hasForm: boolean; customFont?: any }> {
  const base = kind === "pr" ? "pr-form-lib" : kind === "rp" ? "rp-form-lib" : "po-form-lib";

  const localCandidates = [
    \`/\${base}.pdf\`,
    \`/\${base}.pdf.pdf\`,
    \`/forms/\${base}.pdf\`,
    \`/forms/\${base}.pdf.pdf\`,
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
}`;

const loadTemplateNew = `let globalFontBytes: ArrayBuffer | null = null;

async function loadTemplate(kind: "pr" | "po" | "rp"): Promise<{ pdfDoc: any; hasForm: boolean; customFont?: any; templateBytes?: ArrayBuffer }> {
  const base = kind === "pr" ? "pr-form-lib" : kind === "rp" ? "rp-form-lib" : "po-form-lib";

  const localCandidates = [
    \`/\${base}.pdf\`,
    \`/\${base}.pdf.pdf\`,
    \`/forms/\${base}.pdf\`,
    \`/forms/\${base}.pdf.pdf\`,
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
}`;

code = code.replace(loadTemplateOld, loadTemplateNew);


// 2. generatePRPdfBytes
const prOld = \`export async function generatePRPdfBytes(pr: any, { projectName = "", budgetDesc = "" } = {}) {
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
    setTextIfExists(form, ["pr_type"], (pr.purchaseType || "").split(">")[0].trim(), customFont);
    setTextIfExists(form, ["pr_urgency"], pr.urgency === "Urgent" ? "ด่วน" : "ปกติ", customFont);
    setTextIfExists(form, ["pr_location", "Text1"], pr.deliveryLocation || "", customFont);

    // Approver emails (ใส่เมื่อมีข้อมูล)
    if (pr.cmApproverEmail) setTextIfExists(form, ["prcm", "pr_cm", "prCM", "pr_cm_email", "pr_cm_mail"], pr.cmApproverEmail, customFont);
    if (pr.pmApproverEmail) setTextIfExists(form, ["prpm", "pr_pm", "prPM", "pr_pm_email", "pr_pm_mail"], pr.pmApproverEmail, customFont);

    // Item rows (สูงสุด 5 แถวตาม template pr-form-lib.pdf)
    const MAX_ROWS = 5;
    for (let i = 1; i <= MAX_ROWS; i++) {
      const idx2 = String(i).padStart(2, "0");
      const item = items[i - 1];
      // Cost code — แถวแรกใช้จาก pr.costCode, แถวอื่นใช้จาก item.costCode ถ้ามี
      const costCode = i === 1 ? (pr.costCode || item?.costCode || "") : (item?.costCode || "");
      setTextIfExists(form, [\`pr_costcode\${idx2}\`, \`pr_costcode\`], item ? costCode : (i === 1 ? (pr.costCode || "") : ""), customFont);
      setTextIfExists(form, [\`pr_detail\${idx2}\`], item?.description || "", customFont);
      setTextIfExists(form, [\`pr_qty\${idx2}\`], item ? fmtQty(item.quantity) : "", customFont);
      setTextIfExists(form, [\`pr_unit\${idx2}\`], item?.unit || "", customFont);
      setTextIfExists(form, [\`pr_text\${idx2}\`], item?.note || "", customFont);
    }

    // บันทึก rect ของ fields ก่อน flatten (ใช้ stamp หลัง approve)
    const prSigRects: Record<string, { x: number; y: number; width: number; height: number; page: number }> = {};
    const prFieldRects: Record<string, { x: number; y: number; width: number; height: number; page: number }> = {};
    const saveFieldRect = (name: string) => {
      try {
        const f = form.getField(name);
        const widgets = f.acroField.getWidgets();
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
          prFieldRects[name] = { x: rect.x, y: rect.y, width: rect.width, height: rect.height, page: pageIdx };
        }
      } catch (_) {}
    };

    ["Signature1", "Signature2", "Signature3"].forEach((name) => {
      saveFieldRect(name);
      if (prFieldRects[name]) prSigRects[name] = prFieldRects[name];
    });
    // Approver email fields we want to stamp when approving
    ["prcm", "prpm", "pr_cm", "pr_pm"].forEach(saveFieldRect);

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
    // Re-embed all rects เป็น "_fieldRects"
    if (Object.keys(prFieldRects).length > 0) {
      try {
        const newForm = pdfDoc.getForm();
        const metaField = newForm.createTextField("_fieldRects");
        metaField.setText(JSON.stringify(prFieldRects));
        const metaPage = pdfDoc.getPages()[0];
        metaField.addToPage(metaPage, { x: -200, y: -201, width: 1, height: 1, borderWidth: 0 });
      } catch (_) {}
    }
  } else {
    const lines: string[] = [
      \`## Purchase Request\`, \`\`,
      \`PR No.        : \${pr.prNo || pr.id || "-"}\`,
      \`วันที่         : \${safeDate(pr.requestDate)}\`,
      \`Job No.       : \${jobNo}\`,
      \`ผู้ขอซื้อ      : \${pr.requestor || "-"}\`,
      \`ประเภท        : \${(pr.purchaseType || "-").split(">")[0].trim()}\`,
      \`ความเร่งด่วน   : \${pr.urgency === "Urgent" ? "ด่วน" : "ปกติ"}\`,
      \`สถานที่        : \${pr.deliveryLocation || "-"}\`,
      \`Cost Code     : \${pr.costCode || "-"}\`,
      \`\`,
      \`## รายการ\`,
      \`\${\"No.\".padEnd(4)} \${\"รายการ\".padEnd(30)} \${\"จำนวน\".padEnd(8)} \${\"หน่วย\".padEnd(8)}\`,
      \`\${\"-\".repeat(60)}\`,
      ...items.map((it: any, i: number) =>
        \`\${String(i + 1).padEnd(4)} \${String(it.description).substring(0, 28).padEnd(30)} \${String(it.quantity).padEnd(8)} \${String(it.unit).padEnd(8)}\`
      ),
      \`\${\"-\".repeat(60)}\`,
      \`\`,
      \`* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด PR Form ในหน้า Admin → แบบฟอร์ม PDF\`,
    ];
    await buildBasicPage(pdfDoc, lines, customFont);
  }

  return await pdfDoc.save();
}\`;

const prNew = \`export async function generatePRPdfBytes(pr: any, { projectName = "", budgetDesc = "" } = {}) {
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

    const prSigRects: any = {};
    const prFieldRects: any = {};

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
        setTextIfExists(form, [\`pr_costcode\${idx2}\`, \`pr_costcode\`], item ? mainCostCode : (i === 1 && absoluteIndex === 0 ? (pr.costCode || "") : ""), pageCustomFont);
        setTextIfExists(form, [\`pr_detail\${idx2}\`], item?.description || "", pageCustomFont);
        setTextIfExists(form, [\`pr_qty\${idx2}\`], item ? fmtQty(item.quantity) : "", pageCustomFont);
        setTextIfExists(form, [\`pr_unit\${idx2}\`], item?.unit || "", pageCustomFont);
        setTextIfExists(form, [\`pr_text\${idx2}\`], item?.note || "", pageCustomFont);
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

    try {
      const newForm = mergedPdf.getForm() || mergedPdf.getForm();
    } catch (_) {} // trigger form creation if possible

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
      \`## Purchase Request\`, \`\`,
      \`PR No.        : \${pr.prNo || pr.id || "-"}\`,
      \`วันที่         : \${safeDate(pr.requestDate)}\`,
      \`Job No.       : \${jobNo}\`,
      \`ผู้ขอซื้อ      : \${pr.requestor || "-"}\`,
      \`ประเภท        : \${(pr.purchaseType || "-").split(">")[0].trim()}\`,
      \`ความเร่งด่วน   : \${pr.urgency === "Urgent" ? "ด่วน" : "ปกติ"}\`,
      \`สถานที่        : \${pr.deliveryLocation || "-"}\`,
      \`Cost Code     : \${pr.costCode || "-"}\`,
      \`\`,
      \`## รายการ\`,
      \`\${\"No.\".padEnd(4)} \${\"รายการ\".padEnd(30)} \${\"จำนวน\".padEnd(8)} \${\"หน่วย\".padEnd(8)}\`,
      \`\${\"-\".repeat(60)}\`,
      ...items.map((it: any, i: number) =>
        \`\${String(i + 1).padEnd(4)} \${String(it.description).substring(0, 28).padEnd(30)} \${String(it.quantity).padEnd(8)} \${String(it.unit).padEnd(8)}\`
      ),
      \`\${\"-\".repeat(60)}\`,
      \`\`,
      \`* หมายเหตุ: ไม่พบ Template PDF กรุณาอัปโหลด PR Form ในหน้า Admin → แบบฟอร์ม PDF\`,
    ];
    await buildBasicPage(initialDoc, lines, customFont);
    return await initialDoc.save();
  }
}\`;

code = code.replace(prOld, prNew);

fs.writeFileSync(path, code);
console.log('Refactored PR and loadTemplate');

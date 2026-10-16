import { PDFDocument } from "pdf-lib";

type Certificate = { url: string; name: string; contentType?: string };

export function getMaterialPdfCertificates(po: any): Certificate[] {
  return po?.receiveType === "Material" ? (po.materialReceive?.certificates || []) : [];
}

async function downloadCertificate(file: Certificate): Promise<ArrayBuffer> {
  if (!file.url) throw new Error("ไม่มี URL ไฟล์แนบ");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(file.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${response.status})`);
    return await response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

// pdf-lib accepts PNG/JPEG. Decode WebP locally, preserving aspect ratio and transparency.
async function webpToPng(bytes: ArrayBuffer): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/webp" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("อ่านรูป WebP ไม่สำเร็จ"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("ไม่สามารถแปลงรูป WebP ได้");
    context.drawImage(image, 0, 0);
    const encoded = atob(canvas.toDataURL("image/png").split(",")[1]);
    return Uint8Array.from(encoded, (char) => char.charCodeAt(0));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Append all certificate pages in their saved order. No quantities or financial data are changed.
export async function appendMaterialCertificatesToPdf(existingPdfBytes: Uint8Array, po: any): Promise<Uint8Array> {
  const certificates = getMaterialPdfCertificates(po);
  if (!certificates.length) return existingPdfBytes;
  const output = await PDFDocument.load(existingPdfBytes);
  for (const file of certificates) {
    try {
      const bytes = await downloadCertificate(file);
      const type = (file.contentType || "").toLowerCase();
      const name = (file.name || "").toLowerCase();
      if (type === "application/pdf" || name.endsWith(".pdf")) {
        const certificate = await PDFDocument.load(bytes);
        if (!certificate.getPageCount()) throw new Error("PDF ไม่มีหน้าเอกสาร");
        const pages = await output.copyPages(certificate, certificate.getPageIndices());
        pages.forEach((page) => output.addPage(page));
      } else {
        let image;
        if (type === "image/webp" || name.endsWith(".webp")) {
          image = await output.embedPng(await webpToPng(bytes));
        } else if (type === "image/png" || name.endsWith(".png")) {
          image = await output.embedPng(bytes);
        } else if (type === "image/jpeg" || /\.jpe?g$/.test(name)) {
          image = await output.embedJpg(bytes);
        } else {
          throw new Error("รองรับเฉพาะ PDF, PNG, JPG และ WebP");
        }
        const page = output.addPage([595, 842]);
        const scale = Math.min(555 / image.width, 802 / image.height);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, { x: (595 - width) / 2, y: (842 - height) / 2, width, height });
      }
    } catch (error: any) {
      throw new Error(`รวมไฟล์ Material Received "${file.name || "ไม่มีชื่อ"}" ไม่สำเร็จ: ${error?.message || String(error)} กรุณาลองใหม่หรือตรวจสอบไฟล์แนบ`);
    }
  }
  return output.save();
}

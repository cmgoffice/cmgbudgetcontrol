/** @jest-environment node */
import { PDFDocument } from "pdf-lib";
import { Blob } from "buffer";
import { appendMaterialCertificatesToPdf } from "./materialReceivePdf";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=", "base64");
const material = (certificates) => ({ receiveType: "Material", materialReceive: { status: "passed", certificates } });
const attachment = (name) => ({ name, url: `https://example.test/${name}` });
async function pdf(sizes) {
  const doc = await PDFDocument.create();
  sizes.forEach((size) => doc.addPage(size));
  return doc.save();
}
const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; jest.restoreAllMocks(); });

test("all pages of certificates follow RP/PO, in saved file order, before appended receipt photos and INV", async () => {
  const base = await pdf([[500, 700], [510, 710]]);
  const first = await pdf([[520, 720], [530, 730]]);
  const last = await pdf([[540, 740]]);
  const files = [attachment("certificate.pdf"), attachment("ใบรับรอง.png"), attachment("last.PDF")];
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => first })
    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => png })
    .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => last });
  const po = material(files);
  const original = JSON.stringify(po);
  const output = await PDFDocument.load(await appendMaterialCertificatesToPdf(base, po));
  // Existing Receive flow appends receipt photos and INV after this helper.
  output.addPage([550, 750]);
  output.addPage([560, 760]);
  const reopened = await PDFDocument.load(await output.save());
  expect(reopened.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [500, 700], [510, 710], [520, 720], [530, 730], [595, 842], [540, 740], [550, 750], [560, 760],
  ]);
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(files.map((f) => f.url));
  expect(JSON.stringify(po)).toBe(original);
  expect((await PDFDocument.load(base)).getPageCount()).toBe(2);
});

test.each(["EQM", "Service", "Pay before receive", undefined])("%s keeps original PDF even with Material Approve and certificates", async (receiveType) => {
  const bytes = await pdf([[500, 700]]);
  global.fetch = jest.fn();
  const po = { ...material([attachment("cert.pdf")]), receiveType, materialReceiveRequired: true };
  expect(await appendMaterialCertificatesToPdf(bytes, po)).toBe(bytes);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([undefined, { certificates: [] }])("Material without attachments keeps original PDF", async (materialReceive) => {
  const bytes = await pdf([[500, 700]]);
  global.fetch = jest.fn();
  expect(await appendMaterialCertificatesToPdf(bytes, { receiveType: "Material", materialReceive })).toBe(bytes);
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  ["download error", { ok: false, status: 403 }, "403"],
  ["corrupt PDF", { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]) }, "ไม่สำเร็จ"],
])("%s fails with filename instead of silently omitting certificate", async (_, response, message) => {
  const bytes = await pdf([[500, 700]]);
  global.fetch = jest.fn().mockResolvedValue(response);
  await expect(appendMaterialCertificatesToPdf(bytes, material([attachment("broken.pdf")]))).rejects.toThrow("broken.pdf");
  await expect(appendMaterialCertificatesToPdf(bytes, material([attachment("broken.pdf")]))).rejects.toThrow(message);
});

test("missing URL fails without issuing a request", async () => {
  global.fetch = jest.fn();
  await expect(appendMaterialCertificatesToPdf(await pdf([[500, 700]]), material([{ name: "missing.pdf" }]))).rejects.toThrow("ไม่มี URL");
  expect(global.fetch).not.toHaveBeenCalled();
});

test("WebP is converted to PNG, added as an A4 page, and its object URL is released", async () => {
  const oldImage = global.Image;
  const oldDocument = global.document;
  const oldBlob = global.Blob;
  const oldAtob = global.atob;
  global.Blob = Blob;
  global.atob = (value) => Buffer.from(value, "base64").toString("binary");
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => png });
  URL.createObjectURL = jest.fn(() => "blob:webp");
  URL.revokeObjectURL = jest.fn();
  const drawImage = jest.fn();
  global.Image = class {
    naturalWidth = 100;
    naturalHeight = 200;
    set src(_) { this.onload(); }
  };
  global.document = { createElement: () => ({ getContext: () => ({ drawImage }), toDataURL: () => `data:image/png;base64,${png.toString("base64")}` }) };
  try {
    const bytes = await appendMaterialCertificatesToPdf(await pdf([[500, 700]]), material([attachment("image.webp")]));
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:webp");
  } finally {
    global.Image = oldImage;
    global.document = oldDocument;
    global.Blob = oldBlob;
    global.atob = oldAtob;
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});

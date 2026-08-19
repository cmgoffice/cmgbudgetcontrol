import { deleteGeneratedPdf, uploadGeneratedPdf } from "./pdfForms";

const safePart = (value: any) => String(value || "unknown").replace(/[^a-zA-Z0-9\-_]/g, "_");

export const getCanonicalPdfPath = ({ kind, projectId, docNo }: { kind: "po" | "pr"; projectId?: any; docNo?: any }) => (
  `generated/${kind === "po" ? "pos" : "prs"}/${safePart(projectId)}/${safePart(docNo)}.pdf`
);

/** ดึง Storage path จาก Firebase download URL เฉพาะไฟล์ generated ของชนิดเดียวกันเท่านั้น */
export const getGeneratedPdfPathFromUrl = (url: any, kind: "po" | "pr") => {
  if (!url) return "";
  try {
    const parsed = new URL(String(url));
    const marker = "/o/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) return "";
    const encodedPath = parsed.pathname.slice(markerIndex + marker.length);
    const path = decodeURIComponent(encodedPath);
    const prefix = kind === "po" ? "generated/pos/" : "generated/prs/";
    return path.startsWith(prefix) ? path : "";
  } catch (_) {
    return "";
  }
};

export const getPreviousGeneratedPdfPath = (doc: any, kind: "po" | "pr") => (
  String(doc?.pdfPath || "")
    || getGeneratedPdfPathFromUrl(doc?.pdfUrl, kind)
    || getCanonicalPdfPath({ kind, projectId: doc?.projectId, docNo: kind === "po" ? doc?.poNo || doc?.id : doc?.prNo || doc?.id })
);

/**
 * Upload to a unique revision path first. The caller updates Firestore to the
 * returned URL/path, then calls removePreviousGeneratedPdf. This prevents the
 * old URL from being deleted before the new document is safely referenced.
 */
export const uploadRevisionPdf = async ({
  bytes,
  kind,
  projectId,
  docNo,
  revisionNo,
  onProgress,
}: {
  bytes: Uint8Array;
  kind: "po" | "pr";
  projectId?: any;
  docNo?: any;
  revisionNo?: any;
  onProgress?: (progress: { bytesTransferred: number; totalBytes: number; pct: number }) => void;
}) => {
  const folder = kind === "po" ? "pos" : "prs";
  const uniqueSuffix = `rev-${safePart(revisionNo || "update")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const path = `generated/${folder}/${safePart(projectId)}/${safePart(docNo)}-${uniqueSuffix}.pdf`;
  const url = await uploadGeneratedPdf(bytes, path, { onProgress });
  return { url, path };
};

export const removePreviousGeneratedPdf = async (previousPath: any, nextPath: any) => {
  const oldPath = String(previousPath || "");
  const newPath = String(nextPath || "");
  if (!oldPath || oldPath === newPath) return;
  await deleteGeneratedPdf(oldPath);
};

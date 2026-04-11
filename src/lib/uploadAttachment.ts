// @ts-nocheck
/**
 * อัปโหลดไฟล์แนบไปยัง Firebase Storage — ใช้ทุกเมนูที่มีการแนบไฟล์
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, appId } from "./firebase";

const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

/**
 * อัปโหลดไฟล์ไปยัง Storage แล้วคืนค่า URL
 * @param file ไฟล์ที่เลือก
 * @param options type = หมวด (pr, budget, invoice, etc.), projectId, docId/prNo สำหรับ path
 * @returns { url, name } URL สำหรับดาวน์โหลด และชื่อไฟล์เดิม
 */
export async function uploadAttachment(
  file: File,
  options: { type: string; projectId?: string; docId?: string; prNo?: string; subPath?: string }
): Promise<{ url: string; name: string }> {
  const { type, projectId = "", docId, prNo, subPath = "" } = options;
  const ts = Date.now();
  const name = file.name || "file";
  const safeName = sanitize(name);
  const segs = ["attachments", appId, type];
  if (projectId) segs.push(projectId);
  if (subPath) segs.push(subPath);
  const idPart = prNo || docId || ts;
  segs.push(`${idPart}_${ts}_${safeName}`);
  const path = segs.filter(Boolean).join("/");
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(storageRef);
  return { url, name };
}

/**
 * ลบไฟล์จาก Firebase Storage โดยใช้ Download URL หรือ Storage path
 * - รองรับทั้ง HTTPS download URL และ gs:// path
 * - ไม่ throw ถ้าไฟล์ไม่มีอยู่แล้ว (object-not-found)
 */
export async function deleteStorageFile(urlOrPath: string): Promise<void> {
  if (!urlOrPath) return;
  try {
    let storageRef;
    if (urlOrPath.startsWith("gs://")) {
      // gs://bucket/path/to/file
      storageRef = ref(storage, urlOrPath);
    } else if (urlOrPath.startsWith("http")) {
      // Firebase HTTPS download URL — แปลง encoded path กลับมาเป็น storage path
      // format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encoded-path}?...
      const url = new URL(urlOrPath);
      const encodedPath = url.pathname.split("/o/")[1];
      if (!encodedPath) return; // URL รูปแบบอื่น ไม่ใช่ Firebase Storage
      const decodedPath = decodeURIComponent(encodedPath);
      storageRef = ref(storage, decodedPath);
    } else {
      // ถือว่าเป็น path ตรงๆ เช่น "generated/receives/..."
      storageRef = ref(storage, urlOrPath);
    }
    await deleteObject(storageRef);
  } catch (e: any) {
    if (e?.code === "storage/object-not-found") return; // ไม่มีไฟล์ ถือเป็น OK
    console.warn("[deleteStorageFile]", e);
  }
}


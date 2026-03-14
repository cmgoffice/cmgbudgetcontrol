// @ts-nocheck
/**
 * อัปโหลดไฟล์แนบไปยัง Firebase Storage — ใช้ทุกเมนูที่มีการแนบไฟล์
 */
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
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

import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { assertMaterialManualReceive, hasPassedMaterialReceive, isMaterialPending, materialInspectionScope } from "./materialReceive";

export async function confirmMaterialReceive({ db, appId, poId, projectId, certificates, removedCertificateUrls = [], note, userId, userName, expectedScope }: any) {
  const poRef = doc(db, "artifacts", appId, "public", "data", "pos", poId);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(poRef);
    if (!snapshot.exists()) throw new Error("ไม่พบ PO");
    const po = snapshot.data();
    if (po.projectId !== projectId) throw new Error("โครงการของ PO ไม่ตรงกัน");
    if (hasPassedMaterialReceive(po)) return false; // Concurrent confirmation: never overwrite certificates.
    if (!isMaterialPending(po)) throw new Error("สถานะ PO เปลี่ยนแล้ว ไม่สามารถยืนยัน Material Received ได้");
    if (expectedScope !== materialInspectionScope(po)) throw new Error("รายการ PO เปลี่ยนระหว่างตรวจ กรุณาเปิดข้อมูลล่าสุดแล้วตรวจอีกครั้ง");
    transaction.update(poRef, {
      materialReceive: { status: "passed", certificates: [...(po.materialReceive?.certificates || []).filter((file: any) => !removedCertificateUrls.includes(file.url)), ...certificates], note: String(note || "").trim(), confirmedByUid: userId, confirmedByName: userName, confirmedAt: serverTimestamp() },
    });
    return true;
  });
}

// All Receive writers use a fresh PO, including a page opened before Material was confirmed.
// No quantity, amount or financial fields are recalculated here.
export async function createReceiveWithMaterialGuard({ db, appId, data, customId }: any) {
  const receiveCollection = collection(db, "artifacts", appId, "public", "data", "receives");
  const receiveRef = customId ? doc(receiveCollection, customId) : doc(receiveCollection);
  const poRef = doc(db, "artifacts", appId, "public", "data", "pos", data.poId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(poRef);
    if (!snapshot.exists()) throw new Error("ไม่พบ PO สำหรับรับของ");
    const po = snapshot.data();
    if (po.projectId !== data.projectId) throw new Error("โครงการของ PO ไม่ตรงกับ Receive");
    assertMaterialManualReceive(po, data);
    transaction.set(receiveRef, data);
  });
  return receiveRef.id;
}

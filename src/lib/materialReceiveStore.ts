import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
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

export const sumReceivedQtyByPoItem = (receives: any[] = []) => {
  const totals: Record<number, number> = {};
  (receives || []).forEach((receive: any) => {
    (receive?.items || []).forEach((item: any) => {
      const index = Number(item?.poItemIndex);
      if (!Number.isInteger(index) || index < 0) return;
      totals[index] = (totals[index] || 0) + Number(item?.receivedQty || 0);
    });
  });
  return totals;
};

/** Lines whose new quantity would take the PO line past its ordered quantity. */
export const getOverReceivedItems = (po: any, itemsToSave: any[] = [], receivedByIndex: Record<number, number> = {}) =>
  (itemsToSave || []).filter((item: any) => {
    const index = Number(item?.poItemIndex);
    const ordered = Number(po?.items?.[index]?.quantity || 0);
    const alreadyReceived = Number(receivedByIndex[index] || 0);
    return alreadyReceived + Number(item?.receivedQty || 0) > ordered + 0.000001;
  }).map((item: any) => {
    const index = Number(item?.poItemIndex);
    const ordered = Number(po?.items?.[index]?.quantity || 0);
    return { ...item, remaining: Math.max(0, ordered - Number(receivedByIndex[index] || 0)) };
  });

// The page listener can lag behind another tab/user, so quantity checks read
// the latest Receive documents of this PO directly before saving.
export async function fetchReceivedQtyByPoItem({ db, appId, poId, projectId }: any) {
  const receiveCollection = collection(db, "artifacts", appId, "public", "data", "receives");
  const snapshot = await getDocs(query(receiveCollection, where("projectId", "==", projectId), where("poId", "==", poId)));
  return sumReceivedQtyByPoItem(snapshot.docs.map((entry: any) => entry.data()));
}

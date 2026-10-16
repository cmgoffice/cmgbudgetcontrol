// Material inspection is metadata only. Never derive financial amounts here.
import { getPoDisplayStatus, isPoReadyForManualReceive } from "./constants";

export const requiresMaterialReceive = (po: any) => po?.materialReceiveRequired === true;
export const hasPassedMaterialReceive = (po: any) => po?.materialReceive?.status === "passed";
export const canReceiveAfterMaterial = (po: any) =>
  !requiresMaterialReceive(po) || hasPassedMaterialReceive(po);

// The delete action in the pending Receive tab is a workflow reset, not a PO deletion.
// Use Receive Type (not the PR flag) for this user-requested exception, including legacy POs.
export function buildReceiveQueueResetPatch(po: any) {
  const status = { status: "Approved", statusNow: "Approved" };
  return po?.receiveType === "Material"
    ? { ...status, materialReceiveRequired: true, "materialReceive.status": "pending" }
    : status;
}

export function isMaterialInspectionAvailable(po: any) {
  if (!requiresMaterialReceive(po) || ["SP", "DC"].includes(String(po?.poType || "").toUpperCase())) return false;
  if (["Draft", "Rejected", "Pending PCM", "Pending GM", "PO Edit Pending PCM", "PO Edit Pending GM", "Pending Close PO", "Closed PO", "Cancelled", "Canceled"].includes(po?.status)) return false;
  // Explicit operational statuses: do not let a stale statusNow override revision/Draft.
  return ["Approved", "Approve", "Partial Receive", "Wait Invoice", "Deposit", "Invcredit", "Inpay", "paid", "Paid", "Received"]
    .includes(getPoDisplayStatus(po));
}

export function isMaterialPending(po: any) {
  return isMaterialInspectionAvailable(po) && !hasPassedMaterialReceive(po);
}

export function assertMaterialManualReceive(po: any, receive: any = {}) {
  if (!requiresMaterialReceive(po)) return;
  if (receive.autoCreatedFromPoApproval || receive.autoCreatedFromPayDocument || receive.autoCreatedFromPayBeforeReceiveFlow) {
    throw new Error("PO Material Approve ต้องบันทึกจำนวนรับเองในแท็บรับของ");
  }
  if (!hasPassedMaterialReceive(po)) throw new Error("กรุณายืนยัน Material Received ก่อนรับของ");
  if (!isMaterialInspectionAvailable(po) || !isPoReadyForManualReceive(po)) throw new Error("PO ยังไม่พร้อมรับของ กรุณาตรวจสถานะล่าสุด");
}

export function getMaterialSourcePrIds(po: any) {
  return Array.from(new Set([
    ...(po.selectedPrIds || []),
    ...(po.items || []).flatMap((item: any) => [item.prId, ...(item.disPrAllocations || []).map((allocation: any) => allocation.prId)]),
  ].filter(Boolean))).sort();
}

export function getMaterialApproveRefs(po: any, prs: any[] = []) {
  const ids = new Set(getMaterialSourcePrIds(po));
  return prs.filter((pr) => ids.has(pr.id) && pr.materialApprove === true).map((pr) => ({
    prId: pr.id, prNo: pr.prNo || "", no: String(pr.materialApproveNo || "").trim(),
  }));
}

export function isMaterialPoFormRequired(po: any, prs: any[], previous: any = null) {
  if (previous && previous.materialReceiveRequired === undefined) return false;
  if (previous?.materialSnapshotLocked && JSON.stringify(getMaterialSourcePrIds(po)) === JSON.stringify(getMaterialSourcePrIds(previous))) {
    return requiresMaterialReceive(previous);
  }
  return (previous?.materialSnapshotLocked && requiresMaterialReceive(previous)) || getMaterialApproveRefs(po, prs).length > 0;
}

export function materialInspectionScope(po: any) {
  return JSON.stringify({
    prs: getMaterialSourcePrIds(po), poType: po.poType || "", vendorId: po.vendorId || "",
    items: (po.items || []).map((item: any) => ({
      prId: item.prId || "", prItemIndex: String(item.prItemIndex ?? ""), materialNo: item.materialNo || "",
      description: item.description || "", quantity: Number(item.quantity || 0), unit: item.unit || "",
    })),
  });
}

export function buildMaterialPoSnapshot(po: any, prs: any[], previous: any = null) {
  // Existing POs without the feature marker stay on their original workflow.
  if (previous && previous.materialReceiveRequired === undefined) return {};
  if (hasPassedMaterialReceive(previous)) {
    if (materialInspectionScope(po) !== materialInspectionScope(previous)) {
      throw new Error("PO ผ่าน Material Received แล้ว ไม่สามารถเปลี่ยนรายการ ผู้จำหน่าย ประเภท หรือ PR อ้างอิงได้");
    }
    return { materialReceiveRequired: true, materialApproveRefs: previous.materialApproveRefs || [] };
  }
  if (previous?.materialSnapshotLocked && requiresMaterialReceive(previous) && ["SP", "DC"].includes(String(po.poType || "").toUpperCase())) {
    throw new Error("PO Material Approve ไม่รองรับประเภท SP/DC");
  }
  if (previous?.materialSnapshotLocked) {
    const sameSources = JSON.stringify(getMaterialSourcePrIds(po)) === JSON.stringify(getMaterialSourcePrIds(previous));
    if (requiresMaterialReceive(previous) && !sameSources) throw new Error("PO Material Approve ส่งอนุมัติแล้ว ไม่สามารถเปลี่ยน PR อ้างอิงได้");
    if (sameSources) return { materialReceiveRequired: requiresMaterialReceive(previous), materialApproveRefs: previous.materialApproveRefs || [] };
  }
  const refs = getMaterialApproveRefs(po, prs);
  // Once submitted, keep the agreed requirement even if the PR is later unchecked.
  const required = isMaterialPoFormRequired(po, prs, previous);
  if (required && ["SP", "DC"].includes(String(po.poType || "").toUpperCase())) {
    throw new Error("PO ประเภท SP/DC ใช้โฟลว์งานจ้าง ไม่รองรับ PR Material Approve กรุณาเลือกประเภท PO ที่รับสินค้า");
  }
  if (refs.some((ref) => !ref.no)) throw new Error("PR Material Approve ต้องมี Material Approve No. ก่อนเปิด PO");
  return {
    materialReceiveRequired: required,
    materialApproveRefs: required ? (refs.length ? refs : previous?.materialApproveRefs || []) : [],
  };
}

export function validateMaterialCertificate(file: { name: string; size: number; type: string }) {
  if (!/\.(pdf|png|jpe?g|webp)$/i.test(file.name) || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Certificate รองรับไฟล์ PDF, PNG, JPG และ WebP");
  }
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("Certificate ต้องมีขนาดมากกว่า 0 และไม่เกิน 20 MB ต่อไฟล์");
}

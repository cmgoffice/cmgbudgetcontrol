import { doc, runTransaction } from "firebase/firestore";
import { getPendingBudgetReturns } from "./pendingBudgetReturns";
import { canActivatePR } from "./prAllocation";

// Read the PR inside the write transaction so a newly queued Budget return
// cannot race with an already open Active PR confirmation dialog.
export const transitionPrActivation = async ({ db, appId, prId, action, resumeStatus, pos }: any) => {
  const prRef = doc(db, "artifacts", appId, "public", "data", "prs", prId);
  return runTransaction(db, async (transaction: any) => {
    const snapshot = await transaction.get(prRef);
    if (!snapshot.exists()) throw new Error("ไม่พบ PR ล่าสุด");
    const pr = snapshot.data() || {};
    if (getPendingBudgetReturns(pr).length > 0) {
      throw new Error("PR มีรายการคืน Budget รอรับอยู่ กรุณารับยอดก่อนขอ Active ใหม่");
    }
    if (!canActivatePR({ ...pr, id: prId }, pos)) {
      throw new Error("PR ไม่มียอดคงเหลือที่สามารถ Active ได้");
    }
    const expectedStatuses = action === "request"
      ? ["Closed PR", "Closed PR Auto"]
      : ["Pending Active PR"];
    if (!expectedStatuses.includes(pr.status)) {
      throw new Error("สถานะ PR เปลี่ยนแปลงแล้ว กรุณาเปิดรายการใหม่");
    }
    if (action === "request") {
      transaction.update(prRef, { status: "Pending Active PR", activeRequestedAt: new Date().toISOString() });
    } else {
      transaction.update(prRef, { status: resumeStatus, preCloseStatus: null, activeRequestedAt: null });
    }
    return pr;
  });
};

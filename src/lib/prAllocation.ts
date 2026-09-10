import { getPendingReturnDeductionTotal } from "./pendingBudgetReturns";
import { getPoNetAmountAllocatedToPr } from "./prBudgetReturn";

const isCommittedPoForPr = (po: any) => {
  if (!po) return false;
  const status = po?.status || "";
  const statusNow = po?.statusNow || "";

  if (status === "Rejected" || statusNow === "Rejected") return false;
  if (status === "Draft" || statusNow === "Draft") return false;

  const effectiveStatus = statusNow || status;
  return effectiveStatus !== "";
};

export const getPoLinkedAmountForPr = (po: any, prId: string) => {
  if (!isCommittedPoForPr(po) || !prId) return 0;
  return getPoNetAmountAllocatedToPr(po, prId);
};

export const getUsedAmountByPR = (pos: any[], prId: string, excludePoId: string | null = null) => {
  if (!Array.isArray(pos) || !prId) return 0;

  return pos.reduce((sum, po) => {
    if (!po || po.status === "Rejected" || po.id === excludePoId) return sum;
    return sum + getPoLinkedAmountForPr(po, prId);
  }, 0);
};

export const getResumeStatusForPR = (pr: any, pos: any[]) => {
  const totalAmount = Number(pr?.totalAmount ?? pr?.amount ?? 0);
  const usedAmount = getUsedAmountByPR(pos, pr?.id);

  if (totalAmount > 0 && usedAmount >= totalAmount - 0.01) {
    return {
      status: "Closed PR Auto",
      usedAmount,
      totalAmount,
    };
  }

  if (usedAmount > 0) {
    return {
      status: "PO Issued",
      usedAmount,
      totalAmount,
    };
  }

  return {
    status: "Approved",
    usedAmount,
    totalAmount,
  };
};

export const getAvailableBalanceForPR = (pr: any, pos: any[]) => {
  const { totalAmount, usedAmount } = getResumeStatusForPR(pr, pos);
  return Math.max(0, totalAmount - usedAmount - getPendingReturnDeductionTotal(pr));
};

export const canActivatePR = (pr: any, pos: any[]) => (
  getAvailableBalanceForPR(pr, pos) > 0.01
);

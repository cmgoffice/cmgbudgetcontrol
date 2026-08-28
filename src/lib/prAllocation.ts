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

  // ตรวจว่า PO ยังมี items อ้างอิง PR นี้จริงๆ อยู่หรือไม่
  // (ใช้ตัดสินว่าจะนับ lockedPrAllocations หรือไม่)
  const hasActiveItemsForPr =
    Array.isArray(po.items) &&
    po.items.some((item: any) => {
      if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
        return item.disPrAllocations.some((alloc: any) => alloc?.prId === prId);
      }
      return item?.prId === prId;
    });

  // lockedPrAllocations: ใช้ยอดที่ล็อกไว้ เฉพาะเมื่อ PO ยังมี items อ้างอิง PR นี้อยู่
  // กรณีที่ items ถูกตัดออกจาก PO หมดแล้ว = PR ไม่ได้ถูก "ใช้" ใน PO นี้อีกต่อไป
  // → ไม่นับ lockedPrAllocations (ค่าเก่าที่ล้าสมัย)
  if (po.lockedPrAllocations && po.lockedPrAllocations[prId] != null) {
    if (!hasActiveItemsForPr) return 0;
    // early return เพื่อป้องกัน double-count กับ items ด้านล่าง
    return Number(po.lockedPrAllocations[prId]) || 0;
  }

  let total = 0;

  if (Array.isArray(po.items)) {
    po.items.forEach((item: any) => {
      if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
        item.disPrAllocations.forEach((alloc: any) => {
          if (alloc?.prId === prId) {
            total += Number(alloc.amount) || 0;
          }
        });
        return;
      }

      if (item?.prId === prId) {
        total += Number(item.amount) || 0;
      }
    });
  }

  return total;
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
  return Math.max(0, totalAmount - usedAmount);
};

export const canActivatePR = (pr: any, pos: any[]) => (
  getAvailableBalanceForPR(pr, pos) > 0.01
);

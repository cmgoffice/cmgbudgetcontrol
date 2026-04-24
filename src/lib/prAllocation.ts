export const getPoLinkedAmountForPr = (po: any, prId: string) => {
  if (!po || po.status === "Rejected" || !prId) return 0;

  let total = 0;

  if (po.lockedPrAllocations && po.lockedPrAllocations[prId] != null) {
    total += Number(po.lockedPrAllocations[prId]) || 0;
  }

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
  const totalAmount = Number(pr?.totalAmount || pr?.amount || 0);
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

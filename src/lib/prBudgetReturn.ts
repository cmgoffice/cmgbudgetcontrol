export const isPoLinkedToPr = (po: any, prId: string) => {
  if (!po || !prId) return false;
  if (po.prRefId === prId) return true;
  if (Array.isArray(po.selectedPrIds) && po.selectedPrIds.includes(prId)) return true;

  return Array.isArray(po.items) && po.items.some((item: any) => {
    if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
      return item.disPrAllocations.some((alloc: any) => alloc?.prId === prId);
    }
    return item?.prId === prId;
  });
};

export const getPoGrandTotalUsedByPr = (pos: any[], prId: string) => {
  if (!Array.isArray(pos) || !prId) return 0;
  return pos.reduce((sum, po) => {
    if (!po || po.status === "Rejected") return sum;
    if (!isPoLinkedToPr(po, prId)) return sum;
    const subtotal = Array.isArray(po.items)
      ? po.items.reduce((s: number, item: any) => {
        const amount = Number(item?.amount);
        if (Number.isFinite(amount)) return s + amount;
        return s + (Number(item?.quantity || 0) * Number(item?.price || 0));
      }, 0)
      : 0;
    const discount = Number(po?.discount || 0);
    const subTotalAfterDiscount = Math.max(0, subtotal - discount);

    if (subTotalAfterDiscount > 0) return sum + subTotalAfterDiscount;

    const fallbackSubTotal = Number(
      po?.subTotalAfterDiscount ?? po?.subTotal ?? po?.subtotal ?? po?.amountExVat ?? 0
    );
    if (Number.isFinite(fallbackSubTotal) && fallbackSubTotal > 0) return sum + fallbackSubTotal;

    return sum + (Number(po.grandTotal) || 0);
  }, 0);
};

export const getPrBudgetReturnInfo = (pr: any, pos: any[]) => {
  const currentTotal = Number(pr?.totalAmount || pr?.amount || 0);
  const poSubTotalUsed = getPoGrandTotalUsedByPr(pos, pr?.id);
  const revisedTotal = Math.max(0, poSubTotalUsed);
  const returnAmount = Math.max(0, currentTotal - revisedTotal);
  return {
    currentTotal,
    poSubTotalUsed,
    poGrandTotalUsed: poSubTotalUsed,
    revisedTotal,
    returnAmount,
  };
};

export const scalePrItemsToTotal = (items: any[], revisedTotal: number) => {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  const currentItemsTotal = items.reduce((sum, item) => {
    const amount = Number(item?.amount);
    if (Number.isFinite(amount)) return sum + amount;
    return sum + (Number(item?.quantity || 0) * Number(item?.price || 0));
  }, 0);
  if (currentItemsTotal <= 0) return items;

  let assigned = 0;
  return items.map((item, index) => {
    const rawAmount = Number(item?.amount);
    const currentAmount = Number.isFinite(rawAmount)
      ? rawAmount
      : Number(item?.quantity || 0) * Number(item?.price || 0);
    const nextAmount = index === items.length - 1
      ? Math.max(0, revisedTotal - assigned)
      : Math.max(0, Math.round((currentAmount / currentItemsTotal) * revisedTotal * 100) / 100);
    assigned += nextAmount;
    const qty = Number(item?.quantity || 0);
    return {
      ...item,
      amount: nextAmount,
      price: qty > 0 ? nextAmount / qty : Number(item?.price || 0),
    };
  });
};

export const restorePrItemsFromRevision = (currentItems: any[], revision: any) => {
  if (Array.isArray(revision?.oldItems) && revision.oldItems.length > 0) {
    return revision.oldItems;
  }
  return scalePrItemsToTotal(currentItems || [], Number(revision?.oldTotalAmount || 0));
};

export const computeBudgetUsedAfterPrRevision = (
  prs: any[],
  targetPr: any,
  revisedTotal: number
) => {
  if (!Array.isArray(prs) || !targetPr) return 0;
  const budgetId = targetPr.budgetId || "";
  const costCode = targetPr.costCode || "";
  const projectId = targetPr.projectId || "";
  const seen = new Set<string>();

  return prs.reduce((sum, pr) => {
    if (!pr || pr.projectId !== projectId || pr.status === "Rejected") return sum;
    // Do not use Cost Code as a fallback once a PR has an explicit Budget.
    // One Cost Code may intentionally have multiple Budgets.
    const matchById = budgetId && pr.budgetId === budgetId;
    const matchByCodeLegacy = !pr.budgetId && costCode && pr.costCode === costCode;
    if (!(matchById || matchByCodeLegacy) || seen.has(pr.id)) return sum;
    seen.add(pr.id);
    return sum + (pr.id === targetPr.id ? revisedTotal : Number(pr.totalAmount || pr.amount || 0));
  }, 0);
};

export const getLinkedPoRefsForPr = (pos: any[], prId: string) => {
  if (!Array.isArray(pos) || !prId) return [];
  return pos
    .filter((po) => po?.status !== "Rejected" && isPoLinkedToPr(po, prId))
    .map((po) => po.poNo || po.id)
    .filter(Boolean);
};

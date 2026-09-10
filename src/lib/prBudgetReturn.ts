import {
  getPoAmountExVat,
  getPoDiscountAmount,
  getPoDiscountTarget,
  PO_DISCOUNT_ALLOCATION_VERSION,
} from "./poDiscount";

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

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const getPoItemGrossAmount = (item: any) => {
  const amount = Number(item?.amount);
  if (item?.amount !== null && item?.amount !== undefined && item?.amount !== "" && Number.isFinite(amount)) {
    return Math.max(0, amount);
  }
  return Math.max(0, (Number(item?.quantity) || 0) * (Number(item?.price ?? item?.unitPrice) || 0));
};

const getPoLinkedPrIds = (po: any) => {
  const ids = new Set<string>();
  if (po?.prRefId) ids.add(String(po.prRefId));
  (Array.isArray(po?.selectedPrIds) ? po.selectedPrIds : []).forEach((id: any) => {
    if (id) ids.add(String(id));
  });
  (Array.isArray(po?.items) ? po.items : []).forEach((item: any) => {
    if (item?.prId) ids.add(String(item.prId));
    (Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : []).forEach((allocation: any) => {
      if (allocation?.prId) ids.add(String(allocation.prId));
    });
  });
  return Array.from(ids);
};

const getCanonicalItemPrAllocations = (item: any, fallbackItemAmount: number) => {
  const allocations = Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : [];
  const directPrId = String(item?.prId || "");

  if (allocations.length > 0) {
    const allocationTotal = allocations.reduce(
      (sum: number, allocation: any) => sum + Math.max(0, Number(allocation?.amount) || 0),
      0,
    );
    const includesDirectPr = directPrId && allocations.some(
      (allocation: any) => String(allocation?.prId || "") === directPrId
    );

    // item.prId is the source PR item. If a malformed/legacy allocation omits
    // that source PR, keep the item's net amount with its source and ignore the
    // conflicting routes so the PO line is counted exactly once.
    if (directPrId && !includesDirectPr) {
      return [{
        prId: directPrId,
        amount: Math.max(0, allocationTotal > 0 ? allocationTotal : fallbackItemAmount),
        prItemIndex: item?.prItemIndex,
        correctedConflictingAllocation: true,
      }];
    }

    return allocations
      .filter((allocation: any) => allocation?.prId)
      .map((allocation: any) => ({
        ...allocation,
        prId: String(allocation.prId),
        amount: Math.max(0, Number(allocation?.amount) || 0),
      }));
  }

  if (directPrId) {
    return [{
      prId: directPrId,
      amount: Math.max(0, fallbackItemAmount),
      prItemIndex: item?.prItemIndex,
    }];
  }

  return [];
};

export const getPoNetPrAllocations = (po: any) => {
  if (!po) return [];

  const items = Array.isArray(po?.items) ? po.items : [];
  const linkedPrIds = getPoLinkedPrIds(po);
  const grossSubtotal = items.reduce((sum: number, item: any) => sum + getPoItemGrossAmount(item), 0);
  const poNetAmount = getPoAmountExVat(po);
  const legacyNetFactor = grossSubtotal > 0 ? Math.min(1, poNetAmount / grossSubtotal) : 1;
  const isCurrentAllocation = po.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION;
  const rawAllocations: any[] = [];

  if (items.length === 0 && linkedPrIds.length > 0) {
    const sharedAmount = poNetAmount / linkedPrIds.length;
    linkedPrIds.forEach((prId) => rawAllocations.push({ prId, amount: sharedAmount }));
  } else {
    items.forEach((item: any) => {
      const fallbackItemAmount = isCurrentAllocation
        ? getPoItemGrossAmount(item)
        : getPoItemGrossAmount(item) * legacyNetFactor;
      const itemAllocations = getCanonicalItemPrAllocations(item, fallbackItemAmount);
      if (itemAllocations.length > 0) {
        rawAllocations.push(...itemAllocations);
        return;
      }

      // Truly unallocated legacy lines have no source PR. Share only those
      // lines between the PO references so the PO is counted exactly once.
      if (!isCurrentAllocation && linkedPrIds.length > 0) {
        const sharedAmount = fallbackItemAmount / linkedPrIds.length;
        linkedPrIds.forEach((prId) => rawAllocations.push({ prId, amount: sharedAmount }));
      }
    });
  }

  const byPrId = new Map<string, any>();
  rawAllocations.forEach((allocation: any) => {
    const prId = String(allocation?.prId || "");
    if (!prId) return;
    const current = byPrId.get(prId) || { prId, amount: 0 };
    current.amount += Math.max(0, Number(allocation?.amount) || 0);
    if (allocation?.correctedConflictingAllocation) current.correctedConflictingAllocation = true;
    byPrId.set(prId, current);
  });

  return Array.from(byPrId.values()).map((allocation) => ({
    ...allocation,
    amount: roundCurrency(allocation.amount),
  }));
};

/**
 * Returns only the net PO amount funded by one PR.
 *
 * Current PO records use disPrAllocations as the authoritative net amounts.
 * Legacy records fall back to item.prId. If an old multi-PR record has neither,
 * its net amount is shared between the PR references so the whole PO is counted
 * once instead of once per PR.
 */
export const getPoNetAmountAllocatedToPr = (po: any, prId: string) => {
  if (!po || !prId) return 0;

  const targetPrId = String(prId);
  const items = Array.isArray(po?.items) ? po.items : [];
  const hasDirectSourceItem = items.some(
    (item: any) => String(item?.prId || "") === targetPrId
  );
  if (!hasDirectSourceItem && !isPoLinkedToPr(po, prId)) return 0;
  const canonicalAllocations = getPoNetPrAllocations(po);
  const hasActiveItemsForPr = canonicalAllocations.some(
    (allocation: any) => String(allocation?.prId || "") === targetPrId
  );
  if (po?.lockedPrAllocations?.[prId] != null && hasActiveItemsForPr) {
    return Math.max(0, roundCurrency(Number(po.lockedPrAllocations[prId]) || 0));
  }
  const allocation = canonicalAllocations.find(
    (entry: any) => String(entry?.prId || "") === targetPrId
  );
  return Math.max(0, Number(allocation?.amount) || 0);
};

export type PrPoUsageIndex = {
  totalByPrId: Map<string, number>;
  posByPrId: Map<string, any[]>;
};

/**
 * Builds the PR -> PO usage lookup in one pass. Consumers that render many PRs
 * should memoize this index by the PO array instead of rescanning every PO for
 * every table row.
 */
export const buildPrPoUsageIndex = (pos: any[]): PrPoUsageIndex => {
  const totalByPrId = new Map<string, number>();
  const posByPrId = new Map<string, any[]>();

  (Array.isArray(pos) ? pos : []).forEach((po) => {
    if (!po || po.status === "Rejected") return;

    getPoNetPrAllocations(po).forEach((allocation: any) => {
      const prId = String(allocation?.prId || "");
      if (!prId) return;

      const canonicalAmount = Math.max(0, Number(allocation?.amount) || 0);
      const lockedAmount = po?.lockedPrAllocations?.[prId];
      const amount = lockedAmount != null
        ? Math.max(0, roundCurrency(Number(lockedAmount) || 0))
        : canonicalAmount;
      if (amount <= 0) return;

      totalByPrId.set(prId, (totalByPrId.get(prId) || 0) + amount);
      const linkedPos = posByPrId.get(prId);
      if (linkedPos) linkedPos.push(po);
      else posByPrId.set(prId, [po]);
    });
  });

  return { totalByPrId, posByPrId };
};

export const getPoGrandTotalUsedByPr = (pos: any[], prId: string) => {
  if (!Array.isArray(pos) || !prId) return 0;
  return pos.reduce((sum, po) => {
    if (!po || po.status === "Rejected") return sum;
    return sum + getPoNetAmountAllocatedToPr(po, prId);
  }, 0);
};

export const getPrBudgetReturnInfo = (pr: any, pos: any[], usageIndex?: PrPoUsageIndex) => {
  const currentTotal = Number(pr?.totalAmount || pr?.amount || 0);
  const prId = String(pr?.id || "");
  const linkedPos = usageIndex
    ? (usageIndex.posByPrId.get(prId) || [])
    : (Array.isArray(pos) ? pos : []).filter((po) => (
      po?.status !== "Rejected" && getPoNetAmountAllocatedToPr(po, pr?.id) > 0
    ));
  const poSubTotalUsed = usageIndex
    ? (usageIndex.totalByPrId.get(prId) || 0)
    : getPoGrandTotalUsedByPr(pos, pr?.id);
  // A procurement discount is already excluded from the PO net allocation,
  // but it is still present in the original PR amount. Keep it out of the
  // returnable Budget amount and expose it separately for the audit trail.
  const procurementSavingAmount = linkedPos.reduce((sum, po) => {
    const discount = Math.max(0, Number(getPoDiscountAmount(po) || 0));
    if (discount <= 0) return sum;
    const target = getPoDiscountTarget(po)?.prId;
    if (target) return String(target) === String(pr?.id) ? sum + discount : sum;
    const linkedPrIds = new Set<string>();
    if (po?.prRefId) linkedPrIds.add(String(po.prRefId));
    (Array.isArray(po?.selectedPrIds) ? po.selectedPrIds : []).forEach((id: any) => id && linkedPrIds.add(String(id)));
    (Array.isArray(po?.items) ? po.items : []).forEach((item: any) => {
      if (item?.prId) linkedPrIds.add(String(item.prId));
      (Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : []).forEach((allocation: any) => {
        if (allocation?.prId) linkedPrIds.add(String(allocation.prId));
      });
    });
    return linkedPrIds.size === 1 && linkedPrIds.has(String(pr?.id)) ? sum + discount : sum;
  }, 0);
  const rawReturnAmount = Math.max(0, currentTotal - poSubTotalUsed);
  const returnAmount = Math.max(0, rawReturnAmount - procurementSavingAmount);
  // Once a return is fully applied, the PR's current amount should equal its
  // current PO usage. The saving is removed from the PR current amount but is
  // never sent to Budget as a return.
  const revisedTotal = returnAmount > 0
    ? Math.max(0, currentTotal - returnAmount - procurementSavingAmount)
    : currentTotal;
  return {
    currentTotal,
    poSubTotalUsed,
    poGrandTotalUsed: poSubTotalUsed,
    revisedTotal,
    returnAmount,
    rawReturnAmount,
    procurementSavingAmount,
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

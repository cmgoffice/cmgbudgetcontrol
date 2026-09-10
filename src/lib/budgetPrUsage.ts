const getItemAmount = (item: any) => {
  const amount = Number(item?.amount);
  if (item?.amount !== null && item?.amount !== undefined && item?.amount !== "" && Number.isFinite(amount)) {
    return amount;
  }
  return (Number(item?.quantity) || 0) * (Number(item?.price ?? item?.unitPrice) || 0);
};

const getHeaderBudgetId = (pr: any) => pr?.budgetId || pr?.selectedBudgetId || "";
const getItemBudgetId = (item: any) => item?.budgetId || item?.selectedBudgetId || "";
const getItemSubItemId = (item: any) => item?.budgetSubItemId || item?.subItemId || "";

const normalizeText = (value: any) => String(value || "").trim().toLowerCase();

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

const getPrBudgetWeights = (pr: any) => {
  const headerBudgetId = String(getHeaderBudgetId(pr));
  const weights = new Map<string, { budgetId: string; amount: number; order: number }>();
  const items = Array.isArray(pr?.items) ? pr.items : [];
  const explicitItemBudgetIds = new Set(
    items.map((item: any) => String(getItemBudgetId(item))).filter(Boolean),
  );
  const hasLegacyBudgetConflict = explicitItemBudgetIds.size > 1 || (
    Boolean(headerBudgetId) &&
    Array.from(explicitItemBudgetIds).some((itemBudgetId) => itemBudgetId !== headerBudgetId)
  );

  // Normal invariant: one PR belongs to exactly one Budget. Item weights are
  // consulted only for malformed legacy records whose item IDs contradict the
  // PR header; current PR creation must never depend on this fallback.
  if (headerBudgetId && !hasLegacyBudgetConflict) {
    const totalAmount = items.length > 0
      ? items.reduce((sum: number, item: any) => sum + Math.max(0, getItemAmount(item)), 0)
      : Math.max(0, Number(pr?.totalAmount ?? pr?.amount) || 0);
    return [{ budgetId: headerBudgetId, amount: totalAmount || 1, order: 0 }];
  }

  items.forEach((item: any, index: number) => {
    // Legacy fallback only: split a malformed historical PR by its item IDs.
    // Items without an ID remain under the exact PR header.
    const budgetId = String(getItemBudgetId(item) || headerBudgetId);
    const amount = Math.max(0, getItemAmount(item));
    if (!budgetId || amount <= 0) return;
    const current = weights.get(budgetId) || { budgetId, amount: 0, order: index };
    current.amount += amount;
    weights.set(budgetId, current);
  });

  if (weights.size === 0 && headerBudgetId) {
    const fallbackAmount = Math.max(0, Number(pr?.totalAmount ?? pr?.amount) || 0);
    weights.set(headerBudgetId, { budgetId: headerBudgetId, amount: fallbackAmount || 1, order: 0 });
  }

  return Array.from(weights.values());
};

const splitCurrencyByBudgetWeight = (
  amount: number,
  weights: Array<{ budgetId: string; amount: number; order: number }>,
  preferredBudgetId = "",
) => {
  const result = new Map<string, number>();
  const totalCents = Math.max(0, Math.round((Number(amount) || 0) * 100));
  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight.amount), 0);
  if (totalCents <= 0 || totalWeight <= 0) return result;

  const shares = weights.map((weight) => {
    const exactCents = totalCents * Math.max(0, weight.amount) / totalWeight;
    const baseCents = Math.floor(exactCents);
    return { ...weight, cents: baseCents, remainder: exactCents - baseCents };
  });
  let remainingCents = totalCents - shares.reduce((sum, share) => sum + share.cents, 0);

  // Largest remainder keeps every PO allocation exact to the cent. On a tie,
  // the PR header receives the odd cent first, then original PR item order.
  const remainderOrder = [...shares].sort((left, right) => (
    right.remainder - left.remainder ||
    Number(right.budgetId === preferredBudgetId) - Number(left.budgetId === preferredBudgetId) ||
    left.order - right.order
  ));
  for (let index = 0; remainingCents > 0 && remainderOrder.length > 0; index += 1) {
    remainderOrder[index % remainderOrder.length].cents += 1;
    remainingCents -= 1;
  }

  shares.forEach((share) => result.set(share.budgetId, roundCurrency(share.cents / 100)));
  return result;
};

export const getExactBudgetSearchTargets = (budgets: any[], projectId: string, query: string) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return (Array.isArray(budgets) ? budgets : []).flatMap((budget: any) => {
    if (budget?.projectId !== projectId) return [];
    const mainDescription = String(budget?.description || "").trim();
    const targets: any[] = [];

    if (mainDescription && normalizeText(mainDescription) === normalizedQuery) {
      targets.push({ budgetId: String(budget.id), subItemId: "" });
    }
    (Array.isArray(budget?.subItems) ? budget.subItems : []).forEach((subItem: any) => {
      const subDescription = String(subItem?.description || "").trim();
      const fullLabel = mainDescription && subDescription
        ? `${mainDescription} + ${subDescription}`
        : (mainDescription || subDescription);
      if (fullLabel && normalizeText(fullLabel) === normalizedQuery) {
        targets.push({ budgetId: String(budget.id), subItemId: String(subItem?.id || "") });
      }
    });
    return targets;
  });
};

export const isPrLinkedToExactBudgetTarget = (pr: any, target: any) => {
  if (!pr || !target?.budgetId) return false;
  const targetBudgetId = String(target.budgetId);
  const headerBudgetId = String(getHeaderBudgetId(pr));
  const items = Array.isArray(pr?.items) ? pr.items : [];
  const belongsToBudget = headerBudgetId
    ? headerBudgetId === targetBudgetId
    : items.some((item: any) => String(getItemBudgetId(item)) === targetBudgetId);
  if (!belongsToBudget) return false;

  const targetSubItemId = String(target.subItemId || "");
  if (!targetSubItemId) return true;
  const subItemIds = new Set([
    pr?.selectedSubItemId,
    pr?.subItemId,
    ...items.flatMap((item: any) => [item?.subItemId, item?.budgetSubItemId]),
  ].filter(Boolean).map(String));
  return subItemIds.has(targetSubItemId);
};

export const getBudgetAmountFromPoPrAllocations = ({
  allocations,
  prs,
  prById: providedPrById,
  budget,
  hasDuplicateCostCode,
}: {
  allocations: any[];
  prs: any[];
  prById?: Map<string, any>;
  budget: any;
  hasDuplicateCostCode: boolean;
}) => {
  if (!budget?.id || !Array.isArray(allocations)) return 0;
  const budgetId = String(budget.id);
  const budgetCode = String(budget.code || "");
  const prById = providedPrById || new Map(
    (Array.isArray(prs) ? prs : []).map((pr: any) => [String(pr?.id || ""), pr]),
  );

  return allocations.reduce((sum: number, allocation: any) => {
    const pr: any = prById.get(String(allocation?.prId || ""));
    if (!pr) return sum;

    const headerBudgetId = String(getHeaderBudgetId(pr));
    const budgetWeights = getPrBudgetWeights(pr);
    if (budgetWeights.length > 0) {
      const split = splitCurrencyByBudgetWeight(
        Number(allocation?.amount) || 0,
        budgetWeights,
        headerBudgetId,
      );
      return sum + (split.get(budgetId) || 0);
    }

    const itemBudgetIds = new Set(
      (Array.isArray(pr?.items) ? pr.items : [])
        .map((item: any) => String(getItemBudgetId(item)))
        .filter(Boolean),
    );
    if (itemBudgetIds.size > 0) {
      return itemBudgetIds.size === 1 && itemBudgetIds.has(budgetId)
        ? sum + (Number(allocation?.amount) || 0)
        : sum;
    }

    return !hasDuplicateCostCode && String(pr?.costCode || "") === budgetCode
      ? sum + (Number(allocation?.amount) || 0)
      : sum;
  }, 0);
};

export const getBudgetPrTotal = ({
  prs,
  budget,
  projectId,
  hasDuplicateCostCode,
}: {
  prs: any[];
  budget: any;
  projectId: string;
  hasDuplicateCostCode: boolean;
}) => {
  if (!budget?.id || !Array.isArray(prs)) return 0;

  const budgetId = String(budget.id);
  const budgetCode = String(budget.code || "");
  const subItemIds = new Set(
    (Array.isArray(budget.subItems) ? budget.subItems : [])
      .map((subItem: any) => String(subItem?.id || ""))
      .filter(Boolean),
  );

  return prs.reduce((total: number, pr: any) => {
    if (!pr || pr.status === "Rejected" || pr.projectId !== projectId) return total;

    const headerBudgetId = String(getHeaderBudgetId(pr));
    const items = Array.isArray(pr.items) ? pr.items : [];
    const itemBelongsToBudget = (item: any) => {
      const itemBudgetId = String(getItemBudgetId(item));
      if (itemBudgetId) return itemBudgetId === budgetId;

      const itemSubItemId = String(getItemSubItemId(item));
      if (itemSubItemId) {
        if (subItemIds.has(itemSubItemId)) return true;
        // A Sub-item ID can become stale after a Budget revision. The exact
        // header Budget ID still places the amount under the correct parent.
        return headerBudgetId ? headerBudgetId === budgetId : false;
      }

      // Legacy PR items may not contain item-level IDs. The exact PR header
      // Budget ID remains authoritative and cannot mix another Budget that
      // happens to use the same Cost Code.
      if (headerBudgetId) return headerBudgetId === budgetId;

      const itemCode = String(item?.costCode || pr?.costCode || "");
      return !hasDuplicateCostCode && itemCode === budgetCode;
    };

    if (items.length === 0) {
      const belongsByHeader = headerBudgetId
        ? headerBudgetId === budgetId
        : (!hasDuplicateCostCode && String(pr?.costCode || "") === budgetCode);
      return belongsByHeader ? total + (Number(pr.totalAmount ?? pr.amount) || 0) : total;
    }

    const budgetItemSubtotal = items.reduce(
      (sum: number, item: any) => sum + (itemBelongsToBudget(item) ? getItemAmount(item) : 0),
      0,
    );
    if (budgetItemSubtotal <= 0) return total;

    const allItemsSubtotal = items.reduce((sum: number, item: any) => sum + getItemAmount(item), 0);
    const budgetShare = allItemsSubtotal > 0 ? budgetItemSubtotal / allItemsSubtotal : 0;
    const proportionalDiscount = (Number(pr.discount) || 0) * budgetShare;
    return total + Math.max(0, budgetItemSubtotal - proportionalDiscount);
  }, 0);
};

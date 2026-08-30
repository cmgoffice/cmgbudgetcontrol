import { scalePrItemsToTotal } from "./prBudgetReturn";

const asMoney = (value: any) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

export const getPendingBudgetReturns = (pr: any) => {
  const rows = Array.isArray(pr?.pendingBudgetReturns)
    ? pr.pendingBudgetReturns.filter((row: any) => row?.requestId)
    : [];
  const legacy = pr?.pendingBudgetReturn?.requestId ? [pr.pendingBudgetReturn] : [];
  const seen = new Set<string>();
  return [...legacy, ...rows].filter((row: any) => {
    const id = String(row.requestId || "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export const getPendingReturnDeduction = (pendingReturn: any) => asMoney(
  Math.max(0, Number(pendingReturn?.returnedAmount || 0))
  + Math.max(0, Number(pendingReturn?.procurementSavingAmount || 0))
);

export const getPendingReturnDeductionTotal = (pr: any) => asMoney(
  getPendingBudgetReturns(pr).reduce(
    (sum: number, pendingReturn: any) => sum + getPendingReturnDeduction(pendingReturn),
    0
  )
);

export const getPrReturnAvailability = (pr: any, returnInfo: any) => {
  const pendingReturns = getPendingBudgetReturns(pr);
  const pendingReturnedAmount = asMoney(pendingReturns.reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.returnedAmount || 0)),
    0
  ));
  const pendingSavingAmount = asMoney(pendingReturns.reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.procurementSavingAmount || 0)),
    0
  ));
  const appliedSavingAmount = asMoney((Array.isArray(pr?.budgetReturnRevisions) ? pr.budgetReturnRevisions : []).reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.procurementSavingAmount || 0)),
    0
  ));
  const totalSavingAmount = Math.max(0, Number(returnInfo?.procurementSavingAmount || 0));
  const savingToReserve = asMoney(Math.max(0, totalSavingAmount - pendingSavingAmount - appliedSavingAmount));
  const currentTotal = Math.max(0, Number(returnInfo?.currentTotal || 0));
  const usedAmount = Math.max(0, Number(returnInfo?.poSubTotalUsed ?? returnInfo?.poGrandTotalUsed ?? 0));
  const availableReturnAmount = asMoney(Math.max(
    0,
    currentTotal - usedAmount - pendingReturnedAmount - pendingSavingAmount - savingToReserve
  ));
  return {
    availableReturnAmount,
    savingToReserve,
    pendingReturnedAmount,
    pendingSavingAmount,
  };
};

export const appendPendingBudgetReturn = (pr: any, pendingReturn: any) => {
  const current = getPendingBudgetReturns(pr);
  if (!pendingReturn?.requestId || current.some((row: any) => row.requestId === pendingReturn.requestId)) {
    return current;
  }
  return [...current, pendingReturn];
};

export const removePendingBudgetReturns = (pr: any, requestIds: Iterable<string>) => {
  const ids = new Set(Array.from(requestIds, (id) => String(id)));
  return getPendingBudgetReturns(pr).filter((row: any) => !ids.has(String(row.requestId)));
};

export const getBudgetReturnGroupKey = (notification: any) => (
  String(notification?.subItemId || "__main__")
);

export const getPendingBudgetReturnGroup = (notifications: any[], seed: any) => {
  const key = getBudgetReturnGroupKey(seed);
  return (Array.isArray(notifications) ? notifications : []).filter((notification: any) => (
    notification?.id
    && (notification.status || "pending") !== "accepted"
    && getBudgetReturnGroupKey(notification) === key
  ));
};

export const sumBudgetReturnNotifications = (notifications: any[]) => asMoney(
  (Array.isArray(notifications) ? notifications : []).reduce(
    (sum: number, notification: any) => sum + Math.max(0, Number(notification?.amount || 0)),
    0
  )
);

export const buildAcceptedPendingReturnState = (
  pr: any,
  requestIds: Iterable<string>,
  acceptedAt: string,
  acceptedBy: string
) => {
  const ids = new Set(Array.from(requestIds, (id) => String(id)));
  const allPendingReturns = getPendingBudgetReturns(pr);
  const selectedPendingReturns = allPendingReturns.filter((row: any) => ids.has(String(row.requestId)));
  if (selectedPendingReturns.length !== ids.size) {
    throw new Error("รายการรอรับไม่ตรงกับคำขอ");
  }

  let totalAmount = Number(pr?.totalAmount ?? pr?.amount ?? 0);
  let items = Array.isArray(pr?.items) ? pr.items : [];
  const history = Array.isArray(pr?.budgetReturnRevisions) ? pr.budgetReturnRevisions : [];
  const revisions: any[] = [];
  const revisionNoByRequestId: Record<string, number> = {};
  [...selectedPendingReturns]
    .sort((left: any, right: any) => String(left.at || "").localeCompare(String(right.at || "")))
    .forEach((pendingReturn: any, index: number) => {
      const oldTotalAmount = totalAmount;
      const revisedTotal = asMoney(Math.max(0, totalAmount - getPendingReturnDeduction(pendingReturn)));
      const oldItems = items;
      items = scalePrItemsToTotal(items, revisedTotal);
      const { requestId, newItems, newStatus, ...revision } = pendingReturn;
      const revNo = history.length + index + 1;
      revisions.push({
        ...revision,
        revNo,
        budgetReturnRequestId: requestId,
        oldTotalAmount,
        newTotalAmount: revisedTotal,
        oldItems,
        acceptedAt,
        acceptedBy,
      });
      revisionNoByRequestId[String(requestId)] = revNo;
      totalAmount = revisedTotal;
    });

  return {
    totalAmount,
    items,
    revisions,
    history: [...history, ...revisions],
    remainingPendingReturns: removePendingBudgetReturns(pr, ids),
    revisionNoByRequestId,
  };
};

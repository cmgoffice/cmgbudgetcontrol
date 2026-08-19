import {
  getPoAmountExVat,
  getPoDiscountAmount,
  getPoItemsGrossSubtotal,
} from "./poDiscount";
import {
  getLatestPaymentForPo,
  getPaymentAccumulatedNetAmount,
  isPaymentLinkedToPo,
} from "./poPaymentBalance";
import { isPoLinkedToPr } from "./prBudgetReturn";
import { collection, doc, runTransaction } from "firebase/firestore";

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number) => Math.round(asNumber(value) * 100) / 100;

// Preserve the negotiated unit price when a PO is revised. Quantities may be
// fractional, so retain enough precision for quantity x unit price to match
// the revised line amount.
const roundQuantity = (value: number) => Math.round(asNumber(value) * 1_000_000) / 1_000_000;

export const getPoLinkedPrIds = (po: any) => {
  if (!po) return [];
  const ids = new Set<string>();
  if (po.prRefId) ids.add(String(po.prRefId));
  (Array.isArray(po.selectedPrIds) ? po.selectedPrIds : []).forEach((id: any) => {
    if (id) ids.add(String(id));
  });
  (Array.isArray(po.items) ? po.items : []).forEach((item: any) => {
    if (item?.prId) ids.add(String(item.prId));
    (Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : []).forEach((allocation: any) => {
      if (allocation?.prId) ids.add(String(allocation.prId));
    });
  });
  return Array.from(ids);
};

/**
 * Returns the PO's net allocation to one PR before the completion Rev.
 * New PO records carry disPrAllocations after the procurement discount has
 * already been allocated, so those values are the correct PR/budget basis.
 */
export const getPoNetAllocationForPr = (po: any, prId: string, linkedPrIds = getPoLinkedPrIds(po)) => {
  if (!po || !prId || !isPoLinkedToPr(po, prId)) return 0;
  const allocations = (Array.isArray(po.items) ? po.items : []).reduce((sum: number, item: any) => {
    if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
      return sum + item.disPrAllocations.reduce((allocationSum: number, allocation: any) => (
        String(allocation?.prId || "") === String(prId)
          ? allocationSum + Math.max(0, asNumber(allocation.amount))
          : allocationSum
      ), 0);
    }
    return sum + (String(item?.prId || "") === String(prId) ? Math.max(0, asNumber(item.amount)) : 0);
  }, 0);

  if (allocations > 0) return roundCurrency(allocations);

  // Legacy PO records may not have per-PR allocation rows. If only one PR is
  // linked, the complete PO net is unambiguous. For multiple PRs, split by
  // linked PR count rather than assigning the full PO to every PR.
  const poNet = getPoAmountExVat(po);
  return roundCurrency(poNet / Math.max(1, linkedPrIds.length));
};

export const getPoDiscountForPr = (po: any, prId: string, linkedPrIds = getPoLinkedPrIds(po)) => {
  const discount = getPoDiscountAmount(po);
  if (discount <= 0) return 0;
  const targetId = po?.discountPrId || po?.discountAllocation?.prId || "";
  if (targetId) return String(targetId) === String(prId) ? roundCurrency(discount) : 0;
  return linkedPrIds.length === 1 ? roundCurrency(discount) : 0;
};

export const scalePoItemsToNetAmount = (po: any, targetNetAmount: number) => {
  const items = Array.isArray(po?.items) ? po.items : [];
  if (items.length === 0) return items;

  const currentGross = getPoItemsGrossSubtotal(po);
  const discount = getPoDiscountAmount(po);
  const targetNet = Math.max(0, roundCurrency(targetNetAmount));
  const targetGross = Math.max(0, roundCurrency(targetNet + discount));
  if (currentGross <= 0) return items;

  const netRatio = getPoAmountExVat(po) > 0
    ? Math.min(1, targetNet / getPoAmountExVat(po))
    : 0;
  let assignedGross = 0;

  return items.map((item: any, index: number) => {
    const rawAmount = Number(item?.amount);
    const currentAmount = Number.isFinite(rawAmount)
      ? Math.max(0, rawAmount)
      : Math.max(0, asNumber(item?.quantity) * asNumber(item?.price ?? item?.unitPrice));
    const nextGross = index === items.length - 1
      ? Math.max(0, roundCurrency(targetGross - assignedGross))
      : Math.max(0, roundCurrency((currentAmount / currentGross) * targetGross));
    assignedGross = roundCurrency(assignedGross + nextGross);
    const quantity = asNumber(item?.quantity);
    const unitPrice = asNumber(item?.price ?? item?.unitPrice);
    const nextQuantity = unitPrice > 0
      ? roundQuantity(nextGross / unitPrice)
      : roundQuantity(quantity > 0 && currentAmount > 0 ? quantity * (nextGross / currentAmount) : quantity);
    const nextAllocations = Array.isArray(item?.disPrAllocations)
      ? item.disPrAllocations.map((allocation: any) => ({
        ...allocation,
        amount: roundCurrency(Math.max(0, asNumber(allocation?.amount) * netRatio)),
      }))
      : item?.disPrAllocations;
    return {
      ...item,
      amount: nextGross,
      quantity: nextQuantity,
      // Rev reduces the quantity actually used; it must not rewrite the
      // contracted price/unit shown on the PO and its PDF.
      ...(Object.prototype.hasOwnProperty.call(item || {}, "price") ? { price: unitPrice } : {}),
      ...(Object.prototype.hasOwnProperty.call(item || {}, "unitPrice") ? { unitPrice } : {}),
      ...(Array.isArray(item?.disPrAllocations) ? { disPrAllocations: nextAllocations } : {}),
    };
  });
};

export const getPaymentActualUsedForPo = (po: any, payments: any[]) => {
  const latestPayment = getLatestPaymentForPo(po, payments);
  return {
    latestPayment,
    actualUsed: roundCurrency(getPaymentAccumulatedNetAmount(latestPayment)),
    poNetAmount: roundCurrency(getPoAmountExVat(po)),
  };
};

/**
 * Builds the immutable business result used by both the Log PO preview and
 * the backend worker. The result deliberately separates the procurement
 * saving from the amount that can be returned to Budget.
 */
export const buildPoBudgetReturnPlan = ({ po, payments = [], prs = [] }: any) => {
  const { latestPayment, actualUsed, poNetAmount } = getPaymentActualUsedForPo(po, payments);
  const linkedPrIds = getPoLinkedPrIds(po);
  const linkedPrs = linkedPrIds
    .map((id) => (Array.isArray(prs) ? prs.find((pr: any) => String(pr?.id) === String(id)) : null))
    .filter(Boolean);
  const discountAmount = roundCurrency(getPoDiscountAmount(po));
  const paymentComplete = actualUsed >= Math.max(0, poNetAmount - 0.01);
  const usageRatio = poNetAmount > 0 ? Math.min(1, actualUsed / poNetAmount) : 0;

  const rawAllocations = linkedPrs.map((pr: any) => ({
    prId: pr.id,
    prNo: pr.prNo || pr.id,
    currentPrTotal: roundCurrency(asNumber(pr.totalAmount ?? pr.amount)),
    poNetAllocation: getPoNetAllocationForPr(po, pr.id, linkedPrIds),
    discountAmount: getPoDiscountForPr(po, pr.id, linkedPrIds),
  }));
  const allocationTotal = rawAllocations.reduce((sum, row) => sum + row.poNetAllocation, 0);
  const normalizedAllocations = rawAllocations.map((row) => {
    const base = allocationTotal > 0
      ? row.poNetAllocation
      : roundCurrency(poNetAmount / Math.max(1, rawAllocations.length));
    const actualForPr = roundCurrency(actualUsed * (base / Math.max(0.01, allocationTotal || poNetAmount)));
    const returnable = roundCurrency(Math.max(0, base - actualForPr));
    const newPrTotal = roundCurrency(Math.max(0, row.currentPrTotal - returnable - row.discountAmount));
    return {
      ...row,
      poNetAllocation: roundCurrency(base),
      actualUsed: actualForPr,
      returnableAmount: returnable,
      newPrTotal,
    };
  });

  const returnableAmount = roundCurrency(normalizedAllocations.reduce((sum, row) => sum + row.returnableAmount, 0));
  const procurementSaving = roundCurrency(normalizedAllocations.reduce((sum, row) => sum + row.discountAmount, 0) || discountAmount);

  return {
    poId: po?.id || null,
    poNo: po?.poNo || po?.id || "",
    latestPaymentId: latestPayment?.id || null,
    latestPaymentNo: latestPayment?.paymentNo || "",
    latestPeriodNo: latestPayment?.periodNo || null,
    poNetAmount,
    actualUsed,
    balanceBeforeRev: roundCurrency(Math.max(0, poNetAmount - actualUsed)),
    paymentComplete,
    usageRatio,
    discountAmount,
    procurementSaving,
    returnableAmount,
    revisedPoNetAmount: paymentComplete ? poNetAmount : actualUsed,
    revisedPoItems: paymentComplete ? (po?.items || []) : scalePoItemsToNetAmount(po, actualUsed),
    linkedPrs: normalizedAllocations,
    linkedPrIds,
    canStart: Boolean(latestPayment && po?.jobCompleted && !paymentComplete && returnableAmount > 0),
    source: "payment",
  };
};

export const isPaymentLinkedForReturnPlan = (payment: any, po: any) => isPaymentLinkedToPo(payment, po);

/**
 * Put a PO return plan on the durable Firestore queue. The Cloud Function
 * listens to this collection, so the caller can safely close the browser once
 * this transaction has committed.
 */
export const enqueuePoBudgetReturnJob = async ({ db, appId, po, plan, actor = {} }: any) => {
  if (!db || !appId || !po?.id || !plan || plan.paymentComplete || plan.returnableAmount <= 0) {
    return { queued: false, reason: "NO_RETURN_REQUIRED" };
  }
  if (String(po?.poType || "").toUpperCase() !== "SP") {
    return { queued: false, reason: "PO_TYPE_NOT_SUPPORTED" };
  }
  const startedAt = new Date().toISOString();
  const safePaymentId = String(plan.latestPaymentId || "latest").replace(/[^a-zA-Z0-9_-]/g, "_");
  const jobId = `po-return-${po.id}-${safePaymentId}-${Date.now()}`;
  const actorName = actor?.name || actor?.displayName || actor?.email || "Unknown";

  await runTransaction(db, async (transaction: any) => {
    const poRef = doc(db, "artifacts", appId, "public", "data", "pos", po.id);
    const jobRef = doc(collection(db, "artifacts", appId, "public", "data", "poBudgetReturnJobs"), jobId);
    const poSnap = await transaction.get(poRef);
    if (!poSnap.exists()) throw new Error("ไม่พบ PO ล่าสุด");
    const latestPo = poSnap.data() || {};
    const latestStatus = String(latestPo.budgetReturnProcessStatus || "");
    if (["Queued", "Running", "Waiting Budget Approval"].includes(latestStatus)) {
      throw new Error("PO นี้มี Process คืน Budget ที่กำลังดำเนินการอยู่แล้ว");
    }
    transaction.set(jobRef, {
      jobType: "PO_PAYMENT_BUDGET_RETURN",
      status: "Queued",
      currentStep: "Queued",
      poId: po.id,
      poNo: po.poNo || po.id,
      projectId: po.projectId || null,
      latestPaymentId: plan.latestPaymentId,
      latestPaymentNo: plan.latestPaymentNo,
      requestedAt: startedAt,
      requestedBy: actorName,
      requestedByUid: actor?.uid || null,
      requestedByEmail: actor?.email || null,
      idempotencyKey: jobId,
      preview: {
        poNetAmount: plan.poNetAmount,
        actualUsed: plan.actualUsed,
        revisedPoNetAmount: plan.revisedPoNetAmount,
        returnableAmount: plan.returnableAmount,
        procurementSaving: plan.procurementSaving,
      },
      linkedPrs: plan.linkedPrs,
      error: null,
      updatedAt: startedAt,
    });
    transaction.update(poRef, {
      budgetReturnProcessId: jobId,
      budgetReturnProcessStatus: "Queued",
      budgetReturnProcessStep: "Queued",
      budgetReturnProcessUpdatedAt: startedAt,
      budgetReturnProcessRequestedAt: startedAt,
      budgetReturnProcessRequestedBy: actorName,
      budgetReturnProcessRequestedByUid: actor?.uid || null,
      budgetReturnProcessRequestedByEmail: actor?.email || null,
      updatedAt: startedAt,
    });
  });

  return { queued: true, jobId, startedAt };
};

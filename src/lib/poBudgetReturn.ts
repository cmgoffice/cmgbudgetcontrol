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

const getLineAmount = (item: any) => {
  const explicit = Number(item?.amount);
  return Number.isFinite(explicit)
    ? Math.max(0, explicit)
    : Math.max(0, asNumber(item?.quantity) * asNumber(item?.price ?? item?.unitPrice));
};

const allocateTargetByWeight = (targetAmount: number, rows: any[]) => {
  const target = Math.max(0, roundCurrency(targetAmount));
  const result = rows.map(() => 0);
  let remaining = target;
  let active = rows
    .map((row, index) => ({
      index,
      weight: Math.max(0, asNumber(row?.weight)),
      capacity: Math.max(0, asNumber(row?.capacity)),
    }))
    .filter((row) => row.capacity > 0.000001);

  for (let pass = 0; pass < rows.length + 2 && remaining > 0.000001 && active.length > 0; pass += 1) {
    const positiveWeightTotal = active.reduce((sum, row) => sum + row.weight, 0);
    const fallbackWeightTotal = active.reduce((sum, row) => sum + Math.max(0, row.capacity - result[row.index]), 0);
    let assignedThisPass = 0;
    active.forEach((row) => {
      const available = Math.max(0, row.capacity - result[row.index]);
      const weight = positiveWeightTotal > 0 ? row.weight : available;
      const weightTotal = positiveWeightTotal > 0 ? positiveWeightTotal : fallbackWeightTotal;
      const requested = weightTotal > 0 ? remaining * (weight / weightTotal) : 0;
      const take = Math.min(available, requested);
      result[row.index] += take;
      assignedThisPass += take;
    });
    remaining = Math.max(0, target - result.reduce((sum, value) => sum + value, 0));
    active = active.filter((row) => row.capacity - result[row.index] > 0.000001);
    if (assignedThisPass <= 0.000001) break;
  }

  const rounded = result.map(roundCurrency);
  const drift = roundCurrency(target - rounded.reduce((sum, value) => sum + value, 0));
  if (Math.abs(drift) > 0 && rounded.length > 0) {
    let driftIndex = -1;
    for (let candidate = rounded.length - 1; candidate >= 0; candidate -= 1) {
      if (
        rounded[candidate] + drift >= -0.001
        && rounded[candidate] + drift <= Math.max(0, asNumber(rows[candidate]?.capacity)) + 0.001
      ) {
        driftIndex = candidate;
        break;
      }
    }
    if (driftIndex >= 0) rounded[driftIndex] = roundCurrency(rounded[driftIndex] + drift);
  }
  return rounded;
};

/**
 * Trace accumulated Payment usage through the PO line and its PR-item
 * allocations. This is the only safe basis for a multi-PR return: the total
 * Payment amount alone cannot say which Budget/Sub-item was actually used.
 */
export const buildPoPaymentAllocationPlan = (po: any, payment: any) => {
  const poItems = Array.isArray(po?.items) ? po.items : [];
  const paymentItems = Array.isArray(payment?.items) ? payment.items : [];
  const paymentByPoItemIndex = new Map<number, any>();
  paymentItems.forEach((item: any, fallbackIndex: number) => {
    const explicitIndex = Number(item?.prItemIndex);
    const index = Number.isInteger(explicitIndex) && explicitIndex >= 0 ? explicitIndex : fallbackIndex;
    paymentByPoItemIndex.set(index, item);
  });

  const linkedIds = getPoLinkedPrIds(po);
  const hasMultiplePrs = linkedIds.length > 1;
  const lines = poItems.map((item: any, poItemIndex: number) => {
    const allocations = Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0
      ? item.disPrAllocations
        .map((allocation: any, allocationIndex: number) => ({
          ...allocation,
          allocationIndex,
          prId: String(allocation.prId),
          amount: Math.max(0, asNumber(allocation.amount)),
        }))
        .filter((allocation: any) => allocation?.prId && allocation.amount > 0)
      : (item?.prId ? [{
        prId: String(item.prId),
        prItemIndex: item?.prItemIndex,
        allocationIndex: -1,
        amount: getLineAmount(item),
      }] : []);
    const grossAmount = getLineAmount(item);
    const allocationTotal = allocations.reduce((sum: number, allocation: any) => sum + allocation.amount, 0);
    const paymentItem = paymentByPoItemIndex.get(poItemIndex);
    const paidGrossAmount = Math.min(
      grossAmount,
      Math.max(0, asNumber(paymentItem?.prevAccumAmount) + asNumber(paymentItem?.thisPeriodAmount))
    );
    const progressRatio = grossAmount > 0 ? Math.min(1, paidGrossAmount / grossAmount) : 0;
    return {
      item,
      poItemIndex,
      grossAmount,
      allocations,
      allocationTotal,
      progressRatio,
      desiredActual: allocationTotal * progressRatio,
    };
  });

  if (hasMultiplePrs) {
    const ambiguousLine = lines.find((line: any) => (
      line.grossAmount > 0.01
      && (
        line.allocations.length === 0
        || !Array.isArray(line.item?.disPrAllocations)
        || line.allocations.some((allocation: any) => (
          allocation?.prItemIndex == null || !Number.isInteger(Number(allocation.prItemIndex))
        ))
      )
    ));
    if (ambiguousLine) {
      throw new Error(`PO หลาย PR มีรายการที่ระบุ PR item ต้นทางไม่ครบ: ${ambiguousLine.item?.description || `รายการ ${ambiguousLine.poItemIndex + 1}`}`);
    }
  }

  const poNetAmount = roundCurrency(getPoAmountExVat(po));
  const hasExplicitAllocations = lines.some((line: any) => Array.isArray(line.item?.disPrAllocations) && line.item.disPrAllocations.length > 0);
  if (!hasExplicitAllocations) {
    const rawTotal = lines.reduce((sum: number, line: any) => sum + line.allocationTotal, 0);
    const netRatio = rawTotal > 0 ? poNetAmount / rawTotal : 0;
    lines.forEach((line: any) => {
      line.allocations = line.allocations.map((allocation: any) => ({
        ...allocation,
        amount: Math.max(0, allocation.amount * netRatio),
      }));
      line.allocationTotal = line.allocations.reduce((sum: number, allocation: any) => sum + allocation.amount, 0);
      line.desiredActual = line.allocationTotal * line.progressRatio;
    });
  }
  const actualUsed = roundCurrency(getPaymentAccumulatedNetAmount(payment));
  const contractNet = roundCurrency(lines.reduce((sum: number, line: any) => sum + line.allocationTotal, 0));
  if (hasMultiplePrs && Math.abs(contractNet - poNetAmount) > 0.05) {
    throw new Error(`Allocation ของ PO ไม่ตรงกับยอดสุทธิ (${contractNet.toFixed(2)} / ${poNetAmount.toFixed(2)})`);
  }

  const actualByLine = allocateTargetByWeight(Math.min(actualUsed, contractNet || poNetAmount), lines.map((line: any) => ({
    weight: line.desiredActual,
    capacity: line.allocationTotal,
  })));

  const perPr = new Map<string, any>();
  const revisedItems = lines.map((line: any, lineIndex: number) => {
    const actualLineAmount = actualByLine[lineIndex] || 0;
    const actualByAllocation = allocateTargetByWeight(actualLineAmount, line.allocations.map((allocation: any) => ({
      weight: allocation.amount,
      capacity: allocation.amount,
    })));
    line.allocations.forEach((allocation: any, allocationIndex: number) => {
      const current = perPr.get(allocation.prId) || {
        prId: allocation.prId,
        poNetAllocation: 0,
        actualUsed: 0,
        routes: [],
      };
      const actualAmount = actualByAllocation[allocationIndex] || 0;
      current.poNetAllocation = roundCurrency(current.poNetAllocation + allocation.amount);
      current.actualUsed = roundCurrency(current.actualUsed + actualAmount);
      current.routes.push({
        poItemIndex: line.poItemIndex,
        prItemIndex: Number.isInteger(Number(allocation?.prItemIndex)) ? Number(allocation.prItemIndex) : null,
        amount: roundCurrency(allocation.amount),
        actualUsed: roundCurrency(actualAmount),
        returnableAmount: roundCurrency(Math.max(0, allocation.amount - actualAmount)),
      });
      perPr.set(allocation.prId, current);
    });

    const lineDiscount = Math.max(0, roundCurrency(line.grossAmount - line.allocationTotal));
    const nextGross = roundCurrency(actualLineAmount + lineDiscount);
    const unitPrice = asNumber(line.item?.price ?? line.item?.unitPrice);
    const nextQuantity = unitPrice > 0
      ? roundQuantity(nextGross / unitPrice)
      : roundQuantity(asNumber(line.item?.quantity));
    let nextAllocations = line.item?.disPrAllocations;
    if (Array.isArray(nextAllocations) && nextAllocations.length > 0) {
      const actualByOriginalIndex = new Map<number, number>(line.allocations.map((allocation: any, index: number) => (
        [allocation.allocationIndex, actualByAllocation[index] || 0]
      )));
      nextAllocations = nextAllocations.map((allocation: any, index: number) => ({
        ...allocation,
        amount: roundCurrency(actualByOriginalIndex.get(index) || 0),
      }));
    }
    return {
      ...line.item,
      amount: nextGross,
      quantity: nextQuantity,
      ...(Object.prototype.hasOwnProperty.call(line.item || {}, "price") ? { price: unitPrice } : {}),
      ...(Object.prototype.hasOwnProperty.call(line.item || {}, "unitPrice") ? { unitPrice } : {}),
      ...(Array.isArray(nextAllocations) ? { disPrAllocations: nextAllocations } : {}),
    };
  });

  return {
    actualUsed,
    poNetAmount,
    contractNet,
    revisedItems,
    perPr,
  };
};

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

export const isPaymentJobCompleted = (payment: any) => Boolean(
  payment?.jobCompleted === true
  || String(payment?.jobStatus || "") === "จบงาน"
  || String(payment?.status || "") === "จบงาน"
);

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

  let allocationValidationError = "";
  let paymentAllocationPlan: any;
  try {
    paymentAllocationPlan = latestPayment && !paymentComplete
      ? buildPoPaymentAllocationPlan(po, latestPayment)
      : { perPr: new Map(), revisedItems: po?.items || [] };
  } catch (error: any) {
    allocationValidationError = error?.message || String(error);
    paymentAllocationPlan = { perPr: new Map(), revisedItems: po?.items || [] };
  }
  if (!allocationValidationError) {
    const missingPrIds = Array.from(paymentAllocationPlan.perPr.keys()).filter((prId: any) => (
      !Array.isArray(prs) || !prs.some((pr: any) => String(pr?.id || "") === String(prId))
    ));
    if (missingPrIds.length > 0) {
      allocationValidationError = `ไม่พบ PR ต้นทางของ Allocation: ${missingPrIds.join(", ")}`;
    }
  }
  const rawAllocations = linkedPrs.map((pr: any) => {
    const traced = paymentAllocationPlan.perPr.get(String(pr.id));
    return ({
    prId: pr.id,
    prNo: pr.prNo || pr.id,
    currentPrTotal: roundCurrency(asNumber(pr.totalAmount ?? pr.amount)),
    poNetAllocation: traced?.poNetAllocation ?? getPoNetAllocationForPr(po, pr.id, linkedPrIds),
    tracedActualUsed: traced?.actualUsed,
    routes: traced?.routes || [],
    discountAmount: getPoDiscountForPr(po, pr.id, linkedPrIds),
  });
  });
  const allocationTotal = rawAllocations.reduce((sum, row) => sum + row.poNetAllocation, 0);
  const normalizedAllocations = rawAllocations.map((row) => {
    const base = allocationTotal > 0
      ? row.poNetAllocation
      : roundCurrency(poNetAmount / Math.max(1, rawAllocations.length));
    const actualForPr = row.tracedActualUsed != null
      ? roundCurrency(row.tracedActualUsed)
      : roundCurrency(actualUsed * (base / Math.max(0.01, allocationTotal || poNetAmount)));
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
    latestPaymentJobCompleted: isPaymentJobCompleted(latestPayment),
    latestPaymentJobCompletedAt: latestPayment?.jobCompletedAt || latestPayment?.completedAt || null,
    latestPaymentJobCompletedBy: latestPayment?.jobCompletedBy || latestPayment?.completedBy || null,
    latestPaymentJobCompletedByUid: latestPayment?.jobCompletedByUid || latestPayment?.completedByUid || null,
    latestPaymentJobCompletedByEmail: latestPayment?.jobCompletedByEmail || latestPayment?.completedByEmail || null,
    poNetAmount,
    actualUsed,
    balanceBeforeRev: roundCurrency(Math.max(0, poNetAmount - actualUsed)),
    paymentComplete,
    usageRatio,
    discountAmount,
    procurementSaving,
    returnableAmount,
    revisedPoNetAmount: paymentComplete ? poNetAmount : actualUsed,
    revisedPoItems: paymentComplete ? (po?.items || []) : paymentAllocationPlan.revisedItems,
    linkedPrs: normalizedAllocations,
    linkedPrIds,
    allocationValidationError: allocationValidationError || null,
    canStart: Boolean(latestPayment && po?.jobCompleted && !paymentComplete && returnableAmount > 0 && !allocationValidationError),
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
  if (plan.allocationValidationError) {
    throw new Error(plan.allocationValidationError);
  }
  if (!plan.latestPaymentJobCompleted && !po?.jobCompleted) {
    throw new Error("Payment งวดล่าสุดยังไม่ได้จบงาน");
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
      // Keep the manual Log Payment action on the same completion path as
      // PaymentView: the PO is closed and marked complete before the durable
      // worker is allowed to claim the return job.
      status: "Closed PO",
      statusNow: "Closed PO",
      jobStatus: "จบงาน",
      jobCompleted: true,
      jobCompletedAt: latestPo.jobCompletedAt || plan.latestPaymentJobCompletedAt || startedAt,
      jobCompletedBy: latestPo.jobCompletedBy || plan.latestPaymentJobCompletedBy || actorName,
      jobCompletedByUid: latestPo.jobCompletedByUid || plan.latestPaymentJobCompletedByUid || actor?.uid || null,
      jobCompletedByEmail: latestPo.jobCompletedByEmail || plan.latestPaymentJobCompletedByEmail || actor?.email || null,
      jobCompletedPaymentId: latestPo.jobCompletedPaymentId || plan.latestPaymentId || null,
      jobCompletedPaymentNo: latestPo.jobCompletedPaymentNo || plan.latestPaymentNo || "",
      jobCompletedPeriodNo: latestPo.jobCompletedPeriodNo || plan.latestPeriodNo || null,
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

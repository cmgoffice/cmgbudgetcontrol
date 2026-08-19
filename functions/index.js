const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "asia-southeast1", maxInstances: 10 });

const db = admin.firestore();
const DISCOUNT_ALLOCATION_VERSION = 1;
const ACTIVE_JOB_STATUSES = new Set(["Queued", "Running", "Waiting Budget Approval"]);

const root = (appId, collectionName, id) => {
  const col = db.collection("artifacts").doc(appId).collection("public").doc("data").collection(collectionName);
  return id ? col.doc(id) : col;
};

const n = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => Math.round(n(value) * 100) / 100;
const quantity = (value) => Math.round(n(value) * 1000000) / 1000000;

const poGrossSubtotal = (po) => (Array.isArray(po?.items) ? po.items : []).reduce((sum, item) => {
  const explicit = item?.amount !== null && item?.amount !== undefined && item?.amount !== "";
  const amount = Number(item?.amount);
  return sum + (explicit && Number.isFinite(amount) ? Math.max(0, amount) : Math.max(0, n(item?.quantity) * n(item?.price ?? item?.unitPrice)));
}, 0);

const poDiscount = (po) => Math.min(poGrossSubtotal(po), Math.max(0, n(po?.discount)));

const poNet = (po) => {
  const gross = poGrossSubtotal(po);
  if (gross > 0) return money(Math.max(0, gross - poDiscount(po)));
  return money(Math.max(0, n(po?.subTotalAfterDiscount ?? po?.amountExVat ?? po?.subTotal ?? po?.subtotal ?? po?.amount ?? po?.totalAmount)));
};

const periodNo = (payment) => {
  const explicit = Number.parseInt(String(payment?.periodNo ?? ""), 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const match = String(payment?.paymentNo || "").match(/-(\d+)$/);
  const suffix = Number.parseInt(match?.[1] || "", 10);
  return Number.isFinite(suffix) && suffix > 0 ? suffix : 0;
};

const linkedPayment = (payment, po) => {
  if (!payment || !po?.id) return false;
  const poId = String(po.id);
  const poNo = String(po.poNo || "");
  const basePoNo = String(po.originalPoNo || poNo.replace(/_R\.\d+$/i, ""));
  const poNumbers = Array.from(new Set([poNo, basePoNo, po.originalPoNo].filter(Boolean)));
  const same = (value, target) => Boolean(target) && String(value || "") === target;
  if (Array.isArray(payment.selectedPrIds) && payment.selectedPrIds.some((id) => same(id, poId))) return true;
  if ([payment.sourcePoId, payment.poId, payment.poRef].some((value) => same(value, poId))) return true;
  if ([payment.sourcePoNo, payment.poNo, payment.poRef].some((value) => poNumbers.some((number) => same(value, number)))) return true;
  return poNumbers.some((number) => String(payment.paymentNo || "").startsWith(`${number}-`));
};

const latestPaymentForPo = (po, payments) => payments
  .filter((payment) => !["Reject", "Rejected"].includes(String(payment?.status || "")))
  .filter((payment) => linkedPayment(payment, po))
  .sort((a, b) => periodNo(b) - periodNo(a) || String(b?.updatedAt || b?.createdAt || "").localeCompare(String(a?.updatedAt || a?.createdAt || "")))[0] || null;

const paymentActual = (payment) => {
  if (!payment) return 0;
  const items = Array.isArray(payment.items) ? payment.items : [];
  const gross = items.length === 0
    ? Math.max(0, n(payment.amount))
    : items.reduce((sum, item) => sum + Math.max(0, n(item?.prevAccumAmount) + n(item?.thisPeriodAmount)), 0);
  if (payment.discountAllocationVersion !== DISCOUNT_ALLOCATION_VERSION) return money(gross);
  const applied = payment.discountAppliedAmount != null
    ? n(payment.discountAppliedAmount)
    : n(payment.prevAccumDiscount) + n(payment.thisPeriodDiscount);
  return money(Math.max(0, gross - applied));
};

const linkedPrIds = (po) => {
  const ids = new Set();
  if (po?.prRefId) ids.add(String(po.prRefId));
  (Array.isArray(po?.selectedPrIds) ? po.selectedPrIds : []).forEach((id) => id && ids.add(String(id)));
  (Array.isArray(po?.items) ? po.items : []).forEach((item) => {
    if (item?.prId) ids.add(String(item.prId));
    (Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : []).forEach((allocation) => {
      if (allocation?.prId) ids.add(String(allocation.prId));
    });
  });
  return [...ids];
};

const allocationForPr = (po, prId, ids) => {
  const allocated = (Array.isArray(po?.items) ? po.items : []).reduce((sum, item) => {
    if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
      return sum + item.disPrAllocations.reduce((sub, allocation) => String(allocation?.prId || "") === String(prId) ? sub + Math.max(0, n(allocation.amount)) : sub, 0);
    }
    return sum + (String(item?.prId || "") === String(prId) ? Math.max(0, n(item.amount)) : 0);
  }, 0);
  return money(allocated > 0 ? allocated : poNet(po) / Math.max(1, ids.length));
};

const discountForPr = (po, prId, ids) => {
  const discount = poDiscount(po);
  if (discount <= 0) return 0;
  const target = po?.discountPrId || po?.discountAllocation?.prId || "";
  if (target) return String(target) === String(prId) ? money(discount) : 0;
  return ids.length === 1 ? money(discount) : 0;
};

const scalePrItems = (items, targetTotal) => {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  const current = items.reduce((sum, item) => sum + (Number.isFinite(Number(item?.amount)) ? n(item.amount) : n(item?.quantity) * n(item?.price)), 0);
  if (current <= 0) return items;
  let assigned = 0;
  return items.map((item, index) => {
    const currentAmount = Number.isFinite(Number(item?.amount)) ? n(item.amount) : n(item?.quantity) * n(item?.price);
    const next = index === items.length - 1 ? Math.max(0, money(targetTotal - assigned)) : Math.max(0, money((currentAmount / current) * targetTotal));
    assigned = money(assigned + next);
    const qty = n(item?.quantity);
    return { ...item, amount: next, price: qty > 0 ? next / qty : n(item?.price) };
  });
};

const scalePoItemsToNet = (po, targetNet) => {
  const items = Array.isArray(po?.items) ? po.items : [];
  const currentGross = poGrossSubtotal(po);
  if (items.length === 0 || currentGross <= 0) return items;
  const targetGross = Math.max(0, money(targetNet + poDiscount(po)));
  const currentNet = poNet(po);
  const netRatio = currentNet > 0 ? Math.min(1, targetNet / currentNet) : 0;
  let assigned = 0;
  return items.map((item, index) => {
    const currentAmount = Number.isFinite(Number(item?.amount)) ? Math.max(0, n(item.amount)) : Math.max(0, n(item?.quantity) * n(item?.price ?? item?.unitPrice));
    const nextGross = index === items.length - 1 ? Math.max(0, money(targetGross - assigned)) : Math.max(0, money((currentAmount / currentGross) * targetGross));
    assigned = money(assigned + nextGross);
    const qty = n(item?.quantity);
    const unitPrice = n(item?.price ?? item?.unitPrice);
    const nextQty = unitPrice > 0
      ? quantity(nextGross / unitPrice)
      : quantity(qty > 0 && currentAmount > 0 ? qty * (nextGross / currentAmount) : qty);
    const allocations = Array.isArray(item?.disPrAllocations)
      ? item.disPrAllocations.map((allocation) => ({ ...allocation, amount: money(Math.max(0, n(allocation.amount) * netRatio)) }))
      : item?.disPrAllocations;
    return {
      ...item,
      amount: nextGross,
      quantity: nextQty,
      // Rev reduces the quantity actually used; preserve the negotiated
      // unit price in the PO and the replacement PDF.
      ...(Object.prototype.hasOwnProperty.call(item || {}, "price") ? { price: unitPrice } : {}),
      ...(Object.prototype.hasOwnProperty.call(item || {}, "unitPrice") ? { unitPrice } : {}),
      ...(Array.isArray(item?.disPrAllocations) ? { disPrAllocations: allocations } : {}),
    };
  });
};

const budgetRefForPr = (appId, pr) => {
  if (pr?.budgetId) return root(appId, "budgets", pr.budgetId);
  return null;
};

const findBudgetRefForPr = async (appId, pr) => {
  const direct = budgetRefForPr(appId, pr);
  if (direct) return direct;
  if (!pr?.projectId || !pr?.costCode) return null;
  const snap = await root(appId, "budgets")
    .where("projectId", "==", pr.projectId)
    .get();
  const match = snap.docs.find((doc) => String(doc.data()?.code || "") === String(pr.costCode));
  return match ? root(appId, "budgets", match.id) : null;
};

exports.processPoBudgetReturn = onDocumentWritten("artifacts/{appId}/public/data/poBudgetReturnJobs/{jobId}", async (event) => {
  const { appId, jobId } = event.params;
  const jobRef = root(appId, "poBudgetReturnJobs", jobId);
  const now = new Date().toISOString();
  const claimed = await db.runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(jobRef);
    if (!currentSnap.exists) return false;
    const currentJob = currentSnap.data() || {};
    if (currentJob.status !== "Queued") return false;
    transaction.update(jobRef, { status: "Running", currentStep: "VALIDATE", startedAt: now, updatedAt: now });
    return true;
  });
  if (!claimed) return;
  const claimedJobSnap = await jobRef.get();
  if (!claimedJobSnap.exists) return;
  const initialJob = claimedJobSnap.data() || {};

  try {
    const poRef = root(appId, "pos", initialJob.poId);
    const poSnap = await poRef.get();
    if (!poSnap.exists) throw new Error("ไม่พบ PO");
    const po = { id: poSnap.id, ...poSnap.data() };
    const claimedAt = new Date().toISOString();
    await poRef.update({
      budgetReturnProcessStatus: "Running",
      budgetReturnProcessStep: "VALIDATE",
      budgetReturnProcessUpdatedAt: claimedAt,
      updatedAt: claimedAt,
    });
    if (String(po.poType || "").toUpperCase() !== "SP") {
      await db.runTransaction(async (transaction) => {
        const currentPoSnap = await transaction.get(poRef);
        const currentJobSnap = await transaction.get(jobRef);
        if (currentPoSnap.exists) transaction.update(poRef, {
          budgetReturnProcessStatus: "Completed No Return",
          budgetReturnProcessStep: "SKIP_NON_SP",
          budgetReturnProcessUpdatedAt: claimedAt,
          budgetReturnProcessError: null,
          updatedAt: claimedAt,
        });
        if (currentJobSnap.exists) transaction.update(jobRef, {
          status: "Completed No Return",
          currentStep: "SKIP_NON_SP",
          completedAt: claimedAt,
          error: null,
          updatedAt: claimedAt,
        });
      });
      return;
    }
    if (po.status !== "Closed PO" || !po.jobCompleted) throw new Error("PO ต้องเป็น Closed PO และ Payment ต้องจบงานแล้ว");
    if (po.budgetReturnProcessId && po.budgetReturnProcessId !== jobId && ACTIVE_JOB_STATUSES.has(po.budgetReturnProcessStatus)) throw new Error("PO มี Process อื่นกำลังทำงานอยู่");

    const paymentsSnapshot = await root(appId, "payments").get();
    const payments = paymentsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const latestPayment = latestPaymentForPo(po, payments);
    if (!latestPayment) throw new Error("ไม่พบ Payment ที่ผูกกับ PO");
    const actualUsed = paymentActual(latestPayment);
    const poNetAmount = poNet(po);
    const discountAmount = poDiscount(po);
    const ids = linkedPrIds(po);

    if (actualUsed >= Math.max(0, poNetAmount - 0.01)) {
      const completedAt = new Date().toISOString();
      await db.runTransaction(async (transaction) => {
        const currentPoSnap = await transaction.get(poRef);
        const currentJobSnap = await transaction.get(jobRef);
        if (!currentPoSnap.exists || !currentJobSnap.exists) throw new Error("ไม่พบข้อมูลล่าสุด");
        transaction.update(poRef, {
          budgetReturnProcessStatus: "Completed No Return",
          budgetReturnProcessStep: "FINALIZE",
          budgetReturnProcessCompletedAt: completedAt,
          budgetReturnProcessCompletedBy: initialJob.requestedBy || "System",
          budgetReturnProcessReturnableAmount: 0,
          budgetReturnProcessSavingAmount: discountAmount,
          budgetReturnProcessUpdatedAt: completedAt,
          updatedAt: completedAt,
        });
        transaction.update(jobRef, {
          status: "Completed No Return",
          currentStep: "FINALIZE",
          completedAt,
          actualUsed,
          poNetAmount,
          returnableAmount: 0,
          procurementSaving: discountAmount,
          updatedAt: completedAt,
        });
      });
      return;
    }

    const prRefs = ids.map((id) => root(appId, "prs", id));
    const budgetRefs = [];
    const prSnapshots = [];
    for (const ref of prRefs) {
      const snap = await ref.get();
      if (!snap.exists) continue;
      const pr = { id: snap.id, ...snap.data() };
      const budgetRef = await findBudgetRefForPr(appId, pr);
      if (!budgetRef) throw new Error(`ไม่พบ Budget ของ PR ${pr.prNo || pr.id}`);
      budgetRefs.push(budgetRef);
      prSnapshots.push({ pr: { ...pr, __budgetId: budgetRef.id }, snap, budgetRef });
    }
    const baseTotal = ids.reduce((sum, id) => sum + allocationForPr(po, id, ids), 0) || poNetAmount;
    const rows = prSnapshots.map(({ pr }) => {
      const base = allocationForPr(po, pr.id, ids);
      const actualForPr = money(actualUsed * (base / Math.max(0.01, baseTotal)));
      const returnable = money(Math.max(0, base - actualForPr));
      const saving = discountForPr(po, pr.id, ids);
      const currentPrTotal = money(n(pr.totalAmount ?? pr.amount));
      const newPrTotal = money(Math.max(0, currentPrTotal - returnable - saving));
      return { pr, base, actualForPr, returnable, saving, currentPrTotal, newPrTotal };
    });
    const returnableAmount = money(rows.reduce((sum, row) => sum + row.returnable, 0));
    const savingAmount = money(rows.reduce((sum, row) => sum + row.saving, 0) || discountAmount);
    if (returnableAmount <= 0) throw new Error("ไม่มียอดที่สามารถคืน Budget ได้");

    const revisedItems = scalePoItemsToNet(po, actualUsed);
    const completedAt = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const currentPoSnap = await transaction.get(poRef);
      const currentJobSnap = await transaction.get(jobRef);
      if (!currentPoSnap.exists || !currentJobSnap.exists) throw new Error("ไม่พบข้อมูลล่าสุด");
      const currentPo = { id: currentPoSnap.id, ...currentPoSnap.data() };
      if (currentPo.budgetReturnProcessId !== jobId) throw new Error("PO ถูกเปลี่ยน Process ระหว่างดำเนินการ");
      const currentPoHistory = Array.isArray(currentPo.poBudgetReturnRevisions) ? currentPo.poBudgetReturnRevisions : [];
      const revNo = currentPoHistory.length + 1;
      const originalPoNo = currentPo.originalPoNo || String(currentPo.poNo || currentPo.id);
      const revisedPoNo = `${originalPoNo}_R.${revNo}`;
      const currentPrRows = [];
      for (const row of rows) {
        const prRef = root(appId, "prs", row.pr.id);
        const budgetRef = row.pr.__budgetId ? root(appId, "budgets", row.pr.__budgetId) : null;
        if (!budgetRef) throw new Error(`ไม่พบ Budget ล่าสุดของ PR ${row.pr.prNo || row.pr.id}`);
        const prSnap = await transaction.get(prRef);
        const budgetSnap = await transaction.get(budgetRef);
        if (!prSnap.exists || !budgetSnap.exists) throw new Error(`ไม่พบ PR/Budget ล่าสุดของ ${row.pr.prNo || row.pr.id}`);
        const currentPr = prSnap.data() || {};
        if (currentPr.pendingBudgetReturn?.requestId) throw new Error(`PR ${row.pr.prNo || row.pr.id} มีคำขอคืน Budget รออยู่แล้ว`);
        const currentPrTotal = money(n(currentPr.totalAmount ?? currentPr.amount));
        if (Math.abs(currentPrTotal - row.currentPrTotal) > 0.01) throw new Error(`PR ${row.pr.prNo || row.pr.id} ถูกแก้ไขระหว่างเริ่ม Process กรุณาสร้างรายการใหม่`);
        currentPrRows.push({ row, prRef, budgetRef, currentPr, budget: budgetSnap.data() || {} });
      }
      const poRevision = {
        revNo,
        revisionType: "PAYMENT_JOB_COMPLETION",
        at: completedAt,
        by: initialJob.requestedBy || "System",
        jobId,
        paymentId: latestPayment.id,
        paymentNo: latestPayment.paymentNo || null,
        oldNetAmount: poNetAmount,
        newNetAmount: actualUsed,
        oldPoNo: currentPo.poNo || currentPo.id,
        newPoNo: revisedPoNo,
        oldDiscount: discountAmount,
        oldItems: Array.isArray(currentPo.items) ? currentPo.items : [],
        newItems: revisedItems,
        returnableAmount,
        procurementSaving: savingAmount,
      };
      transaction.update(poRef, {
        originalPoSnapshot: currentPo.originalPoSnapshot || {
          capturedAt: completedAt,
          netAmount: poNetAmount,
          discount: discountAmount,
          items: Array.isArray(currentPo.items) ? currentPo.items : [],
        },
        originalPoNo,
        poNo: revisedPoNo,
        items: revisedItems,
        subTotalAfterDiscount: actualUsed,
        amountExVat: actualUsed,
        poBudgetReturnRevisions: [...currentPoHistory, poRevision],
        poBudgetReturnRevNo: poRevision.revNo,
        budgetReturnProcessStatus: "Waiting Budget Approval",
          budgetReturnProcessStep: "WAITING_BUDGET_APPROVAL",
          budgetReturnProcessUpdatedAt: completedAt,
          budgetReturnProcessReturnableAmount: returnableAmount,
        budgetReturnProcessSavingAmount: savingAmount,
        budgetReturnProcessActualUsed: actualUsed,
        budgetReturnProcessCompletedPoRevAt: completedAt,
        updatedAt: completedAt,
      });

      for (const { row, prRef, budgetRef, currentPr, budget } of currentPrRows) {
        const history = Array.isArray(currentPr.budgetReturnRevisions) ? currentPr.budgetReturnRevisions : [];
        const requestId = `${jobId}-${row.pr.id}`;
        const revision = {
          revNo: history.length + 1,
          at: completedAt,
          by: initialJob.requestedBy || "System",
          oldStatus: currentPr.status || null,
          oldTotalAmount: row.currentPrTotal,
          newTotalAmount: row.newPrTotal,
          oldItems: Array.isArray(currentPr.items) ? currentPr.items : [],
          poGrandTotalUsed: row.base,
          returnedAmount: row.returnable,
          procurementSavingAmount: row.saving,
          returnReason: `คืนยอดจาก PO ${po.poNo || po.id} หลัง Payment จบงาน`,
          budgetId: currentPr.budgetId || null,
          costCode: currentPr.costCode || null,
          poRefs: [po.poNo || po.id],
          source: "PO_PAYMENT_BUDGET_RETURN",
          poBudgetReturnJobId: jobId,
        };
        const notification = {
          id: requestId,
          status: "pending",
          applyOnAccept: true,
          createdAt: completedAt,
          createdBy: initialJob.requestedBy || "System",
          prId: row.pr.id,
          prNo: row.pr.prNo || row.pr.id,
          poId: po.id,
          poNo: po.poNo || po.id,
          revNo: revision.revNo,
          amount: row.returnable,
          reason: revision.returnReason,
          subItemId: currentPr.selectedSubItemId || currentPr.subItemId || currentPr.items?.[0]?.budgetSubItemId || currentPr.items?.[0]?.subItemId || null,
          oldPrTotal: row.currentPrTotal,
          newPrTotal: row.newPrTotal,
          procurementSavingAmount: row.saving,
          poBudgetReturnJobId: jobId,
        };
        const pendingBudgetReturn = {
          ...revision,
          requestId,
          newItems: scalePrItems(currentPr.items || [], row.newPrTotal),
          newStatus: row.newPrTotal <= 0 ? "Closed PR Auto" : (currentPr.status || "Approved"),
        };
        const notifications = Array.isArray(budget.budgetReturnNotifications) ? budget.budgetReturnNotifications : [];
        transaction.update(prRef, { pendingBudgetReturn });
        transaction.update(budgetRef, { budgetReturnNotifications: [...notifications, notification] });
      }
      transaction.update(jobRef, {
        status: "Waiting Budget Approval",
        currentStep: "WAITING_BUDGET_APPROVAL",
        completedPoRevAt: completedAt,
        actualUsed,
        poNetAmount,
        revisedPoNetAmount: actualUsed,
        returnableAmount,
        procurementSaving: savingAmount,
        linkedPrs: rows.map((row) => ({ prId: row.pr.id, prNo: row.pr.prNo || row.pr.id, actualUsed: row.actualForPr, returnableAmount: row.returnable, newPrTotal: row.newPrTotal, procurementSaving: row.saving })),
        updatedAt: completedAt,
      });
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    const message = error?.message || String(error);
    await jobRef.update({ status: "Failed", currentStep: "FAILED", error: message, failedAt, updatedAt: failedAt });
    const poRef = root(appId, "pos", initialJob.poId);
    await poRef.update({ budgetReturnProcessStatus: "Failed", budgetReturnProcessStep: "FAILED", budgetReturnProcessError: message, budgetReturnProcessUpdatedAt: failedAt, updatedAt: failedAt });
  }
});

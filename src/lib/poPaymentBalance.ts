import {
  PO_DISCOUNT_ALLOCATION_VERSION,
  getPaymentAccumulatedGrossAmount,
  getPaymentDiscountAmount,
  getPaymentGrossPeriodAmount,
  getPoAmountExVat,
  getPoDiscountAmount,
  getPoItemsGrossSubtotal,
} from "./poDiscount";

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number) => Math.round(asNumber(value) * 100) / 100;

export const getPaymentPeriodNo = (payment: any): number => {
  const explicit = Number.parseInt(String(payment?.periodNo ?? ""), 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const match = String(payment?.paymentNo || "").match(/-(\d+)$/);
  const suffix = Number.parseInt(match?.[1] || "", 10);
  return Number.isFinite(suffix) && suffix > 0 ? suffix : 0;
};

export const isPaymentLinkedToPo = (payment: any, po: any): boolean => {
  if (!payment || !po?.id) return false;
  const poId = String(po.id);
  const poNo = String(po.poNo || "");
  const same = (value: any, target: string) => Boolean(target) && String(value || "") === target;

  if (Array.isArray(payment.selectedPrIds) && payment.selectedPrIds.some((id: any) => same(id, poId))) return true;
  if (same(payment.sourcePoId, poId) || same(payment.poId, poId) || same(payment.poRef, poId)) return true;
  if (same(payment.sourcePoNo, poNo) || same(payment.poNo, poNo) || same(payment.poRef, poNo)) return true;
  if (Array.isArray(payment.items) && payment.items.some((item: any) => (
    same(item?.poId, poId) || same(item?.prId, poId)
  ))) return true;

  return Boolean(poNo && String(payment.paymentNo || "").startsWith(`${poNo}-`));
};

const getPaymentSortTime = (payment: any) => {
  const raw = payment?.updatedAt || payment?.createdAt || payment?.paidAt || payment?.openDate || "";
  const timestamp = Date.parse(String(raw));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getLatestPaymentForPo = (po: any, payments: any[]) => {
  if (!po?.id || !Array.isArray(payments)) return null;
  return payments
    .filter((payment) => !["Reject", "Rejected"].includes(String(payment?.status || "")))
    .filter((payment) => isPaymentLinkedToPo(payment, po))
    .sort((a, b) => (
      getPaymentPeriodNo(b) - getPaymentPeriodNo(a) ||
      getPaymentSortTime(b) - getPaymentSortTime(a) ||
      String(b?.id || "").localeCompare(String(a?.id || ""))
    ))[0] || null;
};

export const getPoNetAmount = getPoAmountExVat;

export const getPaymentAccumulatedNetAmount = (payment: any) => {
  if (!payment) return 0;
  const gross = getPaymentAccumulatedGrossAmount(payment);
  if (payment.discountAllocationVersion !== PO_DISCOUNT_ALLOCATION_VERSION) return roundCurrency(gross);

  const appliedDiscount = payment.discountAppliedAmount != null
    ? asNumber(payment.discountAppliedAmount)
    : asNumber(payment.prevAccumDiscount) + getPaymentDiscountAmount(payment);
  return roundCurrency(Math.max(0, gross - appliedDiscount));
};

export const isReceiveLinkedToPo = (receive: any, po: any): boolean => {
  if (!receive || !po?.id) return false;
  if (String(receive.poId || "") === String(po.id)) return true;
  return Boolean(po.poNo && String(receive.poNo || receive.poRef || "") === String(po.poNo));
};

export const getPoReceiveUsedAmount = (po: any, receives: any[]) => {
  const grossReceived = (Array.isArray(receives) ? receives : [])
    .filter((receive) => isReceiveLinkedToPo(receive, po))
    .reduce((receiveSum, receive) => receiveSum + (receive.items || []).reduce((itemSum: number, item: any) => {
      const amount = Number(item?.amount);
      if (Number.isFinite(amount)) return itemSum + Math.max(0, amount);
      const quantity = asNumber(item?.receivedQty ?? item?.quantity);
      const price = asNumber(item?.price ?? item?.unitPrice);
      return itemSum + Math.max(0, quantity * price);
    }, 0), 0);

  const poGrossAmount = getPoItemsGrossSubtotal(po);
  const poNetAmount = getPoNetAmount(po);
  if (poGrossAmount <= 0) return roundCurrency(Math.min(poNetAmount, grossReceived));

  // Receive เก็บยอดก่อนส่วนลด จึงปรับตามสัดส่วนส่วนลดของ PO เพื่อให้เทียบกับ PO Net ได้
  const netRatio = Math.min(1, Math.max(0, poNetAmount / poGrossAmount));
  return roundCurrency(Math.min(poNetAmount, grossReceived * netRatio));
};

export const getPoPaymentAndReceiveBalanceInfo = (po: any, payments: any[], receives: any[] = []) => {
  const latestPayment = getLatestPaymentForPo(po, payments);
  const poNetAmount = getPoNetAmount(po);
  const paymentUsedAmount = getPaymentAccumulatedNetAmount(latestPayment);
  const linkedReceives = (Array.isArray(receives) ? receives : []).filter((receive) => isReceiveLinkedToPo(receive, po));
  const receiveUsedAmount = getPoReceiveUsedAmount(po, linkedReceives);
  const isPaymentRoute = Boolean(latestPayment) || ["SP", "DC"].includes(String(po?.poType || "").toUpperCase());
  const usageSource = isPaymentRoute ? "payment" : "receive";
  const usedAmount = usageSource === "payment" ? paymentUsedAmount : receiveUsedAmount;
  const jobCompleted = Boolean(
    po?.jobCompleted ||
    po?.jobStatus === "จบงาน" ||
    latestPayment?.jobCompleted ||
    latestPayment?.jobStatus === "จบงาน"
  );
  const jobCompletedBy = po?.jobCompletedBy || po?.completedBy || latestPayment?.jobCompletedBy || latestPayment?.completedBy || "";

  const linkedPayments = (Array.isArray(payments) ? payments : [])
    .filter((payment) => !["Reject", "Rejected"].includes(String(payment?.status || "")))
    .filter((payment) => isPaymentLinkedToPo(payment, po));
  const summedPeriodNetAmount = roundCurrency(linkedPayments.reduce((sum, payment) => {
    const gross = getPaymentGrossPeriodAmount(payment);
    const discount = payment?.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION
      ? getPaymentDiscountAmount(payment)
      : 0;
    return sum + Math.max(0, gross - discount);
  }, 0));

  return {
    poNetAmount,
    usedAmount,
    paymentUsedAmount,
    receiveUsedAmount,
    usageSource,
    jobCompleted,
    jobCompletedBy,
    sourceDocumentNo: usageSource === "payment"
      ? (latestPayment?.paymentNo || "")
      : linkedReceives.map((receive) => receive.rpNo || receive.receiveNo || receive.id).filter(Boolean).join(", "),
    balanceAmount: roundCurrency(Math.max(0, poNetAmount - usedAmount)),
    latestPayment,
    latestPaymentNo: latestPayment?.paymentNo || "",
    latestPeriodNo: latestPayment ? getPaymentPeriodNo(latestPayment) : 0,
    summedPeriodNetAmount,
    isPeriodSumConsistent: Math.abs(summedPeriodNetAmount - paymentUsedAmount) <= 0.01,
  };
};

// Backward-compatible alias for callers that only need Payment-based balance.
export const getPoPaymentBalanceInfo = (po: any, payments: any[]) =>
  getPoPaymentAndReceiveBalanceInfo(po, payments, []);

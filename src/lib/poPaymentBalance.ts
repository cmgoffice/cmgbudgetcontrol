import {
  PO_DISCOUNT_ALLOCATION_VERSION,
  getPaymentAccumulatedGrossAmount,
  getPaymentDiscountAmount,
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

/**
 * A revised PO keeps its original number as the identity and displays
 * `_R.{n}` on the current document number. Payment/Receive records created
 * before the revision still carry the original number, so all variants must
 * remain searchable.
 */
export const getPoNumberVariants = (po: any): string[] => {
  const current = String(po?.poNo || "").trim();
  const original = String(po?.originalPoNo || "").trim();
  const base = current.replace(/_R\.\d+$/i, "");
  return Array.from(new Set([current, original, base].filter(Boolean)));
};

export const isPaymentLinkedToPo = (payment: any, po: any): boolean => {
  if (!payment || !po?.id) return false;
  const poId = String(po.id);
  const poNumbers = getPoNumberVariants(po);
  const same = (value: any, target: string) => Boolean(target) && String(value || "") === target;

  if (Array.isArray(payment.selectedPrIds) && payment.selectedPrIds.some((id: any) => same(id, poId))) return true;
  if (same(payment.sourcePoId, poId) || same(payment.poId, poId) || same(payment.poRef, poId)) return true;
  if ([payment.sourcePoNo, payment.poNo, payment.poRef].some((value: any) => poNumbers.some((number) => same(value, number)))) return true;
  if (Array.isArray(payment.items) && payment.items.some((item: any) => (
    same(item?.poId, poId) || same(item?.prId, poId)
  ))) return true;

  return poNumbers.some((number) => String(payment.paymentNo || "").startsWith(`${number}-`));
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

export const getPaymentAccumulatedNetAmount = (payment: any) => {
  if (!payment) return 0;
  const gross = getPaymentAccumulatedGrossAmount(payment);
  if (payment.discountAllocationVersion !== PO_DISCOUNT_ALLOCATION_VERSION) return roundCurrency(gross);

  const appliedDiscount = payment.discountAppliedAmount != null
    ? asNumber(payment.discountAppliedAmount)
    : asNumber(payment.prevAccumDiscount) + getPaymentDiscountAmount(payment);
  return roundCurrency(Math.max(0, gross - appliedDiscount));
};

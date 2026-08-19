export const PO_DISCOUNT_ALLOCATION_VERSION = 1;

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundCurrency = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

export const getPoItemsGrossSubtotal = (poOrItems: any) => {
  const items = Array.isArray(poOrItems) ? poOrItems : (poOrItems?.items || []);
  return Math.max(0, items.reduce((sum: number, item: any) => {
    const hasExplicitAmount = item?.amount !== null && item?.amount !== undefined && item?.amount !== "";
    const amount = Number(item?.amount);
    const fallback = asNumber(item?.quantity) * asNumber(item?.price ?? item?.unitPrice);
    return sum + (hasExplicitAmount && Number.isFinite(amount) ? amount : fallback);
  }, 0));
};

export const getPoDiscountAmount = (po: any) =>
  Math.min(getPoItemsGrossSubtotal(po), Math.max(0, asNumber(po?.discount)));

/**
 * Canonical PO amount for tables, budgets, and summaries: line subtotal after
 * the PO discount, before VAT. Persisted amount/grandTotal remain untouched
 * because they are the document total (including VAT when applicable).
 */
export const getPoAmountExVat = (po: any) => {
  const gross = getPoItemsGrossSubtotal(po);
  if (gross > 0) return roundCurrency(Math.max(0, gross - getPoDiscountAmount(po)));

  const legacyExVat = po?.subTotalAfterDiscount ?? po?.amountExVat ?? po?.subTotal ?? po?.subtotal;
  if (legacyExVat != null && Number.isFinite(Number(legacyExVat))) {
    return roundCurrency(Math.max(0, Number(legacyExVat)));
  }

  const storedTotal = Math.max(0, asNumber(po?.grandTotal ?? po?.amount ?? po?.totalAmount ?? po?.total));
  if (storedTotal <= 0 || po?.vatType !== "ex-vat") return roundCurrency(storedTotal);

  const manualVat = Number(po?.manualVat);
  if (po?.manualVat != null && Number.isFinite(manualVat)) {
    return roundCurrency(Math.max(0, storedTotal - manualVat));
  }

  return roundCurrency(storedTotal / 1.07);
};

export const getPoDiscountRate = (po: any) => {
  const gross = getPoItemsGrossSubtotal(po);
  return gross > 0 ? getPoDiscountAmount(po) / gross : 0;
};

export const getPoDiscountTarget = (po: any) => ({
  prId: po?.discountPrId || po?.discountAllocation?.prId || null,
  prNo: po?.discountPrNo || po?.discountAllocation?.prNo || "",
});

export const calculatePeriodDiscount = ({
  grossPeriodAmount,
  poGrossAmount,
  poDiscountAmount,
  previousDiscountAmount = 0,
  cumulativeGrossAmount = 0,
  contractGrossAmount = 0,
}: {
  grossPeriodAmount: number;
  poGrossAmount: number;
  poDiscountAmount: number;
  previousDiscountAmount?: number;
  cumulativeGrossAmount?: number;
  contractGrossAmount?: number;
}) => {
  const gross = Math.max(0, asNumber(grossPeriodAmount));
  const target = Math.min(Math.max(0, asNumber(poDiscountAmount)), Math.max(0, asNumber(poGrossAmount)));
  const previous = Math.min(target, Math.max(0, asNumber(previousDiscountAmount)));
  const remaining = Math.max(0, target - previous);
  if (gross <= 0 || remaining <= 0 || poGrossAmount <= 0) return 0;

  const cumulative = Math.max(0, asNumber(cumulativeGrossAmount));
  const contract = Math.max(0, asNumber(contractGrossAmount));
  if (contract > 0 && cumulative >= contract - 0.01) return roundCurrency(remaining);

  return Math.min(remaining, roundCurrency(gross * (target / poGrossAmount)));
};

export const calculateNetPeriodAmount = (grossPeriodAmount: number, periodDiscount: number) =>
  Math.max(0, roundCurrency(asNumber(grossPeriodAmount) - Math.max(0, asNumber(periodDiscount))));

export const getPaymentGrossPeriodAmount = (payment: any) => {
  const items = Array.isArray(payment?.items) ? payment.items : [];
  if (items.length === 0) return Math.max(0, asNumber(payment?.amount));
  return Math.max(0, items.reduce((sum: number, item: any) => sum + asNumber(item?.thisPeriodAmount), 0));
};

export const getPaymentAccumulatedGrossAmount = (payment: any) => {
  const items = Array.isArray(payment?.items) ? payment.items : [];
  if (items.length === 0) return Math.max(0, asNumber(payment?.amount));
  return Math.max(0, items.reduce((sum: number, item: any) => (
    sum + asNumber(item?.prevAccumAmount) + asNumber(item?.thisPeriodAmount)
  ), 0));
};

export const getPaymentContractGrossAmount = (payment: any) => {
  const items = Array.isArray(payment?.items) ? payment.items : [];
  return Math.max(0, items.reduce((sum: number, item: any) => (
    sum + asNumber(item?.contractQty) * asNumber(item?.contractPrice)
  ), 0));
};

export const getPaymentDiscountAmount = (payment: any) =>
  Math.max(0, asNumber(payment?.thisPeriodDiscount));

export const getPaymentNetPeriodAmount = (payment: any) => {
  const gross = getPaymentGrossPeriodAmount(payment);
  if (payment?.discountAllocationVersion !== PO_DISCOUNT_ALLOCATION_VERSION) return gross;
  if (payment?.netPeriodAmount != null) return Math.max(0, asNumber(payment.netPeriodAmount));
  return calculateNetPeriodAmount(gross, getPaymentDiscountAmount(payment));
};

/**
 * Payment keeps a snapshot of the PO discount so completed periods remain
 * auditable. For the current period, however, the latest PO is authoritative.
 * This patch is intentionally derived at read/save time so a discount that is
 * added, changed, or removed after Payment activation is reflected immediately.
 */
export const getPaymentDiscountSyncPatch = (payment: any, po: any) => {
  if (!po) return {};

  const poGrossAmount = getPoItemsGrossSubtotal(po);
  const poDiscountAmount = getPoDiscountAmount(po);
  const discountEnabled =
    po?.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION &&
    poDiscountAmount > 0;
  const grossPeriodAmount = getPaymentGrossPeriodAmount(payment);
  const previousDiscountAmount = discountEnabled
    ? Math.max(0, asNumber(payment?.prevAccumDiscount))
    : 0;
  const thisPeriodDiscount = discountEnabled
    ? calculatePeriodDiscount({
        grossPeriodAmount,
        poGrossAmount,
        poDiscountAmount,
        previousDiscountAmount,
        cumulativeGrossAmount: getPaymentAccumulatedGrossAmount(payment),
        contractGrossAmount: getPaymentContractGrossAmount(payment),
      })
    : 0;
  const netPeriodAmount = calculateNetPeriodAmount(grossPeriodAmount, thisPeriodDiscount);
  const discountTarget = discountEnabled ? getPoDiscountTarget(po) : { prId: null, prNo: "" };

  return {
    discountAllocationVersion: discountEnabled ? PO_DISCOUNT_ALLOCATION_VERSION : null,
    poGrossAmount,
    poDiscountAmount: discountEnabled ? poDiscountAmount : 0,
    discountPrId: discountTarget.prId,
    discountPrNo: discountTarget.prNo || null,
    discountRate: discountEnabled ? getPoDiscountRate(po) : 0,
    grossPeriodAmount,
    thisPeriodDiscount,
    netPeriodAmount,
    discountAppliedAmount: discountEnabled
      ? roundCurrency(previousDiscountAmount + thisPeriodDiscount)
      : 0,
    ...(Array.isArray(payment?.items) ? { amount: netPeriodAmount } : {}),
  };
};

export const appendPaymentDiscountAdjustment = (
  items: any[],
  discountAmount: number,
  discountPrNo = "",
) => {
  const discount = Math.max(0, roundCurrency(discountAmount));
  if (discount <= 0) return [...(items || [])];
  return [
    ...(items || []),
    {
      poItemIndex: null,
      materialNo: "",
      description: `ส่วนลด${discountPrNo ? ` PR ${discountPrNo}` : ""}`,
      unit: "งวด",
      quantity: 1,
      invoiceQty: 1,
      price: -discount,
      amount: -discount,
      isDiscountAdjustment: true,
      discountPrNo: discountPrNo || null,
    },
  ];
};

export const applyDiscountToPrAllocations = (
  items: any[],
  targetPrId: string,
  discountAmount: number,
) => {
  let remaining = Math.max(0, asNumber(discountAmount));
  const target = String(targetPrId || "");
  const updatedItems = (items || []).map((item: any) => ({
    ...item,
    disPrAllocations: (Array.isArray(item?.disPrAllocations) ? item.disPrAllocations : []).map((allocation: any) => {
      if (!target || String(allocation?.prId || "") !== target || remaining <= 0) return allocation;
      const grossAmount = Math.max(0, asNumber(allocation?.amount));
      const deduction = Math.min(grossAmount, remaining);
      remaining = roundCurrency(remaining - deduction);
      return {
        ...allocation,
        amount: roundCurrency(grossAmount - deduction),
      };
    }),
  }));

  return {
    items: updatedItems,
    appliedAmount: roundCurrency(Math.max(0, asNumber(discountAmount)) - remaining),
    remainingAmount: remaining,
  };
};

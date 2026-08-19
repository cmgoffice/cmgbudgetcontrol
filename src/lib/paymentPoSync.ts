import { getPaymentDiscountSyncPatch } from "./poDiscount";

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Refresh contract fields from the latest PO while keeping Payment progress.
 * PO edits may change descriptions, units, quantities, or prices, but must not
 * erase quantities/amounts already recorded in the current Payment chain.
 */
export const syncPaymentItemsFromPo = (payment: any, po: any) => {
  if (!po || !Array.isArray(po.items)) return Array.isArray(payment?.items) ? payment.items : [];

  const paymentItems = Array.isArray(payment?.items) ? payment.items : [];
  const paymentItemByIndex = new Map<number, any>();
  paymentItems.forEach((item: any, fallbackIndex: number) => {
    const itemIndex = Number(item?.prItemIndex);
    paymentItemByIndex.set(Number.isInteger(itemIndex) && itemIndex >= 0 ? itemIndex : fallbackIndex, item);
  });

  return po.items.map((poItem: any, index: number) => {
    const existing = paymentItemByIndex.get(index) || {};
    const contractQty = asNumber(poItem?.quantity);
    const contractPrice = asNumber(poItem?.price ?? poItem?.unitPrice);
    const contractAmount = contractQty * contractPrice;
    const thisPeriodAmount = asNumber(existing?.thisPeriodAmount);

    return {
      ...existing,
      prId: po.id,
      prItemIndex: index,
      materialNo: poItem?.materialNo || "",
      description: poItem?.description || "",
      unit: poItem?.unit || "",
      contractQty,
      contractPrice,
      contractAmount,
      thisPeriodQty: asNumber(existing?.thisPeriodQty),
      thisPeriodAmount,
      thisPeriodPct: contractAmount > 0
        ? Math.round((thisPeriodAmount / contractAmount) * 10000) / 100
        : 0,
      prevAccumQty: asNumber(existing?.prevAccumQty),
      prevAccumAmount: asNumber(existing?.prevAccumAmount),
      remark: existing?.remark || "",
      budgetId: poItem?.budgetId || null,
      budgetSubItemId: poItem?.budgetSubItemId || poItem?.subItemId || null,
    };
  });
};

export const getPaymentPoSyncPatch = (payment: any, po: any) => {
  if (!po) return {};
  const items = syncPaymentItemsFromPo(payment, po);
  const paymentWithLatestItems = { ...payment, items };
  return {
    items,
    ...getPaymentDiscountSyncPatch(paymentWithLatestItems, po),
  };
};

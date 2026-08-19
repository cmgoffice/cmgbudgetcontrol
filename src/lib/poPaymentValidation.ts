import { getPoNumberVariants } from "./poPaymentBalance";

const asNumber = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeText = (value: any) => String(value || "").trim();

const isPaymentLinkedToPo = (payment: any, po: any) => {
  const poId = normalizeText(po?.id);
  const poNumbers = getPoNumberVariants(po);
  const poNo = poNumbers[0] || "";
  if (!poId && !poNo) return false;

  if (normalizeText(payment?.poId) === poId && poId) return true;
  if (poNumbers.some((number) => normalizeText(payment?.poNo) === number)) return true;
  if (normalizeText(payment?.poRef) === poId && poId) return true;
  if (poNumbers.some((number) => normalizeText(payment?.poRef) === number)) return true;

  if (Array.isArray(payment?.selectedPrIds) && poId) {
    if (payment.selectedPrIds.some((id: any) => normalizeText(id) === poId)) return true;
  }

  if (Array.isArray(payment?.items) && poId && payment.items.some((item: any) => normalizeText(item?.poId) === poId || normalizeText(item?.prId) === poId)) return true;
  return poNumbers.some((number) => normalizeText(payment?.paymentNo).startsWith(`${number}-`));
};

export type PoPaymentItemLock = {
  itemIndex: number;
  description: string;
  minimumQty: number;
  minimumAmount: number;
};

export type PoPaymentValidationResult = {
  valid: boolean;
  minimumTotal: number;
  revisedTotal: number;
  itemLocks: PoPaymentItemLock[];
  errors: string[];
};

/**
 * Protects work already recorded in linked Payment periods when a PO is revised.
 * Each new Payment period carries the previous accumulated amount, so use the
 * maximum cumulative value per PO item instead of summing all period documents.
 */
export const validatePoAgainstPaymentProgress = ({
  po,
  revisedItems,
  discount,
  payments,
}: {
  po: any;
  revisedItems: any[];
  discount?: number;
  payments: any[];
}): PoPaymentValidationResult => {
  const lockByIndex = new Map<number, PoPaymentItemLock>();
  const linkedPayments = (payments || []).filter((payment: any) => isPaymentLinkedToPo(payment, po));

  linkedPayments.forEach((payment: any) => {
    (payment?.items || []).forEach((item: any, fallbackIndex: number) => {
      const parsedIndex = Number(item?.prItemIndex);
      const itemIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : fallbackIndex;
      const cumulativeQty = Math.max(0, asNumber(item?.prevAccumQty) + asNumber(item?.thisPeriodQty));
      const cumulativeAmount = Math.max(0, asNumber(item?.prevAccumAmount) + asNumber(item?.thisPeriodAmount));
      if (cumulativeQty <= 0.000001 && cumulativeAmount <= 0.005) return;

      const existing = lockByIndex.get(itemIndex);
      lockByIndex.set(itemIndex, {
        itemIndex,
        description: normalizeText(item?.description) || `รายการที่ ${itemIndex + 1}`,
        minimumQty: Math.max(existing?.minimumQty || 0, cumulativeQty),
        minimumAmount: Math.max(existing?.minimumAmount || 0, cumulativeAmount),
      });
    });
  });

  const itemLocks = Array.from(lockByIndex.values()).sort((a, b) => a.itemIndex - b.itemIndex);
  const minimumTotal = itemLocks.reduce((sum, lock) => sum + lock.minimumAmount, 0);
  const revisedSubtotal = (revisedItems || []).reduce(
    (sum: number, item: any) => sum + Math.max(0, asNumber(item?.quantity) * asNumber(item?.price ?? item?.unitPrice)),
    0
  );
  const revisedTotal = Math.max(0, revisedSubtotal - Math.max(0, asNumber(discount)));
  const errors: string[] = [];

  itemLocks.forEach((lock) => {
    const revisedItem = revisedItems?.[lock.itemIndex];
    if (!revisedItem) {
      errors.push(`${lock.description}: ลบรายการไม่ได้ เนื่องจากมีผลงานสะสมแล้ว ${lock.minimumAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`);
      return;
    }

    const revisedQty = Math.max(0, asNumber(revisedItem?.quantity));
    const revisedAmount = revisedQty * Math.max(0, asNumber(revisedItem?.price ?? revisedItem?.unitPrice));
    if (revisedQty + 0.000001 < lock.minimumQty) {
      errors.push(`${lock.description}: จำนวนต้องไม่น้อยกว่า ${lock.minimumQty.toLocaleString("th-TH")}`);
    }
    if (revisedAmount + 0.005 < lock.minimumAmount) {
      errors.push(`${lock.description}: มูลค่ารายการต้องไม่น้อยกว่า ${lock.minimumAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`);
    }
  });

  if (revisedTotal + 0.005 < minimumTotal) {
    errors.push(`ยอด PO หลังส่วนลดต้องไม่น้อยกว่ายอดสะสม Payment ${minimumTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`);
  }

  return {
    valid: errors.length === 0,
    minimumTotal,
    revisedTotal,
    itemLocks,
    errors,
  };
};

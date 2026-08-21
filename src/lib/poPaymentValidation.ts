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
  immutable: boolean;
  paidPaymentNos: string[];
};

export type PoPaymentValidationResult = {
  valid: boolean;
  minimumTotal: number;
  revisedTotal: number;
  itemLocks: PoPaymentItemLock[];
  errors: string[];
};

const isPaidPayment = (payment: any) => normalizeText(payment?.status || payment?.statusNow).toLowerCase() === "paid";

export const getPaidPoItemIndexes = ({ po, payments }: { po: any; payments: any[] }): Set<number> => {
  const indexes = new Set<number>();
  (payments || [])
    .filter((payment: any) => isPaymentLinkedToPo(payment, po) && isPaidPayment(payment))
    .forEach((payment: any) => {
      (payment?.items || []).forEach((item: any, fallbackIndex: number) => {
        const parsedIndex = Number(item?.prItemIndex);
        const itemIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : fallbackIndex;
        if (po?.items?.[itemIndex]) indexes.add(itemIndex);
      });
    });
  return indexes;
};

const numberEqual = (left: any, right: any) => Math.abs(asNumber(left) - asNumber(right)) <= 0.000001;
const listEqual = (left: any, right: any) => JSON.stringify(Array.isArray(left) ? left : []) === JSON.stringify(Array.isArray(right) ? right : []);
const paidItemWasChanged = (original: any, revised: any) => {
  if (!original || !revised) return true;
  const textFields = ["materialNo", "description", "unit", "prId", "sourcePrId", "linkedPrNo"];
  if (textFields.some((field) => normalizeText(original?.[field]) !== normalizeText(revised?.[field]))) return true;
  const numberFields = ["quantity", "price", "unitPrice", "prItemIndex", "sourcePrItemIndex"];
  if (numberFields.some((field) => {
    if (original?.[field] == null && revised?.[field] == null) return false;
    return !numberEqual(original?.[field], revised?.[field]);
  })) return true;
  return !listEqual(original?.disPrPlan, revised?.disPrPlan) || !listEqual(original?.disPrAllocations, revised?.disPrAllocations);
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
        immutable: Boolean(existing?.immutable),
        paidPaymentNos: existing?.paidPaymentNos || [],
      });
    });
  });

  linkedPayments.filter(isPaidPayment).forEach((payment: any) => {
    (payment?.items || []).forEach((item: any, fallbackIndex: number) => {
      const parsedIndex = Number(item?.prItemIndex);
      const itemIndex = Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : fallbackIndex;
      if (!po?.items?.[itemIndex]) return;
      const existing = lockByIndex.get(itemIndex);
      const paymentNo = normalizeText(payment?.paymentNo || payment?.id);
      lockByIndex.set(itemIndex, {
        itemIndex,
        description: normalizeText(po.items[itemIndex]?.description || item?.description) || `รายการที่ ${itemIndex + 1}`,
        minimumQty: existing?.minimumQty || 0,
        minimumAmount: existing?.minimumAmount || 0,
        immutable: true,
        paidPaymentNos: Array.from(new Set([...(existing?.paidPaymentNos || []), paymentNo].filter(Boolean))),
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
      errors.push(lock.immutable
        ? `${lock.description}: ลบไม่ได้ เพราะบันทึกใน Payment Paid แล้ว${lock.paidPaymentNos.length ? ` (${lock.paidPaymentNos.join(", ")})` : ""}`
        : `${lock.description}: ลบรายการไม่ได้ เนื่องจากมีผลงานสะสมแล้ว ${lock.minimumAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`);
      return;
    }

    if (lock.immutable && paidItemWasChanged(po?.items?.[lock.itemIndex], revisedItem)) {
      errors.push(`${lock.description}: แก้ไขรายการ จำนวน ราคา หรือการอ้างอิง PR ไม่ได้ เพราะบันทึกใน Payment Paid แล้ว${lock.paidPaymentNos.length ? ` (${lock.paidPaymentNos.join(", ")})` : ""}`);
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

  if (itemLocks.some((lock) => lock.immutable) && !numberEqual(discount, po?.discount)) {
    errors.push("แก้ไขส่วนลดเดิมไม่ได้ เพราะมีรายการถูกบันทึกใน Payment Paid แล้ว (สามารถเพิ่มรายการ PO ใหม่ได้)");
  }

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

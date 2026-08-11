import { validatePoAgainstPaymentProgress } from "./poPaymentValidation";

const po = { id: "po-1", poNo: "PO-001" };
const payments = [
  {
    selectedPrIds: [po.id],
    items: [{ prId: po.id, prItemIndex: 0, description: "งาน A", prevAccumQty: 0, thisPeriodQty: 5, prevAccumAmount: 0, thisPeriodAmount: 500 }],
  },
  {
    selectedPrIds: [po.id],
    items: [{ prId: po.id, prItemIndex: 0, description: "งาน A", prevAccumQty: 5, thisPeriodQty: 2, prevAccumAmount: 500, thisPeriodAmount: 200 }],
  },
];

test("uses the latest cumulative Payment progress without double-counting earlier periods", () => {
  const result = validatePoAgainstPaymentProgress({
    po,
    revisedItems: [{ quantity: 7, price: 100 }],
    discount: 0,
    payments,
  });

  expect(result.valid).toBe(true);
  expect(result.minimumTotal).toBe(700);
  expect(result.itemLocks[0]).toMatchObject({ minimumQty: 7, minimumAmount: 700 });
});

test("blocks quantity, item value, and discounted PO total below Payment progress", () => {
  const quantityResult = validatePoAgainstPaymentProgress({
    po,
    revisedItems: [{ quantity: 6, price: 200 }],
    payments,
  });
  expect(quantityResult.valid).toBe(false);
  expect(quantityResult.errors.some((error) => error.includes("จำนวนต้องไม่น้อยกว่า 7"))).toBe(true);

  const amountResult = validatePoAgainstPaymentProgress({
    po,
    revisedItems: [{ quantity: 7, price: 90 }],
    payments,
  });
  expect(amountResult.valid).toBe(false);
  expect(amountResult.errors.some((error) => error.includes("มูลค่ารายการต้องไม่น้อยกว่า"))).toBe(true);

  const discountResult = validatePoAgainstPaymentProgress({
    po,
    revisedItems: [{ quantity: 8, price: 100 }],
    discount: 150,
    payments,
  });
  expect(discountResult.valid).toBe(false);
  expect(discountResult.errors.some((error) => error.includes("ยอด PO หลังส่วนลด"))).toBe(true);
});

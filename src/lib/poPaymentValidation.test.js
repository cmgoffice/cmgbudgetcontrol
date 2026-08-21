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

test("keeps every PO line recorded in a Paid period immutable but allows appended lines", () => {
  const paidPo = {
    ...po,
    discount: 50,
    items: [{ prId: "pr-1", prItemIndex: 0, description: "งาน A", unit: "งาน", quantity: 10, price: 100, disPrPlan: ["PR-001"], disPrAllocations: [] }],
  };
  const paidPayments = [{
    status: "Paid",
    paymentNo: "PAY-001",
    selectedPrIds: [paidPo.id],
    items: [{ prId: paidPo.id, prItemIndex: 0, description: "งาน A", contractQty: 10, contractPrice: 100 }],
  }];

  const unchangedWithNewLine = validatePoAgainstPaymentProgress({
    po: paidPo,
    revisedItems: [...paidPo.items, { prId: "pr-1", prItemIndex: 1, description: "งานเพิ่ม", quantity: 1, price: 200 }],
    discount: 50,
    payments: paidPayments,
  });
  expect(unchangedWithNewLine.valid).toBe(true);

  const edited = validatePoAgainstPaymentProgress({
    po: paidPo,
    revisedItems: [{ ...paidPo.items[0], price: 120 }],
    discount: 50,
    payments: paidPayments,
  });
  expect(edited.valid).toBe(false);
  expect(edited.errors.some((error) => error.includes("Payment Paid"))).toBe(true);

  const deleted = validatePoAgainstPaymentProgress({
    po: paidPo,
    revisedItems: [],
    discount: 50,
    payments: paidPayments,
  });
  expect(deleted.valid).toBe(false);

  const changedDiscount = validatePoAgainstPaymentProgress({
    po: paidPo,
    revisedItems: paidPo.items,
    discount: 0,
    payments: paidPayments,
  });
  expect(changedDiscount.valid).toBe(false);
  expect(changedDiscount.errors.some((error) => error.includes("ส่วนลดเดิม"))).toBe(true);
});

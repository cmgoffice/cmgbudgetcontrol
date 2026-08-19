import { getPaymentPoSyncPatch, syncPaymentItemsFromPo } from "./paymentPoSync";

test("refreshes Payment contract quantity, unit price, amount, and unit from the latest PO", () => {
  const payment = {
    items: [{
      prId: "po-1",
      prItemIndex: 0,
      description: "งานเดิม",
      unit: "เดิม",
      contractQty: 10,
      contractPrice: 100,
      contractAmount: 1000,
      prevAccumQty: 2,
      prevAccumAmount: 200,
      thisPeriodQty: 1,
      thisPeriodAmount: 100,
      thisPeriodPct: 10,
      remark: "คงหมายเหตุ",
    }],
  };
  const po = {
    id: "po-1",
    discountAllocationVersion: 1,
    discount: 0,
    items: [{ description: "งานแก้ไข", unit: "ตร.ม.", quantity: 20, price: 75 }],
  };

  expect(syncPaymentItemsFromPo(payment, po)).toEqual([expect.objectContaining({
    description: "งานแก้ไข",
    unit: "ตร.ม.",
    contractQty: 20,
    contractPrice: 75,
    contractAmount: 1500,
    prevAccumQty: 2,
    prevAccumAmount: 200,
    thisPeriodQty: 1,
    thisPeriodAmount: 100,
    thisPeriodPct: 6.67,
    remark: "คงหมายเหตุ",
  })]);
});

test("adds and removes zero-progress Payment rows to match the latest PO", () => {
  const payment = {
    items: [
      { prItemIndex: 0, description: "old A", thisPeriodAmount: 0 },
      { prItemIndex: 1, description: "removed B", thisPeriodAmount: 0 },
    ],
  };
  const po = {
    id: "po-1",
    items: [
      { description: "latest A", unit: "งาน", quantity: 1, price: 100 },
      { description: "new C", unit: "งาน", quantity: 2, price: 150 },
    ],
  };

  const items = syncPaymentItemsFromPo(payment, po);
  expect(items).toHaveLength(2);
  expect(items.map((item) => item.description)).toEqual(["latest A", "new C"]);
  expect(items[1]).toMatchObject({ contractQty: 2, contractPrice: 150, contractAmount: 300 });
});

test("recalculates the Payment discount after syncing the latest PO prices", () => {
  const payment = {
    items: [{ prItemIndex: 0, contractQty: 1, contractPrice: 1000, thisPeriodAmount: 300 }],
    discountAllocationVersion: 1,
    poDiscountAmount: 100,
  };
  const po = {
    id: "po-1",
    discountAllocationVersion: 1,
    discount: 100,
    items: [{ quantity: 2, price: 1000 }],
  };

  expect(getPaymentPoSyncPatch(payment, po)).toMatchObject({
    poGrossAmount: 2000,
    poDiscountAmount: 100,
    thisPeriodDiscount: 15,
    netPeriodAmount: 285,
    amount: 285,
  });
});

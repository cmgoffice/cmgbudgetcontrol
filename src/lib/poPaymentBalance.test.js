import {
  getLatestPaymentForPo,
  getPaymentAccumulatedNetAmount,
  getPoNumberVariants,
  isPaymentLinkedToPo,
} from "./poPaymentBalance";

const po = {
  id: "po-1",
  poNo: "PO-SP-001",
  items: [{ quantity: 1, price: 100000, amount: 100000 }],
  discount: 0,
};

const period = (periodNo, prevAccumAmount, thisPeriodAmount, extra = {}) => ({
  id: `payment-${periodNo}`,
  paymentNo: `PO-SP-001-${String(periodNo).padStart(3, "0")}`,
  periodNo: String(periodNo),
  selectedPrIds: ["po-1"],
  status: "Paid",
  items: [{ prevAccumAmount, thisPeriodAmount }],
  ...extra,
});

test("selects the latest payment without double counting earlier periods", () => {
  const payments = [
    period(1, 0, 30000),
    period(2, 30000, 20000),
    period(3, 50000, 10000),
  ];

  const latest = getLatestPaymentForPo(po, payments);
  expect(latest.paymentNo).toBe("PO-SP-001-003");
  expect(getPaymentAccumulatedNetAmount(latest)).toBe(60000);
});

test("uses the discounted net accumulated Payment value", () => {
  const payment = period(1, 0, 100000, {
    discountAllocationVersion: 1,
    thisPeriodDiscount: 10000,
    discountAppliedAmount: 10000,
  });
  expect(getPaymentAccumulatedNetAmount(payment)).toBe(90000);
});

test("ignores a rejected latest period and falls back to the latest valid payment", () => {
  const valid = period(1, 0, 25000);
  const rejected = period(2, 25000, 15000, { status: "Rejected" });
  expect(getLatestPaymentForPo(po, [valid, rejected])).toBe(valid);
});

test("keeps pre-Rev Payment links after PO number gets a revision suffix", () => {
  const revisedPo = { ...po, poNo: "PO-SP-001_R.1", originalPoNo: "PO-SP-001" };
  expect(getPoNumberVariants(revisedPo)).toEqual(["PO-SP-001_R.1", "PO-SP-001"]);
  const payment = period(1, 0, 60000);
  expect(isPaymentLinkedToPo(payment, revisedPo)).toBe(true);
  expect(getLatestPaymentForPo(revisedPo, [payment])).toBe(payment);
});

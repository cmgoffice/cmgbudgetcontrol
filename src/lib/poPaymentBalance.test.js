import {
  getLatestPaymentForPo,
  getPoNumberVariants,
  getPoPaymentAndReceiveBalanceInfo,
  getPoPaymentBalanceInfo,
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

test("uses the latest payment accumulated amount without double counting earlier periods", () => {
  const payments = [
    period(1, 0, 30000),
    period(2, 30000, 20000),
    period(3, 50000, 10000),
  ];

  const result = getPoPaymentBalanceInfo(po, payments);
  expect(result.latestPaymentNo).toBe("PO-SP-001-003");
  expect(result.paymentUsedAmount).toBe(60000);
  expect(result.balanceAmount).toBe(40000);
  expect(result.summedPeriodNetAmount).toBe(60000);
  expect(result.isPeriodSumConsistent).toBe(true);
});

test("keeps a positive PO balance when a partially used latest payment is completed", () => {
  const result = getPoPaymentBalanceInfo(po, [period(1, 0, 65000, { jobCompleted: true })]);
  expect(result.paymentUsedAmount).toBe(65000);
  expect(result.balanceAmount).toBe(35000);
});

test("uses net values for a discounted PO and payment", () => {
  const discountedPo = { ...po, discount: 10000 };
  const payment = period(1, 0, 100000, {
    discountAllocationVersion: 1,
    thisPeriodDiscount: 10000,
    discountAppliedAmount: 10000,
  });
  const result = getPoPaymentBalanceInfo(discountedPo, [payment]);

  expect(result.poNetAmount).toBe(90000);
  expect(result.paymentUsedAmount).toBe(90000);
  expect(result.balanceAmount).toBe(0);
});

test("ignores a rejected latest period and falls back to the latest valid payment", () => {
  const valid = period(1, 0, 25000);
  const rejected = period(2, 25000, 15000, { status: "Rejected" });
  expect(getLatestPaymentForPo(po, [valid, rejected])).toBe(valid);
});

test("uses the accumulated value from all Receive documents for a Receive-route PO", () => {
  const materialPo = { ...po, poType: "ML" };
  const receives = [
    { id: "rp-1", rpNo: "RP-001", poId: "po-1", items: [{ receivedQty: 20, price: 1000 }] },
    { id: "rp-2", rpNo: "RP-002", poId: "po-1", items: [{ receivedQty: 35, price: 1000 }] },
  ];
  const result = getPoPaymentAndReceiveBalanceInfo(materialPo, [], receives);

  expect(result.usageSource).toBe("receive");
  expect(result.usedAmount).toBe(55000);
  expect(result.balanceAmount).toBe(45000);
  expect(result.sourceDocumentNo).toBe("RP-001, RP-002");
});

test("applies the PO discount proportionally to received value", () => {
  const materialPo = { ...po, poType: "ML", discount: 10000 };
  const receives = [
    { id: "rp-1", poId: "po-1", items: [{ receivedQty: 50, price: 1000 }] },
  ];
  const result = getPoPaymentAndReceiveBalanceInfo(materialPo, [], receives);

  expect(result.poNetAmount).toBe(90000);
  expect(result.usedAmount).toBe(45000);
  expect(result.balanceAmount).toBe(45000);
});

test("prefers Payment when a PO has both Payment and Receive documents", () => {
  const receives = [{ id: "rp-1", poId: "po-1", items: [{ receivedQty: 90, price: 1000 }] }];
  const result = getPoPaymentAndReceiveBalanceInfo({ ...po, poType: "ML" }, [period(1, 0, 40000)], receives);

  expect(result.usageSource).toBe("payment");
  expect(result.usedAmount).toBe(40000);
  expect(result.balanceAmount).toBe(60000);
});

test("exposes the job completion marker from the latest Payment period", () => {
  const result = getPoPaymentAndReceiveBalanceInfo(
    { ...po, poType: "SP" },
    [period(1, 0, 40000, { jobCompleted: true, jobCompletedBy: "PM Test" })],
    [],
  );

  expect(result.jobCompleted).toBe(true);
  expect(result.jobCompletedBy).toBe("PM Test");
});

test("keeps pre-Rev Payment links after PO number gets a revision suffix", () => {
  const revisedPo = { ...po, poNo: "PO-SP-001_R.1", originalPoNo: "PO-SP-001" };
  expect(getPoNumberVariants(revisedPo)).toEqual(["PO-SP-001_R.1", "PO-SP-001"]);
  const result = getPoPaymentBalanceInfo(revisedPo, [period(1, 0, 60000)]);
  expect(result.paymentUsedAmount).toBe(60000);
  expect(result.latestPaymentNo).toBe("PO-SP-001-001");
});

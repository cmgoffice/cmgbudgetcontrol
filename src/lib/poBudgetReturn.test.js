import { buildPoBudgetReturnPlan, isPaymentJobCompleted, scalePoItemsToNetAmount } from "./poBudgetReturn";
import { getPrBudgetReturnInfo } from "./prBudgetReturn";

const makePayment = (used) => ({
  id: "pay-1",
  paymentNo: "PO-001-001",
  periodNo: "1",
  selectedPrIds: ["po-1"],
  status: "Paid",
  jobCompleted: true,
  items: [{ prevAccumAmount: 0, thisPeriodAmount: used }],
});

test("recognizes completed Payment records used by legacy and current flows", () => {
  expect(isPaymentJobCompleted({ jobCompleted: true })).toBe(true);
  expect(isPaymentJobCompleted({ jobStatus: "จบงาน" })).toBe(true);
  expect(isPaymentJobCompleted({ status: "จบงาน" })).toBe(true);
  expect(isPaymentJobCompleted({ status: "Paid" })).toBe(false);
});

test("excludes procurement discount from the PR/Budget return", () => {
  const po = {
    id: "po-1",
    poNo: "PO-001",
    jobCompleted: true,
    discount: 20000,
    discountPrId: "pr-1",
    items: [{ amount: 1020000, quantity: 1, price: 1020000, disPrAllocations: [{ prId: "pr-1", amount: 1000000 }] }],
  };
  const pr = { id: "pr-1", prNo: "PR-001", totalAmount: 1020000 };
  const plan = buildPoBudgetReturnPlan({ po, payments: [makePayment(700000)], prs: [pr] });

  expect(plan.poNetAmount).toBe(1000000);
  expect(plan.actualUsed).toBe(700000);
  expect(plan.revisedPoNetAmount).toBe(700000);
  expect(plan.returnableAmount).toBe(300000);
  expect(plan.procurementSaving).toBe(20000);
  expect(plan.linkedPrs[0].newPrTotal).toBe(700000);
});

test("does not create a return when the latest Payment is complete", () => {
  const po = {
    id: "po-1",
    jobCompleted: true,
    discount: 20000,
    discountPrId: "pr-1",
    items: [{ amount: 1020000, quantity: 1, price: 1020000, disPrAllocations: [{ prId: "pr-1", amount: 1000000 }] }],
  };
  const plan = buildPoBudgetReturnPlan({
    po,
    payments: [makePayment(1000000)],
    prs: [{ id: "pr-1", totalAmount: 1020000 }],
  });

  expect(plan.paymentComplete).toBe(true);
  expect(plan.returnableAmount).toBe(0);
  expect(plan.canStart).toBe(false);
  expect(plan.revisedPoNetAmount).toBe(1000000);
});

test("scales PO gross lines so net after the original discount equals Payment usage", () => {
  const po = {
    discount: 20000,
    items: [
      { amount: 600000, quantity: 1, price: 600000, disPrAllocations: [{ prId: "pr-1", amount: 588235.29 }] },
      { amount: 420000, quantity: 1, price: 420000, disPrAllocations: [{ prId: "pr-1", amount: 411764.71 }] },
    ],
  };
  const items = scalePoItemsToNetAmount(po, 700000);
  const gross = items.reduce((sum, item) => sum + item.amount, 0);
  const allocated = items.reduce((sum, item) => sum + item.disPrAllocations[0].amount, 0);
  expect(Math.round((gross - 20000) * 100) / 100).toBe(700000);
  expect(Math.round(allocated * 100) / 100).toBe(700000);
});

test("reduces quantity and preserves the contracted unit price", () => {
  const po = {
    discount: 0,
    items: [{ amount: 900000, quantity: 500, price: 1800 }],
  };
  const items = scalePoItemsToNetAmount(po, 450000);

  expect(items[0].quantity).toBe(250);
  expect(items[0].price).toBe(1800);
  expect(items[0].amount).toBe(450000);
});

test("existing PR Balance calculation excludes the targeted procurement discount", () => {
  const pr = { id: "pr-1", totalAmount: 1020000 };
  const po = {
    id: "po-1",
    discount: 20000,
    discountPrId: "pr-1",
    items: [{ amount: 720000, disPrAllocations: [{ prId: "pr-1", amount: 700000 }] }],
  };
  const info = getPrBudgetReturnInfo(pr, [po]);
  expect(info.poSubTotalUsed).toBe(700000);
  expect(info.procurementSavingAmount).toBe(20000);
  expect(info.returnAmount).toBe(300000);
  expect(info.revisedTotal).toBe(700000);
});

test("returns each Payment line to the PR and Budget Sub-item that funded that line", () => {
  const po = {
    id: "po-multi",
    poNo: "PO-MULTI",
    jobCompleted: true,
    selectedPrIds: ["pr-sub-a", "pr-sub-b"],
    items: [
      {
        amount: 100,
        quantity: 1,
        price: 100,
        disPrAllocations: [{ prId: "pr-sub-a", prItemIndex: 0, amount: 100 }],
      },
      {
        amount: 200,
        quantity: 1,
        price: 200,
        disPrAllocations: [{ prId: "pr-sub-b", prItemIndex: 0, amount: 200 }],
      },
    ],
  };
  const payment = {
    id: "pay-multi",
    paymentNo: "PO-MULTI-001",
    periodNo: "1",
    selectedPrIds: [po.id],
    status: "Paid",
    jobCompleted: true,
    items: [
      { prItemIndex: 0, prevAccumAmount: 0, thisPeriodAmount: 100 },
      { prItemIndex: 1, prevAccumAmount: 0, thisPeriodAmount: 0 },
    ],
  };
  const prs = [
    { id: "pr-sub-a", prNo: "PR-A", budgetId: "budget-1", selectedSubItemId: "sub-a", totalAmount: 100 },
    { id: "pr-sub-b", prNo: "PR-B", budgetId: "budget-1", selectedSubItemId: "sub-b", totalAmount: 200 },
  ];

  const plan = buildPoBudgetReturnPlan({ po, payments: [payment], prs });
  const prA = plan.linkedPrs.find((row) => row.prId === "pr-sub-a");
  const prB = plan.linkedPrs.find((row) => row.prId === "pr-sub-b");

  expect(prA).toMatchObject({ actualUsed: 100, returnableAmount: 0, newPrTotal: 100 });
  expect(prB).toMatchObject({ actualUsed: 0, returnableAmount: 200, newPrTotal: 0 });
  expect(prA.routes[0]).toMatchObject({ prItemIndex: 0, actualUsed: 100, returnableAmount: 0 });
  expect(prB.routes[0]).toMatchObject({ prItemIndex: 0, actualUsed: 0, returnableAmount: 200 });
  expect(plan.returnableAmount).toBe(200);
  expect(plan.revisedPoItems.map((item) => item.disPrAllocations[0].amount)).toEqual([100, 0]);
});

test("splits an actually used merged PO line by its explicit PR allocations", () => {
  const po = {
    id: "po-merged-line",
    jobCompleted: true,
    selectedPrIds: ["pr-a", "pr-b"],
    items: [{
      amount: 300,
      quantity: 3,
      price: 100,
      disPrAllocations: [
        { prId: "pr-a", prItemIndex: 0, amount: 100 },
        { prId: "pr-b", prItemIndex: 0, amount: 200 },
      ],
    }],
  };
  const payment = {
    id: "pay-merged-line",
    selectedPrIds: [po.id],
    status: "Paid",
    jobCompleted: true,
    items: [{ prItemIndex: 0, prevAccumAmount: 0, thisPeriodAmount: 150 }],
  };
  const plan = buildPoBudgetReturnPlan({
    po,
    payments: [payment],
    prs: [
      { id: "pr-a", totalAmount: 100 },
      { id: "pr-b", totalAmount: 200 },
    ],
  });

  expect(plan.linkedPrs.find((row) => row.prId === "pr-a")).toMatchObject({ actualUsed: 50, returnableAmount: 50 });
  expect(plan.linkedPrs.find((row) => row.prId === "pr-b")).toMatchObject({ actualUsed: 100, returnableAmount: 100 });
  expect(plan.revisedPoItems[0].disPrAllocations.map((allocation) => allocation.amount)).toEqual([50, 100]);
});

test("keeps targeted procurement saving out of both Sub-item returns", () => {
  const po = {
    id: "po-merged-discount",
    jobCompleted: true,
    discountAllocationVersion: 1,
    discount: 20,
    discountPrId: "pr-a",
    selectedPrIds: ["pr-a", "pr-b"],
    items: [{
      amount: 300,
      quantity: 3,
      price: 100,
      disPrAllocations: [
        { prId: "pr-a", prItemIndex: 0, amount: 80 },
        { prId: "pr-b", prItemIndex: 0, amount: 200 },
      ],
    }],
  };
  const payment = {
    id: "pay-merged-discount",
    selectedPrIds: [po.id],
    status: "Paid",
    jobCompleted: true,
    discountAllocationVersion: 1,
    discountAppliedAmount: 10,
    items: [{ prItemIndex: 0, thisPeriodAmount: 150 }],
  };
  const plan = buildPoBudgetReturnPlan({
    po,
    payments: [payment],
    prs: [{ id: "pr-a", totalAmount: 100 }, { id: "pr-b", totalAmount: 200 }],
  });

  expect(plan.actualUsed).toBe(140);
  expect(plan.procurementSaving).toBe(20);
  expect(plan.returnableAmount).toBe(140);
  expect(plan.linkedPrs.find((row) => row.prId === "pr-a")).toMatchObject({ actualUsed: 40, returnableAmount: 40, newPrTotal: 40 });
  expect(plan.linkedPrs.find((row) => row.prId === "pr-b")).toMatchObject({ actualUsed: 100, returnableAmount: 100, newPrTotal: 100 });
  expect(plan.revisedPoItems[0]).toMatchObject({ amount: 160 });
  expect(plan.revisedPoItems[0].disPrAllocations.map((allocation) => allocation.amount)).toEqual([40, 100]);
});

test("blocks an ambiguous legacy multi-PR PO instead of guessing a Budget", () => {
  const po = {
    id: "po-legacy-ambiguous",
    selectedPrIds: ["pr-a", "pr-b"],
    items: [{ prId: "pr-a", amount: 100, quantity: 1, price: 100 }],
  };
  const payment = {
    id: "pay-legacy",
    selectedPrIds: [po.id],
    items: [{ prItemIndex: 0, thisPeriodAmount: 50 }],
  };

  const plan = buildPoBudgetReturnPlan({
    po,
    payments: [payment],
    prs: [{ id: "pr-a", totalAmount: 100 }, { id: "pr-b", totalAmount: 100 }],
  });
  expect(plan.canStart).toBe(false);
  expect(plan.allocationValidationError).toContain("ระบุ PR item ต้นทางไม่ครบ");
});

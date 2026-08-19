import { buildPoBudgetReturnPlan, scalePoItemsToNetAmount } from "./poBudgetReturn";
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

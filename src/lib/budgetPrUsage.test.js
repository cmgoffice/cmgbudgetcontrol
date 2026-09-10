import {
  getBudgetAmountFromPoPrAllocations,
  getBudgetPrTotal,
  getExactBudgetSearchTargets,
  isPrLinkedToExactBudgetTarget,
} from "./budgetPrUsage";
import { getPoNetPrAllocations } from "./prBudgetReturn";

const headOffice = {
  id: "budget-head-office",
  projectId: "project-1",
  code: "002014",
  subItems: [{ id: "sub-head-office" }],
};

const workshop = {
  id: "budget-workshop",
  projectId: "project-1",
  code: "002014",
  subItems: [{ id: "sub-workshop" }],
};

test("never mixes duplicate Cost Codes that have different Budget IDs", () => {
  const prs = [
    {
      id: "pr-head-office",
      projectId: "project-1",
      budgetId: headOffice.id,
      costCode: "002014",
      items: [{ budgetId: headOffice.id, subItemId: "sub-head-office", amount: 700 }],
    },
    {
      id: "pr-workshop",
      projectId: "project-1",
      budgetId: workshop.id,
      costCode: "002014",
      items: [{ budgetId: workshop.id, subItemId: "sub-workshop", amount: 900 }],
    },
  ];

  expect(getBudgetPrTotal({ prs, budget: headOffice, projectId: "project-1", hasDuplicateCostCode: true })).toBe(700);
  expect(getBudgetPrTotal({ prs, budget: workshop, projectId: "project-1", hasDuplicateCostCode: true })).toBe(900);
});

test("counts legacy items from the exact PR header Budget ID", () => {
  const prs = [{
    id: "pr-legacy-head-office",
    projectId: "project-1",
    budgetId: headOffice.id,
    costCode: "002014",
    items: [{ description: "วัสดุสิ้นเปลืองออฟฟิค", quantity: 2, price: 362.51 }],
  }];

  expect(getBudgetPrTotal({ prs, budget: headOffice, projectId: "project-1", hasDuplicateCostCode: true })).toBe(725.02);
  expect(getBudgetPrTotal({ prs, budget: workshop, projectId: "project-1", hasDuplicateCostCode: true })).toBe(0);
});

test("keeps a stale Sub-item under its exact parent Budget ID", () => {
  const prs = [{
    id: "pr-stale-sub-item",
    projectId: "project-1",
    budgetId: headOffice.id,
    costCode: "002014",
    items: [{ subItemId: "old-head-office-sub-item", amount: 725.02 }],
  }];

  expect(getBudgetPrTotal({ prs, budget: headOffice, projectId: "project-1", hasDuplicateCostCode: true })).toBe(725.02);
  expect(getBudgetPrTotal({ prs, budget: workshop, projectId: "project-1", hasDuplicateCostCode: true })).toBe(0);
});

test("does not guess a Budget from a duplicated Cost Code", () => {
  const prs = [{
    id: "pr-ambiguous",
    projectId: "project-1",
    costCode: "002014",
    items: [{ amount: 500 }],
  }];

  expect(getBudgetPrTotal({ prs, budget: headOffice, projectId: "project-1", hasDuplicateCostCode: true })).toBe(0);
  expect(getBudgetPrTotal({ prs, budget: workshop, projectId: "project-1", hasDuplicateCostCode: true })).toBe(0);
});

test("an exact Budget and Sub-item search resolves to IDs and excludes Workshop", () => {
  const budgets = [
    {
      ...headOffice,
      description: "วัสดุสิ้นเปลืองออฟฟิค กาแฟ เบ็ดเตล็ด Head Office",
      subItems: [{
        id: "sub-head-office",
        description: "วัสดุสิ้นเปลืองออฟฟิค กาแฟ เบ็ดเตล็ด Head Office",
      }],
    },
    {
      ...workshop,
      description: "วัสดุสิ้นเปลืองออฟฟิค กาแฟ เบ็ดเตล็ด Workshop",
      subItems: [{ id: "sub-workshop", description: "วัสดุสิ้นเปลืองออฟฟิค Workshop" }],
    },
  ];
  const query = "วัสดุสิ้นเปลืองออฟฟิค กาแฟ เบ็ดเตล็ด Head Office + วัสดุสิ้นเปลืองออฟฟิค กาแฟ เบ็ดเตล็ด Head Office";
  const targets = getExactBudgetSearchTargets(budgets, "project-1", query);
  const headOfficePr = {
    projectId: "project-1",
    budgetId: headOffice.id,
    selectedSubItemId: "sub-head-office",
  };
  const workshopPr = {
    projectId: "project-1",
    budgetId: workshop.id,
    selectedSubItemId: "sub-workshop",
  };

  expect(targets).toEqual([{ budgetId: headOffice.id, subItemId: "sub-head-office" }]);
  expect(targets.some((target) => isPrLinkedToExactBudgetTarget(headOfficePr, target))).toBe(true);
  expect(targets.some((target) => isPrLinkedToExactBudgetTarget(workshopPr, target))).toBe(false);
});

test("routes a conflicting PO allocation back to the source PR Budget exactly once", () => {
  const prs = [
    { id: "pr-head-office", budgetId: headOffice.id, costCode: "002014" },
    { id: "pr-workshop", budgetId: workshop.id, costCode: "002014" },
  ];
  const po = {
    discountAllocationVersion: 1,
    selectedPrIds: ["pr-head-office", "pr-workshop"],
    items: [{
      prId: "pr-head-office",
      amount: 4_735.06,
      disPrAllocations: [{ prId: "pr-workshop", amount: 4_735.06 }],
    }],
  };
  const allocations = getPoNetPrAllocations(po);

  expect(allocations).toEqual([{
    prId: "pr-head-office",
    amount: 4_735.06,
    correctedConflictingAllocation: true,
  }]);
  expect(getBudgetAmountFromPoPrAllocations({ allocations, prs, budget: headOffice, hasDuplicateCostCode: true })).toBe(4_735.06);
  expect(getBudgetAmountFromPoPrAllocations({ allocations, prs, budget: workshop, hasDuplicateCostCode: true })).toBe(0);
});

test("uses item Budget proportions only as a fallback for a malformed legacy PR", () => {
  const prs = [{
    id: "J01-WA-104",
    budgetId: headOffice.id,
    costCode: "002014",
    totalAmount: 11_378.97,
    items: [
      { budgetId: workshop.id, amount: 5_689.485 },
      { budgetId: headOffice.id, amount: 5_689.485 },
    ],
  }];
  const allocations = [{ prId: "J01-WA-104", amount: 11_378.97 }];

  expect(getBudgetAmountFromPoPrAllocations({
    allocations,
    prs,
    budget: headOffice,
    hasDuplicateCostCode: true,
  })).toBe(5_689.49);
  expect(getBudgetAmountFromPoPrAllocations({
    allocations,
    prs,
    budget: workshop,
    hasDuplicateCostCode: true,
  })).toBe(5_689.48);
});

test("cuts a multi-PR PO against each normal PR's own Budget", () => {
  const prs = [
    {
      id: "pr-head-office",
      budgetId: headOffice.id,
      costCode: "002014",
      items: [{ budgetId: headOffice.id, amount: 400 }],
    },
    {
      id: "pr-workshop",
      budgetId: workshop.id,
      costCode: "002014",
      items: [{ budgetId: workshop.id, amount: 600 }],
    },
  ];
  const po = {
    discountAllocationVersion: 1,
    selectedPrIds: ["pr-head-office", "pr-workshop"],
    items: [
      { prId: "pr-head-office", amount: 400, disPrAllocations: [{ prId: "pr-head-office", amount: 400 }] },
      { prId: "pr-workshop", amount: 600, disPrAllocations: [{ prId: "pr-workshop", amount: 600 }] },
    ],
  };
  const allocations = getPoNetPrAllocations(po);

  expect(getBudgetAmountFromPoPrAllocations({
    allocations,
    prs,
    budget: headOffice,
    hasDuplicateCostCode: true,
  })).toBe(400);
  expect(getBudgetAmountFromPoPrAllocations({
    allocations,
    prs,
    budget: workshop,
    hasDuplicateCostCode: true,
  })).toBe(600);
});

test("splits every multi-Budget PR proportionally and preserves the PO total to the cent", () => {
  const thirdBudget = { id: "budget-third", code: "002014" };
  const prs = [{
    id: "pr-three-budgets",
    budgetId: headOffice.id,
    items: [
      { budgetId: headOffice.id, amount: 50 },
      { budgetId: workshop.id, amount: 30 },
      { budgetId: thirdBudget.id, amount: 20 },
    ],
  }];
  const allocations = [{ prId: "pr-three-budgets", amount: 10.01 }];
  const amounts = [headOffice, workshop, thirdBudget].map((budget) => (
    getBudgetAmountFromPoPrAllocations({ allocations, prs, budget, hasDuplicateCostCode: true })
  ));

  expect(amounts).toEqual([5.01, 3, 2]);
  expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(10.01);
});

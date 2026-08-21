import { repairLegacyAllocationRoutes, validatePoPrLinkage } from "./poPrValidation";

const prs = [{
  id: "pr-1",
  prNo: "PR-001",
  projectId: "project-1",
  costCode: "MAT",
  items: [
    { description: "Safety helmet chin strap", costCode: "MAT" },
    { description: "Safety shoes", costCode: "MAT" },
  ],
}];

test("repairs a legacy allocation that omitted its PR item index", () => {
  const legacyItem = {
    prId: "pr-1",
    prItemIndex: 0,
    description: "Safety helmet chin strap",
    costCode: "MAT",
    disPrAllocations: [{ prId: "pr-1", prNo: "PR-001", amount: 100 }],
  };

  expect(validatePoPrLinkage({
    projectId: "project-1",
    selectedPrIds: ["pr-1"],
    items: [legacyItem],
    prs,
    requireAllocations: true,
  }).valid).toBe(false);

  const repairedItem = repairLegacyAllocationRoutes(legacyItem, prs);
  expect(repairedItem.disPrAllocations[0].prItemIndex).toBe(0);
  expect(validatePoPrLinkage({
    projectId: "project-1",
    selectedPrIds: ["pr-1"],
    items: [repairedItem],
    prs,
    requireAllocations: true,
  }).valid).toBe(true);
});

test("does not guess when a legacy allocation route is ambiguous", () => {
  const ambiguousItem = {
    prId: "different-pr",
    prItemIndex: 0,
    description: "Unknown item",
    costCode: "MAT",
    disPrAllocations: [{ prId: "pr-1", amount: 100 }],
  };

  const repairedItem = repairLegacyAllocationRoutes(ambiguousItem, prs);
  expect(repairedItem.disPrAllocations[0].prItemIndex).toBeUndefined();
});

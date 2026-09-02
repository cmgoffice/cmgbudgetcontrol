const MAIN_BUDGET_CATEGORY_PATTERN = /^00[1-9]$/;

export function canDirectEditApprovedMainBudget(
  projectStatus: unknown,
  budgetStatus: unknown,
  category: unknown
): boolean {
  return (
    projectStatus === "Prepare Budget" &&
    budgetStatus === "Approved" &&
    MAIN_BUDGET_CATEGORY_PATTERN.test(String(category || ""))
  );
}

export function canDirectEditApprovedSubItemBudget(
  projectStatus: unknown,
  mainBudgetStatus: unknown,
  subItemStatus: unknown,
  category: unknown
): boolean {
  return (
    projectStatus === "Prepare Budget" &&
    mainBudgetStatus === "Approved" &&
    subItemStatus === "Approved" &&
    MAIN_BUDGET_CATEGORY_PATTERN.test(String(category || ""))
  );
}

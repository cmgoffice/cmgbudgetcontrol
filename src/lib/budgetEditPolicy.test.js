import { canDirectEditApprovedMainBudget } from "./budgetEditPolicy";

test("allows direct editing for approved main budgets while the project is preparing its budget", () => {
  expect(canDirectEditApprovedMainBudget("Prepare Budget", "Approved", "001")).toBe(true);
  expect(canDirectEditApprovedMainBudget("Prepare Budget", "Approved", "009")).toBe(true);
});

test("keeps the existing workflow outside Prepare Budget and outside categories 001-009", () => {
  expect(canDirectEditApprovedMainBudget("Active", "Approved", "001")).toBe(false);
  expect(canDirectEditApprovedMainBudget("Prepare Budget", "Revision Pending", "001")).toBe(false);
  expect(canDirectEditApprovedMainBudget("Prepare Budget", "Approved", "OVERVIEW")).toBe(false);
});

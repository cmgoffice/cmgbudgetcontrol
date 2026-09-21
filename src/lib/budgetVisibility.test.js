import { isMainBudgetHidden } from "./budgetVisibility";

describe("isMainBudgetHidden", () => {
  it.each([
    [undefined, false],
    [{}, false],
    [{ Hide: false }, false],
    [{ Hide: "false" }, false],
    [{ Hide: true }, true],
    [{ Hide: "true" }, true],
    [{ Hide: " TRUE " }, true],
  ])("reads the backend Hide flag from %p", (budget, expected) => {
    expect(isMainBudgetHidden(budget)).toBe(expected);
  });
});


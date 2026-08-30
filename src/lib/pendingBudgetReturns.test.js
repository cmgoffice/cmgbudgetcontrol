import {
  appendPendingBudgetReturn,
  buildAcceptedPendingReturnState,
  getPendingBudgetReturnGroup,
  getPendingBudgetReturns,
  getPendingReturnDeductionTotal,
  getPrReturnAvailability,
  removePendingBudgetReturns,
  sumBudgetReturnNotifications,
} from "./pendingBudgetReturns";

describe("pending Budget returns", () => {
  it("supports legacy and multiple pending rows without duplicates", () => {
    const legacy = { requestId: "old", returnedAmount: 100 };
    const pr = {
      pendingBudgetReturn: legacy,
      pendingBudgetReturns: [legacy, { requestId: "new", returnedAmount: 200, procurementSavingAmount: 25 }],
    };

    expect(getPendingBudgetReturns(pr).map((row) => row.requestId)).toEqual(["old", "new"]);
    expect(getPendingReturnDeductionTotal(pr)).toBe(325);
  });

  it("appends and removes requests independently", () => {
    const pr = { pendingBudgetReturns: [{ requestId: "one" }] };
    const appended = appendPendingBudgetReturn(pr, { requestId: "two" });
    expect(appended.map((row) => row.requestId)).toEqual(["one", "two"]);
    expect(removePendingBudgetReturns({ pendingBudgetReturns: appended }, ["one"]))
      .toEqual([{ requestId: "two" }]);
  });

  it("groups pending notifications by Sub-item and sums the visible total", () => {
    const rows = [
      { id: "a", subItemId: "sub-1", amount: 100 },
      { id: "b", subItemId: "sub-1", amount: 250 },
      { id: "c", subItemId: "sub-2", amount: 500 },
      { id: "d", subItemId: "sub-1", amount: 999, status: "accepted" },
    ];
    const group = getPendingBudgetReturnGroup(rows, rows[0]);
    expect(group.map((row) => row.id)).toEqual(["a", "b"]);
    expect(sumBudgetReturnNotifications(group)).toBe(350);
  });

  it("reserves procurement saving once while allowing multiple partial returns", () => {
    const info = { currentTotal: 1_000, poSubTotalUsed: 700, procurementSavingAmount: 20 };
    expect(getPrReturnAvailability({}, info)).toMatchObject({
      availableReturnAmount: 280,
      savingToReserve: 20,
    });
    expect(getPrReturnAvailability({
      pendingBudgetReturns: [{ requestId: "one", returnedAmount: 100, procurementSavingAmount: 20 }],
    }, info)).toMatchObject({
      availableReturnAmount: 180,
      savingToReserve: 0,
    });
  });

  it("accepts two returns for one PR as sequential deltas", () => {
    const pr = {
      totalAmount: 1_000,
      items: [{ quantity: 1, price: 1_000, amount: 1_000 }],
      pendingBudgetReturns: [
        { requestId: "one", at: "2026-01-01", returnedAmount: 100, procurementSavingAmount: 20 },
        { requestId: "two", at: "2026-01-02", returnedAmount: 200, procurementSavingAmount: 0 },
      ],
    };
    const result = buildAcceptedPendingReturnState(pr, ["one", "two"], "accepted", "Budget Owner");
    expect(result.totalAmount).toBe(680);
    expect(result.revisions.map((row) => [row.revNo, row.oldTotalAmount, row.newTotalAmount])).toEqual([
      [1, 1_000, 880],
      [2, 880, 680],
    ]);
    expect(result.items[0].amount).toBe(680);
    expect(result.remainingPendingReturns).toEqual([]);
    expect(result.revisionNoByRequestId).toEqual({ one: 1, two: 2 });
  });
});

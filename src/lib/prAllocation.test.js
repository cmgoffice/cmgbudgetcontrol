import { canActivatePR, getAvailableBalanceForPR, getResumeStatusForPR } from "./prAllocation";

const makePo = (prId, amount) => ({
  id: `po-${amount}`,
  status: "Closed PO",
  items: [{ disPrAllocations: [{ prId, amount }] }],
});

describe("PR activation balance", () => {
  it("does not allow Active PR when linked PO uses the revised PR total", () => {
    const pr = { id: "pr-1", totalAmount: 700 };
    const pos = [makePo(pr.id, 700)];

    expect(getAvailableBalanceForPR(pr, pos)).toBe(0);
    expect(canActivatePR(pr, pos)).toBe(false);
    expect(getResumeStatusForPR(pr, pos).status).toBe("Closed PR Auto");
  });

  it("allows Active PR only for balance that remains after the return", () => {
    const pr = { id: "pr-1", totalAmount: 1_000 };
    const pos = [makePo(pr.id, 700)];

    expect(getAvailableBalanceForPR(pr, pos)).toBe(300);
    expect(canActivatePR(pr, pos)).toBe(true);
    expect(getResumeStatusForPR(pr, pos).status).toBe("PO Issued");
  });

  it("treats a zero revised total as having no activatable balance", () => {
    const pr = { id: "pr-1", totalAmount: 0, amount: 5_000 };

    expect(getAvailableBalanceForPR(pr, [])).toBe(0);
    expect(canActivatePR(pr, [])).toBe(false);
  });
});

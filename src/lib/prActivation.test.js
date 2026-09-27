import { runTransaction } from "firebase/firestore";
import { transitionPrActivation } from "./prActivation";

jest.mock("firebase/firestore", () => ({
  doc: jest.fn((...parts) => parts.join("/")),
  runTransaction: jest.fn(),
}));

const po = {
  id: "po-1",
  status: "Closed PO",
  items: [{ disPrAllocations: [{ prId: "pr-1", amount: 700 }] }],
};

const setLatestPr = (pr) => {
  const update = jest.fn();
  runTransaction.mockImplementation(async (_db, callback) => callback({
    get: async () => ({ exists: () => true, data: () => pr }),
    update,
  }));
  return update;
};

describe("Active PR transaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an Active request when a partial Budget return arrived after the page loaded", async () => {
    const update = setLatestPr({
      status: "Closed PR Auto",
      totalAmount: 1_000,
      pendingBudgetReturns: [{ requestId: "return-1", returnedAmount: 100 }],
    });
    await expect(transitionPrActivation({ db: {}, appId: "app", prId: "pr-1", action: "request", pos: [po] }))
      .rejects.toThrow("รอรับ");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects approval when a Payment return arrives during Pending Active PR", async () => {
    const update = setLatestPr({
      status: "Pending Active PR",
      totalAmount: 1_000,
      pendingBudgetReturns: [{ requestId: "payment-return", returnedAmount: 100, poBudgetReturnJobId: "job-1" }],
    });
    await expect(transitionPrActivation({ db: {}, appId: "app", prId: "pr-1", action: "approve", resumeStatus: "PO Issued", pos: [po] }))
      .rejects.toThrow("รอรับ");
    expect(update).not.toHaveBeenCalled();
  });

  it("allows a new request after the return is accepted and a balance remains", async () => {
    const update = setLatestPr({ status: "Closed PR Auto", totalAmount: 900, pendingBudgetReturns: [] });
    await transitionPrActivation({ db: {}, appId: "app", prId: "pr-1", action: "request", pos: [po] });
    expect(update.mock.calls[0][1]).toEqual(expect.objectContaining({ status: "Pending Active PR" }));
  });
});

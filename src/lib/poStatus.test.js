import { getPoDisplayStatus } from "./constants";

describe("getPoDisplayStatus", () => {
  it("keeps a real Draft PO as Draft even when an old statusNow value remains", () => {
    expect(getPoDisplayStatus({ status: "Draft", statusNow: "Approved" })).toBe("Draft");
  });

  it("does not let a stale statusNow Draft hide an approved PO", () => {
    expect(getPoDisplayStatus({ status: "Approved", statusNow: "Draft" })).toBe("Approved");
  });

  it("uses downstream operational status after approval", () => {
    expect(getPoDisplayStatus({ status: "Approved", statusNow: "Partial Receive" })).toBe("Partial Receive");
    expect(getPoDisplayStatus({ status: "Approved", statusNow: "PMT In Process" })).toBe("PMT In Process");
  });

  it("keeps pending approval statuses authoritative", () => {
    expect(getPoDisplayStatus({ status: "Pending GM", statusNow: "Draft" })).toBe("Pending GM");
  });
});

import { getPoDisplayStatus, isPoReadyForManualReceive } from "./constants";

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

describe("isPoReadyForManualReceive", () => {
  it("shows approved and partially received purchasing POs", () => {
    expect(isPoReadyForManualReceive({ poType: "CR", status: "Approved", statusNow: "Approved" })).toBe(true);
    expect(isPoReadyForManualReceive({ poType: "CR", status: "Approve" })).toBe(true);
    expect(isPoReadyForManualReceive({ poType: "CR", status: "Approved", statusNow: "Partial Receive" })).toBe(true);
  });

  it("shows a paid pay-before-receive PO until receiving is complete", () => {
    expect(isPoReadyForManualReceive({
      poType: "CR",
      status: "paid",
      statusNow: "paid",
      payBeforeReceiveChecked: true,
    })).toBe(true);
    expect(isPoReadyForManualReceive({
      poType: "CR",
      status: "Paid",
      statusNow: "Paid",
      payBeforeReceiveChecked: true,
    })).toBe(false);
  });

  it("does not show pending approvals or subcontract payment POs", () => {
    expect(isPoReadyForManualReceive({ poType: "CR", status: "Pending GM", statusNow: "Approved" })).toBe(false);
    expect(isPoReadyForManualReceive({ poType: "SP", status: "Approved", statusNow: "Approved" })).toBe(false);
    expect(isPoReadyForManualReceive({ poType: "DC", status: "Approved", statusNow: "Approved" })).toBe(false);
  });
});

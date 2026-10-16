import { isBudgetPoApprovalTask, isBudgetPrApprovalTask } from "./budgetApprovalTasks";
import { PO_REVISION_PENDING_GM, PO_REVISION_PENDING_PCM, PR_PENDING_ACTIVE } from "./constants";

const admin = ["Administrator"];

describe("Project Budget approval tasks", () => {
  it.each([
    "Draft", "Closed PR", "Closed PR Auto", "Rejected", "Approved", "PO Issued",
    "Edit Budget", "Pending Close", "Pending Unknown", "", undefined,
  ])("does not count PR status %p as an Administrator approval", (status) => {
    expect(isBudgetPrApprovalTask({ status }, admin, [])).toBe(false);
  });

  it.each(["CM", "PM", "GM", "MD"])("keeps pending PR approvals for %s and Administrator", (role) => {
    const pr = { status: `Pending ${role}` };
    expect(isBudgetPrApprovalTask(pr, [role], [])).toBe(true);
    expect(isBudgetPrApprovalTask(pr, ["Viewer", role], [])).toBe(true);
    expect(isBudgetPrApprovalTask(pr, admin, [])).toBe(true);
    expect(isBudgetPrApprovalTask(pr, ["Procurement"], [])).toBe(false);
  });

  it("removes a PR from the count after approval or rejection", () => {
    const rows = [{ id: "pr-1", status: "Pending MD" }, { id: "pr-2", status: "Closed PR Auto" }];
    const tasks = () => rows.filter((pr) => isBudgetPrApprovalTask(pr, admin, []));
    expect(tasks().map((pr) => pr.id)).toEqual(["pr-1"]);
    rows[0] = { ...rows[0], status: "Approved" };
    expect(tasks()).toEqual([]);
    rows[0] = { ...rows[0], status: "Rejected" };
    expect(tasks()).toEqual([]);
  });

  it.each(["Administrator", "PCM"])("keeps only activatable PR requests for %s", (role) => {
    const roles = [role];
    const pr = { id: "pr-1", status: PR_PENDING_ACTIVE, totalAmount: 1000 };
    const pos = [{ status: "Closed PO", items: [{ disPrAllocations: [{ prId: pr.id, amount: 1000 }] }] }];
    expect(isBudgetPrApprovalTask(pr, roles, [])).toBe(true);
    expect(isBudgetPrApprovalTask(pr, roles, pos)).toBe(false);
    expect(isBudgetPrApprovalTask({ ...pr, totalAmount: 0 }, roles, [])).toBe(false);
    expect(isBudgetPrApprovalTask({
      ...pr, pendingBudgetReturns: [{ requestId: "return-1", returnedAmount: 100 }],
    }, roles, [])).toBe(false);
    expect(isBudgetPrApprovalTask(pr, ["MD"], [])).toBe(false);
  });

  it.each([
    ["Pending PCM", "PCM"], ["Pending GM", "GM"],
    [PO_REVISION_PENDING_PCM, "PCM"], [PO_REVISION_PENDING_GM, "GM"],
  ])("keeps PO %s for its approver and Administrator", (status, role) => {
    expect(isBudgetPoApprovalTask({ status }, [role])).toBe(true);
    expect(isBudgetPoApprovalTask({ status }, admin)).toBe(true);
    expect(isBudgetPoApprovalTask({ status }, ["CM"])).toBe(false);
    expect(isBudgetPoApprovalTask({ status }, [role === "PCM" ? "GM" : "PCM"])).toBe(false);
  });

  it.each([
    "Draft", "Approved", "Rejected", "Received", "Closed PO", "Paid",
    "Pending Close PO", "Pending Unknown", undefined,
  ])("excludes PO %p from the Budget approval table", (status) => {
    expect(isBudgetPoApprovalTask({ status }, admin)).toBe(false);
  });

  it("does not leave a paid PO's legacy close request in the Budget badge", () => {
    expect(isBudgetPoApprovalTask({ status: "Pending Close PO", statusNow: "paid" }, admin)).toBe(false);
  });
});

import { runTransaction } from "firebase/firestore";
import { createAdvance, advanceAction } from "./advancePaymentStore";

jest.mock("firebase/firestore", () => ({
  collection: (_db, ...parts) => parts.join("/"),
  doc: (path, id = "new-id") => ({ path: `${path}/${id}`, id }),
  Timestamp: { now: () => "CLIENT_TIMESTAMP" },
  serverTimestamp: () => "SERVER_TIMESTAMP",
  runTransaction: jest.fn(),
}));
const po = { id: "po", status: "Approved", poType: "SP", projectId: "project", vendorId: "vendor", vendorName: "Vendor", poNo: "PO-1", amountExVat: 1000 };
const user = { uid: "user", displayName: "Name" };
const args = { db: {}, appId: "app", po, user, payments: [], form: { amount: "100.01", workUnclaimedAmount: "50", recoveryTerms: "Each period", reason: "Deposit" } };
const stored = { status: "Pending PD", amountSatang: 10000000, paidSatang: 0, recoveredSatang: 0, projectId: "project", poId: "po", history: [{ action: "create" }] };
const actionArgs = { db: {}, appId: "app", id: "advance", user, action: "approve", roles: ["PD"] };
function mockRecord(record, profile = { role: "Administrator" }, permissions = null) {
  const tx = { get: jest.fn(async ref => {
    const data = ref.path.endsWith("/users/user") ? profile
      : ref.path.endsWith("/settings/functionPermissions") ? permissions : record;
    return { exists: () => !!data, data: () => data };
  }), set: jest.fn(), update: jest.fn() };
  runTransaction.mockImplementation(async (_db, callback) => callback(tx));
  return tx;
}
beforeEach(() => jest.clearAllMocks());
test.each([{ status: "Closed PO" }, { status: "Rejected" }, { status: "Draft" }, { statusNow: "Pending Close PO" }, { statusNow: "Cancelled" }])("creation rechecks persisted PO eligibility %p", async changed => {
  const tx = mockRecord({ ...po, ...changed });
  await expect(createAdvance(args)).rejects.toThrow("eligible");
  expect(tx.set).not.toHaveBeenCalled();
});
test.each(["CR", "DC", "", undefined])("creation rejects approved PO type %p", async poType => {
  const tx = mockRecord({ ...po, poType });
  await expect(createAdvance(args)).rejects.toThrow("eligible");
  expect(tx.set).not.toHaveBeenCalled();
});
test("balance is a display snapshot, not a maximum request limit", async () => {
  const tx = mockRecord({ ...po, amountExVat: 1 });
  await createAdvance(args);
  expect(tx.set.mock.calls[0][1]).toMatchObject({ amountSatang: 10001, balanceSnapshot: 1 });
});
test("create reads PO and atomically writes only advance and new audit, preserving PO", async () => {
  const tx = mockRecord({ ...po, amountExVat: 800 });
  await expect(createAdvance(args)).resolves.toBe("new-id");
  expect(tx.get.mock.calls[0][0].path).toMatch(/\/pos\/po$/);
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.set).toHaveBeenCalledTimes(2);
  const [ref, advance] = tx.set.mock.calls[0];
  expect(ref.path).toMatch(/\/advances\/new-id$/);
  expect(advance).toMatchObject({ status: "Pending PD", amountSatang: 10001, paidSatang: 0, recoveredSatang: 0, projectId: "project", poId: "po", vendorId: "vendor", vendorName: "Vendor", balanceSnapshot: 800, workUnclaimedAmount: 50, createdByUid: "user", createdByName: "Name" });
  expect(tx.set.mock.calls[1][0].path).toMatch(/\/advanceTransactions\/new-id$/);
  expect(tx.set.mock.calls[1][1]).toMatchObject({ ...advance.history[0], advanceId: "new-id", createdAt: "SERVER_TIMESTAMP" });
});
test("legacy supplier fields are normalized", async () => {
  const legacy = { ...po, vendorId: undefined, vendorName: undefined, supplierId: "vendor", supplierName: "Vendor" };
  const tx = mockRecord(legacy);
  await createAdvance({ ...args, po: legacy });
  expect(tx.set.mock.calls[0][1]).toMatchObject({ vendorId: "vendor", vendorName: "Vendor" });
});
test.each([null, { ...po, projectId: "other" }, { ...po, vendorId: "other" }, { ...po, vendorName: "Changed" }])("stale/missing PO fails without writes %p", async record => {
  const tx = mockRecord(record);
  await expect(createAdvance(args)).rejects.toThrow();
  expect(tx.set).not.toHaveBeenCalled();
});
test.each([{ amount: 0 }, { amount: -1 }, { amount: "junk" }, { workUnclaimedAmount: -1 }, { reason: " " }, { recoveryTerms: "" }, { projectId: "other" }, { vendorId: "other" }])("invalid form is not saved %p", async fields => {
  const tx = mockRecord(po);
  await expect(createAdvance({ ...args, form: { ...args.form, ...fields } })).rejects.toThrow();
  expect(tx.set).not.toHaveBeenCalled();
});
test.each([["Pending PD", "PD", 100, "Pending PCM"], ["Pending PCM", "PCM", 100, "Pending GM"], ["Pending GM", "GM", 10000000, "Approved"], ["Pending GM", "GM", 10000001, "Pending MD"], ["Pending MD", "MD", 10000001, "Approved"]])("advances persisted stage %s", async (status, role, amountSatang, next) => {
  const tx = mockRecord({ ...stored, status, amountSatang });
  await expect(advanceAction({ ...actionArgs, roles: [role] })).resolves.toBe("advance");
  expect(tx.update.mock.calls[0][1]).toMatchObject({ status: next, history: [stored.history[0], expect.objectContaining({ action: "approve", fromStatus: status, toStatus: next })] });
  expect(tx.update.mock.calls[0][1]).not.toHaveProperty("amountSatang");
  expect(tx.set).toHaveBeenCalledTimes(1);
});
test("reject requires reason and saves it in both history and audit", async () => {
  const tx = mockRecord(stored);
  await expect(advanceAction({ ...actionArgs, action: "reject", note: " " })).rejects.toThrow();
  expect(tx.update).not.toHaveBeenCalled();
  await advanceAction({ ...actionArgs, action: "reject", note: " Wrong vendor " });
  expect(tx.update.mock.calls[0][1]).toMatchObject({ status: "Rejected", rejectionReason: "Wrong vendor" });
  expect(tx.set.mock.calls[0][1]).toMatchObject({ action: "reject", note: "Wrong vendor" });
});
const payArgs = { ...actionArgs, action: "pay", roles: ["Administrator"], paidDate: "2026-10-16", paymentReference: "BANK-1" };
test("pay transfers full stored amount and preserves approval history", async () => {
  const tx = mockRecord({ ...stored, status: "Approved" });
  await advanceAction(payArgs);
  expect(tx.update.mock.calls[0][1]).toMatchObject({ status: "Paid", paidSatang: stored.amountSatang, paidDate: "2026-10-16", paymentReference: "BANK-1", paidByUid: "user" });
  expect(tx.set.mock.calls[0][1]).toMatchObject({ action: "pay", amountSatang: stored.amountSatang, paymentReference: "BANK-1" });
});
test.each([{ paidDate: "" }, { paidDate: "2026-02-30" }, { paidDate: "nonsense" }, { paymentReference: " " }])("invalid pay request fails %p", async override => {
  const tx = mockRecord({ ...stored, status: "Approved" });
  await expect(advanceAction({ ...payArgs, ...override })).rejects.toThrow();
  expect(tx.update).not.toHaveBeenCalled();
  expect(tx.set).not.toHaveBeenCalled();
});
test("configured confirmPay checks persisted secondary roles instead of caller roles", async () => {
  const tx = mockRecord({ ...stored, status: "Approved" }, { role: "Staff", roles: ["PCM"] }, { "advance-payment": { confirmPay: ["PCM"] } });
  await advanceAction({ ...payArgs, roles: [] });
  expect(tx.update.mock.calls[0][1].status).toBe("Paid");
  expect(tx.get.mock.calls.map(([ref]) => ref.path)).toEqual(expect.arrayContaining([
    "artifacts/app/public/data/users/user", "artifacts/app/public/data/settings/functionPermissions",
  ]));
});
test.each([null, {}, { "advance-payment": { confirmPay: [] } }, { "advance-payment": { confirmPay: ["GM"] } }, { "advance-payment": { confirmPay: "PCM" } }])("persisted profile denies forged/stale Administrator role %p", async permissions => {
  const tx = mockRecord({ ...stored, status: "Approved" }, { role: "PCM" }, permissions);
  await expect(advanceAction(payArgs)).rejects.toThrow("Not authorized");
  expect(tx.update).not.toHaveBeenCalled();
});
test("missing profile cannot pay", async () => {
  const tx = mockRecord({ ...stored, status: "Approved" }, null);
  await expect(advanceAction(payArgs)).rejects.toThrow("profile");
  expect(tx.set).not.toHaveBeenCalled();
});
test.each(["Pending PD", "Paid", "Rejected"]) ("pay rejects persisted status %s", async status => {
  const tx = mockRecord({ ...stored, status });
  await expect(advanceAction(payArgs)).rejects.toThrow();
  expect(tx.update).not.toHaveBeenCalled();
});
test("server stage prevents stale/wrong-role approval", async () => {
  const tx = mockRecord({ ...stored, status: "Pending PCM" });
  await expect(advanceAction(actionArgs)).rejects.toThrow();
  expect(tx.update).not.toHaveBeenCalled();
});
test("transaction reads latest paid state and prevents duplicate payout", async () => {
  const tx = mockRecord({ ...stored, status: "Approved" });
  tx.get.mockResolvedValueOnce({ exists: () => true, data: () => ({ ...stored, status: "Paid", paidSatang: stored.amountSatang }) });
  await expect(advanceAction(payArgs)).rejects.toThrow();
  expect(tx.set).not.toHaveBeenCalled();
});

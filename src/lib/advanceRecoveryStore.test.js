import { runTransaction } from "firebase/firestore";
import { canChangeAdvanceRecovery, saveAdvanceRecovery, validateAdvanceRecovery } from "./advanceRecoveryStore";

jest.mock("firebase/firestore", () => ({
  collection: (_db, ...parts) => parts.join("/"),
  doc: (first, ...parts) => {
    const path = typeof first === "string" ? `${first}/${parts[0] || "audit-id"}` : parts.join("/");
    return { path, id: path.split("/").pop() };
  },
  serverTimestamp: () => "SERVER_TIMESTAMP",
  runTransaction: jest.fn(),
}));
const source = { status: "Active", projectId: "project", contractorId: "vendor", selectedPrIds: ["po"], amount: 500, items: [{ prId: "po", amount: 500 }], vat: 35, retention: 20 };
const advance = { status: "Paid", projectId: "project", vendorId: "vendor", poId: "po", amountSatang: 100000, paidSatang: 100000, recoveredSatang: 0 };
const args = { db: {}, appId: "app", documentType: "payments", documentId: "source", advanceId: "advance", amount: 100, user: { uid: "user" } };
const marker = { advanceId: "advance", amountSatang: 10000 };
function transactionFor({ record = source, balance = advance, ledger = null, invoice = null } = {}) {
  return {
    get: jest.fn(async ref => {
      const data = ref.path.includes("/advances/") ? balance : ref.path.includes("/advanceRecoveries/") ? ledger
        : ref.id === "payment-invoice-source" ? invoice : record;
      return { exists: () => data != null, data: () => data };
    }), set: jest.fn(), update: jest.fn(),
  };
}
function setup(options) {
  const tx = transactionFor(options);
  runTransaction.mockImplementation(async (_db, callback) => callback(tx));
  return tx;
}
const noWrites = tx => { expect(tx.set).not.toHaveBeenCalled(); expect(tx.update).not.toHaveBeenCalled(); };
beforeEach(() => jest.clearAllMocks());

test("allocation atomically writes ledger, counter, metadata and audit without changing original money/items", async () => {
  const before = JSON.stringify(source);
  const tx = setup();
  await expect(saveAdvanceRecovery(args)).resolves.toBe(true);
  expect(tx.get.mock.calls.map(([ref]) => ref.path)).toEqual([
    "artifacts/app/public/data/payments/source", "artifacts/app/public/data/advances/advance",
    "artifacts/app/public/data/advanceRecoveries/payments-source", "artifacts/app/public/data/invoices/payment-invoice-source",
  ]);
  expect(tx.update.mock.calls[0][1]).toEqual({ advanceRecovery: marker, updatedAt: expect.any(String) });
  expect(tx.update.mock.calls[1][1]).toEqual({ recoveredSatang: 10000, lastRecoveryId: "payments-source", updatedAt: "SERVER_TIMESTAMP" });
  expect(tx.set.mock.calls[0][1]).toMatchObject({ ...marker, documentType: "payments", documentId: "source", projectId: "project", poId: "po", updatedByUid: "user" });
  expect(tx.set.mock.calls[1][1]).toMatchObject({ type: "recovery", amountSatang: 10000, recoveryId: "payments-source", createdByUid: "user" });
  expect(JSON.stringify(source)).toBe(before);
});
test.each([
  { amount: 501 }, { amount: -1 }, { amount: "invalid" },
])("invalid/over-document amount writes nothing %p", async overrides => {
  const tx = setup();
  await expect(saveAdvanceRecovery({ ...args, ...overrides })).rejects.toThrow();
  noWrites(tx);
});
test("latest shared counter blocks overspending", async () => {
  const tx = setup({ balance: { ...advance, recoveredSatang: 95000 } });
  await expect(saveAdvanceRecovery(args)).rejects.toThrow();
  noWrites(tx);
});
test("transaction retry recomputes delta from concurrently updated source and ledger", async () => {
  const first = transactionFor();
  const updatedMarker = { ...marker, amountSatang: 15000 };
  const retry = transactionFor({ record: { ...source, advanceRecovery: updatedMarker }, ledger: updatedMarker, balance: { ...advance, recoveredSatang: 70000 } });
  runTransaction.mockImplementation(async (_db, callback) => {
    await callback(first); // Simulate a discarded attempt, then a Firestore conflict retry.
    return callback(retry);
  });
  await saveAdvanceRecovery({ ...args, amount: 200 });
  expect(retry.update.mock.calls[1][1].recoveredSatang).toBe(75000);
  expect(retry.set.mock.calls[1][1].amountSatang).toBe(5000);
});
test("retry rejects when another source consumed the remaining balance", async () => {
  const first = transactionFor();
  const retry = transactionFor({ balance: { ...advance, recoveredSatang: 95000 } });
  runTransaction.mockImplementation(async (_db, callback) => { await callback(first); return callback(retry); });
  await expect(saveAdvanceRecovery(args)).rejects.toThrow();
  noWrites(retry);
});
test.each([
  { record: { ...source, advanceRecovery: marker } },
  { ledger: marker },
  { ledger: marker, record: { ...source, advanceRecovery: { ...marker, advanceId: "other" } } },
  { ledger: { ...marker, advanceId: "other" }, record: { ...source, advanceRecovery: { ...marker, advanceId: "other" } } },
  { record: { ...source, projectId: "other" } },
  { record: { ...source, contractorId: "other" } },
  { record: { ...source, contractorId: "" } },
  { record: { ...source, selectedPrIds: [], items: [] } },
  { record: null }, { balance: null },
  { balance: { ...advance, status: "Approved" } },
])("mismatch, scope or missing document rejects without writes %p", async options => {
  const tx = setup(options);
  await expect(saveAdvanceRecovery(args)).rejects.toThrow();
  noWrites(tx);
});
test.each([
  { inheritedAdvanceRecovery: marker }, { sourceType: "payment" }, { isDeposit: true }, { depositSettled: true },
  { billingNo: "BILL" }, { payNo: "PAY" }, { invoiceId: "INV" }, { status: "Draft" }, { status: "Paid" }, { status: "Wait Pay" },
])("blocked source stage/ownership rejects allocation %p", async fields => {
  const tx = setup({ record: { ...source, ...fields } });
  await expect(saveAdvanceRecovery(args)).rejects.toThrow();
  noWrites(tx);
});
test("canonical inherited invoice blocks changes even without invoiceId marker", async () => {
  const tx = setup({ invoice: { sourceType: "payment" } });
  await expect(saveAdvanceRecovery(args)).rejects.toThrow();
  noWrites(tx);
});
test("zero without a recovery and exact repeat are no-ops", async () => {
  const empty = setup();
  await expect(saveAdvanceRecovery({ ...args, amount: 0 })).resolves.toBe(false);
  noWrites(empty);
  const repeated = setup({ record: { ...source, advanceRecovery: marker }, ledger: marker, balance: { ...advance, recoveredSatang: 10000 } });
  await expect(saveAdvanceRecovery(args)).resolves.toBe(false);
  noWrites(repeated);
});
test.each(["Active", "งวดงาน Pending CM", "งวดงาน Pending PM", "Reject", "Rejected", "Hold", "Wait Pay"])("reverse at Payment stage %s restores only this ledger amount", async status => {
  const tx = setup({ record: { ...source, status, advanceRecovery: marker }, ledger: marker, balance: { ...advance, recoveredSatang: 40000 } });
  await saveAdvanceRecovery({ ...args, amount: 0 });
  expect(tx.update.mock.calls[0][1]).toEqual({ advanceRecovery: null, updatedAt: expect.any(String) });
  expect(tx.update.mock.calls[1][1].recoveredSatang).toBe(30000);
  expect(tx.set.mock.calls[0][1].amountSatang).toBe(0);
  expect(tx.set.mock.calls[1][1]).toMatchObject({ type: "reversal", amountSatang: 10000 });
});
test.each(["Draft", "Invcredit"])("unbilled/unpaid Invoice %s allows reversal", async status => {
  const record = { ...source, status, poId: "po", vendorId: "vendor", advanceRecovery: marker };
  const tx = setup({ record, ledger: marker, balance: { ...advance, recoveredSatang: 10000 } });
  await expect(saveAdvanceRecovery({ ...args, documentType: "invoices", amount: 0 })).resolves.toBe(true);
  expect(tx.update.mock.calls[1][1].recoveredSatang).toBe(0);
  expect(tx.get).toHaveBeenCalledTimes(3);
  expect(canChangeAdvanceRecovery("invoices", record)).toBe(status === "Draft");
});
test.each([{ status: "Invcredit" }, { status: "Paid" }, { status: "Draft", sourceType: "payment" }])("invoice allocation requires own Draft %p", async fields => {
  const tx = setup({ record: { ...source, poId: "po", ...fields } });
  await expect(saveAdvanceRecovery({ ...args, documentType: "invoices" })).rejects.toThrow();
  noWrites(tx);
});
test.each([{ billingNo: "B" }, { payNo: "P" }, { inheritedAdvanceRecovery: marker }])("Invcredit reversal blocks billed/paid/inherited source %p", async fields => {
  const tx = setup({ record: { ...source, poId: "po", status: "Invcredit", advanceRecovery: marker, ...fields }, ledger: marker, balance: { ...advance, recoveredSatang: 10000 } });
  await expect(saveAdvanceRecovery({ ...args, documentType: "invoices", amount: 0 })).rejects.toThrow();
  noWrites(tx);
});
test("Draft invoice allocation preserves original amount/items", async () => {
  const record = { ...source, status: "Draft", poId: "po" };
  const before = JSON.stringify(record);
  const tx = setup({ record });
  await saveAdvanceRecovery({ ...args, documentType: "invoices" });
  expect(Object.keys(tx.update.mock.calls[0][1]).sort()).toEqual(["advanceRecovery", "updatedAt"]);
  expect(JSON.stringify(record)).toBe(before);
});
test("validator rejects unsafe/fractional counters and an inconsistent reversal", () => {
  [NaN, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].forEach(amount => expect(() => validateAdvanceRecovery("payments", source, advance, amount, 0)).toThrow());
  expect(() => validateAdvanceRecovery("payments", source, advance, 0, 100)).toThrow();
});

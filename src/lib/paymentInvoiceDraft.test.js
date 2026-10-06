import { collection, doc, query, where, getDocsFromServer, runTransaction } from "firebase/firestore";
import { ensurePaymentInvoiceDraft } from "./paymentInvoiceDraft";

jest.mock("firebase/firestore", () => ({
  collection: jest.fn((db, ...parts) => parts.join("/")),
  doc: jest.fn((db, ...parts) => ({ id: parts[parts.length - 1] })),
  query: jest.fn((...args) => args),
  where: jest.fn((...args) => args),
  getDocsFromServer: jest.fn(),
  runTransaction: jest.fn(),
}));
const payload = { sourceType: "payment", status: "Draft", paymentId: "payment-1", poId: "payment-1", projectId: "J-72", amount: 60000 };

beforeEach(() => {
  jest.clearAllMocks();
  collection.mockImplementation((db, ...parts) => parts.join("/"));
  doc.mockImplementation((db, ...parts) => ({ id: parts[parts.length - 1] }));
  query.mockImplementation((...args) => args);
  where.mockImplementation((...args) => args);
});

test("reuses the oldest legacy invoice including completed invoices without deleting or overwriting anything", async () => {
  const docs = [
    { id: "new-draft", data: () => ({ createdAt: "2026-09-30", status: "Draft" }) },
    { id: "old-invoice", data: () => ({ createdAt: "2026-09-19", status: "paid" }) },
  ];
  getDocsFromServer.mockResolvedValue({ docs });
  expect(await ensurePaymentInvoiceDraft({}, "app", payload)).toBe("old-invoice");
  expect(runTransaction).not.toHaveBeenCalled();
});

test("concurrent stale callers create one stable Draft and never reset its persisted data", async () => {
  getDocsFromServer.mockResolvedValue({ docs: [] });
  const stored = new Map();
  const writes = [];
  let queue = Promise.resolve();
  runTransaction.mockImplementation((db, callback) => {
    const pending = queue.then(() => callback({
      get: async (ref) => ({ exists: () => stored.has(ref.id), data: () => stored.get(ref.id) }),
      set: (ref, data) => { writes.push(ref.id); stored.set(ref.id, data); },
    }));
    queue = pending;
    return pending;
  });
  const ids = await Promise.all([
    ensurePaymentInvoiceDraft({}, "app", payload),
    ensurePaymentInvoiceDraft({}, "app", { ...payload, amount: 99999 }),
  ]);
  expect(ids).toEqual(["payment-invoice-payment-1", "payment-invoice-payment-1"]);
  expect(writes).toEqual(["payment-invoice-payment-1"]);
  expect(stored.get(ids[0]).amount).toBe(60000);
});

test("different Payment periods use different Draft ids", async () => {
  getDocsFromServer.mockResolvedValue({ docs: [] });
  runTransaction.mockImplementation((db, callback) => callback({ get: async () => ({ exists: () => false }), set: jest.fn() }));
  expect(await ensurePaymentInvoiceDraft({}, "app", payload)).toBe("payment-invoice-payment-1");
  expect(await ensurePaymentInvoiceDraft({}, "app", { ...payload, paymentId: "payment-2", poId: "payment-2" })).toBe("payment-invoice-payment-2");
});

test("server read failure aborts creation instead of assuming no invoice exists", async () => {
  getDocsFromServer.mockRejectedValue(new Error("permission-denied"));
  await expect(ensurePaymentInvoiceDraft({}, "app", payload)).rejects.toThrow("permission-denied");
  expect(runTransaction).not.toHaveBeenCalled();
});

test("skips hidden older drafts and keeps a newer paid invoice without creating a replacement", async () => {
  getDocsFromServer.mockResolvedValue({ docs: [
    { id: "old-hidden", data: () => ({ status: "Draft", createdAt: "2026-09-01", isDuplicateArchived: true, duplicateOfInvoiceId: "paid-primary" }) },
    { id: "paid-primary", data: () => ({ status: "paid", createdAt: "2026-09-29" }) },
  ] });
  expect(await ensurePaymentInvoiceDraft({}, "app", payload)).toBe("paid-primary");
  expect(runTransaction).not.toHaveBeenCalled();
});

test("hidden-only groups fail closed instead of generating another draft", async () => {
  getDocsFromServer.mockResolvedValue({ docs: [
    { id: "hidden", data: () => ({ status: "Draft", isDuplicateArchived: true, duplicateOfInvoiceId: "missing" }) },
  ] });
  await expect(ensurePaymentInvoiceDraft({}, "app", payload)).rejects.toThrow("ไม่พบใบหลัก");
  expect(runTransaction).not.toHaveBeenCalled();
});

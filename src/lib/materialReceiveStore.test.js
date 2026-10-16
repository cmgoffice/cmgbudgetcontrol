import { runTransaction } from "firebase/firestore";
import { confirmMaterialReceive, createReceiveWithMaterialGuard } from "./materialReceiveStore";
import { materialInspectionScope } from "./materialReceive";

jest.mock("firebase/firestore", () => ({
  collection: (...parts) => parts.slice(1).join("/"),
  doc: (...parts) => ({ id: "new-receive", path: parts.map(String).join("/") }),
  serverTimestamp: () => "SERVER_TIME",
  runTransaction: jest.fn(),
}));
const material = { projectId: "project-1", poType: "CR", status: "Approved", materialReceiveRequired: true, amount: 963, grandTotal: 963, items: [{ quantity: 10, price: 100, amount: 1000 }] };
const args = { db: {}, appId: "app", poId: "po-1", projectId: "project-1", certificates: [{ url: "https://example.test/cert.pdf", name: "cert.pdf" }], note: "  ผ่าน  ", userId: "user-1", userName: "ผู้รับ", expectedScope: materialInspectionScope(material) };
const mockPo = (po) => {
  const transaction = { get: jest.fn(async () => ({ exists: () => !!po, data: () => po })), update: jest.fn(), set: jest.fn() };
  runTransaction.mockImplementation(async (_db, action) => action(transaction));
  return transaction;
};
beforeEach(() => jest.clearAllMocks());

test("confirmation writes only Material metadata, never a quantity, status, amount or Receive", async () => {
  const transaction = mockPo(material);
  const before = JSON.stringify(material);
  await expect(confirmMaterialReceive(args)).resolves.toBe(true);
  expect(transaction.update.mock.calls[0][1]).toEqual({ materialReceive: { status: "passed", certificates: args.certificates, note: "ผ่าน", confirmedByUid: "user-1", confirmedByName: "ผู้รับ", confirmedAt: "SERVER_TIME" } });
  expect(transaction.set).not.toHaveBeenCalled();
  expect(JSON.stringify(material)).toBe(before);
});
test("a concurrent second confirmation preserves the first certificate and operator", async () => {
  const transaction = mockPo({ ...material, materialReceive: { status: "passed", note: "first" } });
  await expect(confirmMaterialReceive(args)).resolves.toBe(false);
  expect(transaction.update).not.toHaveBeenCalled();
});
test("reconfirmation after a queue reset preserves existing certificates and appends new uploads", async () => {
  const existing = { name: "previous.pdf", url: "https://example.test/previous.pdf" };
  const transaction = mockPo({ ...material, materialReceive: { status: "pending", certificates: [existing], note: "previous" } });
  await expect(confirmMaterialReceive(args)).resolves.toBe(true);
  expect(transaction.update.mock.calls[0][1].materialReceive.certificates).toEqual([existing, ...args.certificates]);
  expect(Object.keys(transaction.update.mock.calls[0][1])).toEqual(["materialReceive"]);
});
test.each([null, { ...material, status: "Draft" }, { ...material, projectId: "another-project" }])("rejects a stale/missing/cross-project PO without writing", async (po) => {
  const transaction = mockPo(po);
  await expect(confirmMaterialReceive(args)).rejects.toThrow();
  expect(transaction.update).not.toHaveBeenCalled();
});
test("receive opened on stale client cannot bypass a pending inspection", async () => {
  const transaction = mockPo(material);
  await expect(createReceiveWithMaterialGuard({ ...args, data: { poId: "po-1", projectId: "project-1", items: [{ receivedQty: 2, amount: 200 }] } })).rejects.toThrow("Material Received");
  expect(transaction.set).not.toHaveBeenCalled();
});
test("does not confirm quantities changed while the inspection dialog was open", async () => {
  const transaction = mockPo({ ...material, items: [{ ...material.items[0], quantity: 20 }] });
  await expect(confirmMaterialReceive(args)).rejects.toThrow("รายการ PO เปลี่ยน");
  expect(transaction.update).not.toHaveBeenCalled();
});
test.each([false, true])("preserves the exact Receive payload when allowed, material=%s", async (isMaterial) => {
  const transaction = mockPo({ ...material, materialReceiveRequired: isMaterial, materialReceive: { status: "passed" } });
  const data = { poId: "po-1", projectId: "project-1", items: [{ receivedQty: 2, amount: 200 }], note: "partial" };
  await createReceiveWithMaterialGuard({ ...args, data });
  expect(transaction.set.mock.calls[0][1]).toBe(data);
  expect(transaction.update).not.toHaveBeenCalled();
});

test("removes only selected certificates while preserving concurrently added files", async () => {
  const removed = { name: "old.pdf", url: "old" };
  const kept = { name: "concurrent.pdf", url: "concurrent" };
  const transaction = mockPo({ ...material, materialReceive: { status: "pending", certificates: [removed, kept] } });
  await expect(confirmMaterialReceive({ ...args, removedCertificateUrls: [removed.url] })).resolves.toBe(true);
  expect(transaction.update.mock.calls[0][1].materialReceive.certificates).toEqual([kept, ...args.certificates]);
});

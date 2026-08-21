import { buildPoActiveBlockedMessage, getPoActiveDependencies } from "./poActiveValidation";

test("reports PO rollback dependencies in Pay, Billing, Invoice, Receive order", () => {
  const po = { id: "po-1", poNo: "PO-001" };
  const dependencies = getPoActiveDependencies({
    po,
    invoices: [{ id: "inv-1", invNo: "INV-001", poId: po.id }],
    billings: [{ id: "bill-1", docNo: "BILL-001", invoiceIds: ["inv-1"] }],
    pays: [{ id: "pay-1", docNo: "PAY-001", billingIds: ["bill-1"] }],
    receives: [{ id: "receive-1", rpNo: "RCV-001", poNo: po.poNo }],
  });

  const message = buildPoActiveBlockedMessage(po, dependencies);
  expect(dependencies.pays).toHaveLength(1);
  expect(message.indexOf("PAY-001")).toBeLessThan(message.indexOf("BILL-001"));
  expect(message.indexOf("BILL-001")).toBeLessThan(message.indexOf("INV-001"));
  expect(message.indexOf("INV-001")).toBeLessThan(message.indexOf("RCV-001"));
});

test("returns no blocker after downstream documents are rolled back", () => {
  const po = { id: "po-1", poNo: "PO-001" };
  const dependencies = getPoActiveDependencies({ po });
  expect(buildPoActiveBlockedMessage(po, dependencies)).toBe("");
});

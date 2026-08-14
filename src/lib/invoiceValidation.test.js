import {
  getInvoiceAmountForPo,
  getPoInvoiceLimit,
  validateInvoiceAmountForPo,
} from "./billingPayUtils";

const po = {
  id: "po-1",
  poNo: "PO-001",
  discount: 100,
  items: [{ quantity: 10, price: 100, amount: 1000 }],
};

test("uses PO item subtotal after discount as the invoice limit", () => {
  expect(getPoInvoiceLimit(po)).toBe(900);
  expect(getInvoiceAmountForPo({ amount: 1000 }, po)).toBe(900);
});

test("blocks a second spent invoice that would exceed the PO", () => {
  const result = validateInvoiceAmountForPo({
    po,
    invoices: [{ id: "inv-1", poId: "po-1", amount: 1000, status: "paid" }],
    candidateAmount: 100,
    candidateStatus: "Invcredit",
  });

  expect(result.ok).toBe(false);
  expect(result.excessAmount).toBe(90);
});

test("excludes the invoice currently being edited", () => {
  const result = validateInvoiceAmountForPo({
    po,
    invoices: [{ id: "inv-1", poId: "po-1", amount: 1000, status: "paid" }],
    candidateAmount: 1000,
    candidateStatus: "paid",
    excludedInvoiceId: "inv-1",
  });

  expect(result.ok).toBe(true);
  expect(result.existingSpent).toBe(0);
});

test("does not count drafts or deposits as spent", () => {
  const result = validateInvoiceAmountForPo({
    po,
    invoices: [
      { id: "draft-1", poId: "po-1", amount: 1000, status: "Draft" },
      { id: "deposit-1", poId: "po-1", amount: 1000, status: "Deposit" },
    ],
    candidateAmount: 1000,
    candidateStatus: "Invcredit",
  });

  expect(result.ok).toBe(true);
  expect(result.existingSpent).toBe(0);
});

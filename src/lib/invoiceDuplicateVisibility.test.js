import { isHiddenDuplicateDraft, partitionInvoiceDrafts, selectPaymentInvoicePrimary } from "./invoiceDuplicateVisibility";
import { getSpentInvoiceAmountForPo } from "./billingPayUtils";

test("hiding a duplicate removes only its row/count and preserves every financial field", () => {
  const original = { id: "draft", status: "Draft", amount: 60000, poId: "payment", items: [{ quantity: 1, price: 60000, amount: 60000 }] };
  const hidden = { ...original, isDuplicateArchived: true, duplicateOfInvoiceId: "primary" };
  const primary = { ...original, id: "primary" };
  const result = partitionInvoiceDrafts([hidden, primary]);
  expect(result.visible).toEqual([primary]);
  expect(result.hidden).toEqual([hidden]);
  expect(result.hidden[0]).toBe(hidden);
  expect(hidden.items).toBe(original.items);
  expect(hidden.status).toBe("Draft");
  expect(hidden.amount).toBe(60000);
});

test("a paid invoice is never hidden and spent totals are identical before and after marking Drafts", () => {
  const po = { id: "payment", items: [{ quantity: 1, price: 60000, amount: 60000 }] };
  const paid = { id: "paid", poId: "payment", status: "paid", amount: 60000 };
  const draft = { id: "draft", poId: "payment", status: "Draft", amount: 60000 };
  const hidden = { ...draft, isDuplicateArchived: true };
  expect(getSpentInvoiceAmountForPo([paid, draft], po)).toBe(60000);
  expect(getSpentInvoiceAmountForPo([paid, hidden], po)).toBe(60000);
  expect(isHiddenDuplicateDraft({ ...paid, isDuplicateArchived: true })).toBe(false);
});

test("restoring visibility keeps the same invoice id, amount and items", () => {
  const hidden = { id: "same-id", status: "Draft", amount: 123, items: [{ amount: 123 }], isDuplicateArchived: true };
  const restored = { ...hidden, isDuplicateArchived: false };
  expect(partitionInvoiceDrafts([restored]).visible).toEqual([restored]);
  expect(restored.items).toBe(hidden.items);
  expect(restored.id).toBe(hidden.id);
  expect(restored.amount).toBe(hidden.amount);
});

test("primary selection prefers paid records, then marked primary, and ignores hidden-only records", () => {
  const old = { id: "old", status: "Draft", createdAt: "2026-09-01" };
  const selected = { id: "primary", status: "Draft", createdAt: "2026-09-29" };
  const hidden = { id: "hidden", status: "Draft", isDuplicateArchived: true, duplicateOfInvoiceId: "primary" };
  const paid = { id: "paid", status: "paid", createdAt: "2026-10-05" };
  expect(selectPaymentInvoicePrimary([old, selected, hidden])).toBe(selected);
  expect(selectPaymentInvoicePrimary([old, selected, hidden, paid])).toBe(paid);
  expect(selectPaymentInvoicePrimary([hidden])).toBeNull();
});

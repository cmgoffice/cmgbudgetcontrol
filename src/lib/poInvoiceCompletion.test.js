import { getInvoicedQtyByPoItem, isPoFullyInvoiced } from "./billingPayUtils";

// Mirrors PO26J74-CA0144: five monthly utility lines, one invoice billed three.
const po = {
  id: "po-1",
  poNo: "PO-001",
  items: [
    { quantity: 1, price: 24813.83 },
    { quantity: 1, price: 1717.66 },
    { quantity: 1, price: 1529.83 },
    { quantity: 1, price: 21442.93 },
    { quantity: 1, price: 1842.53 },
  ],
};
const line = (poItemIndex, quantity = 1) => ({ poItemIndex, quantity, price: 1, amount: quantity });

test("a partial invoice does not complete the PO", () => {
  const candidateInvoice = { items: [line(0), line(1), line(2)] };
  expect(isPoFullyInvoiced({ po, invoices: [], candidateInvoice })).toBe(false);
});

test("the remaining lines complete the PO on a second invoice", () => {
  const invoices = [{ id: "inv-1", poId: "po-1", status: "paid", items: [line(0), line(1), line(2)] }];
  expect(isPoFullyInvoiced({ po, invoices, candidateInvoice: { items: [line(3), line(4)] } })).toBe(true);
});

test("editing an invoice replaces its previous lines instead of adding to them", () => {
  const invoices = [{ id: "inv-1", poId: "po-1", status: "Draft", items: [0, 1, 2, 3, 4].map((i) => line(i)) }];
  const candidateInvoice = { items: [line(0), line(1), line(2)] };
  expect(isPoFullyInvoiced({ po, invoices, candidateInvoice, excludedInvoiceId: "inv-1" })).toBe(false);
});

test("drafts, deposits and other POs do not count as billed", () => {
  const invoices = [
    { id: "draft", poId: "po-1", status: "Draft", items: [3, 4].map((i) => line(i)) },
    { id: "deposit", poId: "po-1", status: "Deposit", items: [3, 4].map((i) => line(i)) },
    { id: "other", poId: "po-2", status: "paid", items: [3, 4].map((i) => line(i)) },
  ];
  expect(isPoFullyInvoiced({ po, invoices, candidateInvoice: { items: [line(0), line(1), line(2)] } })).toBe(false);
});

test("quantity, not price, decides whether a line is fully billed", () => {
  const qtyPo = { id: "po-q", items: [{ quantity: 30, price: 3000 }] };
  expect(isPoFullyInvoiced({ po: qtyPo, candidateInvoice: { items: [{ poItemIndex: 0, quantity: 19, price: 3000 }] } })).toBe(false);
  expect(isPoFullyInvoiced({ po: qtyPo, candidateInvoice: { items: [{ poItemIndex: 0, quantity: 30, price: 2900 }] } })).toBe(true);
});

test("legacy invoices without line detail keep the previous behaviour", () => {
  const invoices = [{ id: "legacy", poId: "po-1", status: "paid", amount: 100 }];
  expect(getInvoicedQtyByPoItem(invoices, po)).toBeNull();
  expect(isPoFullyInvoiced({ po, invoices, candidateInvoice: { items: [line(0)] } })).toBe(true);
});

test("sums billed quantity per PO line for the remaining-quantity default", () => {
  const invoices = [
    { id: "a", poId: "po-1", status: "Invcredit", items: [line(0), line(3)] },
    { id: "b", poNo: "PO-001", status: "paid", items: [line(3)] },
  ];
  const quantities = getInvoicedQtyByPoItem(invoices, po);
  expect(quantities.get(0)).toBe(1);
  expect(quantities.get(3)).toBe(2);
  expect(quantities.has(4)).toBe(false);
});

import { deductAdvanceRecovery, hasOwnAdvanceRecovery, inheritedRecoveryFromPayment, recoverySatang, sumInvoiceAdvanceRecovery, sumBillingAdvanceRecovery, invoiceRecoveryAmountsUnchanged } from "./advanceRecovery";

test("legacy arithmetic is unchanged and full recovery yields zero", () => {
  expect(deductAdvanceRecovery(107.123456, 0)).toBe(107.123456);
  expect(deductAdvanceRecovery(107 - 3 - 5, 20)).toBe(79);
  expect(deductAdvanceRecovery(99, 99)).toBe(0);
  expect(() => deductAdvanceRecovery(99, 99.01)).toThrow();
});

test("one inherited ledger allocation is counted once across duplicate invoice selections", () => {
  const inheritedAdvanceRecovery = { paymentId: "p1", advanceId: "a1", amountSatang: 10000 };
  expect(sumInvoiceAdvanceRecovery([
    { id: "i1", inheritedAdvanceRecovery }, { id: "i1", inheritedAdvanceRecovery },
    { id: "i2", inheritedAdvanceRecovery },
    { id: "i3", advanceRecovery: { advanceId: "a1", amountSatang: 2500 } },
  ])).toBe(125);
  expect(sumInvoiceAdvanceRecovery([{ id: "legacy", amount: 1000 }])).toBe(0);
});

test("invalid or inconsistent recovery metadata fails closed", () => {
  for (const amountSatang of [-1, 0, 1.5, NaN, Infinity, "100"]) {
    expect(() => recoverySatang({ advanceId: "a", amountSatang })).toThrow();
  }
  expect(() => sumInvoiceAdvanceRecovery([
    { id: "i", advanceRecovery: { advanceId: "a", amountSatang: 100 } },
    { id: "i", advanceRecovery: { advanceId: "a", amountSatang: 200 } },
  ])).toThrow("Conflicting");
});

test("inheritance carries only the live own allocation and never becomes an own allocation", () => {
  const marker = inheritedRecoveryFromPayment({ id: "p", advanceRecovery: { advanceId: "a", amountSatang: 500 } });
  expect(marker).toEqual({ paymentId: "p", advanceId: "a", amountSatang: 500 });
  expect(hasOwnAdvanceRecovery({ inheritedAdvanceRecovery: marker })).toBe(false);
  expect(inheritedRecoveryFromPayment({ id: "p" })).toBeNull();
});

test("legacy missing invoice links do not block Pay, recovery-bearing Billing must match loaded invoices", () => {
  expect(sumBillingAdvanceRecovery([{ invoiceIds: ["missing"] }], [])).toBe(0);
  const billing = { invoiceIds: ["i"], advanceRecoveryAmount: 100 };
  expect(() => sumBillingAdvanceRecovery([billing], [])).toThrow();
  expect(() => sumBillingAdvanceRecovery([billing], [{ id: "i" }])).toThrow();
  const invoice = { id: "i", advanceRecovery: { advanceId: "a", amountSatang: 10000 } };
  expect(sumBillingAdvanceRecovery([billing, billing], [invoice])).toBe(100);
});

test("recovered Invoice may finalize unchanged, but cannot change amount, quantities or prices", () => {
  const saved = { amount: 0.3, items: [{ quantity: 1, price: 0.3 }] };
  const selected = [{ invoiceQty: 1, price: 0.3, description: "", materialNo: "", unit: "" }];
  expect(invoiceRecoveryAmountsUnchanged(saved, selected, 0.1 + 0.2)).toBe(true);
  expect(invoiceRecoveryAmountsUnchanged(saved, selected, 0.29)).toBe(false);
  expect(invoiceRecoveryAmountsUnchanged(saved, [{ ...selected[0], invoiceQty: 2, price: 0.15 }], 0.3)).toBe(false);
});

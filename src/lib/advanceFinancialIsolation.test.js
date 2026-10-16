import { getInvoiceAmount, getInvoiceAmountForPo, getSpentInvoiceAmountForPo, validateInvoiceAmountForPo } from "./billingPayUtils";
import { getPaymentAccumulatedNetAmount } from "./poPaymentBalance";
import { getPoAmountExVat, getPaymentNetPeriodAmount } from "./poDiscount";
import { validatePaymentInvoiceAmount } from "./paymentInvoice";
import { getAdvancePoBalance } from "./advancePayment";
import { deductAdvanceRecovery, sumInvoiceAdvanceRecovery } from "./advanceRecovery";

const po = { id: "po", poNo: "PO-001", projectId: "project", discount: 1000, items: [{ quantity: 1, price: 10000, amount: 10000 }] };
const payment = {
  id: "payment", selectedPrIds: ["po"], status: "Active", periodNo: "1",
  amount: 4500, netPeriodAmount: 4500, grossPeriodAmount: 5000,
  discountAllocationVersion: 1, thisPeriodDiscount: 500, discountAppliedAmount: 500,
  items: [{ prevAccumAmount: 0, thisPeriodAmount: 5000 }],
};
const invoice = { id: "invoice", projectId: "project", poId: "po", amount: 5000, status: "Invcredit", items: [{ quantity: 1, price: 5000 }] };
const marker = { advanceId: "advance", amountSatang: 100000 };

test("recovery metadata preserves the PO value, Payment work balance and period discount", () => {
  const withAdvance = { ...payment, advanceRecovery: marker };
  expect(getPoAmountExVat(po)).toBe(9000);
  expect(getPaymentAccumulatedNetAmount(withAdvance)).toBe(getPaymentAccumulatedNetAmount(payment));
  expect(getPaymentNetPeriodAmount(withAdvance)).toBe(getPaymentNetPeriodAmount(payment));
  expect(getAdvancePoBalance(po, [withAdvance])).toBe(getAdvancePoBalance(po, [payment]));
  expect(getAdvancePoBalance(po, [withAdvance])).toBe(4500);
});

test("recovery does not reduce invoice spent/PO validation bases", () => {
  const withAdvance = { ...invoice, advanceRecovery: marker };
  expect(getInvoiceAmount(withAdvance)).toBe(5000);
  expect(getInvoiceAmountForPo(withAdvance, po)).toBe(4500);
  expect(getSpentInvoiceAmountForPo([withAdvance], po)).toBe(getSpentInvoiceAmountForPo([invoice], po));
  const validate = row => validateInvoiceAmountForPo({ invoices: [row], po, candidateAmount: 6000, candidateStatus: "paid" });
  expect(validate(withAdvance)).toEqual(validate(invoice));
  expect(validate(withAdvance).ok).toBe(false);
});

test("Payment invoice inheritance keeps line validation and only reduces final cash after other deductions", () => {
  const inherited = { ...invoice, amount: 4500, inheritedAdvanceRecovery: { ...marker, paymentId: payment.id } };
  expect(validatePaymentInvoiceAmount(payment, [{ invoiceQty: 1, price: 4500 }], inherited.amount)).toBe(true);
  const vat = inherited.amount * 0.07;
  const wht = inherited.amount * 0.03;
  const retention = inherited.amount * 0.05;
  const legacyNet = inherited.amount + vat - wht - retention;
  expect(deductAdvanceRecovery(legacyNet, sumInvoiceAdvanceRecovery([inherited]))).toBe(3455);
  expect(deductAdvanceRecovery(legacyNet, sumInvoiceAdvanceRecovery([invoice]))).toBe(legacyNet);
  expect(inherited.amount).toBe(4500);
});

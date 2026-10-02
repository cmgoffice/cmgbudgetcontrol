import { buildPaymentInvoiceFormItems, validatePaymentInvoiceAmount } from "./paymentInvoice";
import { appendPaymentDiscountAdjustment } from "./poDiscount";

const source = {
  isPaymentSubcontract: true,
  amount: 60000,
  items: [
    { poItemIndex: 0, quantity: 80, price: 150, amount: 12000 },
    { poItemIndex: 1, quantity: 40, price: 1200, amount: 48000 },
    { poItemIndex: 2, quantity: 0, price: 150, amount: 0 },
  ],
};
const draft = { items: source.items.map((item) => ({ ...item, quantity: 1, invoiceQty: 1, price: item.amount })) };
const total = (items) => items.reduce((sum, item) => sum + item.invoiceQty * item.price, 0);

test("opening the actual 60,000-baht Draft shape never multiplies progress quantities by period amounts", () => {
  const form = buildPaymentInvoiceFormItems(source, draft);
  expect(total(form)).toBe(60000);
  expect(form.map((item) => item.invoiceQty)).toEqual([1, 1, 1]);
  const reopened = buildPaymentInvoiceFormItems(source, { items: form.map((item) => ({ ...item, quantity: item.invoiceQty })) });
  expect(total(reopened)).toBe(60000);
  expect(validatePaymentInvoiceAmount(source, reopened, 60000)).toBe(true);
});

test("saved invoices retain their own quantities, prices and lines after Payment changes", () => {
  const saved = { items: [{ poItemIndex: 0, quantity: 80, price: 150, amount: 12000 }] };
  const form = buildPaymentInvoiceFormItems({ ...source, items: [{ quantity: 999, price: 999 }] }, saved);
  expect(form).toHaveLength(1);
  expect(total(form)).toBe(12000);
  expect(saved.items[0].quantity).toBe(80);
});

test("new Payment invoices use approved period amounts even when amount differs from quantity times contract price", () => {
  const payment = { ...source, amount: 2000, items: [{ quantity: 10, price: 100, amount: 2000 }] };
  const form = buildPaymentInvoiceFormItems(payment);
  expect(total(form)).toBe(2000);
  expect(validatePaymentInvoiceAmount(payment, form, 2000)).toBe(true);
});

test("Payment discounts remain negative lines and zero-progress lines stay zero", () => {
  const discounted = { items: appendPaymentDiscountAdjustment(draft.items, 6000, "PR-1") };
  const form = buildPaymentInvoiceFormItems(source, discounted);
  expect(total(form)).toBe(54000);
  expect(form[2].price).toBe(0);
  expect(form[3].price).toBe(-6000);
  expect(validatePaymentInvoiceAmount({ ...source, amount: 54000 }, form, 54000)).toBe(true);
});

test("Payment amount validation blocks inflated lines, even for deposits or unchanged historical amounts", () => {
  const inflated = draft.items.map((item, index) => ({ ...item, invoiceQty: [80, 40, 0][index] }));
  expect(total(inflated)).toBe(2880000);
  expect(validatePaymentInvoiceAmount(source, inflated, 2880000)).toBe(false);
  expect(validatePaymentInvoiceAmount(source, inflated, 1000)).toBe(false);
  const form = buildPaymentInvoiceFormItems(source, draft);
  expect(validatePaymentInvoiceAmount(source, form, 10000)).toBe(true);
  expect(validatePaymentInvoiceAmount(source, form, 50000)).toBe(true);
  expect(validatePaymentInvoiceAmount(source, form, 60001)).toBe(false);
  expect(validatePaymentInvoiceAmount(source, [{ invoiceQty: NaN, price: 1 }], 1)).toBe(false);
});

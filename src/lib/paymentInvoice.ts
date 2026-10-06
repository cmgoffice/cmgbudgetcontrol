/** Payment invoice lines use their saved quantity/price together, never a
 * Payment progress quantity combined with an invoice period amount. */
export const buildPaymentInvoiceFormItems = (source: any, invoice?: any) => {
  const savedItems = Array.isArray(invoice?.items) ? invoice.items : [];
  const hasSavedItems = savedItems.length > 0;
  const items = hasSavedItems ? savedItems : (source?.items || []);
  return items.map((item: any, index: number) => {
    const quantity = hasSavedItems ? Number(item.quantity ?? item.invoiceQty ?? 1) : 1;
    const amount = Number(item.amount ?? 0);
    return {
      ...item,
      poItemIndex: item.poItemIndex ?? index,
      quantity,
      invoiceQty: quantity,
      price: hasSavedItems ? Number(item.price ?? (quantity > 0 ? amount / quantity : 0)) : amount,
      checked: true,
    };
  });
};

/** Validate only the Payment invoice path; shared PO/budget formulas stay intact. */
export const validatePaymentInvoiceAmount = (source: any, items: any[], totalAmount: number) => {
  const lineTotal = items.reduce((sum, item) => sum + Number(item.invoiceQty) * Number(item.price), 0);
  const periodAmount = Number(source?.amount);
  return Number.isFinite(lineTotal) && Number.isFinite(periodAmount) && Number.isFinite(totalAmount) &&
    totalAmount >= 0 && lineTotal >= 0 &&
    totalAmount <= lineTotal + 0.01 && Math.abs(lineTotal - periodAmount) <= 0.01;
};

// Visibility metadata is deliberately independent of financial status/amounts.
export const isHiddenDuplicateDraft = (invoice: any): boolean =>
  invoice?.status === "Draft" && invoice?.isDuplicateArchived === true;

export const partitionInvoiceDrafts = (invoices: any[]) => {
  const visible: any[] = [];
  const hidden: any[] = [];
  for (const invoice of invoices || []) {
    if (invoice?.status !== "Draft") continue;
    (isHiddenDuplicateDraft(invoice) ? hidden : visible).push(invoice);
  }
  return { visible, hidden };
};

/** Prefer recorded invoices, then an explicitly identified active primary,
 * then an ordinary Draft. Hidden-only groups must not trigger new creation. */
export const selectPaymentInvoicePrimary = (invoices: any[]) => {
  const hidden = (invoices || []).filter(isHiddenDuplicateDraft);
  const primaryIds = new Set(hidden.map((i) => String(i.duplicateOfInvoiceId || "")).filter(Boolean));
  return (invoices || []).filter((i) => !isHiddenDuplicateDraft(i)).sort((a, b) => (
    Number(b.status !== "Draft") - Number(a.status !== "Draft") ||
    Number(primaryIds.has(String(b.id))) - Number(primaryIds.has(String(a.id))) ||
    String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
    String(a.id).localeCompare(String(b.id))
  ))[0] || null;
};

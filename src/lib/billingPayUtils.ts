export const isPaidStatus = (value: any) => String(value || "").trim().toLowerCase() === "paid";

export const isPaidInvoiceRecord = (invoice: any) => {
  if (isPaidStatus(invoice?.status) || isPaidStatus(invoice?.statusNow)) return true;
  const paymentType = String(invoice?.paymentType || "").trim();
  if (["เงินสด", "โอน", "เช็ค"].includes(paymentType)) return true;
  return false;
};

export const normalizeIdList = (ids: any) =>
  Array.isArray(ids) ? ids.map(String) : typeof ids === "string" ? ids.split(",").map((s) => s.trim()) : [];

export const getProjectPayHistoryTotal = (projectId: string, invoices: any[], payments: any[], pos: any[]) => {
  if (!projectId) return 0;

  const projectPoNos = new Set(
    pos.filter((po: any) => po.projectId === projectId).map((po: any) => po.poNo).filter(Boolean)
  );

  const paidInvoiceHistoryRows = invoices
    .filter((invoice: any) => {
      const invoiceProjectId =
        invoice?.projectId ||
        pos.find((po: any) => String(po.id) === String(invoice?.poId || ""))?.projectId ||
        "";
      
      const belongsToProject = 
        invoiceProjectId === projectId || 
        projectPoNos.has(invoice?.poRef) || 
        projectPoNos.has(invoice?.poNo);

      return belongsToProject && isPaidInvoiceRecord(invoice);
    })
    .map((invoice: any) => ({
      invoiceId: invoice.id,
      amount: Number(invoice.amount) || (Number(invoice.invoiceQty || 0) * Number(invoice.price || 0)) || 0,
    }));

  const projectPayments = payments.filter((p: any) => p.projectId === projectId);
  const payDocs = projectPayments.filter((row: any) => isPaidStatus(row.status));
  
  const paidInvoiceIds = new Set(
    paidInvoiceHistoryRows
      .map((row: any) => String(row?.invoiceId || ""))
      .filter(Boolean)
  );

  const orphanPayDocs = payDocs.filter((row: any) => {
    const linkedInvoiceIds = normalizeIdList(row.invoiceIds || []);
    const hasLinkedPaidInvoice = linkedInvoiceIds.some((invoiceId) => paidInvoiceIds.has(invoiceId));
    const hasInvoiceByPayNo = (invoices || []).some((invoice: any) => (
      isPaidInvoiceRecord(invoice) &&
      String(invoice?.payNo || "") === String(row?.docNo || "")
    ));
    return !hasLinkedPaidInvoice && !hasInvoiceByPayNo;
  }).map((row: any) => ({
    amount: Number(row.amount) || 0,
  }));

  const totalPaidInvoices = paidInvoiceHistoryRows.reduce((sum, row) => sum + row.amount, 0);
  const totalOrphanPays = orphanPayDocs.reduce((sum, row) => sum + row.amount, 0);

  return totalPaidInvoices + totalOrphanPays;
};

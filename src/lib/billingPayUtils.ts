export const isPaidStatus = (value: any) => String(value || "").trim().toLowerCase() === "paid";

export const isSpentInvoiceStatus = (value: any) => {
  const status = String(value || "").trim().toLowerCase();
  return status === "paid" || status === "invcredit";
};

export const isSpentInvoiceRecord = (invoice: any) =>
  isSpentInvoiceStatus(invoice?.status) || isSpentInvoiceStatus(invoice?.statusNow);

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

      return belongsToProject && isSpentInvoiceRecord(invoice);
    })
    .map((invoice: any) => ({
      invoiceId: invoice.id,
      amount: Number(invoice.amount) || (Number(invoice.invoiceQty || 0) * Number(invoice.price || 0)) || 0,
    }));

  const totalPaidInvoices = paidInvoiceHistoryRows.reduce((sum, row) => sum + row.amount, 0);
  return totalPaidInvoices;
};

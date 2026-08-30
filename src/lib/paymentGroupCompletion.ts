export const isPaidPaymentStatus = (status: unknown): boolean =>
  String(status || "").trim().toLowerCase() === "paid";

export const isPaymentJobCompleted = (payment: any): boolean =>
  payment?.jobCompleted === true
  || String(payment?.status || "").trim() === "จบงาน"
  || String(payment?.jobStatus || "").trim() === "จบงาน";

export const canCompletePaymentGroup = (payments: any[]): boolean => {
  if (!Array.isArray(payments) || payments.length === 0) return false;
  if (payments.some(isPaymentJobCompleted)) return false;
  return payments.every((payment) => isPaidPaymentStatus(payment?.status));
};

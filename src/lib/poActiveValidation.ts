import { getPoNumberVariants } from "./poPaymentBalance";

const text = (value: any) => String(value || "").trim();
const same = (left: any, right: any) => Boolean(text(left)) && text(left) === text(right);
const unique = (values: any[]) => Array.from(new Set(values.map(text).filter(Boolean)));

const documentNo = (record: any, fields: string[]) => {
  for (const field of fields) {
    const value = text(record?.[field]);
    if (value) return value;
  }
  return text(record?.id) || "-";
};

export type PoActiveDependencies = {
  invoices: any[];
  billings: any[];
  pays: any[];
  receives: any[];
};

export const getPoActiveDependencies = ({
  po,
  invoices = [],
  billings = [],
  pays = [],
  receives = [],
}: {
  po: any;
  invoices?: any[];
  billings?: any[];
  pays?: any[];
  receives?: any[];
}): PoActiveDependencies => {
  const poId = text(po?.id);
  const poNumbers = getPoNumberVariants(po);
  const matchesPoReference = (record: any) => (
    (poId && same(record?.poId, poId)) ||
    poNumbers.some((number) => [record?.poNo, record?.poRef].some((value) => same(value, number)))
  );

  const relatedInvoices = invoices.filter(matchesPoReference);
  const invoiceIds = new Set(relatedInvoices.map((invoice) => text(invoice?.id)).filter(Boolean));
  const invoiceNos = new Set(relatedInvoices.flatMap((invoice) => [invoice?.invNo, invoice?.docNo, invoice?.id].map(text)).filter(Boolean));

  const relatedBillings = billings.filter((billing) => (
    matchesPoReference(billing) ||
    (Array.isArray(billing?.invoiceIds) && billing.invoiceIds.some((id: any) => invoiceIds.has(text(id)))) ||
    (Array.isArray(billing?.invoiceRefs) && billing.invoiceRefs.some((ref: any) => invoiceNos.has(text(ref)))) ||
    (Array.isArray(billing?.invoices) && billing.invoices.some((invoice: any) => (
      invoiceIds.has(text(invoice?.id)) || poNumbers.some((number) => same(invoice?.poNo, number))
    )))
  ));
  const billingIds = new Set(relatedBillings.map((billing) => text(billing?.id)).filter(Boolean));
  const billingNos = new Set(relatedBillings.flatMap((billing) => [billing?.docNo, billing?.billingNo, billing?.id].map(text)).filter(Boolean));

  const relatedPays = pays.filter((pay) => (
    matchesPoReference(pay) ||
    (Array.isArray(pay?.billingIds) && pay.billingIds.some((id: any) => billingIds.has(text(id)))) ||
    (Array.isArray(pay?.billingRefs) && pay.billingRefs.some((ref: any) => billingNos.has(text(ref)))) ||
    (Array.isArray(pay?.invoiceIds) && pay.invoiceIds.some((id: any) => invoiceIds.has(text(id)))) ||
    (Array.isArray(pay?.invoiceRefs) && pay.invoiceRefs.some((ref: any) => invoiceNos.has(text(ref))))
  ));

  return {
    invoices: relatedInvoices,
    billings: relatedBillings,
    pays: relatedPays,
    receives: receives.filter(matchesPoReference),
  };
};

export const buildPoActiveBlockedMessage = (po: any, dependencies: PoActiveDependencies) => {
  const payNos = unique(dependencies.pays.map((record) => documentNo(record, ["docNo", "payNo"])));
  const billingNos = unique(dependencies.billings.map((record) => documentNo(record, ["docNo", "billingNo"])));
  const invoiceNos = unique(dependencies.invoices.map((record) => documentNo(record, ["invNo", "docNo"])));
  const receiveNos = unique(dependencies.receives.map((record) => documentNo(record, ["rpNo", "receiveNo", "docNo"])));
  const steps: string[] = [];

  if (payNos.length) steps.push(`1. ลบ Pay ก่อน: ${payNos.join(", ")}`);
  if (billingNos.length) steps.push(`${steps.length + 1}. ลบ Billing: ${billingNos.join(", ")}`);
  if (invoiceNos.length) steps.push(`${steps.length + 1}. ลบ Invoice: ${invoiceNos.join(", ")}`);
  if (receiveNos.length) steps.push(`${steps.length + 1}. ลบ Receive: ${receiveNos.join(", ")}`);

  if (!steps.length) return "";
  return [
    `PO ${po?.poNo || po?.id || "-"} ยังมีเอกสารที่ผูกอยู่ จึงยัง Active ไม่ได้`,
    "",
    "กรุณา Roll Back ทีละขั้นตามลำดับ ห้ามลบข้ามขั้น:",
    ...steps,
    "",
    "เมื่อลบเอกสารข้างต้นครบแล้วจึงกลับมากด Active PO อีกครั้ง",
  ].join("\n");
};


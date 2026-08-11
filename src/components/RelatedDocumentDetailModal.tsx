// @ts-nocheck
import React from "react";
import {
  ClipboardList,
  DollarSign,
  FileOutput,
  FileText,
  Package,
  Paperclip,
  XCircle,
} from "lucide-react";
import { Badge, formatCurrency } from "./ui";

const TYPE_CONFIG = {
  pr: { title: "รายละเอียด PR", icon: ClipboardList, color: "blue" },
  payment: { title: "รายละเอียด Payment", icon: DollarSign, color: "orange" },
  receive: { title: "รายละเอียด Receive", icon: Package, color: "emerald" },
  invoice: { title: "รายละเอียด INV", icon: FileText, color: "violet" },
  pay: { title: "รายละเอียด PAY", icon: FileOutput, color: "cyan" },
};

const HEADER_CLASSES = {
  blue: "from-blue-700 to-blue-900",
  orange: "from-orange-700 to-orange-900",
  emerald: "from-emerald-700 to-emerald-900",
  violet: "from-violet-700 to-violet-900",
  cyan: "from-cyan-700 to-cyan-900",
};

const getDocumentNo = (type, doc) => {
  if (!doc) return "-";
  if (type === "pr") return doc.prNo || doc.docNo || doc.id || "-";
  if (type === "payment") return doc.paymentNo || doc.docNo || doc.id || "-";
  if (type === "receive") return doc.rpNo || doc.receiveNo || doc.docNo || doc.id || "-";
  if (type === "invoice") return doc.invNo || doc.docNo || doc.id || "-";
  return doc.docNo || doc.payNo || doc.id || "-";
};

const getPdfUrl = (doc) => (
  doc?.pdfUrl ||
  doc?.attachmentUrl ||
  doc?.paySlipUrl?.url ||
  doc?.paySlipUrl ||
  doc?.slipUrl ||
  doc?.paymentAttachments?.find?.((att) => att?.url)?.url ||
  doc?.attachments?.find?.((att) => att?.url)?.url ||
  ""
);

const getItems = (type, doc) => {
  if (Array.isArray(doc?.items)) return doc.items;
  if (type === "pay" && Array.isArray(doc?.invoices)) return doc.invoices;
  return [];
};

const getItemDescription = (item) => (
  item?.description || item?.itemDescription || item?.name || item?.materialName || "-"
);

const getItemAmount = (type, item) => {
  if (type === "payment") {
    return Number(item?.thisPeriodAmount || 0) || Number(item?.contractAmount || 0) || 0;
  }
  return Number(item?.amount || 0) || (Number(item?.quantity || item?.receivedQty || 0) * Number(item?.price || 0));
};

const getAttachments = (doc) => {
  const attachments = [];
  if (Array.isArray(doc?.attachments)) attachments.push(...doc.attachments);
  if (Array.isArray(doc?.paymentAttachments)) attachments.push(...doc.paymentAttachments);
  if (doc?.attachmentUrl) attachments.push({ url: doc.attachmentUrl, name: doc.attachmentName });
  if (doc?.paySlipUrl) {
    const slip = typeof doc.paySlipUrl === "object" ? doc.paySlipUrl : { url: doc.paySlipUrl };
    attachments.push({ ...slip, name: slip.name || doc.paySlipName || "Pay slip" });
  }
  return attachments.filter((attachment, index, list) => (
    attachment?.url && list.findIndex((item) => item.url === attachment.url) === index
  ));
};

const valueOrDash = (value) => value === 0 ? "0" : (value || "-");

export default function RelatedDocumentDetailModal({ documentType, document, onClose }) {
  if (!document) return null;

  const config = TYPE_CONFIG[documentType] || TYPE_CONFIG.pr;
  const Icon = config.icon;
  const docNo = getDocumentNo(documentType, document);
  const items = getItems(documentType, document);
  const attachments = getAttachments(document);
  const pdfUrl = getPdfUrl(document);
  const total = Number(
    document.totalAmount ||
    document.grandTotal ||
    document.amount ||
    items.reduce((sum, item) => sum + getItemAmount(documentType, item), 0)
  ) || 0;

  const detailsByType = {
    pr: [
      ["PR No.", docNo],
      ["Request date", document.requestDate || document.createdAt],
      ["Requestor", document.requestor],
      ["Cost Code", document.costCode],
      ["Purchase type", document.purchaseType],
      ["Urgency", document.urgency],
      ["Delivery location", document.deliveryLocation],
    ],
    payment: [
      ["Payment No.", docNo],
      ["Project", document.projectName || document.projectId],
      ["Contractor", document.contractorName || document.vendorName],
      ["Contract title", document.contractTitle],
      ["Payment type", document.paymentType],
      ["Period", document.periodNo],
      ["Date", document.openDate || document.createdAt],
    ],
    receive: [
      ["Receive No.", docNo],
      ["Receive date", document.receivedDate || document.receiveDate || document.createdAt],
      ["Vendor", document.vendorName],
      ["PO No.", document.poNo || document.poRef],
      ["PR No.", document.prNo],
      ["Document No.", document.documentNo],
      ["Received by", document.receivedByName],
    ],
    invoice: [
      ["Invoice No.", docNo],
      ["Invoice date", document.invDate || document.invoiceDate || document.createdAt],
      ["Vendor", document.vendorName],
      ["PO No.", document.poNo || document.poRef],
      ["Payment type", document.paymentType],
      ["Bank account", document.bankAccountNo],
      ["Deposit", document.isDeposit ? formatCurrency(document.depositAmount || 0) : "No"],
    ],
    pay: [
      ["Pay No.", docNo],
      ["Pay date", document.docDate || document.payDate || document.createdAt],
      ["Vendor", document.vendorName],
      ["PO No.", document.poRef || document.poNo],
      ["Payment type", document.paymentType],
      ["Due date", document.dueDate],
      ["Description", document.description],
    ],
  };

  const details = detailsByType[documentType] || detailsByType.pr;
  const itemColumns = documentType === "payment"
    ? ["Description", "Contract qty", "This period qty", "This period amount"]
    : ["Description", "Quantity", "Unit", "Amount"];

  return (
    <div
      className="fixed inset-0 z-[10030] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`px-6 py-4 bg-gradient-to-r ${HEADER_CLASSES[config.color]} flex items-center justify-between shrink-0`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
              <Icon size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">{config.title}</h3>
              <p className="text-white/70 text-xs mt-0.5">{docNo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge status={document.status || document.statusNow || "-"} />
            <button type="button" onClick={onClose} className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all">
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {details.map(([label, value]) => (
              <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 min-w-0">
                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
                <p className="font-semibold text-slate-700 break-words">{valueOrDash(value)}</p>
              </div>
            ))}
            <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Total</p>
              <p className="font-bold text-slate-800">{formatCurrency(total)}</p>
            </div>
          </div>

          {items.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">Line items</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[620px]">
                  <thead className="bg-slate-100 text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-center w-12">#</th>
                      {itemColumns.map((column) => <th key={column} className="px-3 py-2 text-left">{column}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, index) => (
                      <tr key={item?.id || index}>
                        <td className="px-3 py-2 text-center text-slate-400">{index + 1}</td>
                        <td className="px-3 py-2 font-medium text-slate-700">{getItemDescription(item)}</td>
                        {documentType === "payment" ? (
                          <>
                            <td className="px-3 py-2 text-right">{valueOrDash(item?.contractQty)}</td>
                            <td className="px-3 py-2 text-right">{valueOrDash(item?.thisPeriodQty)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(getItemAmount(documentType, item))}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-right">{valueOrDash(item?.quantity || item?.receivedQty)}</td>
                            <td className="px-3 py-2">{valueOrDash(item?.unit)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(getItemAmount(documentType, item))}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(document.note || document.remark) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
              <span className="font-bold">Note:</span> {document.note || document.remark}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs">
              <p className="font-bold text-slate-700 flex items-center gap-1.5 mb-2"><Paperclip size={13} /> Attachments</p>
              <div className="space-y-1">
                {attachments.map((attachment, index) => (
                  <a key={`${attachment.url}-${index}`} href={attachment.url} target="_blank" rel="noopener noreferrer" className="block text-blue-700 underline truncate">
                    {attachment.name || `Attachment ${index + 1}`}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
          {pdfUrl ? (
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700">
              <FileOutput size={14} /> Open PDF
            </a>
          ) : <span />}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-100">Close</button>
        </div>
      </div>
    </div>
  );
}

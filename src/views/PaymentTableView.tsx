// @ts-nocheck
import React, { useState, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  Search, CreditCard, FileSpreadsheet, Paperclip,
  Trash2, Eye, Filter,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { Card, Badge, formatCurrency } from "../components/ui";

const PaymentTableView = React.memo(() => {
  const {
    payments = [],
    vendors,
    projects,
    visibleProjects,
    openConfirm,
    showAlert,
    deleteData,
    logAction,
    canUseFunction,
    userRole,
    isColumnVisible,
  } = useAppData();

  const { selectedProjectId } = useUI();

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterProject, setFilterProject] = useState(selectedProjectId || "all");
  const [viewingPayment, setViewingPayment] = useState<any>(null);

  React.useEffect(() => {
    setFilterProject(selectedProjectId || "all");
  }, [selectedProjectId]);

  const allStatuses = ["Draft", "Pending", "Approved", "Rejected", "Paid"];

  const filtered = useMemo(() => {
    const q = searchTerm.toLowerCase();
    return payments.filter((p: any) => {
      const contractor = vendors?.find((v: any) => v.id === p.contractorId);
      const matchSearch =
        !q ||
        (p.paymentNo || "").toLowerCase().includes(q) ||
        (p.paymentType || "").toLowerCase().includes(q) ||
        (contractor?.name || "").toLowerCase().includes(q) ||
        (p.billingCycle || "").toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || p.status === filterStatus;
      const matchType = filterType === "all" || p.paymentType === filterType;
      const matchProject = filterProject === "all" || p.projectId === filterProject;
      return matchSearch && matchStatus && matchType && matchProject;
    });
  }, [payments, vendors, searchTerm, filterStatus, filterType, filterProject]);

  const statusColors: Record<string, string> = {
    "Draft": "bg-slate-50 text-slate-500 border-slate-200",
    "Pending": "bg-amber-50 text-amber-700 border-amber-200",
    "Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Paid": "bg-teal-50 text-teal-700 border-teal-200",
  };

  const handleDelete = (p: any) => {
    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ Payment ${p.paymentNo} ใช่หรือไม่?`,
      async () => {
        await deleteData("payments", p.id, { skipLog: true });
        await logAction?.("Delete Payment", `ลบ Payment ${p.paymentNo}`);
        showAlert?.("สำเร็จ", "ลบ Payment เรียบร้อย", "success");
      },
      "danger"
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm bg-orange-600">
            <FileSpreadsheet size={18} className="text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">Payment Subcontractor</h2>
              <ColumnVisibilityToggle tableId="payment-table" />
            </div>
            <p className="text-xs text-slate-500">
              {filtered.length} รายการ{filterStatus !== "all" ? ` (${filterStatus})` : " ทั้งหมด"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหา Payment No., ผู้รับเหมา..."
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white w-52 focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">ทุก Type</option>
            <option value="DL">DL — จ้างเหมา</option>
            <option value="DC">DC — ค่าแรง</option>
          </select>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="all">ทุก Status</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-orange-300 cursor-pointer"
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
          >
            <option value="all">ทุกโครงการ</option>
            {visibleProjects.map((proj: any) => (
              <option key={proj.id} value={proj.id}>{proj.name || proj.id}</option>
            ))}
          </select>

        </div>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto w-full">
        <table className="w-full text-left text-xs text-slate-600 min-w-[800px]">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold border-b border-slate-200">
            <tr>
              {isColumnVisible("payment-table", "paymentNo") && <th className="py-2.5 px-3 w-40">Payment No.</th>}
              {isColumnVisible("payment-table", "type") && <th className="py-2.5 px-3 text-center w-20">Type</th>}
              {isColumnVisible("payment-table", "contractor") && <th className="py-2.5 px-3">ผู้รับเหมา</th>}
              {isColumnVisible("payment-table", "billingCycle") && <th className="py-2.5 px-3 w-36">รอบวางบิล</th>}
              {isColumnVisible("payment-table", "openDate") && <th className="py-2.5 px-3 w-28">วันที่เปิด</th>}
              {isColumnVisible("payment-table", "amount") && <th className="py-2.5 px-3 text-right w-32">ยอดรวม</th>}
              {isColumnVisible("payment-table", "attachment") && <th className="py-2.5 px-3 text-center w-24">เอกสาร</th>}
              {isColumnVisible("payment-table", "status") && <th className="py-2.5 px-3 text-center w-28">Status</th>}
              {isColumnVisible("payment-table", "actions") && <th className="py-2.5 px-3 text-right w-24">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={["paymentNo", "type", "contractor", "billingCycle", "openDate", "amount", "attachment", "status", "actions"].filter(k => isColumnVisible("payment-table", k)).length} className="py-12 text-center text-slate-400 text-sm">
                  ไม่พบรายการ Payment ที่ตรงกับเงื่อนไข
                </td>
              </tr>
            ) : (
              filtered.map((p: any) => {
                const contractor = vendors?.find((v: any) => v.id === p.contractorId);
                const project = projects.find((proj: any) => proj.id === p.projectId);
                const statusCls = statusColors[p.status] || "bg-slate-50 text-slate-500 border-slate-200";
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-orange-50/40 transition-colors cursor-pointer odd:bg-white even:bg-slate-50/50"
                    onClick={() => setViewingPayment(p)}
                  >
                    {isColumnVisible("payment-table", "paymentNo") && (
                      <td className="py-2 px-3 font-semibold text-orange-700">{p.paymentNo || "-"}</td>
                    )}
                    {isColumnVisible("payment-table", "type") && (
                      <td className="py-2 px-3 text-center">
                        {p.paymentType && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                            {p.paymentType}
                          </span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("payment-table", "contractor") && (
                      <td className="py-2 px-3 truncate max-w-[200px]" title={contractor?.name || "-"}>
                        {contractor?.name || "-"}
                      </td>
                    )}
                    {isColumnVisible("payment-table", "billingCycle") && (
                      <td className="py-2 px-3 text-slate-500 text-[11px]">{p.billingCycle || "-"}</td>
                    )}
                    {isColumnVisible("payment-table", "openDate") && (
                      <td className="py-2 px-3 text-slate-500 text-[11px]">{p.openDate || "-"}</td>
                    )}
                    {isColumnVisible("payment-table", "amount") && (
                      <td className="py-2 px-3 text-right font-semibold">{formatCurrency(p.amount || 0)}</td>
                    )}
                    {isColumnVisible("payment-table", "attachment") && (
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {p.attachmentUrl ? (
                          <a
                            href={p.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-800 text-[10px] font-medium underline"
                            title={p.attachmentName || "เอกสารแนบ"}
                          >
                            <Paperclip size={11} />
                            ดูไฟล์
                          </a>
                        ) : (
                          <span className="text-slate-300 text-[10px]">—</span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("payment-table", "status") && (
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold ${statusCls}`}>
                          {p.status || "Draft"}
                        </span>
                      </td>
                    )}
                    {isColumnVisible("payment-table", "actions") && (
                      <td
                        className="py-2 px-3 text-right flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="p-1.5 rounded hover:bg-orange-100 text-orange-600 transition-colors"
                          title="ดูรายละเอียด"
                          onClick={() => setViewingPayment(p)}
                        >
                          <Eye size={13} />
                        </button>
                        {canUseFunction?.("payment-subcontract", "delete") !== false && (
                          <button
                            className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                            title="ลบ"
                            onClick={() => handleDelete(p)}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="bg-slate-50 border-t border-slate-200">
              <tr>
                <td colSpan={["paymentNo", "type", "contractor", "billingCycle", "openDate"].filter(k => isColumnVisible("payment-table", k)).length || 1} className="py-2 px-3 text-xs font-bold text-slate-600">
                  รวม {filtered.length} รายการ
                </td>
                {isColumnVisible("payment-table", "amount") && (
                  <td className="py-2 px-3 text-right text-xs font-bold text-orange-700">
                    {formatCurrency(filtered.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0))}
                  </td>
                )}
                <td colSpan={["attachment", "status", "actions"].filter(k => isColumnVisible("payment-table", k)).length || 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {/* ─── View Detail Modal — Payment Application Style (View-only) ─── */}
      {viewingPayment && (() => {
        const contractor = vendors?.find((v: any) => v.id === viewingPayment.contractorId);
        const project = projects.find((proj: any) => proj.id === viewingPayment.projectId);
        const items: any[] = viewingPayment.items || [];

        // Grand total calculations
        const contractGT = items.reduce((s, it) => s + ((Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0)), 0);
        const prevAmtGT = items.reduce((s, it) => s + (Number(it.prevAccumAmount) || 0), 0);
        const tpAmtGT = items.reduce((s, it) => s + (Number(it.thisPeriodAmount) || 0), 0);
        const totalAmtGT = prevAmtGT + tpAmtGT;
        const prevPctGT = contractGT > 0 ? (prevAmtGT / contractGT) * 100 : 0;
        const tpPctGT = contractGT > 0 ? (tpAmtGT / contractGT) * 100 : 0;
        const totalPctGT = contractGT > 0 ? (totalAmtGT / contractGT) * 100 : 0;

        // Pay/Slip
        const rawPaySlipUrl = viewingPayment.paySlipUrl;
        const displayPaySlipUrl = rawPaySlipUrl && typeof rawPaySlipUrl === "object" ? rawPaySlipUrl.url : rawPaySlipUrl;
        const rawPaySlipName = viewingPayment.paySlipName;
        const displayPaySlipName = rawPaySlipName && typeof rawPaySlipName === "object" ? rawPaySlipName.name : rawPaySlipName;

        return ReactDOM.createPortal(
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[99999] p-4">
            <div className="bg-white shadow-2xl border border-slate-300 w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden">

              {/* ─ Title bar ─ */}
              <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION</h3>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusColors[viewingPayment.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {viewingPayment.status || "Draft"}
                  </span>
                  <button
                    onClick={() => setViewingPayment(null)}
                    className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all ml-1"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ─ Scrollable body ─ */}
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">

                  {/* ── Header info grid ── */}
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    {/* Left */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อโครงการ / PROJECT NAME :</span>
                        <span className="font-bold text-slate-800">{project?.name || viewingPayment.projectId || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ผู้รับเหมาช่วง / SUBCONTRACTOR :</span>
                        <span className="font-bold text-slate-800">{contractor?.name || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">อ้างอิง PO / REF PO NO. :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.paymentNo || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อสัญญา / CONTRACT TITLE :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.contractTitle || viewingPayment.paymentNo || "-"}</span>
                      </div>
                      {displayPaySlipUrl && (
                        <div className="flex items-center">
                          <span className="w-52 text-emerald-600 font-semibold shrink-0">เอกสารการจ่ายเงิน (Pay / Slip) :</span>
                          <a
                            href={displayPaySlipUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded underline font-medium flex items-center gap-1 text-[11px] hover:bg-emerald-100 transition-colors"
                          >
                            <Paperclip size={11} /> {displayPaySlipName || "ดูเอกสารการจ่ายเงิน"}
                          </a>
                        </div>
                      )}
                    </div>
                    {/* Right */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">เลขที่เบิกงวดงาน / PAYMENT NO. :</span>
                        <span className="font-bold text-blue-800">{viewingPayment.paymentNo || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">Payment Type :</span>
                        <span className="font-bold text-slate-800">{viewingPayment.paymentType || "-"}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">งวดงาน / PERIOD NO. :</span>
                        <span className="font-bold px-2 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200">
                          {viewingPayment.periodNo || 1} / {viewingPayment.periodNo || 1}
                        </span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">รอบวางบิล :</span>
                        <span className="font-medium text-slate-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">{viewingPayment.billingCycle || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">วันที่จัดทำเอกสาร / Date :</span>
                        <span className="font-medium text-slate-700">{viewingPayment.openDate || "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Attachment */}
                  {viewingPayment.attachmentUrl && (
                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2 text-xs text-orange-800">
                      <Paperclip size={13} />
                      <a href={viewingPayment.attachmentUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
                        {viewingPayment.attachmentName || "ดูเอกสารแนบ"}
                      </a>
                    </div>
                  )}

                  {/* Pay/Slip banner */}
                  {displayPaySlipUrl && (
                    <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-xs text-emerald-800">
                      <Paperclip size={13} className="text-emerald-600 shrink-0" />
                      <span className="font-semibold text-emerald-700 shrink-0">เอกสารการจ่ายเงิน (Pay / Slip) :</span>
                      <a
                        href={displayPaySlipUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
                      >
                        {displayPaySlipName || "ดูเอกสารการจ่ายเงิน"}
                      </a>
                    </div>
                  )}

                  {/* paymentAttachments (Upload File) */}
                  {Array.isArray(viewingPayment.paymentAttachments) && viewingPayment.paymentAttachments.length > 0 && (
                    <div className="flex flex-col gap-1.5 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs">
                      <span className="font-semibold text-blue-700 flex items-center gap-1.5">
                        <Paperclip size={12} /> ไฟล์แนบ ({viewingPayment.paymentAttachments.length})
                      </span>
                      {viewingPayment.paymentAttachments.map((att: any, idx: number) => (
                        <div key={idx} className="flex items-center gap-2 ml-1">
                          <Paperclip size={10} className="text-blue-400 shrink-0" />
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 underline hover:text-blue-900 truncate max-w-[300px]"
                          >
                            {att.name || `ไฟล์แนบ ${idx + 1}`}
                          </a>
                          <span className="text-[10px] text-slate-400 shrink-0">โดย {att.uploadedBy || "-"}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* ── Items table — full Payment Application layout ── */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse min-w-max table-fixed">
                        <colgroup>
                          <col style={{ width: 40 }} />
                          <col style={{ width: 180 }} />
                          <col style={{ width: 56 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 80 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 52 }} />
                          <col style={{ width: 96 }} />
                          <col style={{ width: 48 }} />
                          <col style={{ width: 100 }} />
                        </colgroup>
                        <thead>
                          <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              ITEM<br /><span className="font-normal text-[9px] text-slate-500">ลำดับ</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-left font-bold text-slate-700 bg-slate-100">
                              DESCRIPTION<br /><span className="font-normal text-[9px] text-slate-500">รายละเอียด</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หน่วย<br /><span className="font-normal text-[9px] text-slate-500">Unit</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-purple-800 bg-purple-50">
                              ราคาตามสัญญา/ใบสั่งซื้อ<br /><span className="font-normal text-[9px]">CONTRACT / PO PRICE</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-blue-800 bg-blue-50">
                              ผลงานสะสมรวมงวดนี้<br /><span className="font-normal text-[9px]">TOTAL ACCUMULATED</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-amber-800 bg-amber-50">
                              ผลงานสะสมก่อนหน้านี้<br /><span className="font-normal text-[9px]">PREVIOUS ACCUMULATED</span>
                            </th>
                            <th colSpan={3} className="border border-slate-300 px-2 py-1.5 text-center font-bold text-green-800 bg-green-50">
                              ผลงานงวดนี้<br /><span className="font-normal text-[9px]">THIS PERIOD</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หมายเหตุ<br /><span className="font-normal text-[9px] text-slate-500">REMARK</span>
                            </th>
                          </tr>
                          <tr className="bg-slate-50 border-b border-slate-300 text-[9px] font-bold text-slate-600">
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ราคา/หน่วย<br />PRICE</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">ปริมาณ<br />TOTAL QTY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">%<br />PROGRESS</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">ปริมาณ<br />PREV SUM</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">จำนวนเงิน<br />PREV AMT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">%<br />PREV</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">%<br />CURR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr>
                              <td colSpan={16} className="py-8 text-center text-slate-400 text-xs border border-slate-200">ยังไม่มีรายการ</td>
                            </tr>
                          ) : (
                            items.map((it: any, i: number) => {
                              const cQty = Number(it.contractQty) || 0;
                              const cPrice = Number(it.contractPrice) || 0;
                              const cAmount = cQty * cPrice;
                              const prevQty = Number(it.prevAccumQty) || 0;
                              const prevAmt = Number(it.prevAccumAmount) || 0;
                              const prevPct = cAmount > 0 ? (prevAmt / cAmount) * 100 : 0;
                              const tpQty = Number(it.thisPeriodQty) || 0;
                              const tpAmt = Number(it.thisPeriodAmount) || 0;
                              const tpPct = cAmount > 0 ? (tpAmt / cAmount) * 100 : 0;
                              const totQty = prevQty + tpQty;
                              const totAmt = prevAmt + tpAmt;
                              const totPct = cAmount > 0 ? (totAmt / cAmount) * 100 : 0;
                              return (
                                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 font-medium">{i + 1}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-800 font-medium overflow-hidden max-w-0">
                                    <div className="line-clamp-2 break-words leading-tight" title={it.description || "-"}>
                                      {it.description || "-"}
                                    </div>
                                  </td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{it.unit || "-"}</td>
                                  {/* CONTRACT */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-purple-800">{cQty > 0 ? cQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-purple-800">{cPrice > 0 ? formatCurrency(cPrice) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-purple-900">{cAmount > 0 ? formatCurrency(cAmount) : "-"}</td>
                                  {/* TOTAL ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-blue-700">{totQty > 0 ? totQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-blue-700">{totAmt > 0 ? formatCurrency(totAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-blue-700">{totPct > 0 ? `${totPct.toFixed(2)}%` : "-"}</td>
                                  {/* PREVIOUS ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-amber-700">{prevQty > 0 ? prevQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right text-amber-700">{prevAmt > 0 ? formatCurrency(prevAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-amber-700">{prevPct > 0 ? `${prevPct.toFixed(2)}%` : "-"}</td>
                                  {/* THIS PERIOD */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-green-700">{tpQty > 0 ? tpQty.toLocaleString() : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-bold text-green-700">{tpAmt > 0 ? formatCurrency(tpAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-green-700">{tpPct > 0 ? `${tpPct.toFixed(2)}%` : "-"}</td>
                                  {/* REMARK */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-500 text-[10px]">{it.remark || "-"}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {items.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-800 text-white font-bold text-[11px]">
                              <td colSpan={3} className="border border-slate-600 px-3 py-2 text-center">ผลรวมทั้งสิ้น / GRAND TOTAL</td>
                              <td colSpan={2} className="border border-slate-600 px-2 py-2 text-right text-purple-300">{formatCurrency(contractGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-purple-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-blue-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-blue-300">{formatCurrency(totalAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-blue-300">{totalPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-amber-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-amber-300">{formatCurrency(prevAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-amber-300">{prevPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-green-300">-</td>
                              <td className="border border-slate-600 px-2 py-2 text-right text-green-300">{formatCurrency(tpAmtGT)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-center text-green-300">{tpPctGT.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* ── Signature section ── */}
                  <div className="grid grid-cols-3 gap-4 text-xs mt-2 px-2">
                    {[
                      { title: "PREPARE BY", position: "ผู้จัดทำ", name: viewingPayment.periodPreparedBy, date: viewingPayment.periodPreparedAt },
                      { title: "CHECK BY", position: "Construction Manager", name: viewingPayment.periodCheckedBy, date: viewingPayment.periodCheckedAt },
                      { title: "APPROVE BY", position: "Project Manager", name: viewingPayment.periodApprovedBy, date: viewingPayment.periodApprovedAt },
                    ].map((sig) => (
                      <div key={sig.title} className={`border rounded-lg p-3 text-center space-y-3 ${sig.name ? "border-green-300 bg-green-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                        <p className="font-bold text-slate-700 text-[11px]">{sig.title}</p>
                        <div className="h-8 flex items-center justify-center">
                          {sig.name ? (
                            <span className="text-[11px] font-bold text-green-700 border-b-2 border-green-500 pb-0.5 px-2">{sig.name}</span>
                          ) : (
                            <span className="text-[10px] text-slate-300 italic">— ยังไม่ได้ลงนาม —</span>
                          )}
                        </div>
                        <div className="border-t border-slate-300 pt-2 space-y-1">
                          <p className="text-[10px] text-slate-500">POSITION : <span className="font-semibold text-slate-700">{sig.position}</span></p>
                          <p className="text-[10px] text-slate-500">
                            DATE : {sig.date ? new Date(sig.date).toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "numeric" }) : "_______________"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Note */}
                  {viewingPayment.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                      <span className="font-bold">หมายเหตุ:</span> {viewingPayment.note}
                    </div>
                  )}

                </div>
              </div>

              {/* ─ Footer ─ */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end shrink-0 rounded-b-2xl">
                <button
                  onClick={() => setViewingPayment(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50"
                >
                  ปิด
                </button>
              </div>

            </div>
          </div>
          , document.body);
      })()}

    </div>
  );
});

export default PaymentTableView;

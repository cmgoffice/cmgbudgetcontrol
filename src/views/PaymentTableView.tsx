// @ts-nocheck
import React, { useState, useMemo } from "react";
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
    "Draft":    "bg-slate-50 text-slate-500 border-slate-200",
    "Pending":  "bg-amber-50 text-amber-700 border-amber-200",
    "Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Paid":     "bg-teal-50 text-teal-700 border-teal-200",
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
              <h2 className="text-lg font-bold text-slate-800">ตารางข้อมูล Payment Subcontract</h2>
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
                <td colSpan={["paymentNo","type","contractor","billingCycle","openDate","amount","attachment","status","actions"].filter(k => isColumnVisible("payment-table", k)).length} className="py-12 text-center text-slate-400 text-sm">
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
                <td colSpan={["paymentNo","type","contractor","billingCycle","openDate"].filter(k => isColumnVisible("payment-table", k)).length || 1} className="py-2 px-3 text-xs font-bold text-slate-600">
                  รวม {filtered.length} รายการ
                </td>
                {isColumnVisible("payment-table", "amount") && (
                  <td className="py-2 px-3 text-right text-xs font-bold text-orange-700">
                    {formatCurrency(filtered.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0))}
                  </td>
                )}
                <td colSpan={["attachment","status","actions"].filter(k => isColumnVisible("payment-table", k)).length || 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>

      {/* View Detail Modal */}
      {viewingPayment && (() => {
        const contractor = vendors?.find((v: any) => v.id === viewingPayment.contractorId);
        const project = projects.find((proj: any) => proj.id === viewingPayment.projectId);
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 bg-gradient-to-r from-orange-600 to-orange-800 rounded-t-2xl flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <CreditCard size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Subcontract</h3>
                    <p className="text-orange-200 text-xs mt-0.5">{viewingPayment.paymentNo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[11px] font-semibold ${statusColors[viewingPayment.status] || "bg-slate-100 text-slate-600 border-slate-200"}`}>
                    {viewingPayment.status || "Draft"}
                  </span>
                  <button
                    onClick={() => setViewingPayment(null)}
                    className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all ml-2"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {[
                    { label: "Payment No.", value: viewingPayment.paymentNo },
                    { label: "Payment Type", value: viewingPayment.paymentType || "-" },
                    { label: "ผู้รับเหมา", value: contractor?.name || "-" },
                    { label: "โครงการ", value: project?.name || viewingPayment.projectId || "-" },
                    { label: "วันที่เปิด", value: viewingPayment.openDate || "-" },
                    { label: "รอบวางบิล", value: viewingPayment.billingCycle || "-" },
                    { label: "สร้างโดย", value: viewingPayment.createdBy || "-" },
                    { label: "วันที่บันทึก", value: viewingPayment.createdAt ? new Date(viewingPayment.createdAt).toLocaleDateString("th-TH") : "-" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
                      <p className="font-semibold text-slate-700 truncate" title={String(value)}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Attachment */}
                {viewingPayment.attachmentUrl && (
                  <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-xs text-orange-800">
                    <Paperclip size={13} />
                    <a
                      href={viewingPayment.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                    >
                      {viewingPayment.attachmentName || "ดูเอกสารแนบ"}
                    </a>
                  </div>
                )}

                {/* Items */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-orange-700 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-white uppercase tracking-wide">รายการ Payment</span>
                    <span className="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {(viewingPayment.items || []).length} รายการ
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left min-w-[600px]">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 w-8 text-center">#</th>
                          <th className="px-3 py-2">รายการ</th>
                          <th className="px-3 py-2 w-16 text-center">หน่วย</th>
                          <th className="px-3 py-2 text-right w-28">ยอดสัญญา</th>
                          <th className="px-3 py-2 text-right w-24">งวดนี้ (Qty)</th>
                          <th className="px-3 py-2 text-right w-28">ยอดงวดนี้</th>
                          <th className="px-3 py-2 text-right w-16">%</th>
                          <th className="px-3 py-2 w-24">Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(viewingPayment.items || []).length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-400">ไม่มีรายการ</td>
                          </tr>
                        ) : (
                          (viewingPayment.items || []).map((it: any, i: number) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                              <td className="px-3 py-1.5 text-center text-slate-400">{i + 1}</td>
                              <td className="px-3 py-1.5 text-slate-700">{it.description || "-"}</td>
                              <td className="px-3 py-1.5 text-center text-slate-500">{it.unit || "-"}</td>
                              <td className="px-3 py-1.5 text-right text-slate-600">{formatCurrency(it.contractAmount || 0)}</td>
                              <td className="px-3 py-1.5 text-right">{it.thisPeriodQty ?? "-"}</td>
                              <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(it.thisPeriodAmount || 0)}</td>
                              <td className="px-3 py-1.5 text-right text-slate-500">{it.thisPeriodPct ?? 0}%</td>
                              <td className="px-3 py-1.5 text-slate-400 text-[10px]">{it.remark || "-"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-orange-700">
                        <tr>
                          <td colSpan={5} className="px-3 py-2 text-xs font-bold text-white">รวมยอดงวดนี้</td>
                          <td className="px-3 py-2 text-right text-xs font-semibold text-white">
                            {formatCurrency(viewingPayment.amount || 0)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>

                {/* Note */}
                {viewingPayment.note && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                    <span className="font-bold">หมายเหตุ:</span> {viewingPayment.note}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-2 shrink-0">
                <button
                  onClick={() => setViewingPayment(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
});

export default PaymentTableView;

// @ts-nocheck
import React, { useState, useMemo, useCallback, useContext } from "react";
import {
  ChevronDown, ChevronRight, FileText, Eye, X, Search, Trash2,
  DollarSign, Calendar, CreditCard, Package, Check, AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { AuthContext } from "../auth/AuthContext";
import { Card, Button, Badge, formatCurrency } from "../components/ui";
import {
  modalOverlayVariants,
  modalContentVariants,
  modalTransition,
  overlayTransition,
} from "../lib/animations";

const PO_TYPE_LABELS: Record<string, string> = {
  CR: "CR — เครดิต",
  SP: "SP — ผู้รับเหมา",
  SE: "SE — บริการ",
  CC: "CC — คอนกรีต",
  OL: "OL — น้ำมัน",
  DC: "DC — ค่าแรง",
  SM: "SM — เงินเดือน",
  CA: "CA — เงินสด/เงินโอน",
  RE: "RE — เช่า",
  WF: "WF — รายจ่ายประจำ",
};

const PAYMENT_TYPES = ["เครดิต", "โอน", "เช็ค", "เงินสด"];

// Alternating pastel group colors
const GROUP_COLORS = [
  {
    header: "bg-violet-50 hover:bg-violet-100",
    badge: "bg-violet-200 text-violet-800",
    border: "border-violet-100",
    thead: "bg-violet-50/70",
    rowHover: "hover:bg-violet-50/50",
    poNo: "text-violet-700",
    btn: "border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700",
  },
  {
    header: "bg-amber-50 hover:bg-amber-100",
    badge: "bg-amber-200 text-amber-800",
    border: "border-amber-100",
    thead: "bg-amber-50/70",
    rowHover: "hover:bg-amber-50/50",
    poNo: "text-amber-700",
    btn: "border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700",
  },
];

const InvoiceView = React.memo(() => {
  const {
    pos,
    vendors,
    invoices,
    addData,
    updateData,
    deleteData,
    showAlert,
    canUseFunction,
    userRoles,
  } = useAppData();
  const { selectedProjectId } = useUI();
  const { userData } = useContext(AuthContext);

  const [activeTab, setActiveTab] = useState<"po" | "history">("po");
  const [viewingPO, setViewingPO] = useState<any>(null);
  const [invoiceForm, setInvoiceForm] = useState({
    invNo: "",
    invDate: new Date().toISOString().split("T")[0],
    paymentType: "เครดิต",
    items: [] as any[],
  });
  const [saving, setSaving] = useState(false);
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>({});
  const [poPOSearch, setPoPOSearch] = useState("");
  const [poVendorSearch, setPoVendorSearch] = useState("");
  const [histSearch, setHistSearch] = useState("");

  const getVendorName = useCallback(
    (vendorId: string) => {
      const v = vendors.find((vd) => vd.id === vendorId);
      return v ? v.name : "-";
    },
    [vendors]
  );

  // POs eligible for invoice entry for this project
  // - Normal flow: Received
  // - Pay before receive flow: Wait Invoice
  const invoiceEligiblePOs = useMemo(() => {
    if (!selectedProjectId) return [];
    return pos.filter(
      (po) =>
        po.projectId === selectedProjectId &&
        (po.status === "Received" || po.status === "Wait Invoice")
    );
  }, [pos, selectedProjectId]);

  const filteredPOs = useMemo(() => {
    return invoiceEligiblePOs.filter((po) => {
      const poNoOk =
        !poPOSearch ||
        (po.poNo || "").toLowerCase().includes(poPOSearch.toLowerCase());
      const vendorOk =
        !poVendorSearch ||
        getVendorName(po.vendorId)
          .toLowerCase()
          .includes(poVendorSearch.toLowerCase());
      return poNoOk && vendorOk;
    });
  }, [invoiceEligiblePOs, poPOSearch, poVendorSearch, getVendorName]);

  const groupedPOs = useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredPOs.forEach((po) => {
      const type = po.poType || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(po);
    });
    return groups;
  }, [filteredPOs]);

  const toggleType = (type: string) =>
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));

  const poDescription = (po: any) => {
    const items = po.items || [];
    if (items.length === 0) return po.description || "-";
    const first = items[0]?.description || "-";
    return items.length > 1 ? `${first} (+${items.length - 1} รายการ)` : first;
  };

  const openPODetail = (po: any) => {
    setViewingPO(po);
    setInvoiceForm({
      invNo: "",
      invDate: new Date().toISOString().split("T")[0],
      paymentType: po.paymentType || "เครดิต",
      items: (po.items || []).map((item: any, idx: number) => ({
        ...item,
        poItemIndex: idx,
        invoiceQty: Number(item.quantity || 0),
        checked: true,
      })),
    });
  };

  const handleSaveInvoice = async () => {
    if (!viewingPO) return;
    if (!invoiceForm.invNo.trim())
      return showAlert("กรุณากรอกข้อมูล", "กรุณากรอกเลขที่ใบแจ้งหนี้", "warning");

    const selectedItems = invoiceForm.items.filter((i) => i.checked);
    if (selectedItems.length === 0)
      return showAlert("ไม่มีรายการ", "กรุณาเลือกรายการอย่างน้อย 1 รายการ", "warning");

    setSaving(true);
    try {
      const totalAmount = selectedItems.reduce(
        (sum, item) => sum + Number(item.invoiceQty) * Number(item.price || 0),
        0
      );
      const success = await addData("invoices", {
        invNo: invoiceForm.invNo.trim(),
        invDate: invoiceForm.invDate,
        paymentType: invoiceForm.paymentType,
        poId: viewingPO.id,
        poNo: viewingPO.poNo,
        poRef: viewingPO.poNo,
        vendorId: viewingPO.vendorId,
        vendorName: getVendorName(viewingPO.vendorId),
        items: selectedItems.map((item) => ({
          poItemIndex: item.poItemIndex,
          materialNo: item.materialNo || "",
          description: item.description || "",
          unit: item.unit || "",
          quantity: item.invoiceQty,
          price: item.price || 0,
          amount: Number(item.invoiceQty) * Number(item.price || 0),
        })),
        amount: totalAmount,
        description: poDescription(viewingPO),
        projectId: selectedProjectId,
        status: "Pending PM",
        createdBy:
          `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
      });

      if (success) {
        const isPayBeforeReceive =
          viewingPO.receiveType === "Pay before receive" || viewingPO.status === "Wait Invoice";

        await updateData(
          "pos",
          viewingPO.id,
          isPayBeforeReceive
            ? {
                status: "Approved",
                statusNow: "Approved",
              }
            : {
                status: "Invoice Issue",
                statusNow: "Invoice Issue",
              }
        );
        setViewingPO(null);
        showAlert("สำเร็จ", "บันทึกใบแจ้งหนี้เรียบร้อยแล้ว", "success");
      }
    } catch (e: any) {
      showAlert("เกิดข้อผิดพลาด", e.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return;
    let newStatus = inv.status;
    if (
      inv.status === "Pending PM" &&
      (userRoles.includes("PM") || userRoles.includes("Administrator"))
    )
      newStatus = "Paid";
    if (
      inv.status === "Pending GM" &&
      (userRoles.includes("PM") ||
        userRoles.includes("GM") ||
        userRoles.includes("Administrator"))
    )
      newStatus = "Paid";
    if (newStatus !== inv.status)
      await updateData("invoices", id, { status: newStatus });
  };

  const projectInvoices = useMemo(
    () => invoices.filter((inv) => inv.projectId === selectedProjectId),
    [invoices, selectedProjectId]
  );

  const pendingInvoices = useMemo(
    () => projectInvoices.filter((inv) => inv.status !== "Paid"),
    [projectInvoices]
  );

  const paidInvoices = useMemo(
    () => projectInvoices.filter((inv) => inv.status === "Paid"),
    [projectInvoices]
  );

  const filteredPaidInvoices = useMemo(() => {
    if (!histSearch) return paidInvoices;
    const q = histSearch.toLowerCase();
    return paidInvoices.filter(
      (inv) =>
        (inv.invNo || "").toLowerCase().includes(q) ||
        (inv.poNo || inv.poRef || "").toLowerCase().includes(q) ||
        (inv.vendorName || "").toLowerCase().includes(q)
    );
  }, [paidInvoices, histSearch]);

  // ─── Computed totals for invoice items ────────────────────────────────────
  const invoiceTotalAmount = useMemo(
    () =>
      invoiceForm.items
        .filter((i) => i.checked)
        .reduce(
          (sum, i) => sum + Number(i.invoiceQty) * Number(i.price || 0),
          0
        ),
    [invoiceForm.items]
  );

  return (
    <div className="space-y-4">
      {/* ── Page Header + Tabs ── */}
      <div className="flex items-center justify-between gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center shadow-sm">
              <FileText size={19} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-violet-800 leading-none">
                F. ใบแจ้งหนี้ (Invoice)
              </h2>
              <p className="text-[10px] text-violet-400 mt-1">
                จัดการใบแจ้งหนี้จาก PO ที่รับสินค้าแล้ว
              </p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 bg-violet-50/50 rounded-xl border border-violet-100/50 p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("po")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "po"
                  ? "bg-white text-violet-600 shadow-sm ring-1 ring-violet-200"
                  : "text-violet-400 hover:text-violet-600 hover:bg-white/50"
              }`}
            >
              <Package size={13} />
              PO พร้อมวางบิล
              <span
                className={`text-[9px] font-bold rounded-full px-1 py-0.5 min-w-[16px] text-center ${
                  activeTab === "po"
                    ? "bg-violet-100 text-violet-600"
                    : "bg-violet-50 text-violet-400"
                }`}
              >
                {invoiceEligiblePOs.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "history"
                  ? "bg-white text-amber-600 shadow-sm ring-1 ring-amber-200"
                  : "text-amber-400 hover:text-amber-600 hover:bg-white/50"
              }`}
            >
              <DollarSign size={13} />
              ประวัติ Invoice
              <span
                className={`text-[9px] font-bold rounded-full px-1 py-0.5 min-w-[16px] text-center ${
                  activeTab === "history"
                    ? "bg-amber-100 text-amber-600"
                    : "bg-amber-50 text-amber-400"
                }`}
              >
                {paidInvoices.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════
          Tab: PO พร้อมวางบิล
      ══════════════════════════════════════ */}
      {activeTab === "po" && (
        <div className="space-y-2">
          {/* Search toolbar */}
          <Card className="px-4 py-3 bg-gradient-to-r from-violet-50 to-purple-50 border-violet-100">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={poPOSearch}
                  onChange={(e) => setPoPOSearch(e.target.value)}
                  placeholder="ค้นหา PO No."
                  className="pl-7 pr-2 py-1.5 text-xs border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 w-36"
                />
              </div>
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-violet-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={poVendorSearch}
                  onChange={(e) => setPoVendorSearch(e.target.value)}
                  placeholder="ค้นหา Vendor"
                  className="pl-7 pr-2 py-1.5 text-xs border border-violet-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 w-36"
                />
              </div>
              {(poPOSearch || poVendorSearch) && (
                <button
                  type="button"
                  onClick={() => {
                    setPoPOSearch("");
                    setPoVendorSearch("");
                  }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
              <span className="ml-auto text-[11px] text-violet-400">
                {filteredPOs.length} รายการ
              </span>
            </div>
          </Card>

          {/* Empty state */}
          {Object.keys(groupedPOs).length === 0 ? (
            <Card className="py-12 text-center border-violet-100">
              <div className="w-14 h-14 rounded-full bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <Package size={26} className="text-violet-300" />
              </div>
              <p className="text-sm font-medium text-slate-500">
                ไม่พบ PO ที่พร้อมวางบิล
              </p>
              <p className="text-xs text-slate-400 mt-1">
                แสดง PO สถานะ Received (โฟลวปกติ) และ Wait Invoice (Pay before receive)
              </p>
            </Card>
          ) : (
            Object.entries(groupedPOs).map(([type, poList], groupIdx) => {
              const c = GROUP_COLORS[groupIdx % 2];
              const isExpanded = expandedTypes[type] !== false;
              return (
                <Card key={type} className={`overflow-hidden border ${c.border}`}>
                  {/* Group header */}
                  <button
                    type="button"
                    onClick={() => toggleType(type)}
                    className={`w-full flex items-center justify-between px-4 py-3 ${c.header} transition-colors`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown size={15} className="text-slate-500" />
                      ) : (
                        <ChevronRight size={15} className="text-slate-500" />
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-bold ${c.badge}`}
                      >
                        {type}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {PO_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({poList.length} PO)
                      </span>
                    </div>
                  </button>

                  {/* Group table */}
                  {isExpanded && (
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead
                        className={`${c.thead} text-slate-500 uppercase font-semibold`}
                      >
                        <tr>
                          <th className="py-1.5 px-3">PO No.</th>
                          <th className="py-1.5 px-3">Vendor</th>
                          <th className="py-1.5 px-3">รายละเอียด</th>
                          <th className="py-1.5 px-3 text-right">ยอดรวม</th>
                          <th className="py-1.5 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poList.map((po) => (
                          <tr
                            key={po.id}
                            className={`${c.rowHover} cursor-pointer transition-colors`}
                            onClick={() => openPODetail(po)}
                          >
                            <td
                              className={`py-1.5 px-3 font-semibold ${c.poNo}`}
                            >
                              {po.poNo}
                            </td>
                            <td className="py-1.5 px-3">
                              {getVendorName(po.vendorId)}
                            </td>
                            <td
                              className="py-1.5 px-3 max-w-[260px] truncate"
                              title={poDescription(po)}
                            >
                              {poDescription(po)}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold">
                              {formatCurrency(po.amount)}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              <button
                                type="button"
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[10px] font-medium transition-colors ${c.btn}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openPODetail(po);
                                }}
                              >
                                <FileText size={11} /> ลงข้อมูลใบแจ้งหนี้
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </Card>
              );
            })
          )}

          {/* Pending invoice list stays in PO tab until paid */}
          <Card className="overflow-hidden border-violet-100">
            <div className="px-4 py-2 bg-violet-50/60 border-b border-violet-100 flex items-center justify-between">
              <h4 className="text-xs font-bold text-violet-700">Invoice รออนุมัติจ่าย</h4>
              <span className="text-[11px] text-violet-500">{pendingInvoices.length} รายการ</span>
            </div>
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-violet-50/40 text-slate-500 uppercase font-semibold border-b border-violet-100">
                <tr>
                  <th className="py-1.5 px-3">Invoice No.</th>
                  <th className="py-1.5 px-3">Ref. PO</th>
                  <th className="py-1.5 px-3">Vendor</th>
                  <th className="py-1.5 px-3">วันที่</th>
                  <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                  <th className="py-1.5 px-3 text-center">สถานะ</th>
                  <th className="py-1.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-50">
                {pendingInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      ยังไม่มี Invoice ที่รออนุมัติจ่าย
                    </td>
                  </tr>
                ) : (
                  pendingInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-violet-50/20"
                      } hover:bg-violet-50/40`}
                    >
                      <td className="py-1.5 px-3 font-semibold text-violet-700">{inv.invNo}</td>
                      <td className="py-1.5 px-3 font-medium text-amber-600">{inv.poNo || inv.poRef || "-"}</td>
                      <td className="py-1.5 px-3">{inv.vendorName || "-"}</td>
                      <td className="py-1.5 px-3">{inv.invDate || inv.receiveDate || "-"}</td>
                      <td className="py-1.5 px-3 text-right font-semibold">{formatCurrency(inv.amount)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge status={inv.status} />
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {canUseFunction("invoice", "approve") &&
                            (userRoles.includes("PM") || userRoles.includes("Administrator")) &&
                            inv.status === "Pending PM" && (
                              <Button
                                variant="success"
                                size="sm"
                                className="px-2 py-0.5 text-[10px]"
                                onClick={() => handleApprove(inv.id)}
                              >
                                PM อนุมัติจ่าย
                              </Button>
                            )}
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => deleteData("invoices", inv.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════
          Tab: ประวัติ Invoice
      ══════════════════════════════════════ */}
      {activeTab === "history" && (
        <div className="space-y-2">
          {/* Search */}
          <Card className="px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 border-amber-100">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-amber-300 pointer-events-none"
                />
                <input
                  type="text"
                  value={histSearch}
                  onChange={(e) => setHistSearch(e.target.value)}
                  placeholder="ค้นหา Invoice / PO / Vendor"
                  className="pl-7 pr-2 py-1.5 text-xs border border-amber-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 w-60"
                />
              </div>
              {histSearch && (
                <button
                  onClick={() => setHistSearch("")}
                  className="text-slate-400 hover:text-red-500"
                >
                  <X size={13} />
                </button>
              )}
              <span className="ml-auto text-[11px] text-amber-400">
                {filteredPaidInvoices.length} รายการ
              </span>
            </div>
          </Card>

          {/* Invoice table */}
          <Card className="overflow-hidden border-amber-100">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-gradient-to-r from-amber-50 to-orange-50 text-slate-600 uppercase font-semibold border-b border-amber-100">
                <tr>
                  <th className="py-1.5 px-3">Invoice No.</th>
                  <th className="py-1.5 px-3">Ref. PO</th>
                  <th className="py-1.5 px-3">Vendor</th>
                  <th className="py-1.5 px-3">วันที่</th>
                  <th className="py-1.5 px-3">ประเภทชำระ</th>
                  <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                  <th className="py-1.5 px-3 text-center">สถานะ</th>
                  <th className="py-1.5 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-50">
                {filteredPaidInvoices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="py-10 text-center text-slate-400"
                    >
                      <DollarSign
                        size={28}
                        className="mx-auto mb-2 opacity-25"
                      />
                      ไม่มีข้อมูล Invoice ที่ชำระแล้ว
                    </td>
                  </tr>
                ) : (
                  filteredPaidInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={`transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-amber-50/25"
                      } hover:bg-amber-50/60`}
                    >
                      <td className="py-1.5 px-3 font-semibold text-amber-700">
                        {inv.invNo}
                      </td>
                      <td className="py-1.5 px-3 font-medium text-violet-600">
                        {inv.poNo || inv.poRef || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {inv.vendorName || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {inv.invDate || inv.receiveDate || "-"}
                      </td>
                      <td className="py-1.5 px-3">
                        {inv.paymentType ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-700">
                            {inv.paymentType}
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-semibold">
                        {formatCurrency(inv.amount)}
                      </td>
                      <td className="py-1.5 px-3 text-center">
                        <Badge status={inv.status} />
                      </td>
                      <td className="py-1.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          {canUseFunction("invoice", "delete") && (
                            <button
                              className="text-red-400 hover:text-red-600 transition-colors"
                              onClick={() => deleteData("invoices", inv.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* ══════════════════════════════════════
          Modal: ลงข้อมูลใบแจ้งหนี้
      ══════════════════════════════════════ */}
      <AnimatePresence>
        {viewingPO && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-[10010] p-4 overflow-y-auto"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => {
              if (!saving) setViewingPO(null);
            }}
          >
            <motion.div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-purple-50 to-white rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
                    <FileText size={20} className="text-violet-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-violet-800">
                      ลงข้อมูลใบแจ้งหนี้
                    </h3>
                    <p className="text-xs text-violet-400">
                      {viewingPO.poNo} —{" "}
                      {getVendorName(viewingPO.vendorId)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!saving) setViewingPO(null);
                  }}
                  className="p-2 rounded-lg hover:bg-violet-100 text-violet-400 hover:text-violet-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 max-h-[72vh] overflow-y-auto custom-scrollbar space-y-3">
                {/* PO Info Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    {
                      label: "PO No.",
                      value: viewingPO.poNo,
                      tone: "violet",
                    },
                    {
                      label: "ประเภท PO",
                      value:
                        PO_TYPE_LABELS[viewingPO.poType] ||
                        viewingPO.poType ||
                        "-",
                      tone: "violet",
                    },
                    {
                      label: "Vendor",
                      value: getVendorName(viewingPO.vendorId),
                      tone: "amber",
                    },
                    {
                      label: "ยอด PO",
                      value: formatCurrency(viewingPO.amount),
                      tone: "amber",
                    },
                  ].map((f) => (
                    <div
                      key={f.label}
                      className={`rounded-lg p-2.5 ${
                        f.tone === "violet"
                          ? "bg-violet-50 border border-violet-100"
                          : "bg-amber-50 border border-amber-100"
                      }`}
                    >
                      <p
                        className={`text-[9px] font-semibold uppercase tracking-wide ${
                          f.tone === "violet"
                            ? "text-violet-400"
                            : "text-amber-400"
                        }`}
                      >
                        {f.label}
                      </p>
                      <p
                        className={`text-xs font-bold truncate mt-0.5 ${
                          f.tone === "violet"
                            ? "text-violet-800"
                            : "text-amber-800"
                        }`}
                        title={String(f.value)}
                      >
                        {f.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Invoice Entry Fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-gradient-to-r from-violet-50/60 to-amber-50/60 rounded-xl p-3 border border-violet-100">
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-violet-700 mb-1.5">
                      <FileText size={11} /> เลขที่ใบแจ้งหนี้{" "}
                      <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น INV 69030001"
                      value={invoiceForm.invNo}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          invNo: e.target.value,
                        }))
                      }
                      className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-violet-700 mb-1.5">
                      <Calendar size={11} /> วันที่ใบแจ้งหนี้
                    </label>
                    <input
                      type="date"
                      value={invoiceForm.invDate}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          invDate: e.target.value,
                        }))
                      }
                      className="w-full border border-violet-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-400 bg-white"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1 text-xs font-semibold text-amber-700 mb-1.5">
                      <CreditCard size={11} /> ประเภทการชำระเงิน
                    </label>
                    <select
                      value={invoiceForm.paymentType}
                      onChange={(e) =>
                        setInvoiceForm((f) => ({
                          ...f,
                          paymentType: e.target.value,
                        }))
                      }
                      className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 bg-white"
                    >
                      {PAYMENT_TYPES.map((pt) => (
                        <option key={pt} value={pt}>
                          {pt}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      รายการสินค้าจาก PO
                      <span className="text-[11px] font-normal text-slate-400">
                        ({invoiceForm.items.length} รายการ) — เลือกรายการที่ต้องการวางบิล
                      </span>
                    </h4>
                  </div>
                  <div className="border border-violet-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-slate-600">
                      <thead className="bg-gradient-to-r from-violet-50 to-purple-50 text-slate-500 uppercase font-semibold">
                        <tr>
                          <th className="py-1.5 px-3 text-center w-8">
                            <input
                              type="checkbox"
                              checked={
                                invoiceForm.items.length > 0 &&
                                invoiceForm.items.every((i) => i.checked)
                              }
                              onChange={(e) =>
                                setInvoiceForm((f) => ({
                                  ...f,
                                  items: f.items.map((item) => ({
                                    ...item,
                                    checked: e.target.checked,
                                  })),
                                }))
                              }
                              className="accent-violet-500 w-3.5 h-3.5"
                            />
                          </th>
                          <th className="py-1.5 px-3">#</th>
                          <th className="py-1.5 px-3">รหัสวัสดุ</th>
                          <th className="py-1.5 px-3">รายละเอียด</th>
                          <th className="py-1.5 px-3 text-center">หน่วย</th>
                          <th className="py-1.5 px-3 text-right">ราคา/หน่วย</th>
                          <th className="py-1.5 px-3 text-right w-24">
                            จำนวนวางบิล
                          </th>
                          <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-violet-50">
                        {invoiceForm.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={`transition-colors ${
                              !item.checked
                                ? "opacity-40 bg-slate-50"
                                : idx % 2 === 0
                                ? "bg-white"
                                : "bg-violet-50/20"
                            }`}
                          >
                            <td className="py-1.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) =>
                                  setInvoiceForm((f) => ({
                                    ...f,
                                    items: f.items.map((it, i) =>
                                      i === idx
                                        ? { ...it, checked: e.target.checked }
                                        : it
                                    ),
                                  }))
                                }
                                className="accent-violet-500 w-3.5 h-3.5"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-1.5 px-3 font-mono text-[10px] text-slate-500">
                              {item.materialNo || "-"}
                            </td>
                            <td className="py-1.5 px-3">
                              {item.description || "-"}
                            </td>
                            <td className="py-1.5 px-3 text-center">
                              {item.unit || "-"}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {formatCurrency(item.price || 0)}
                            </td>
                            <td className="py-1.5 px-3">
                              <input
                                type="number"
                                min={0}
                                max={item.quantity}
                                value={item.invoiceQty}
                                disabled={!item.checked}
                                onChange={(e) =>
                                  setInvoiceForm((f) => ({
                                    ...f,
                                    items: f.items.map((it, i) =>
                                      i === idx
                                        ? {
                                            ...it,
                                            invoiceQty: Number(e.target.value),
                                          }
                                        : it
                                    ),
                                  }))
                                }
                                className="w-20 border border-violet-200 rounded-lg px-2 py-1 text-right text-xs focus:outline-none focus:ring-2 focus:ring-violet-300 bg-white disabled:bg-slate-50 disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold text-violet-700">
                              {formatCurrency(
                                Number(item.invoiceQty) *
                                  Number(item.price || 0)
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-amber-50 to-orange-50 border-t border-amber-100">
                        <tr>
                          <td
                            colSpan={7}
                            className="py-3 px-3 text-right text-sm font-bold text-amber-700"
                          >
                            รวมยอดวางบิล
                          </td>
                          <td className="py-3 px-3 text-right text-sm font-bold text-amber-700">
                            {formatCurrency(invoiceTotalAmount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-between px-5 py-3 border-t border-violet-100 bg-gradient-to-r from-violet-50/40 to-amber-50/40 rounded-b-2xl">
                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <AlertCircle size={11} />
                  หลังบันทึก สถานะ PO จะเปลี่ยนตาม Receive Type
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setViewingPO(null)}
                    disabled={saving}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveInvoice}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 shadow-md shadow-violet-200 transition-all disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        กำลังบันทึก...
                      </>
                    ) : (
                      <>
                        <Check size={14} /> บันทึกใบแจ้งหนี้
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default InvoiceView;

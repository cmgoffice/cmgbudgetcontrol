// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "firebase/firestore";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  CreditCard,
  FileText,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Badge, Button, Card, formatCurrency } from "../components/ui";
import {
  modalContentVariants,
  modalOverlayVariants,
  modalTransition,
  overlayTransition,
} from "../lib/animations";

const VIEW_CONFIG = {
  billing: {
    moduleKey: "billing",
    collectionName: "billings",
    title: "Billing",
    titlePrefix: "G.",
    description: "สร้างและจัดการรายการ Billing แบบตาราง พร้อมปุ่มสร้างรายการใหม่",
    numberLabel: "Billing No.",
    numberPlaceholder: "เช่น BILL-0001",
    refLabel: "Ref. PO",
    emptyText: "ยังไม่มีรายการ Billing สำหรับโครงการนี้",
    actionLabel: "สร้าง Billing",
    editLabel: "แก้ไข Billing",
    deleteLabel: "ลบ Billing",
    saveLogLabel: "Billing",
    icon: ReceiptText,
    theme: {
      iconBox: "bg-gradient-to-br from-cyan-100 to-sky-100",
      iconText: "text-cyan-700",
      title: "text-cyan-800",
      desc: "text-cyan-500",
      accent: "bg-cyan-600 hover:bg-cyan-700",
      border: "border-cyan-100",
      soft: "bg-cyan-50/60",
      head: "from-cyan-50 to-sky-50",
      altRow: "bg-cyan-50/20",
      hoverRow: "hover:bg-cyan-50/60",
      number: "text-cyan-700",
      edit: "text-cyan-500 hover:text-cyan-700",
      filterIcon: "text-cyan-300",
      filterBorder: "border-cyan-200 focus:ring-cyan-200 focus:border-cyan-400",
    },
  },
  pay: {
    moduleKey: "pay",
    collectionName: "pays",
    title: "Pay",
    titlePrefix: "H.",
    description: "สร้างและจัดการรายการ Pay แบบตาราง พร้อมปุ่มสร้างรายการใหม่",
    numberLabel: "Pay No.",
    numberPlaceholder: "เช่น PAY-0001",
    refLabel: "Ref. Billing/PO",
    emptyText: "ยังไม่มีรายการ Pay สำหรับโครงการนี้",
    actionLabel: "สร้าง Pay",
    editLabel: "แก้ไข Pay",
    deleteLabel: "ลบ Pay",
    saveLogLabel: "Pay",
    icon: Wallet,
    theme: {
      iconBox: "bg-gradient-to-br from-emerald-100 to-teal-100",
      iconText: "text-emerald-700",
      title: "text-emerald-800",
      desc: "text-emerald-500",
      accent: "bg-emerald-600 hover:bg-emerald-700",
      border: "border-emerald-100",
      soft: "bg-emerald-50/60",
      head: "from-emerald-50 to-teal-50",
      altRow: "bg-emerald-50/20",
      hoverRow: "hover:bg-emerald-50/60",
      number: "text-emerald-700",
      edit: "text-emerald-500 hover:text-emerald-700",
      filterIcon: "text-emerald-300",
      filterBorder: "border-emerald-200 focus:ring-emerald-200 focus:border-emerald-400",
    },
  },
};

const PAYMENT_TYPES = ["เครดิต", "โอน", "เช็ค", "เงินสด"];

const getDefaultForm = () => ({
  docNo: "",
  docDate: new Date().toISOString().split("T")[0],
  vendorId: "",
  vendorName: "",
  poRef: "",
  paymentType: "เครดิต",
  amount: "",
  description: "",
  note: "",
  status: "Draft",
});

const BillingPayView = React.memo(({ menuType = "billing" }) => {
  const config = VIEW_CONFIG[menuType] || VIEW_CONFIG.billing;
  const Icon = config.icon;
  const {
    db,
    appId,
    vendors,
    loadVendors,
    addData,
    updateData,
    deleteData,
    showAlert,
    openConfirm,
    logAction,
    userData,
    canUseFunction,
  } = useAppData();
  const { selectedProjectId } = useUI();

  const [rows, setRows] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<any>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState(getDefaultForm());

  const canCreate = canUseFunction(config.moduleKey, "create");
  const canEdit = canUseFunction(config.moduleKey, "edit");
  const canDelete = canUseFunction(config.moduleKey, "delete");

  useEffect(() => {
    loadVendors?.();
  }, [loadVendors]);

  useEffect(() => {
    const ref = collection(db, "artifacts", appId, "public", "data", config.collectionName);
    return onSnapshot(
      query(ref),
      (snap) => setRows(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))),
      (err) => console.error(`Error syncing ${config.collectionName}:`, err)
    );
  }, [appId, config.collectionName, db]);

  const formatDate = useCallback((value?: string) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("th-TH");
  }, []);

  const closeModal = useCallback(() => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingRow(null);
    setFormData(getDefaultForm());
  }, [saving]);

  const openCreateModal = useCallback(() => {
    setEditingRow(null);
    setFormData(getDefaultForm());
    setIsModalOpen(true);
  }, []);

  const openEditModal = useCallback((row: any) => {
    setEditingRow(row);
    setFormData({
      docNo: row.docNo || "",
      docDate: row.docDate || new Date().toISOString().split("T")[0],
      vendorId: row.vendorId || "",
      vendorName: row.vendorName || "",
      poRef: row.poRef || "",
      paymentType: row.paymentType || "เครดิต",
      amount: row.amount != null ? String(row.amount) : "",
      description: row.description || "",
      note: row.note || "",
      status: row.status || "Draft",
    });
    setIsModalOpen(true);
  }, []);

  const projectRows = useMemo(() => {
    if (!selectedProjectId) return [];
    return rows
      .filter((row: any) => row.projectId === selectedProjectId)
      .sort((a: any, b: any) => {
        const aTime = new Date(a.docDate || a.createdAt || 0).getTime();
        const bTime = new Date(b.docDate || b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }, [rows, selectedProjectId]);

  const filteredRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return projectRows;
    return projectRows.filter((row: any) =>
      [
        row.docNo,
        row.poRef,
        row.vendorName,
        row.description,
        row.note,
        row.paymentType,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [projectRows, searchTerm]);

  const totalAmount = useMemo(
    () => filteredRows.reduce((sum: number, row: any) => sum + Number(row.amount || 0), 0),
    [filteredRows]
  );

  const handleVendorChange = useCallback((vendorId: string) => {
    const vendor = vendors.find((item: any) => item.id === vendorId);
    setFormData((prev) => ({
      ...prev,
      vendorId,
      vendorName: vendor?.name || "",
    }));
  }, [vendors]);

  const handleSave = useCallback(async () => {
    if (!selectedProjectId) {
      showAlert?.("ยังไม่เลือกโครงการ", "กรุณาเลือกโครงการก่อนสร้างรายการ", "warning");
      return;
    }
    if (!formData.docNo.trim()) {
      showAlert?.("ข้อมูลไม่ครบ", `กรุณากรอก ${config.numberLabel}`, "warning");
      return;
    }
    if (!formData.docDate) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณาเลือกวันที่เอกสาร", "warning");
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      showAlert?.("ข้อมูลไม่ครบ", "กรุณากรอกจำนวนเงินให้มากกว่า 0", "warning");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        docNo: formData.docNo.trim(),
        docDate: formData.docDate,
        vendorId: formData.vendorId || "",
        vendorName: formData.vendorName || "",
        poRef: formData.poRef.trim(),
        paymentType: formData.paymentType,
        amount: Number(formData.amount || 0),
        description: formData.description.trim(),
        note: formData.note.trim(),
        status: formData.status || "Draft",
        projectId: editingRow?.projectId || selectedProjectId,
        createdBy:
          editingRow?.createdBy ||
          `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim(),
        updatedAt: new Date().toISOString(),
      };

      if (editingRow) {
        const ok = await updateData(config.collectionName, editingRow.id, payload, { skipLog: true });
        if (!ok) return;
        await logAction?.(
          `Edit ${config.saveLogLabel}`,
          `แก้ไข ${config.saveLogLabel} ${payload.docNo}`,
          payload.projectId
        );
        showAlert?.("สำเร็จ", `แก้ไข ${config.title} เรียบร้อยแล้ว`, "success");
      } else {
        const ok = await addData(
          config.collectionName,
          { ...payload, createdAt: new Date().toISOString() },
          null,
          { skipLog: true }
        );
        if (!ok) return;
        await logAction?.(
          `Create ${config.saveLogLabel}`,
          `สร้าง ${config.saveLogLabel} ${payload.docNo}`,
          payload.projectId
        );
        showAlert?.("สำเร็จ", `สร้าง ${config.title} เรียบร้อยแล้ว`, "success");
      }
      closeModal();
    } catch (error: any) {
      showAlert?.("เกิดข้อผิดพลาด", error?.message || String(error), "error");
    } finally {
      setSaving(false);
    }
  }, [
    addData,
    closeModal,
    config.collectionName,
    config.numberLabel,
    config.saveLogLabel,
    config.title,
    editingRow,
    formData,
    logAction,
    selectedProjectId,
    showAlert,
    updateData,
    userData,
  ]);

  const handleDelete = useCallback((row: any) => {
    openConfirm?.(
      "ยืนยันการลบ",
      `ต้องการลบ ${config.title} ${row.docNo || row.id} ใช่หรือไม่?`,
      async () => {
        const ok = await deleteData(config.collectionName, row.id, { skipLog: true });
        if (!ok) return;
        await logAction?.(
          `Delete ${config.saveLogLabel}`,
          `ลบ ${config.saveLogLabel} ${row.docNo || row.id}`,
          row.projectId
        );
        showAlert?.("สำเร็จ", `ลบ ${config.title} เรียบร้อยแล้ว`, "success");
      },
      "danger"
    );
  }, [config.collectionName, config.saveLogLabel, config.title, deleteData, logAction, openConfirm, showAlert]);

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border bg-white/40 p-3 shadow-sm ${config.theme.border}`}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ${config.theme.iconBox}`}>
              <Icon size={20} className={config.theme.iconText} />
            </div>
            <div>
              <h2 className={`text-lg font-bold leading-none ${config.theme.title}`}>
                {config.titlePrefix} {config.title}
              </h2>
              <p className={`mt-1 text-[11px] ${config.theme.desc}`}>{config.description}</p>
            </div>
          </div>
          {canCreate && (
            <Button type="button" onClick={openCreateModal} className={`${config.theme.accent} text-white`}>
              <span className="flex items-center gap-2">
                <Plus size={15} />
                {config.actionLabel}
              </span>
            </Button>
          )}
        </div>
      </div>

      <Card className={`border ${config.theme.border}`}>
        <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 md:flex-row md:items-center ${config.theme.soft} ${config.theme.border}`}>
          <div className="relative">
            <Search size={14} className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 ${config.theme.filterIcon}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`ค้นหา ${config.title} No. / Vendor / Ref.`}
              className={`w-72 rounded-xl border bg-white py-2 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 ${config.theme.filterBorder}`}
            />
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] text-slate-500">{filteredRows.length} รายการ</p>
            <p className="text-sm font-bold text-slate-800">{formatCurrency(totalAmount)}</p>
          </div>
        </div>
      </Card>

      <Card className={`overflow-x-auto border ${config.theme.border}`}>
        <table className="w-full min-w-[980px] text-left text-xs text-slate-600">
          <thead className={`bg-gradient-to-r ${config.theme.head} border-b ${config.theme.border} text-slate-600 uppercase font-semibold`}>
            <tr>
              <th className="px-3 py-2">{config.numberLabel}</th>
              <th className="px-3 py-2">{config.refLabel}</th>
              <th className="px-3 py-2">Vendor</th>
              <th className="px-3 py-2">วันที่</th>
              <th className="px-3 py-2">รายละเอียด</th>
              <th className="px-3 py-2">ชำระ</th>
              <th className="px-3 py-2 text-right">จำนวนเงิน</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-12 text-center text-sm text-slate-400">
                  {config.emptyText}
                </td>
              </tr>
            ) : (
              filteredRows.map((row: any, idx: number) => (
                <tr
                  key={row.id}
                  className={`transition-colors ${idx % 2 === 0 ? "bg-white" : config.theme.altRow} ${config.theme.hoverRow}`}
                >
                  <td className={`px-3 py-2 font-semibold ${config.theme.number}`}>{row.docNo || "-"}</td>
                  <td className="px-3 py-2 font-medium text-amber-600">{row.poRef || "-"}</td>
                  <td className="px-3 py-2">{row.vendorName || "-"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.docDate)}</td>
                  <td className="px-3 py-2 max-w-[260px] truncate" title={row.description || row.note || "-"}>
                    {row.description || row.note || "-"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {row.paymentType || "-"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.amount || 0)}</td>
                  <td className="px-3 py-2 text-center">
                    <Badge status={row.status || "Draft"} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          className={`transition-colors ${config.theme.edit}`}
                          title={config.editLabel}
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="text-red-400 transition-colors hover:text-red-600"
                          title={config.deleteLabel}
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

      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 z-[10010] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-md"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={closeModal}
          >
            <motion.div
              className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`flex items-center justify-between rounded-t-2xl border-b px-5 py-3 ${config.theme.soft} ${config.theme.border}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${config.theme.iconBox}`}>
                    <Icon size={18} className={config.theme.iconText} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-bold ${config.theme.title}`}>
                      {editingRow ? config.editLabel : config.actionLabel}
                    </h3>
                    <p className="text-xs text-slate-500">โครงสร้างสร้างรายการแบบฟอร์มเดี่ยวในแนวเดียวกับหน้า PO</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <FileText size={12} /> {config.numberLabel}
                    </label>
                    <input
                      type="text"
                      value={formData.docNo}
                      onChange={(e) => setFormData((prev) => ({ ...prev, docNo: e.target.value }))}
                      placeholder={config.numberPlaceholder}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Calendar size={12} /> วันที่เอกสาร
                    </label>
                    <input
                      type="date"
                      value={formData.docDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, docDate: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <FileText size={12} /> {config.refLabel}
                    </label>
                    <input
                      type="text"
                      value={formData.poRef}
                      onChange={(e) => setFormData((prev) => ({ ...prev, poRef: e.target.value }))}
                      placeholder="กรอกเลขอ้างอิง"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <CreditCard size={12} /> ประเภทการชำระ
                    </label>
                    <select
                      value={formData.paymentType}
                      onChange={(e) => setFormData((prev) => ({ ...prev, paymentType: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      {PAYMENT_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <FileText size={12} /> Vendor
                    </label>
                    <select
                      value={formData.vendorId}
                      onChange={(e) => handleVendorChange(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      <option value="">เลือก Vendor</option>
                      {vendors.map((vendor: any) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-700">
                      <Wallet size={12} /> จำนวนเงิน
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.amount}
                      onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">รายละเอียด</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder={`ระบุรายละเอียด ${config.title}`}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">หมายเหตุ</label>
                  <textarea
                    rows={2}
                    value={formData.note}
                    onChange={(e) => setFormData((prev) => ({ ...prev, note: e.target.value }))}
                    placeholder="หมายเหตุเพิ่มเติม"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={saving}>
                  ยกเลิก
                </Button>
                <Button type="button" onClick={handleSave} disabled={saving} className={`${config.theme.accent} text-white`}>
                  {saving ? "กำลังบันทึก..." : editingRow ? "บันทึกการแก้ไข" : "บันทึกรายการ"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default BillingPayView;

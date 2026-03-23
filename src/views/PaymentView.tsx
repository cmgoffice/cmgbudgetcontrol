// @ts-nocheck
import React, { useState, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Edit, XCircle, Save, Calendar, Hash, Tag,
  ClipboardList, Upload, Building2, CreditCard, FileSpreadsheet,
  Paperclip, AlertCircle, CheckCircle, Send, RotateCcw,
  ThumbsUp, ThumbsDown, Zap, Clock, ShieldCheck, MessageSquare,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import { motion, AnimatePresence } from "framer-motion";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { uploadAttachment } from "../lib/uploadAttachment";

// ─── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_TYPES = [
  { code: "DL", label: "DL — จ้างเหมา" },
  { code: "DC", label: "DC — ค่าแรง" },
];

const BILLING_CYCLES = [
  { value: "วันที่ 10 จ่าย 25", label: "วันที่ 10 จ่าย 25" },
  { value: "วันที่ 25 จ่าย 10", label: "วันที่ 25 จ่าย 10" },
];

const PAYMENT_PR_TYPES = ["จ้างเหมา > DL", "ค่าแรง > DC"];

// ─── Approval Flow Constants ──────────────────────────────────────────────────
const STATUS_APPROVER_ROLES: Record<string, string[]> = {
  "Pending CM":          ["CM", "Administrator"],
  "Pending PM":          ["PM", "PCM", "Administrator"],
  "Pending MD":          ["MD", "GM", "Administrator"],
  "Pending Procurement": ["Procurement", "Administrator"],
};

const getFirstPendingStatus = (roles: string[]): string => {
  if (roles.some((r) => ["MD", "GM"].includes(r))) return "Pending Procurement";
  if (roles.some((r) => ["PM", "PCM"].includes(r))) return "Pending MD";
  if (roles.includes("CM")) return "Pending PM";
  return "Pending CM";
};

const getNextStatus = (status: string): string => {
  const chain = ["Pending CM", "Pending PM", "Pending MD", "Pending Procurement", "Active"];
  const idx = chain.indexOf(status);
  return idx >= 0 && idx < chain.length - 1 ? chain[idx + 1] : "Active";
};

const isPendingForMe = (status: string, roles: string[]): boolean => {
  const approvers = STATUS_APPROVER_ROLES[status];
  return !!approvers && roles.some((r) => approvers.includes(r));
};

const isFlowActive = (status: string): boolean =>
  ["Pending CM", "Pending PM", "Pending MD", "Pending Procurement"].includes(status);

const STATUS_BADGE_COLORS: Record<string, string> = {
  "Draft":                  "bg-gray-100 text-gray-700 border border-gray-200",
  "Pending CM":             "bg-yellow-100 text-yellow-800 border border-yellow-200",
  "Pending PM":             "bg-amber-100 text-amber-800 border border-amber-200",
  "Pending MD":             "bg-orange-100 text-orange-800 border border-orange-200",
  "Pending Procurement":    "bg-blue-100 text-blue-800 border border-blue-200",
  "Active":                 "bg-green-100 text-green-800 border border-green-200",
  "งวดงาน Pending CM":     "bg-yellow-200 text-yellow-900 border border-yellow-400",
  "งวดงาน Pending PM":     "bg-amber-200 text-amber-900 border border-amber-400",
  "Wait Pay":               "bg-orange-200 text-orange-900 border border-orange-400",
  "Revision Requested":     "bg-rose-100 text-rose-800 border border-rose-200",
  "Rejected":               "bg-red-100 text-red-800 border border-red-300",
};

const PERIOD_APPROVER_ROLES: Record<string, string[]> = {
  "งวดงาน Pending CM": ["CM", "Administrator"],
  "งวดงาน Pending PM": ["PM", "PCM", "Administrator"],
};

const isPeriodFlow = (status: string): boolean =>
  ["งวดงาน Pending CM", "งวดงาน Pending PM"].includes(status);

const isPeriodPendingForMe = (status: string, roles: string[]): boolean => {
  const approvers = PERIOD_APPROVER_ROLES[status];
  return !!approvers && roles.some((r) => approvers.includes(r));
};

const PaymentStatusBadge = ({ status }: { status: string }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE_COLORS[status] || "bg-slate-100 text-slate-700 border border-slate-200"}`}>
    {status || "Draft"}
  </span>
);

const emptyForm = () => ({
  paymentNo: "",
  paymentType: "",
  contractorId: "",
  contractTitle: "",
  periodNo: "",
  openDate: new Date().toISOString().split("T")[0],
  billingCycle: "",
  note: "",
  selectedPrIds: [] as string[],
  items: [] as any[],
});

// ─── Component ────────────────────────────────────────────────────────────────
const PaymentView = React.memo(() => {
  const {
    prs, payments = [], vendors, projects, addData, updateData, deleteData, loadVendors,
    showAlert, openConfirm, logAction, userData, user, userRoles, canUseFunction, isColumnVisible,
  } = useAppData();
  const myRoles: string[] = userRoles || [];

  const { selectedProjectId, isFullScreenModalOpen, setIsFullScreenModalOpen } = useUI();

  // ─── UI State ───────────────────────────────────────────────────────────────
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);

  // ─── Active-state qty edit ────────────────────────────────────────────────
  const [activeQtyEdits, setActiveQtyEdits] = useState<Record<string, any>>({});
  const [savingActiveQty, setSavingActiveQty] = useState(false);
  const [isQtyEditMode, setIsQtyEditMode] = useState(false);

  // ─── Revision Request ─────────────────────────────────────────────────────
  const [revisionModalPayment, setRevisionModalPayment] = useState<any>(null);
  const [revisionNote, setRevisionNote] = useState("");

  // ─── Reject Reason ───────────────────────────────────────────────────────
  const [rejectModalPayment, setRejectModalPayment] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");

  // ─── Form State ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState(emptyForm());
  const [attachment, setAttachment] = useState<File | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>();
  const [attachmentName, setAttachmentName] = useState<string | undefined>();

  // ─── Contractor (Vendor) Search ─────────────────────────────────────────────
  const [contractorSearch, setContractorSearch] = useState("");
  const [contractorDropOpen, setContractorDropOpen] = useState(false);
  const contractorAnchorRef = useRef<HTMLDivElement>(null);
  const [contractorDropRect, setContractorDropRect] = useState<DOMRect | null>(null);

  const filteredContractors = useMemo(() => {
    const q = contractorSearch.toLowerCase();
    return vendors.filter((v: any) =>
      !q || (v.name || "").toLowerCase().includes(q) || (v.code || "").toLowerCase().includes(q)
    );
  }, [vendors, contractorSearch]);

  const openContractorDrop = useCallback(() => {
    if (contractorAnchorRef.current) {
      setContractorDropRect(contractorAnchorRef.current.getBoundingClientRect());
    }
    setContractorDropOpen(true);
  }, []);

  // ─── Available PRs (DL/DC, Approved) ───────────────────────────────────────
  const availablePRs = useMemo(() => {
    return prs.filter((pr: any) => {
      if (pr.projectId !== selectedProjectId) return false;
      if (!PAYMENT_PR_TYPES.includes(pr.purchaseType)) return false;
      if (pr.status !== "Approved" && pr.status !== "PO Issued") return false;
      return true;
    });
  }, [prs, selectedProjectId]);

  // ─── Available Items from selected PRs ──────────────────────────────────────
  const availableItems = useMemo(() => {
    const items: any[] = [];
    form.selectedPrIds.forEach((prId) => {
      const pr = prs.find((p: any) => p.id === prId);
      if (!pr) return;
      (pr.contractItems || pr.items || []).forEach((item: any, idx: number) => {
        items.push({
          prId,
          prNo: pr.prNo,
          prItemIndex: idx,
          description: item.description || "",
          unit: item.unit || "",
          contractQty: Number(item.quantity) || 0,
          contractPrice: Number(item.price) || Number(item.contractPrice) || 0,
          contractAmount: Number(item.amount) || 0,
          thisPeriodQty: 0,
          thisPeriodAmount: 0,
          thisPeriodPct: 0,
          remark: "",
        });
      });
    });
    return items;
  }, [form.selectedPrIds, prs]);

  // ─── Merge availableItems into form.items (preserve edits) ──────────────────
  const mergedItems = useMemo(() => {
    return availableItems.map((ai) => {
      const existing = form.items.find(
        (fi) => fi.prId === ai.prId && fi.prItemIndex === ai.prItemIndex
      );
      return existing || ai;
    });
  }, [availableItems, form.items]);

  // ─── Reset Form ─────────────────────────────────────────────────────────────
  const resetForm = () => {
    setForm(emptyForm());
    setAttachment(null);
    setAttachmentUrl(undefined);
    setAttachmentName(undefined);
    setContractorSearch("");
    setEditingId(null);
  };

  const openCreate = () => {
    resetForm();
    setIsModalOpen(true);
    setIsFullScreenModalOpen(true);
    loadVendors?.();
  };

  const openEdit = (p: any) => {
    const s = p.status || "Draft";
    if (s !== "Draft" && s !== "Rejected") {
      showAlert("ไม่สามารถแก้ไขได้", "Payment นี้อยู่ในระหว่างขั้นตอนอนุมัติ หากต้องการแก้ไขกรุณากดปุ่มขอแก้ไข (วงกลมสีส้ม)", "warning");
      return;
    }
    setEditingId(p.id);
    setForm({
      paymentNo: p.paymentNo || "",
      paymentType: p.paymentType || "",
      contractorId: p.contractorId || "",
      contractTitle: p.contractTitle || "",
      periodNo: p.periodNo || "",
      openDate: p.openDate || new Date().toISOString().split("T")[0],
      billingCycle: p.billingCycle || "",
      note: p.note || "",
      selectedPrIds: p.selectedPrIds || [],
      items: p.items || [],
    });
    setAttachmentUrl(p.attachmentUrl);
    setAttachmentName(p.attachmentName);
    const contractor = vendors.find((v: any) => v.id === p.contractorId);
    setContractorSearch(contractor?.name || "");
    setIsModalOpen(true);
    setIsFullScreenModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsFullScreenModalOpen(false);
    resetForm();
  };

  // ─── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.paymentType) return showAlert("ข้อมูลไม่ครบ", "กรุณาเลือก Payment Type", "warning");
    if (!form.paymentNo.trim()) return showAlert("ข้อมูลไม่ครบ", "กรุณาระบุ Payment No.", "warning");
    if (!form.contractorId) return showAlert("ข้อมูลไม่ครบ", "กรุณาเลือกผู้รับเหมา", "warning");
    if (mergedItems.length === 0) return showAlert("ข้อมูลไม่ครบ", "กรุณาเลือก PR และมีรายการสินค้าอย่างน้อย 1 รายการ", "warning");

    setSaving(true);
    try {
      let resolvedAttachmentUrl = attachmentUrl;
      let resolvedAttachmentName = attachmentName;

      if (attachment) {
        const path = `payments/${selectedProjectId}/${form.paymentNo.replace(/[^a-zA-Z0-9\-_]/g, "_")}_${Date.now()}`;
        resolvedAttachmentUrl = await uploadAttachment(attachment, path);
        resolvedAttachmentName = attachment.name;
      }

      const totalAmount = mergedItems.reduce(
        (s, it) => s + (Number(it.thisPeriodAmount) || 0), 0
      );

      const payload = {
        paymentNo: form.paymentNo.trim(),
        paymentType: form.paymentType,
        contractorId: form.contractorId,
        contractTitle: form.contractTitle.trim(),
        periodNo: form.periodNo.trim(),
        openDate: form.openDate,
        billingCycle: form.billingCycle,
        note: form.note,
        selectedPrIds: form.selectedPrIds,
        items: mergedItems,
        amount: totalAmount,
        projectId: selectedProjectId,
        status: "Draft",
        rejectReason: null,
        rejectedBy: null,
        rejectedAt: null,
        attachmentUrl: resolvedAttachmentUrl || null,
        attachmentName: resolvedAttachmentName || null,
        createdBy: userData?.name || user?.email || "",
        updatedAt: new Date().toISOString(),
      };

      if (editingId) {
        await updateData("payments", editingId, payload, { skipLog: true });
        await logAction("Update Payment", `แก้ไข Payment ${form.paymentNo}`);
        showAlert("สำเร็จ", "แก้ไข Payment เรียบร้อย", "success");
      } else {
        payload.createdAt = new Date().toISOString();
        await addData("payments", payload, null, { skipLog: true });
        await logAction("Create Payment", `สร้าง Payment ${form.paymentNo}`);
        showAlert("สำเร็จ", "บันทึก Payment เรียบร้อย", "success");
      }
      closeModal();
    } catch (e) {
      console.error("[PaymentView Save]", e);
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = (p: any) => {
    openConfirm("ยืนยันการลบ", `ต้องการลบ Payment ${p.paymentNo} ใช่หรือไม่?`, async () => {
      await deleteData("payments", p.id, { skipLog: true });
      await logAction("Delete Payment", `ลบ Payment ${p.paymentNo}`);
    }, "danger");
  };

  // ─── Approval Actions ────────────────────────────────────────────────────────

  const handleSubmit = async (p: any) => {
    const firstStatus = getFirstPendingStatus(myRoles);
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: firstStatus,
        submittedBy: userData?.name || user?.email || "",
        submittedAt: new Date().toISOString(),
        revisionRequested: false,
      }, { skipLog: true });
      await logAction("Submit Payment", `ส่ง Payment ${p.paymentNo} เพื่ออนุมัติ → ${firstStatus}`);
      showAlert("ส่งสำเร็จ", `Payment ถูกส่งเพื่ออนุมัติแล้ว (${firstStatus})`, "success");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleApprove = async (p: any) => {
    const next = getNextStatus(p.status);
    const label = p.status === "Pending Procurement" ? "Active" : next;
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: next,
        [`approvedBy.${p.status.replace("Pending ", "")}`]: userData?.name || user?.email || "",
        [`approvedAt.${p.status.replace("Pending ", "")}`]: new Date().toISOString(),
        revisionRequested: false,
      }, { skipLog: true });
      await logAction("Approve Payment", `อนุมัติ Payment ${p.paymentNo} → ${label}`);
      showAlert("อนุมัติสำเร็จ", `Payment ถูกเปลี่ยนสถานะเป็น ${label}`, "success");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalPayment) return;
    setActioning(true);
    try {
      await updateData("payments", rejectModalPayment.id, {
        status: "Rejected",
        rejectReason: rejectReason.trim() || "-",
        rejectedBy: userData?.name || user?.email || "",
        rejectedAt: new Date().toISOString(),
        revisionRequested: false,
      }, { skipLog: true });
      await logAction("Reject Payment", `ปฏิเสธ Payment ${rejectModalPayment.paymentNo}`);
      showAlert("ปฏิเสธแล้ว", "Payment ถูกตีกลับ สามารถแก้ไขและส่งใหม่ได้", "warning");
      setRejectModalPayment(null);
      setRejectReason("");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRequestRevision = async () => {
    if (!revisionModalPayment) return;
    const p = revisionModalPayment;
    const targetRole = p.status === "Active" ? "MD" : p.status.replace("Pending ", "");
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        revisionRequested: true,
        revisionRequestedBy: userData?.name || user?.email || "",
        revisionRequestedAt: new Date().toISOString(),
        revisionNote: revisionNote.trim(),
        revisionTargetRole: targetRole,
        revisionFromStatus: p.status,
      }, { skipLog: true });
      await logAction("Request Revision", `ขอแก้ไข Payment ${p.paymentNo} → ${targetRole}`);
      showAlert("ส่งขอแก้ไขแล้ว", `คำขอแก้ไขถูกส่งไปยัง ${targetRole}`, "success");
      setRevisionModalPayment(null);
      setRevisionNote("");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleApproveRevision = async (p: any) => {
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: "Draft",
        revisionRequested: false,
        revisionApprovedBy: userData?.name || user?.email || "",
        revisionApprovedAt: new Date().toISOString(),
      }, { skipLog: true });
      await logAction("Approve Revision", `อนุมัติขอแก้ไข Payment ${p.paymentNo} → Draft`);
      showAlert("อนุมัติแก้ไขแล้ว", "Payment กลับเป็น Draft สามารถแก้ไขได้แล้ว", "success");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRejectRevision = async (p: any) => {
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        revisionRequested: false,
      }, { skipLog: true });
      await logAction("Reject Revision", `ปฏิเสธขอแก้ไข Payment ${p.paymentNo}`);
      showAlert("ปฏิเสธคำขอแก้ไข", "Payment ยังคงสถานะเดิม", "info");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  // ─── Active Qty Update ────────────────────────────────────────────────────────
  const updateActiveQty = (key: string, field: string, val: any, contractPrice: number, contractAmount: number) => {
    setActiveQtyEdits((prev) => {
      const existing = prev[key] || {};
      let updated = { ...existing, [field]: val };
      if (field === "thisPeriodQty") {
        const newAmt = parseFloat(val) * contractPrice;
        updated.thisPeriodAmount = isNaN(newAmt) ? 0 : newAmt;
        updated.thisPeriodPct = contractAmount > 0
          ? Math.round((updated.thisPeriodAmount / contractAmount) * 10000) / 100
          : 0;
      }
      if (field === "thisPeriodAmount") {
        updated.thisPeriodPct = contractAmount > 0
          ? Math.round((parseFloat(val) / contractAmount) * 10000) / 100 : 0;
      }
      return { ...prev, [key]: updated };
    });
  };

  const handleSaveActiveQty = async (p: any, finalize = false) => {
    const updatedItems = (p.items || []).map((it: any) => {
      const key = `${it.prId}_${it.prItemIndex}`;
      const edit = activeQtyEdits[key];
      if (!edit) return it;
      const qty = parseFloat(edit.thisPeriodQty ?? it.thisPeriodQty) || 0;
      const amt = parseFloat(edit.thisPeriodAmount ?? it.thisPeriodAmount) || 0;
      const contractAmt = (it.contractQty || 0) * (it.contractPrice || 0);
      const pct = contractAmt > 0 ? Math.round((amt / contractAmt) * 10000) / 100 : 0;
      if (qty < 0 || qty > 9999) {
        showAlert("ค่าไม่ถูกต้อง", `ปริมาณต้องอยู่ระหว่าง 0.01 - 9999.00`, "warning");
        throw new Error("invalid qty");
      }
      if (pct > 100) {
        showAlert("เกิน 100%", `ผลงานงวดนี้ต้องไม่เกิน 100% ของยอดสัญญา`, "warning");
        throw new Error("exceed 100%");
      }
      return { ...it, thisPeriodQty: qty, thisPeriodAmount: amt, thisPeriodPct: pct };
    });
    setSavingActiveQty(true);
    try {
      const totalAmt = updatedItems.reduce((s: number, it: any) => s + (Number(it.thisPeriodAmount) || 0), 0);
      const now = new Date().toISOString();
      const extraFields: Record<string, any> = {};
      if (finalize) {
        extraFields.status = "งวดงาน Pending CM";
        extraFields.periodPreparedBy = userData?.name || user?.email || "";
        extraFields.periodPreparedAt = now;
        // reset previous period approvals when re-submitting
        extraFields.periodCheckedBy = null;
        extraFields.periodCheckedAt = null;
        extraFields.periodApprovedBy = null;
        extraFields.periodApprovedAt = null;
      }
      await updateData("payments", p.id, { items: updatedItems, amount: totalAmt, ...extraFields }, { skipLog: true });
      await logAction(
        finalize ? "Submit งวดงาน" : "Save Draft งวดงาน",
        `${finalize ? "บันทึกงวดงาน" : "Save Draft"} Payment ${p.paymentNo}`
      );
      showAlert("บันทึกสำเร็จ",
        finalize ? "บันทึกงวดงานแล้ว ส่งให้ CM ตรวจสอบ" : "Save Draft สำเร็จ",
        "success"
      );
      setActiveQtyEdits({});
      setViewingPayment((prev: any) => {
        if (!prev) return prev;
        return { ...prev, items: updatedItems, amount: totalAmt, ...extraFields };
      });
    } catch (_) {}
    finally { setSavingActiveQty(false); }
  };

  // ─── Period (งวดงาน) Approve ─────────────────────────────────────────────────
  const handlePeriodApprove = async (p: any) => {
    const isCheckStep = p.status === "งวดงาน Pending CM";
    const nextStatus = isCheckStep ? "งวดงาน Pending PM" : "Wait Pay";
    const sigField = isCheckStep ? "periodCheckedBy" : "periodApprovedBy";
    const dateField = isCheckStep ? "periodCheckedAt" : "periodApprovedAt";
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: nextStatus,
        [sigField]: userData?.name || user?.email || "",
        [dateField]: new Date().toISOString(),
      }, { skipLog: true });
      await logAction("Approve งวดงาน", `${isCheckStep ? "CM Check" : "PM Approve"} Payment ${p.paymentNo} → ${nextStatus}`);
      showAlert("อนุมัติสำเร็จ",
        isCheckStep ? "CM ตรวจสอบแล้ว ส่งให้ PM อนุมัติ" : "PM อนุมัติแล้ว สถานะเปลี่ยนเป็น Wait Pay",
        "success"
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  // ─── Item field update ───────────────────────────────────────────────────────
  const updateItem = (prId: string, idx: number, field: string, val: any) => {
    setForm((prev) => {
      const existing = prev.items.find((fi) => fi.prId === prId && fi.prItemIndex === idx);
      const base = existing || availableItems.find((ai) => ai.prId === prId && ai.prItemIndex === idx) || {};
      let updated = { ...base, [field]: val };

      if (field === "thisPeriodQty") {
        updated.thisPeriodAmount = Number(val) * Number(updated.contractPrice || 0);
        updated.thisPeriodPct = updated.contractAmount > 0
          ? Math.round((updated.thisPeriodAmount / updated.contractAmount) * 100 * 100) / 100
          : 0;
      }
      if (field === "thisPeriodAmount") {
        updated.thisPeriodPct = updated.contractAmount > 0
          ? Math.round((Number(val) / updated.contractAmount) * 100 * 100) / 100
          : 0;
      }

      const newItems = prev.items.filter((fi) => !(fi.prId === prId && fi.prItemIndex === idx));
      return { ...prev, items: [...newItems, updated] };
    });
  };

  // ─── Filtered payments for current project ───────────────────────────────────
  const projectPayments = useMemo(() => {
    return (payments || []).filter((p: any) => p.projectId === selectedProjectId);
  }, [payments, selectedProjectId]);

  const totalAmount = mergedItems.reduce((s, it) => s + (Number(it.thisPeriodAmount) || 0), 0);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 w-full min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-orange-800">Payment Subcontract</h2>
          <ColumnVisibilityToggle tableId="payment" />
        </div>
        <div className="flex items-center gap-2">
          {canUseFunction?.("payment-subcontract", "create") !== false && (
            <Button
              onClick={openCreate}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm"
            >
              <Plus size={14} /> สร้าง Payment
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden w-full min-w-0">
        <table className="w-full text-left text-xs text-slate-600 table-fixed">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              {isColumnVisible("payment", "paymentNo") && <th className="py-2 px-3 w-40">Payment No.</th>}
              {isColumnVisible("payment", "type") && <th className="py-2 px-3 text-center w-20">Type</th>}
              {isColumnVisible("payment", "contractor") && <th className="py-2 px-3">ผู้รับเหมา</th>}
              {isColumnVisible("payment", "billingCycle") && <th className="py-2 px-3 w-36">รอบวางบิล</th>}
              {isColumnVisible("payment", "amount") && <th className="py-2 px-3 text-right w-32">ยอดรวม</th>}
              {isColumnVisible("payment", "status") && <th className="py-2 px-3 text-center w-28">Status</th>}
              {isColumnVisible("payment", "actions") && <th className="py-2 px-3 text-right w-24">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectPayments.length === 0 ? (
              <tr>
                <td colSpan={["paymentNo","type","contractor","billingCycle","amount","status","actions"].filter(k => isColumnVisible("payment", k)).length} className="py-10 text-center text-slate-400 text-sm">
                  ยังไม่มีรายการ Payment — กด "สร้าง Payment" เพื่อเริ่มต้น
                </td>
              </tr>
            ) : (
              projectPayments.map((p: any) => {
                const contractor = vendors.find((v: any) => v.id === p.contractorId);
                return (
                  <tr
                    key={p.id}
                    className={`cursor-pointer transition-colors border-b ${
                      p.status === "Wait Pay"
                        ? "bg-orange-50 hover:bg-orange-100"
                        : "hover:bg-orange-50 odd:bg-white even:bg-slate-50"
                    }`}
                    onClick={() => setViewingPayment(p)}
                  >
                    {isColumnVisible("payment", "paymentNo") && (
                      <td className="py-2 px-3 font-medium text-orange-700">{p.paymentNo}</td>
                    )}
                    {isColumnVisible("payment", "type") && (
                      <td className="py-2 px-3 text-center">
                        {p.paymentType && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-700 border border-orange-200">
                            {p.paymentType}
                          </span>
                        )}
                      </td>
                    )}
                    {isColumnVisible("payment", "contractor") && (
                      <td className="py-2 px-3 truncate">{contractor?.name || "-"}</td>
                    )}
                    {isColumnVisible("payment", "billingCycle") && (
                      <td className="py-2 px-3 text-xs text-slate-500">{p.billingCycle || "-"}</td>
                    )}
                    {isColumnVisible("payment", "amount") && (
                      <td className="py-2 px-3 text-right font-semibold">{formatCurrency(p.amount || 0)}</td>
                    )}
                    {isColumnVisible("payment", "status") && (
                      <td className="py-2 px-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <PaymentStatusBadge status={p.status || "Draft"} />
                          {p.revisionRequested && (
                            <span className="text-[9px] text-rose-600 font-semibold">ขอแก้ไข</span>
                          )}
                          {p.status === "Rejected" && p.rejectReason && (
                            <span className="text-[9px] text-red-600 max-w-[100px] truncate" title={p.rejectReason}>
                              {p.rejectReason}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {isColumnVisible("payment", "actions") && (
                      <td
                        className="py-2 px-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end gap-1 flex-wrap">
                          {/* Period flow approve */}
                          {isPeriodFlow(p.status) && isPeriodPendingForMe(p.status, myRoles) && (
                            <button
                              title={p.status === "งวดงาน Pending CM" ? "CM ตรวจสอบ" : "PM อนุมัติ"}
                              className="p-1 rounded text-teal-600 hover:bg-teal-50 transition-colors"
                              onClick={() => handlePeriodApprove(p)}
                            >
                              <ThumbsUp size={13} />
                            </button>
                          )}
                          {/* Draft → Submit */}
                          {(p.status || "Draft") === "Draft" && canUseFunction?.("payment-subcontract", "create") !== false && (
                            <button
                              title="ส่งอนุมัติ"
                              className="p-1 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50 transition-colors"
                              onClick={() => handleSubmit(p)}
                            >
                              <Send size={13} />
                            </button>
                          )}
                          {/* Pending → Approve/Reject */}
                          {isFlowActive(p.status) && !p.revisionRequested && isPendingForMe(p.status, myRoles) && (
                            <>
                              <button title="อนุมัติ" className="p-1 rounded text-green-600 hover:bg-green-50 transition-colors" onClick={() => handleApprove(p)}>
                                <ThumbsUp size={13} />
                              </button>
                              <button title="ปฏิเสธ" className="p-1 rounded text-red-500 hover:bg-red-50 transition-colors" onClick={() => { setRejectModalPayment(p); setRejectReason(""); }}>
                                <ThumbsDown size={13} />
                              </button>
                            </>
                          )}
                          {/* Pending Procurement → Active */}
                          {p.status === "Pending Procurement" && !p.revisionRequested && isPendingForMe(p.status, myRoles) && (
                            <button title="Active" className="p-1 rounded text-blue-600 hover:bg-blue-50 transition-colors" onClick={() => handleApprove(p)}>
                              <Zap size={13} />
                            </button>
                          )}
                          {/* Revision request pending — for current approver */}
                          {p.revisionRequested && isPendingForMe(p.status === "Active" ? "Pending MD" : p.status, myRoles) && (
                            <>
                              <button title="อนุมัติขอแก้ไข" className="p-1 rounded text-green-600 hover:bg-green-50" onClick={() => handleApproveRevision(p)}><ShieldCheck size={13} /></button>
                              <button title="ปฏิเสธขอแก้ไข" className="p-1 rounded text-red-500 hover:bg-red-50" onClick={() => handleRejectRevision(p)}><XCircle size={13} /></button>
                            </>
                          )}
                          {/* Revision request button (orange circle) */}
                          {(isFlowActive(p.status) || p.status === "Active") && !p.revisionRequested && (
                            <button
                              title="ขอแก้ไข"
                              className="w-5 h-5 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors"
                              onClick={() => { setRevisionModalPayment(p); setRevisionNote(""); }}
                            >
                              <RotateCcw size={10} />
                            </button>
                          )}
                          {/* Edit (Draft or Rejected) */}
                          {["Draft", "Rejected"].includes(p.status || "Draft") && canUseFunction?.("payment-subcontract", "edit") !== false && (
                            <button title="แก้ไข" className={`p-1 rounded transition-colors ${p.status === "Rejected" ? "text-red-500 hover:text-red-700 hover:bg-red-50" : "text-blue-500 hover:text-blue-700 hover:bg-blue-50"}`} onClick={() => openEdit(p)}>
                              <Edit size={13} />
                            </button>
                          )}
                          {/* Delete (Draft only) */}
                          {(p.status || "Draft") === "Draft" && canUseFunction?.("payment-subcontract", "delete") !== false && (
                            <button title="ลบ" className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" onClick={() => handleDelete(p)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* ─── View Modal — Payment Application Form (Portal → document.body) ── */}
      {viewingPayment && createPortal((() => {
        const vp = viewingPayment;
        const contractor = vendors.find((v: any) => v.id === vp.contractorId);
        const project = (projects || []).find((p: any) => p.id === vp.projectId);
        const refPRs = (vp.selectedPrIds || []).map((id: string) => prs.find((p: any) => p.id === id)).filter(Boolean);
        const contractTitle = refPRs.map((pr: any) => pr.prNo).join(", ");
        const vpItems = vp.items || [];
        const contractGrandTotal = vpItems.reduce((s: number, it: any) => s + ((it.contractQty || 0) * (it.contractPrice || 0)), 0);
        const thisPeriodGrandTotal = vpItems.reduce((s: number, it: any) => {
          const k = `${it.prId}_${it.prItemIndex}`;
          const ed = activeQtyEdits[k];
          return s + (ed?.thisPeriodAmount !== undefined ? Number(ed.thisPeriodAmount) : (Number(it.thisPeriodAmount) || 0));
        }, 0);
        const thisPeriodPctTotal = contractGrandTotal > 0 ? ((thisPeriodGrandTotal / contractGrandTotal) * 100) : 0;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4">
            <div className="bg-white shadow-2xl border border-slate-300 w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden">

              {/* ─ Title bar ─ */}
              <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION</h3>
                <div className="flex items-center gap-2">
                  <PaymentStatusBadge status={vp.status || "Draft"} />
                  {vp.revisionRequested && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                      <RotateCcw size={9} /> ขอแก้ไข
                    </span>
                  )}
                  <button onClick={() => setViewingPayment(null)} className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
                    <XCircle size={18} />
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
                        <span className="font-bold text-slate-800">{project?.name || vp.projectId || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ผู้รับเหมาช่วง / SUBCONTRACTOR :</span>
                        <span className="font-bold text-slate-800">{contractor?.name || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">อ้างอิง PR / REF PR NO. :</span>
                        <span className="font-medium text-slate-700">{contractTitle || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อสัญญา / CONTRACT TITLE :</span>
                        <span className="font-medium text-slate-700">{vp.contractTitle || "-"}</span>
                      </div>
                    </div>
                    {/* Right */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">เลขที่เบิกงวดงาน / PAYMENT NO. :</span>
                        <span className="font-bold text-blue-800">{vp.paymentNo}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">Payment Type :</span>
                        <span className="font-bold text-slate-800">{vp.paymentType || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">งวดงาน / PERIOD NO. :</span>
                        <span className="font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded px-2 py-0.5">{vp.periodNo || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">รอบวางบิล :</span>
                        <span className="font-medium text-slate-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">{vp.billingCycle || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">วันที่จัดทำเอกสาร / Date :</span>
                        <span className="font-medium text-slate-700">{vp.openDate || "-"}</span>
                      </div>
                      {vp.attachmentUrl && (
                        <div className="flex items-center">
                          <span className="w-56 text-slate-500 font-semibold shrink-0">เอกสารแนบ :</span>
                          <a href={vp.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline font-medium flex items-center gap-1">
                            <Paperclip size={11} /> {vp.attachmentName || "ดูเอกสาร"}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Items table — Payment Application style ── */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse min-w-[1100px]">
                        <thead>
                          {/* Row 1: Group headers */}
                          <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 w-10 bg-slate-100">
                              ITEM<br /><span className="font-normal text-[9px] text-slate-500">ลำดับ</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-left font-bold text-slate-700 min-w-[160px] bg-slate-100">
                              DESCRIPTION<br /><span className="font-normal text-[9px] text-slate-500">รายละเอียด</span>
                            </th>
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 w-14 bg-slate-100">
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
                            <th rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 w-20 bg-slate-100">
                              หมายเหตุ<br /><span className="font-normal text-[9px] text-slate-500">REMARK</span>
                            </th>
                          </tr>
                          {/* Row 2: Sub-column headers */}
                          <tr className="bg-slate-50 border-b border-slate-300 text-[9px] font-bold text-slate-600">
                            {/* CONTRACT / PO PRICE */}
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700 w-16">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700 w-20">ราคา/หน่วย<br />PRICE</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700 w-24">จำนวนเงิน<br />AMOUNT</th>
                            {/* TOTAL ACCUMULATED */}
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700 w-16">ปริมาณ<br />TOTAL QTY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700 w-24">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700 w-14">%<br />PROGRESS</th>
                            {/* PREVIOUS ACCUMULATED */}
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700 w-16">ปริมาณ<br />PREV SUM</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700 w-24">จำนวนเงิน<br />PREV AMT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700 w-14">%<br />PREV</th>
                            {/* THIS PERIOD */}
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700 w-16">ปริมาณ<br />QUANTITY</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700 w-24">จำนวนเงิน<br />AMOUNT</th>
                            <th className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700 w-14">%<br />CURR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {vpItems.length === 0 ? (
                            <tr>
                              <td colSpan={16} className="py-8 text-center text-slate-400 text-xs border border-slate-200">ยังไม่มีรายการ</td>
                            </tr>
                          ) : (
                            vpItems.map((it: any, i: number) => {
                              const key = `${it.prId}_${it.prItemIndex ?? i}`;
                              const edit = activeQtyEdits[key] || {};
                              const canEditQty = vp.status === "Active" && isQtyEditMode;
                              const cQty = Number(it.contractQty) || 0;
                              const cPrice = Number(it.contractPrice) || 0;
                              const cAmount = cQty * cPrice;
                              const prevQty = Number(it.prevAccumQty) || 0;
                              const prevAmt = Number(it.prevAccumAmount) || 0;
                              const prevPct = cAmount > 0 ? (prevAmt / cAmount) * 100 : 0;
                              const tpQty = edit.thisPeriodQty !== undefined ? Number(edit.thisPeriodQty) : (Number(it.thisPeriodQty) || 0);
                              const tpAmt = edit.thisPeriodAmount !== undefined ? Number(edit.thisPeriodAmount) : (Number(it.thisPeriodAmount) || 0);
                              const tpPct = cAmount > 0 ? (tpAmt / cAmount) * 100 : 0;
                              const totalQty = prevQty + tpQty;
                              const totalAmt = prevAmt + tpAmt;
                              const totalPct = cAmount > 0 ? (totalAmt / cAmount) * 100 : 0;

                              return (
                                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 font-medium">{i + 1}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-700 font-medium">{it.description || "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{it.unit || "-"}</td>
                                  {/* CONTRACT */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-purple-50/20">{cQty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-purple-50/20">{formatCurrency(cPrice)}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono font-semibold bg-purple-50/20">{formatCurrency(cAmount)}</td>
                                  {/* TOTAL ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-blue-50/20">{totalQty > 0 ? totalQty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-blue-50/20">{totalAmt > 0 ? formatCurrency(totalAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-blue-50/20">{totalPct > 0 ? totalPct.toFixed(2) + "%" : "-"}</td>
                                  {/* PREVIOUS ACCUMULATED */}
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-amber-50/20 text-slate-400">{prevQty > 0 ? prevQty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-amber-50/20 text-slate-400">{prevAmt > 0 ? formatCurrency(prevAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-amber-50/20 text-slate-400">{prevPct > 0 ? prevPct.toFixed(2) + "%" : "-"}</td>
                                  {/* THIS PERIOD — editable when isQtyEditMode */}
                                  <td className="border border-slate-200 px-1 py-1 bg-green-50/40">
                                    {canEditQty ? (
                                      <input
                                        type="number" min={0} max={9999} step={0.01}
                                        className="w-full border border-green-400 rounded px-1 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-green-500 bg-white font-mono"
                                        value={edit.thisPeriodQty !== undefined ? edit.thisPeriodQty : (it.thisPeriodQty || "")}
                                        onChange={(e) => updateActiveQty(key, "thisPeriodQty", e.target.value, cPrice, cAmount)}
                                      />
                                    ) : (
                                      <span className="block text-right font-mono px-1">{tpQty > 0 ? tpQty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</span>
                                    )}
                                  </td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono font-semibold bg-green-50/40 text-green-700">{tpAmt > 0 ? formatCurrency(tpAmt) : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-green-50/40 text-green-600">{tpPct > 0 ? tpPct.toFixed(2) + "%" : "-"}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-400">{it.remark || "-"}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {vpItems.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-700 text-white font-bold">
                              <td colSpan={5} className="border border-slate-600 px-3 py-2 text-right text-[11px] tracking-wide">
                                ผลรวมทั้งสิ้น / GRAND TOTAL
                              </td>
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-sm">{formatCurrency(contractGrandTotal)}</td>
                              {/* Total accumulated */}
                              <td className="border border-slate-600 px-2 py-2" />
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono">
                                {formatCurrency(vpItems.reduce((s: number, it: any) => s + ((Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0)), 0))}
                              </td>
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-[10px]">
                                {contractGrandTotal > 0 ? (((vpItems.reduce((s: number, it: any) => s + ((Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0)), 0)) / contractGrandTotal) * 100).toFixed(2) + "%" : "0.00%"}
                              </td>
                              {/* Previous accumulated */}
                              <td className="border border-slate-600 px-2 py-2" />
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-slate-300">
                                {formatCurrency(vpItems.reduce((s: number, it: any) => s + (Number(it.prevAccumAmount) || 0), 0))}
                              </td>
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-[10px] text-slate-300">
                                {contractGrandTotal > 0 ? ((vpItems.reduce((s: number, it: any) => s + (Number(it.prevAccumAmount) || 0), 0) / contractGrandTotal) * 100).toFixed(2) + "%" : "0.00%"}
                              </td>
                              {/* This period */}
                              <td className="border border-slate-600 px-2 py-2" />
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-sm text-green-300">{formatCurrency(thisPeriodGrandTotal)}</td>
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-[10px] text-green-300">{thisPeriodPctTotal.toFixed(2)}%</td>
                              <td className="border border-slate-600 px-2 py-2" />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* ── Signature section ── */}
                  <div className="grid grid-cols-3 gap-4 text-xs mt-6 px-2">
                    {[
                      {
                        title: "PREPARE BY", position: "ผู้จัดทำ",
                        name: vp.periodPreparedBy, date: vp.periodPreparedAt,
                        filled: !!vp.periodPreparedBy,
                      },
                      {
                        title: "CHECK BY", position: "Construction Manager",
                        name: vp.periodCheckedBy, date: vp.periodCheckedAt,
                        filled: !!vp.periodCheckedBy,
                      },
                      {
                        title: "APPROVE BY", position: "Project Manager",
                        name: vp.periodApprovedBy, date: vp.periodApprovedAt,
                        filled: !!vp.periodApprovedBy,
                      },
                    ].map((sig) => (
                      <div key={sig.title} className={`border rounded-lg p-3 text-center space-y-3 ${sig.filled ? "border-green-300 bg-green-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                        <p className="font-bold text-slate-700 text-[11px]">{sig.title}</p>
                        <div className="h-8 flex items-center justify-center">
                          {sig.filled ? (
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
                  {vp.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                      <span className="font-bold">หมายเหตุ:</span> {vp.note}
                    </div>
                  )}

                  {/* ── Rejection banner ── */}
                  {vp.status === "Rejected" && (
                    <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                      <ThumbsDown size={14} className="mt-0.5 shrink-0 text-red-600" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-red-700">Payment ถูกปฏิเสธ — กรุณาแก้ไขและส่งอนุมัติใหม่</p>
                        {vp.rejectReason && vp.rejectReason !== "-" && (
                          <p>เหตุผล: <span className="font-semibold">{vp.rejectReason}</span></p>
                        )}
                        <p className="text-red-500">ปฏิเสธโดย: {vp.rejectedBy || "-"} เมื่อ {vp.rejectedAt ? new Date(vp.rejectedAt).toLocaleDateString("th-TH") : "-"}</p>
                      </div>
                    </div>
                  )}

                  {/* ── Revision info banner ── */}
                  {vp.revisionRequested && (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg px-4 py-3 text-xs text-rose-800 flex items-start gap-2">
                      <RotateCcw size={14} className="mt-0.5 shrink-0" />
                      <div>
                        <p className="font-bold">คำขอแก้ไข</p>
                        <p>ผู้ขอ: <span className="font-semibold">{vp.revisionRequestedBy || "-"}</span></p>
                        {vp.revisionNote && <p>เหตุผล: {vp.revisionNote}</p>}
                        <p>ส่งถึง: <span className="font-semibold">{vp.revisionTargetRole || "-"}</span></p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ─ Footer buttons ─ */}
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0 rounded-b-2xl">
                {/* Left: action buttons based on status */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Submit (Draft) */}
                  {(vp.status || "Draft") === "Draft" && canUseFunction?.("payment-subcontract", "create") !== false && (
                    <button
                      disabled={actioning}
                      onClick={() => handleSubmit(vp)}
                      className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                    >
                      <Send size={14} /> ส่งอนุมัติ
                    </button>
                  )}
                  {/* Approve/Reject (Pending) */}
                  {isFlowActive(vp.status) && !vp.revisionRequested && isPendingForMe(vp.status, myRoles) && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => handleApprove(vp)}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsUp size={14} /> {vp.status === "Pending Procurement" ? "Active" : "อนุมัติ"}
                      </button>
                      <button
                        disabled={actioning}
                        onClick={() => { setRejectModalPayment(vp); setRejectReason(""); }}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsDown size={14} /> ปฏิเสธ
                      </button>
                    </>
                  )}
                  {/* Revision pending — for current approver */}
                  {vp.revisionRequested && isPendingForMe(vp.status === "Active" ? "Pending MD" : vp.status, myRoles) && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => handleApproveRevision(vp)}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ShieldCheck size={14} /> อนุมัติขอแก้ไข
                      </button>
                      <button
                        disabled={actioning}
                        onClick={() => handleRejectRevision(vp)}
                        className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium flex items-center gap-2 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle size={14} /> ปฏิเสธขอแก้ไข
                      </button>
                    </>
                  )}
                  {/* งวดงาน Period Approve */}
                  {isPeriodFlow(vp.status) && isPeriodPendingForMe(vp.status, myRoles) && (
                    <button
                      disabled={actioning}
                      onClick={() => handlePeriodApprove(vp)}
                      className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      <ThumbsUp size={14} />
                      {vp.status === "งวดงาน Pending CM" ? "CHECK — ตรวจสอบ (CM)" : "APPROVE — อนุมัติ (PM)"}
                    </button>
                  )}
                  {/* Active: ใส่ปริมาณ / บันทึกงวดงาน + Save Draft */}
                  {vp.status === "Active" && !isQtyEditMode && (
                    <button
                      onClick={() => setIsQtyEditMode(true)}
                      className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center gap-2"
                    >
                      <Edit size={14} /> ใส่ปริมาณ
                    </button>
                  )}
                  {vp.status === "Active" && isQtyEditMode && (
                    <>
                      <button
                        disabled={savingActiveQty}
                        onClick={async () => { await handleSaveActiveQty(vp, true); setIsQtyEditMode(false); }}
                        className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      >
                        {savingActiveQty ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Save size={14} />}
                        บันทึกงวดงาน
                      </button>
                      <button
                        disabled={savingActiveQty}
                        onClick={() => handleSaveActiveQty(vp, false)}
                        className="px-4 py-2 rounded-lg border border-green-400 text-green-700 hover:bg-green-50 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      >
                        {savingActiveQty ? <span className="animate-spin w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full" /> : <Save size={14} />}
                        Save Draft
                      </button>
                    </>
                  )}
                  {/* Request Revision (orange circle) */}
                  {(isFlowActive(vp.status) || vp.status === "Active") && !vp.revisionRequested && (
                    <button
                      disabled={actioning}
                      onClick={() => { setRevisionModalPayment(vp); setRevisionNote(""); }}
                      className="w-8 h-8 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors disabled:opacity-60"
                      title="ขอแก้ไข"
                    >
                      <RotateCcw size={13} />
                    </button>
                  )}
                  {/* Edit (Draft or Rejected) */}
                  {["Draft", "Rejected"].includes(vp.status || "Draft") && canUseFunction?.("payment-subcontract", "edit") !== false && (
                    <button
                      onClick={() => { setViewingPayment(null); openEdit(viewingPayment); }}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 ${vp.status === "Rejected" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      <Edit size={14} /> แก้ไข{vp.status === "Rejected" ? " (ส่งใหม่)" : ""}
                    </button>
                  )}
                </div>
                {/* Right: close */}
                <button
                  onClick={() => { setViewingPayment(null); setActiveQtyEdits({}); setIsQtyEditMode(false); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                >
                  <XCircle size={15} /> ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ─── Revision Request Modal ─────────────────────────────────────────────── */}
      {revisionModalPayment && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center"><RotateCcw size={14} className="text-white" /></span>
              ขอแก้ไข Payment
            </h3>
            <p className="text-xs text-slate-500">
              Payment: <strong>{revisionModalPayment.paymentNo}</strong><br />
              คำขอนี้จะถูกส่งไปยัง <strong>{revisionModalPayment.status === "Active" ? "MD" : revisionModalPayment.status.replace("Pending ", "")}</strong> เพื่ออนุมัติการแก้ไข
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">เหตุผลที่ขอแก้ไข (ไม่บังคับ)</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400"
                rows={3}
                placeholder="กรอกเหตุผล..."
                value={revisionNote}
                onChange={(e) => setRevisionNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRevisionModalPayment(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                disabled={actioning}
                onClick={handleRequestRevision}
                className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Send size={13} />}
                ส่งขอแก้ไข
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── Reject Modal ────────────────────────────────────────────────────────── */}
      {rejectModalPayment && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ThumbsDown size={18} className="text-red-500" /> ปฏิเสธ Payment
            </h3>
            <p className="text-xs text-slate-500">
              Payment: <strong>{rejectModalPayment.paymentNo}</strong><br />
              Payment จะถูกส่งกลับไปยังสถานะ <strong>Draft</strong>
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">เหตุผลที่ปฏิเสธ</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                rows={3}
                placeholder="กรอกเหตุผล..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectModalPayment(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                disabled={actioning}
                onClick={handleRejectConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <ThumbsDown size={13} />}
                ปฏิเสธ
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── Create / Edit Modal ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[9999] p-4"
            initial="hidden" animate="visible" exit="hidden"
            variants={modalOverlayVariants} transition={overlayTransition}
          >
            <motion.div
              className="w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden" animate="visible" exit="hidden"
              variants={modalContentVariants} transition={modalTransition}
            >
              {/* Modal Header */}
              <div className="relative px-6 py-4 border-b border-black/10 bg-gradient-to-r from-orange-600 via-orange-700 to-orange-900 shrink-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <CreditCard size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {editingId ? "แก้ไข Payment Subcontract" : "สร้าง Payment Subcontract"}
                      </h3>
                      <p className="text-white/80 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อบันทึก Payment</p>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
                    className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">

                {/* ─── 1. ข้อมูลส่วนหัว ─────────────────────────────────────────── */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-50 to-slate-50 border-b border-slate-200">
                    <div className="w-5 h-5 bg-red-700 rounded-md flex items-center justify-center">
                      <CreditCard size={11} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-red-900 tracking-wide uppercase">1. ข้อมูลส่วนหัว (Header)</span>
                  </div>
                  <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">

                    {/* Payment Type */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Tag size={11} className="text-orange-500" /> Payment Type
                      </label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 cursor-pointer"
                        value={form.paymentType}
                        disabled={!!editingId}
                        onChange={(e) => setForm((f) => ({ ...f, paymentType: e.target.value }))}
                      >
                        <option value="">-- เลือก --</option>
                        {PAYMENT_TYPES.map((t) => (
                          <option key={t.code} value={t.code}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Payment No. */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Hash size={11} className="text-orange-500" /> Payment No.
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        placeholder="กรอก Payment No."
                        value={form.paymentNo}
                        onChange={(e) => setForm((f) => ({ ...f, paymentNo: e.target.value }))}
                      />
                    </div>

                    {/* งวดงาน */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Hash size={11} className="text-orange-400" /> งวดงาน / Period No.
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        placeholder="เช่น 1, 2, ..."
                        value={form.periodNo}
                        onChange={(e) => setForm((f) => ({ ...f, periodNo: e.target.value }))}
                      />
                    </div>

                    {/* วันที่เปิด */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <Calendar size={11} className="text-amber-500" /> วันที่เปิด
                      </label>
                      <input
                        type="date"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm cursor-pointer hover:border-orange-300"
                        value={form.openDate}
                        onChange={(e) => setForm((f) => ({ ...f, openDate: e.target.value }))}
                      />
                    </div>

                    {/* รอบวางบิล */}
                    <div>
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <Calendar size={11} className="text-emerald-500" /> รอบวางบิล
                      </label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100 cursor-pointer"
                        value={form.billingCycle}
                        onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value }))}
                      >
                        <option value="">-- เลือกรอบวางบิล --</option>
                        {BILLING_CYCLES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* ชื่อสัญญา */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Tag size={11} className="text-blue-500" /> ชื่อสัญญา / CONTRACT TITLE
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                        placeholder="กรอกชื่อสัญญา..."
                        value={form.contractTitle}
                        onChange={(e) => setForm((f) => ({ ...f, contractTitle: e.target.value }))}
                      />
                    </div>

                    {/* ผู้รับเหมา */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Building2 size={11} className="text-orange-500" /> ผู้รับเหมา
                      </label>
                      <div ref={contractorAnchorRef} className="relative">
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 pl-9 text-sm hover:border-orange-300 focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                          placeholder="ค้นหาผู้รับเหมา..."
                          value={contractorSearch}
                          onChange={(e) => { setContractorSearch(e.target.value); openContractorDrop(); }}
                          onFocus={openContractorDrop}
                          onBlur={() => setTimeout(() => setContractorDropOpen(false), 180)}
                        />
                        <Building2 className="absolute left-3 top-2 text-orange-400 pointer-events-none" size={14} />
                        {form.contractorId && (
                          <button
                            type="button"
                            className="absolute right-2 top-2 p-1 text-slate-400 hover:text-red-500"
                            onClick={() => { setForm((f) => ({ ...f, contractorId: "" })); setContractorSearch(""); }}
                          >
                            <XCircle size={12} />
                          </button>
                        )}
                        {contractorDropOpen && contractorDropRect && createPortal(
                          <div
                            className="fixed max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1"
                            style={{ top: contractorDropRect.bottom + 4, left: contractorDropRect.left, width: contractorDropRect.width, zIndex: 99999 }}
                          >
                            {filteredContractors.length === 0 ? (
                              <div className="px-3 py-3 text-xs text-slate-500 text-center">ไม่พบผู้รับเหมา</div>
                            ) : (
                              filteredContractors.slice(0, 50).map((v: any) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-orange-50 flex items-center justify-between ${form.contractorId === v.id ? "bg-orange-50 text-orange-800" : "text-slate-700"}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setForm((f) => ({ ...f, contractorId: v.id }));
                                    setContractorSearch(v.name || "");
                                    setContractorDropOpen(false);
                                  }}
                                >
                                  <span className="font-medium truncate">{v.name}</span>
                                  {v.code && <span className="text-xs text-slate-500 shrink-0 ml-1">{v.code}</span>}
                                </button>
                              ))
                            )}
                          </div>,
                          document.body
                        )}
                      </div>
                    </div>

                    {/* เอกสารแนบ */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                        <Paperclip size={11} className="text-orange-500" /> เอกสารแนบ
                      </label>
                      <div className="flex items-center gap-2 w-full border border-dashed border-slate-200 rounded-lg px-3 py-1.5 bg-slate-50 hover:border-orange-300 hover:bg-orange-50/30 transition-all cursor-pointer">
                        <Upload size={14} className="text-slate-400 shrink-0" />
                        <input
                          type="file"
                          className="hidden"
                          id="payment-attachment-upload"
                          onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                        />
                        <label htmlFor="payment-attachment-upload" className="flex-1 text-xs text-slate-600 cursor-pointer py-0.5 truncate">
                          {attachment
                            ? attachment.name
                            : attachmentUrl
                              ? (attachmentName || "ไฟล์แนบ") + " (บันทึกแล้ว)"
                              : "คลิกเพื่อแนบไฟล์"}
                        </label>
                        {(attachment || attachmentUrl) && (
                          <button
                            type="button"
                            className="shrink-0 text-slate-400 hover:text-red-500"
                            onClick={() => { setAttachment(null); setAttachmentUrl(undefined); setAttachmentName(undefined); }}
                          >
                            <XCircle size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── 2. เลือก PR ─────────────────────────────────────────────────── */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                    <div className="w-5 h-5 bg-slate-800 rounded-md flex items-center justify-center">
                      <ClipboardList size={11} className="text-white" />
                    </div>
                    <span className="text-[11px] font-bold text-slate-800 tracking-wide uppercase">
                      2. เลือกใบขอซื้อ (PR) — เฉพาะ DL / DC
                    </span>
                  </div>
                  <div className="p-2 max-h-40 overflow-y-auto">
                    {availablePRs.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">ไม่มี PR ประเภท DL/DC ที่พร้อมใช้งาน</p>
                    ) : (
                      availablePRs.map((pr: any) => {
                        const checked = form.selectedPrIds.includes(pr.id);
                        return (
                          <label
                            key={pr.id}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${checked ? "bg-orange-50 border border-orange-200" : "hover:bg-slate-50"}`}
                          >
                            <input
                              type="checkbox"
                              className="accent-orange-500"
                              checked={checked}
                              onChange={() => {
                                setForm((f) => {
                                  const ids = checked
                                    ? f.selectedPrIds.filter((id) => id !== pr.id)
                                    : [...f.selectedPrIds, pr.id];
                                  return { ...f, selectedPrIds: ids };
                                });
                              }}
                            />
                            <span className="font-medium text-slate-700">{pr.prNo}</span>
                            <span className="text-slate-400">—</span>
                            <span className="text-slate-600">{pr.purchaseType}</span>
                            <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-semibold ${pr.status === "Approved" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                              {pr.status}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* ─── 3. รายการสินค้า / งาน (Contract Items) ──────────────────────── */}
                {form.selectedPrIds.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gradient-to-r from-purple-50 to-orange-50 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-purple-700 rounded-md flex items-center justify-center">
                          <FileSpreadsheet size={11} className="text-white" />
                        </div>
                        <span className="text-[11px] font-bold text-purple-900 tracking-wide uppercase">
                          3. รายการสินค้า / งาน (Contract Items)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">{mergedItems.length} รายการ</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse min-w-[900px]">
                        <thead>
                          <tr className="border-b-2 border-slate-300">
                            <th rowSpan={2} className="px-2 py-2 text-center bg-slate-100 text-slate-600 font-bold w-10 border-r border-slate-200">
                              ITEM<br /><span className="font-normal text-[10px]">ลำดับ</span>
                            </th>
                            <th rowSpan={2} className="px-2 py-2 text-left bg-slate-100 text-slate-600 font-bold border-r border-slate-200 min-w-[180px]">
                              DESCRIPTION<br /><span className="font-normal text-[10px]">รายละเอียด</span>
                            </th>
                            <th rowSpan={2} className="px-2 py-2 text-center bg-slate-100 text-slate-600 font-bold w-16 border-r border-slate-200">
                              หน่วย<br /><span className="font-normal text-[10px]">Unit</span>
                            </th>
                            <th colSpan={3} className="px-2 py-1.5 text-center bg-purple-100 text-purple-700 font-bold border-r border-purple-200">
                              ราคาตามสัญญา / ใบขอซื้อ<br /><span className="font-normal text-[10px]">CONTRACT / PO PRICE</span>
                            </th>
                            <th colSpan={2} className="px-2 py-1.5 text-center bg-green-100 text-green-700 font-bold border-r border-green-200">
                              ผลงานงวดนี้<br /><span className="font-normal text-[10px]">THIS PERIOD</span>
                            </th>
                            <th rowSpan={2} className="px-2 py-2 text-center bg-slate-100 text-slate-600 font-bold w-14 border-r border-slate-200">
                              %<br /><span className="font-normal text-[10px]">CURR</span>
                            </th>
                            <th rowSpan={2} className="px-2 py-2 text-center bg-slate-100 text-slate-600 font-bold w-28">
                              หมายเหตุ<br /><span className="font-normal text-[10px]">REMARK</span>
                            </th>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <th className="px-2 py-1 text-center bg-purple-50 text-purple-700 font-bold text-[10px] w-20 border-r border-purple-100">ปริมาณ<br />QTY</th>
                            <th className="px-2 py-1 text-center bg-purple-50 text-purple-700 font-bold text-[10px] w-28 border-r border-purple-100">ราคา/หน่วย<br />PRICE</th>
                            <th className="px-2 py-1 text-center bg-purple-50 text-purple-700 font-bold text-[10px] w-28 border-r border-purple-200">จำนวนเงิน<br />AMOUNT</th>
                            <th className="px-2 py-1 text-center bg-green-50 text-green-700 font-bold text-[10px] w-20 border-r border-green-100">ปริมาณ<br />QTY</th>
                            <th className="px-2 py-1 text-center bg-green-50 text-green-700 font-bold text-[10px] w-28 border-r border-green-200">จำนวนเงิน<br />AMOUNT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {mergedItems.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="py-8 text-center text-slate-400 text-sm">
                                ยังไม่มีรายการ — เลือก PR ด้านบน
                              </td>
                            </tr>
                          ) : (
                            mergedItems.map((item, i) => {
                              const contractAmount = (item.contractQty || 0) * (item.contractPrice || 0);
                              const thisPeriodQty = Number(item.thisPeriodQty) || 0;
                              const thisPeriodAmount = Number(item.thisPeriodAmount) || 0;
                              const pctCurr = contractAmount > 0 ? ((thisPeriodAmount / contractAmount) * 100) : 0;
                              return (
                                <tr key={`${item.prId}-${item.prItemIndex}`} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="px-2 py-2 text-center border-r border-slate-100">
                                    <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 rounded-full text-[11px] font-bold text-slate-600">{i + 1}</span>
                                  </td>
                                  <td className="px-2 py-2 border-r border-slate-100 text-slate-700 font-medium">
                                    {item.description || "-"}
                                    <div className="text-[10px] text-slate-400 font-normal">PR: {item.prNo}</div>
                                  </td>
                                  <td className="px-2 py-2 text-center border-r border-slate-100 text-slate-500">{item.unit || "-"}</td>
                                  {/* Purple zone — read-only */}
                                  <td className="px-2 py-2 text-right border-r border-purple-100 bg-purple-50/30 text-slate-700 font-mono">
                                    {(item.contractQty || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </td>
                                  <td className="px-2 py-2 text-right border-r border-purple-100 bg-purple-50/30 text-slate-700 font-mono">
                                    {formatCurrency(item.contractPrice || 0)}
                                  </td>
                                  <td className="px-2 py-2 text-right border-r border-purple-200 bg-purple-50/30 font-semibold text-slate-800 font-mono">
                                    {formatCurrency(contractAmount)}
                                  </td>
                                  {/* Green zone — editable */}
                                  <td className="px-1.5 py-1.5 border-r border-green-100 bg-green-50/40">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      className="w-full border border-green-300 hover:border-green-400 focus:border-green-500 focus:ring-1 focus:ring-green-200 rounded px-2 py-1 text-xs text-right font-mono text-slate-700 bg-white transition-all"
                                      value={thisPeriodQty === 0 ? "" : thisPeriodQty}
                                      placeholder="0.00"
                                      onChange={(e) => updateItem(item.prId, item.prItemIndex, "thisPeriodQty", parseFloat(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="px-1.5 py-1.5 border-r border-green-200 bg-green-50/40">
                                    <input
                                      type="number"
                                      min={0}
                                      step="any"
                                      className="w-full border border-green-300 hover:border-green-400 focus:border-green-500 focus:ring-1 focus:ring-green-200 rounded px-2 py-1 text-xs text-right font-mono text-slate-700 bg-white transition-all"
                                      value={thisPeriodAmount === 0 ? "" : thisPeriodAmount}
                                      placeholder="0.00"
                                      onChange={(e) => updateItem(item.prId, item.prItemIndex, "thisPeriodAmount", parseFloat(e.target.value) || 0)}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right border-r border-slate-100 font-mono text-slate-600">
                                    {pctCurr.toFixed(2)}%
                                  </td>
                                  <td className="px-1.5 py-1.5">
                                    <input
                                      type="text"
                                      className="w-full border border-transparent hover:border-slate-200 focus:border-slate-300 focus:ring-1 focus:ring-slate-200 rounded px-2 py-1 text-xs text-slate-600 bg-transparent focus:bg-white transition-all"
                                      placeholder="หมายเหตุ..."
                                      value={item.remark || ""}
                                      onChange={(e) => updateItem(item.prId, item.prItemIndex, "remark", e.target.value)}
                                    />
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                        {mergedItems.length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-700">
                              <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-200 font-bold tracking-wide">
                                ผลรวมทั้งสิ้น / GRAND TOTAL
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-white text-sm font-mono">
                                {formatCurrency(mergedItems.reduce((s, it) => s + ((it.contractQty || 0) * (it.contractPrice || 0)), 0))}
                              </td>
                              <td />
                              <td className="py-2.5 px-3 text-right font-bold text-white text-sm font-mono">
                                {formatCurrency(totalAmount)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-bold text-green-300 text-xs">
                                {(() => {
                                  const contractTotal = mergedItems.reduce((s, it) => s + ((it.contractQty || 0) * (it.contractPrice || 0)), 0);
                                  return contractTotal > 0 ? ((totalAmount / contractTotal) * 100).toFixed(2) + "%" : "0.00%";
                                })()}
                              </td>
                              <td />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}

                {/* หมายเหตุ */}
                <div>
                  <label className="text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider block">หมายเหตุ</label>
                  <textarea
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm min-h-[60px] focus:border-orange-300 focus:ring-1 focus:ring-orange-100"
                    placeholder="หมายเหตุ (ถ้ามี)..."
                    value={form.note}
                    onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
                <div className="text-xs text-slate-500">
                  ยอดรวมงวดนี้: <span className="font-bold text-orange-700 text-sm">{formatCurrency(totalAmount)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={closeModal} className="px-4 rounded-lg">
                    ยกเลิก
                  </Button>
                  <Button
                    size="sm"
                    className="px-5 rounded-lg flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? (
                      <span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                      <Save size={13} />
                    )}
                    {saving ? "กำลังบันทึก..." : "บันทึก Payment"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default PaymentView;
// @ts-nocheck
import React, { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Trash2, Edit, XCircle, Save, Upload,
  CreditCard, AlertTriangle, CheckCircle, RotateCcw,
  ThumbsUp, ThumbsDown, Zap, Clock, ShieldCheck,
  ChevronLeft, ChevronRight, Paperclip, Send,
  FileText, Download,
} from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import ResizableTh from "../components/ResizableTh";
import { Card, Button, formatCurrency } from "../components/ui";
import { uploadAttachment, deleteStorageFile } from "../lib/uploadAttachment";
import { generatePaymentPdfBytes } from "../lib/pdfForms";
import {
  buildPaymentSignatureUserFields,
  clearPaymentSignatureUserFields,
  resolvePaymentSignatureImage,
  stampPaymentSignaturesToPdf,
} from "../lib/paymentSignatureStamps";
import { getUserIdentity } from "../lib/poSignatureStamps";
import {
  PO_DISCOUNT_ALLOCATION_VERSION,
  calculateNetPeriodAmount,
  calculatePeriodDiscount,
  appendPaymentDiscountAdjustment,
  getPaymentAccumulatedGrossAmount,
  getPaymentContractGrossAmount,
  getPaymentDiscountAmount,
  getPaymentGrossPeriodAmount,
  getPaymentNetPeriodAmount,
  getPoDiscountAmount,
  getPoDiscountRate,
  getPoItemsGrossSubtotal,
  getPoDiscountTarget,
} from "../lib/poDiscount";
import {
  buildDeleteLogDetails,
  buildRecordSummary,
  formatLogCurrency,
  truncateLogText,
} from "../lib/systemLogDetails";


// ─── Constants ────────────────────────────────────────────────────────────────
const PAYMENT_TYPES = [
  { code: "SP", label: "SP — ผู้รับเหมา (จ้างเหมา)" },
  { code: "DC", label: "DC — ค่าแรง" },
];

const BILLING_CYCLES = [
  { value: "วันที่ 10 จ่าย 25", label: "วันที่ 10 จ่าย 25" },
  { value: "วันที่ 15 วางบิล 18 (จ่าย 25)", label: "วันที่ 15 วางบิล 18 (จ่าย 25)" },
  { value: "วันที่ 25 จ่าย 10", label: "วันที่ 25 จ่าย 10" },
  { value: "วันที่ 30 วางบิล 3 (จ่าย 10)", label: "วันที่ 30 วางบิล 3 (จ่าย 10)" },
];

// ─── Approval Flow Constants ──────────────────────────────────────────────────
const STATUS_APPROVER_ROLES: Record<string, string[]> = {
  "Pending CM": ["CM", "Administrator"],
  "Pending PM": ["PM", "PCM", "Administrator"],
  "Pending MD": ["MD", "GM", "Administrator"],
  "Pending Procurement": ["Procurement", "Administrator"],
};

const getFirstPendingStatus = (roles: string[]): string => {
  if (roles.some((r) => ["MD", "GM"].includes(r))) return "Pending Procurement";
  if (roles.some((r) => ["PM", "PCM"].includes(r))) return "Pending Procurement";
  if (roles.includes("CM")) return "Pending PM";
  return "Pending CM";
};

const getNextStatus = (status: string): string => {
  if (status === "Pending MD") return "Pending Procurement";
  const chain = ["Pending CM", "Pending PM", "Pending Procurement", "Active"];
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
  "Draft": "bg-gray-100 text-gray-700 border border-gray-200",
  "Pending CM": "bg-yellow-100 text-yellow-800 border border-yellow-200",
  "Pending PM": "bg-amber-100 text-amber-800 border border-amber-200",
  "Pending MD": "bg-orange-100 text-orange-800 border border-orange-200",
  "Pending Procurement": "bg-blue-100 text-blue-800 border border-blue-200",
  "Active": "bg-green-100 text-green-800 border border-green-200",
  "In Process": "bg-indigo-100 text-indigo-800 border border-indigo-300",
  "งวดงาน Pending CM": "bg-yellow-200 text-yellow-900 border border-yellow-400",
  "งวดงาน Pending PM": "bg-amber-200 text-amber-900 border border-amber-400",
  "Wait Pay": "bg-orange-200 text-orange-900 border border-orange-400",
  "Hold": "bg-yellow-200 text-yellow-900 border border-yellow-400",
  "Paid": "bg-emerald-100 text-emerald-800 border border-emerald-300",
  "Revision Requested": "bg-rose-100 text-rose-800 border border-rose-200",
  "Reject": "bg-red-100 text-red-800 border border-red-300",
  "Rejected": "bg-red-100 text-red-800 border border-red-300",
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

// Payment numbers use the final numeric segment as the period number (e.g. PO-001).
// Keep these helpers deterministic so period numbers can never be selected manually.
const getPaymentPeriodNo = (payment: any): number => {
  const explicit = Number.parseInt(String(payment?.periodNo ?? ""), 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const suffix = String(payment?.paymentNo || "").match(/-(\d+)$/);
  const fromPaymentNo = suffix ? Number.parseInt(suffix[1], 10) : NaN;
  return Number.isFinite(fromPaymentNo) && fromPaymentNo > 0 ? fromPaymentNo : 1;
};

const getPaymentBaseNo = (paymentNo: any): string => {
  const value = String(paymentNo || "PAYMENT");
  return value.replace(/-\d+$/, "");
};

const PaymentStatusBadge = ({ status }: { status: string }) => {
  const displayStatus = status === "Rejected" ? "Reject" : (status || "Draft");
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_BADGE_COLORS[displayStatus] || "bg-slate-100 text-slate-700 border border-slate-200"}`}>
      {displayStatus}
    </span>
  );
};



// ─── Component ────────────────────────────────────────────────────────────────
const PaymentView = React.memo(() => {
  const {
    prs, pos, payments = [], invoices = [], vendors, projects, addData, updateData, deleteData, loadVendors,
    showAlert, openConfirm, logAction, userData, user, userRoles, canUseFunction, functionPermissions,
    isColumnVisible, columnWidths, handleColumnResize,
  } = useAppData();
  const myRoles: string[] = userRoles || [];

  const { selectedProjectId, isFullScreenModalOpen, setIsFullScreenModalOpen } = useUI();

  const getPaymentLogSummary = React.useCallback(
    (payment: any, patch: any = null) => buildRecordSummary("payments", patch ? { ...payment, ...patch } : payment, payment?.id),
    []
  );

  // ─── UI State ───────────────────────────────────────────────────────────────

  const [viewingPayment, setViewingPayment] = useState<any>(null);
  const [paymentSignatureImages, setPaymentSignatureImages] = useState<Record<string, string | null>>({});
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState(false);

  // ─── PDF Preview ────────────────────────────────────────────────────────────
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewPayment, setPdfPreviewPayment] = useState<any>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // ─── Activate PO Modal ────────────────────────────────────────────────────
  const [activatingPO, setActivatingPO] = useState<any>(null);
  const [activatingContractTitle, setActivatingContractTitle] = useState("");

  // ─── Active-state qty edit ────────────────────────────────────────────────
  const [activeQtyEdits, setActiveQtyEdits] = useState<Record<string, any>>({});
  const [savingActiveQty, setSavingActiveQty] = useState(false);
  const [isQtyEditMode, setIsQtyEditMode] = useState(false);
  const [periodBillingCycle, setPeriodBillingCycle] = useState("");

  // ─── Revision Request ─────────────────────────────────────────────────────
  const [revisionModalPayment, setRevisionModalPayment] = useState<any>(null);
  const [revisionNote, setRevisionNote] = useState("");

  // ─── Reject Reason ───────────────────────────────────────────────────────
  const [rejectModalPayment, setRejectModalPayment] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [waitPayModalPayment, setWaitPayModalPayment] = useState<any>(null);
  const [paySlipFile, setPaySlipFile] = useState<File | null>(null);
  // (removed payJobStatus selection — status determined by progress percentage)

  // ─── Job Complete + Subcontractor Evaluation ────────────────────────────────
  const [evalModalPayment, setEvalModalPayment] = useState<any>(null);
  const [evalForm, setEvalForm] = useState({
    jobName: "",
    jobNo: "",
    evaluatorName: "",
    evaluationDate: new Date().toISOString().split("T")[0],
    q1: "",
    q2: "",
    q3: "",
    q4: "",
    q5: "",
    recommendations: "",
  });
  const [evaluating, setEvaluating] = useState(false);

  const [holdModalPayment, setHoldModalPayment] = useState<any>(null);
  const [holdReasonInput, setHoldReasonInput] = useState("");
  const [holdDecision, setHoldDecision] = useState<"backToEdit" | "keepHold">("keepHold");

  // ─── Period Navigation ─────────────────────────────────────────────────────
  const [viewPeriodIdx, setViewPeriodIdx] = useState(-1);

  React.useEffect(() => {
    if (!viewingPayment) {
      setPaymentSignatureImages({});
      return;
    }

    let cancelled = false;
    const allPeriods = viewingPayment.periods || [];
    const source =
      viewPeriodIdx >= 0 && viewPeriodIdx < allPeriods.length
        ? allPeriods[viewPeriodIdx]
        : viewingPayment;

    setPaymentSignatureImages({});
    (async () => {
      const entries = await Promise.all(
        ["Signature1", "Signature2", "Signature3"].map(async (slot) => {
          try {
            const image = await resolvePaymentSignatureImage(source, slot, {
              currentUserData: userData,
              currentAuthUser: user,
            });
            return [slot, image || null];
          } catch (err) {
            console.warn(`[Payment Signature UI] Resolve ${slot} failed:`, err);
            return [slot, null];
          }
        })
      );
      if (!cancelled) setPaymentSignatureImages(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [viewingPayment, viewPeriodIdx, userData, user]);

  // ─── Period Attachment Upload ─────────────────────────────────────────────
  const [periodAttachFile, setPeriodAttachFile] = useState<File | null>(null);
  const [uploadingAttach, setUploadingAttach] = useState(false);
  const periodAttachFileRef = React.useRef<HTMLInputElement>(null);

  // ─── Period Reject Modal ──────────────────────────────────────────────────
  const [periodRejectModal, setPeriodRejectModal] = useState<any>(null);
  const [periodRejectReason, setPeriodRejectReason] = useState("");

  React.useEffect(() => {
    if (!viewingPayment) return;
    const paymentStatus = viewingPayment.status || "Draft";
    if (["Reject", "Rejected"].includes(paymentStatus)) {
      setIsQtyEditMode(true);
      setPeriodBillingCycle(viewingPayment.billingCycle || "");
      setActiveQtyEdits({});
    }
  }, [viewingPayment]);



  // ─── Main Payment Table — resizable columns (MasterAdmin, persisted globally) ──
  const PAYMENT_MAIN_DEFAULT_WIDTHS = { paymentNo: 160, type: 80, contractor: 200, contractTitle: 180, billingCycle: 140, totalAmount: 140, accumAmount: 140, periodAmount: 140, progress: 128, status: 120, actions: 96 };
  const paymentMainColWidths = useMemo(() => ({ ...PAYMENT_MAIN_DEFAULT_WIDTHS, ...(columnWidths?.paymentMain || {}) }), [columnWidths]);
  const isPaymentMainTableAdmin = myRoles.includes("Administrator");

  // ─── Contract Items Table — resizable columns (MasterAdmin, persisted globally) ──
  const PAY_ITEMS_DEFAULT_WIDTHS = {
    item: 40, description: 160, unit: 56,
    cQty: 40, cPrice: 48, cAmount: 64,
    tQty: 40, tAmount: 64, tProgress: 40,
    pSum: 40, pAmt: 64, pPrev: 40,
    currQty: 40, currAmt: 64, currPct: 40,
    remark: 120
  };
  const payItemColWidths = useMemo(() => ({ ...PAY_ITEMS_DEFAULT_WIDTHS, ...(columnWidths?.payItems || {}) }), [columnWidths]);
  const isPayTableAdmin = myRoles.includes("Administrator");
  // helper: ถ้า function key ยังไม่ได้กำหนดค่าใน Firestore (empty []) → fallback ให้ใช้ role check เดิม
  const funcConfigured = (key: string) => {
    const roles = functionPermissions?.["payment-subcontract"]?.[key];
    return Array.isArray(roles);
  };
  const canCreatePayment = canUseFunction?.("payment-subcontract", "create") !== false;
  const canEditPayment = canUseFunction?.("payment-subcontract", "edit") !== false;
  const canDeletePayment = canUseFunction?.("payment-subcontract", "delete") !== false;
  const canSubmitPayment = canUseFunction?.("payment-subcontract", "submit") !== false;
  const canApproveFlow = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "approveFlow") !== false;
  const canRejectFlow = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "rejectFlow") !== false;
  const canApproveRevision = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "approveRevision") !== false;
  const canRejectRevision = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "rejectRevision") !== false;
  const canSavePeriodDraft = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "savePeriodDraft") !== false;
  const canSubmitPeriod = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "submitPeriod") !== false;
  const canApprovePeriod = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "approvePeriod") !== false;
  const canRequestRevision = myRoles.includes("Administrator") || (
    !funcConfigured("requestRevision") || canUseFunction?.("payment-subcontract", "requestRevision") !== false
  );
  const canPayPayment = myRoles.includes("Administrator") || (
    myRoles.some((r) => ["Procurement", "PCM"].includes(r))
    && canUseFunction?.("payment-subcontract", "pay") !== false
  );
  const canHoldPayment = myRoles.includes("Administrator") || (
    myRoles.some((r) => ["Procurement", "PCM"].includes(r))
    && canUseFunction?.("payment-subcontract", "hold") !== false
  );
  const canStartNextPeriod = !myRoles.some(r => r === "Procurement") && (myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "startNextPeriod") !== false);
  const canCompleteJob = myRoles.includes("Administrator") || canUseFunction?.("payment-subcontract", "completeJob") !== false;
  // ── aliases ที่ชัดเจนเพื่อส่งให้ ResizableTh (ใช้ handleColumnResize จาก AppDataContext)
  const handlePaymentMainColResize = handleColumnResize;
  const handlePayItemColResize = handleColumnResize;





  // ─── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = (p: any) => {
    if (!canDeletePayment) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ลบ Payment", "warning");
    openConfirm("ยืนยันการลบ", `ต้องการลบ Payment ${p.paymentNo} ใช่หรือไม่?\n(ไฟล์แนบที่อัปโหลดไว้จะถูกลบด้วย)`, async () => {
      // ── ลบไฟล์ใน Firebase Storage ก่อนลบ Firestore doc ──
      if (p.paySlipPath) {
        try { const { deleteGeneratedPdf } = await import("../lib/pdfForms"); await deleteGeneratedPdf(p.paySlipPath); } catch (_) {}
      } else if (p.paySlipUrl) {
        await deleteStorageFile(p.paySlipUrl);
      }
      for (const att of (p.paymentAttachments || [])) {
        if (att?.url) await deleteStorageFile(att.url);
      }
      await deleteData("payments", p.id, { skipLog: true });
      await logAction(
        "Delete Payment",
        buildDeleteLogDetails("payments", p, p.id),
        selectedProjectId
      );
    }, "danger");
  };

  // ─── Approval Actions ────────────────────────────────────────────────────────

  const handleSubmit = async (p: any) => {
    if (!canSubmitPayment) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ส่ง Payment", "warning");
    const firstStatus = getFirstPendingStatus(myRoles);
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: firstStatus,
        submittedBy: userData?.name || user?.email || "",
        submittedAt: new Date().toISOString(),
        revisionRequested: false,
      }, { skipLog: true });
      await logAction(
        "Submit Payment",
        `ส่งอนุมัติ | ${getPaymentLogSummary(p, { status: firstStatus })} | สถานะ: ${p.status || "Draft"} → ${firstStatus}`,
        selectedProjectId
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleApprove = async (p: any) => {
    if (!canApproveFlow) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติ Payment", "warning");
    const next = getNextStatus(p.status);
    const label = p.status === "Pending Procurement" ? "Active" : next;
    setActioning(true);
    try {
      const approver = getUserIdentity(userData, user);
      const approvalSignatureFields =
        p.status === "Pending CM" ? {
          ...buildPaymentSignatureUserFields("Signature2", userData, user),
          cmApprovedByUid: approver.uid || null,
          cmApprovedByEmail: approver.email || null,
          cmApprovedByName: approver.name || null,
          cmApprovedAt: new Date().toISOString(),
        } :
        p.status === "Pending PM" ? {
          ...buildPaymentSignatureUserFields("Signature3", userData, user),
          pmApprovedByUid: approver.uid || null,
          pmApprovedByEmail: approver.email || null,
          pmApprovedByName: approver.name || null,
          pmApprovedAt: new Date().toISOString(),
        } : {};
      await updateData("payments", p.id, {
        status: next,
        [`approvedBy.${p.status.replace("Pending ", "")}`]: approver.name || userData?.name || user?.email || "",
        [`approvedAt.${p.status.replace("Pending ", "")}`]: new Date().toISOString(),
        revisionRequested: false,
        ...approvalSignatureFields,
      }, { skipLog: true });



      await logAction(
        "Approve Payment",
        `อนุมัติ | ${getPaymentLogSummary(p, { status: next })} | สถานะ: ${p.status} → ${label}`,
        selectedProjectId
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRejectConfirm = async () => {
    if (!rejectModalPayment) return;
    if (!canRejectFlow) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธ Payment", "warning");
    setActioning(true);
    try {
      await updateData("payments", rejectModalPayment.id, {
        status: "Reject",
        rejectReason: rejectReason.trim() || "-",
        rejectedBy: userData?.name || user?.email || "",
        rejectedAt: new Date().toISOString(),
        revisionRequested: false,
      }, { skipLog: true });
      await logAction(
        "Reject Payment",
        `ปฏิเสธ | ${getPaymentLogSummary(rejectModalPayment, { status: "Reject" })} | เหตุผล: ${truncateLogText(rejectReason.trim() || "-", 120)}`,
        selectedProjectId
      );
      setRejectModalPayment(null);
      setRejectReason("");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRequestRevision = async () => {
    if (!revisionModalPayment) return;
    if (!canRequestRevision) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ขอแก้ไข Payment", "warning");
    const p = revisionModalPayment;
    const targetRole = p.status === "Active" ? "Procurement" : p.status.replace("Pending ", "");
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
      await logAction(
        "Request Revision",
        `ขอแก้ไข | ${getPaymentLogSummary(p)} | ส่งกลับให้: ${targetRole} | เหตุผล: ${truncateLogText(revisionNote.trim() || "-", 120)}`,
        selectedProjectId
      );
      setRevisionModalPayment(null);
      setRevisionNote("");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleApproveRevision = async (p: any) => {
    if (!canApproveRevision) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติคำขอแก้ไข", "warning");
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        status: "Draft",
        revisionRequested: false,
        revisionApprovedBy: userData?.name || user?.email || "",
        revisionApprovedAt: new Date().toISOString(),
      }, { skipLog: true });
      await logAction(
        "Approve Revision",
        `อนุมัติขอแก้ไข | ${getPaymentLogSummary(p, { status: "Draft" })} | สถานะ: ${p.status} → Draft`,
        selectedProjectId
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handleRejectRevision = async (p: any) => {
    if (!canRejectRevision) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธคำขอแก้ไข", "warning");
    setActioning(true);
    try {
      await updateData("payments", p.id, {
        revisionRequested: false,
      }, { skipLog: true });
      await logAction(
        "Reject Revision",
        `ปฏิเสธขอแก้ไข | ${getPaymentLogSummary(p)} | คงสถานะ: ${p.status}`,
        selectedProjectId
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  // ─── Active Qty Update ────────────────────────────────────────────────────────
  const updateActiveQty = (key: string, field: string, val: any, contractPrice: number, contractAmount: number, prevAccumAmount: number) => {
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
      // flag ถ้า cumulative เกิน 100%
      const thisPeriodAmt = Number(updated.thisPeriodAmount) || 0;
      updated._exceedsCumulative = contractAmount > 0 && (prevAccumAmount + thisPeriodAmt) > contractAmount;
      return { ...prev, [key]: updated };
    });
  };

  const handleSaveActiveQty = async (p: any, finalize = false) => {
    if (finalize && !canSubmitPeriod) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์บันทึกงวดงานส่งอนุมัติ", "warning");
    if (!finalize && !canSavePeriodDraft) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์บันทึก Draft งวดงาน", "warning");
    // บังคับเลือกรอบวางบิลทุกครั้ง
    if (!periodBillingCycle) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาเลือก รอบวางบิล ก่อนบันทึกงวดงาน", "warning");
      return;
    }
    // validate ก่อน map — ห้าม throw ใน .map()
    for (const it of (p.items || [])) {
      const key = `${it.prId}_${it.prItemIndex}`;
      const edit = activeQtyEdits[key];
      if (!edit) continue;
      const qty = parseFloat(edit.thisPeriodQty ?? it.thisPeriodQty) || 0;
      const amt = parseFloat(edit.thisPeriodAmount ?? it.thisPeriodAmount) || 0;
      const contractAmt = (it.contractQty || 0) * (it.contractPrice || 0);
      const prevAccumAmt = Number(it.prevAccumAmount) || 0;
      const cumulativePct = contractAmt > 0 ? ((prevAccumAmt + amt) / contractAmt) * 100 : 0;
      if (qty < 0) {
        showAlert("ค่าไม่ถูกต้อง", `ปริมาณต้องไม่น้อยกว่า 0`, "warning");
        return;
      }
      if (cumulativePct > 100) {
        showAlert("เกิน 100%", `ผลงานสะสมรวมงวดนี้ (${cumulativePct.toFixed(2)}%) ต้องไม่เกิน 100% ของยอดสัญญา`, "warning");
        return;
      }
    }
    const updatedItems = (p.items || []).map((it: any) => {
      const key = `${it.prId}_${it.prItemIndex}`;
      const edit = activeQtyEdits[key];
      if (!edit) return it;
      const qty = parseFloat(edit.thisPeriodQty ?? it.thisPeriodQty) || 0;
      const amt = parseFloat(edit.thisPeriodAmount ?? it.thisPeriodAmount) || 0;
      const contractAmt = (it.contractQty || 0) * (it.contractPrice || 0);
      const pct = contractAmt > 0 ? Math.round((amt / contractAmt) * 10000) / 100 : 0;
      return { ...it, thisPeriodQty: qty, thisPeriodAmount: amt, thisPeriodPct: pct };
    });
    setSavingActiveQty(true);
    try {
       const totalAmt = updatedItems.reduce((s: number, it: any) => s + (Number(it.thisPeriodAmount) || 0), 0);
       const paymentDiscountEnabled = p.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION;
       const poGrossAmount = Number(p.poGrossAmount) || getPaymentContractGrossAmount(p);
       const poDiscountAmount = paymentDiscountEnabled ? (Number(p.poDiscountAmount) || 0) : 0;
       const previousDiscountAmount = paymentDiscountEnabled ? (Number(p.prevAccumDiscount) || 0) : 0;
       const cumulativeGrossAmount = updatedItems.reduce(
         (s: number, it: any) => s + (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0),
         0
       );
       const contractGrossAmount = updatedItems.reduce(
         (s: number, it: any) => s + (Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0),
         0
       );
       const thisPeriodDiscount = paymentDiscountEnabled
         ? calculatePeriodDiscount({
             grossPeriodAmount: totalAmt,
             poGrossAmount,
             poDiscountAmount,
             previousDiscountAmount,
             cumulativeGrossAmount,
             contractGrossAmount,
           })
         : 0;
       const netPeriodAmount = paymentDiscountEnabled
         ? calculateNetPeriodAmount(totalAmt, thisPeriodDiscount)
         : totalAmt;
        const now = new Date().toISOString();
        const normalizedContractTitle = typeof p.contractTitle === "string" ? p.contractTitle.trim() : "";
        const extraFields: Record<string, any> = {
          billingCycle: periodBillingCycle,
          contractTitle: normalizedContractTitle,
          ...(paymentDiscountEnabled ? {
            grossPeriodAmount: totalAmt,
            thisPeriodDiscount,
            netPeriodAmount,
            discountAppliedAmount: previousDiscountAmount + thisPeriodDiscount,
          } : {}),
        };

        if (finalize) {
          extraFields.status = "งวดงาน Pending CM";
          const preparedBy = getUserIdentity(userData, user);
          extraFields.periodPreparedBy = preparedBy.name || userData?.name || user?.email || "";
          extraFields.periodPreparedByUid = preparedBy.uid || null;
          extraFields.periodPreparedByEmail = preparedBy.email || null;
          extraFields.periodPreparedAt = now;
          Object.assign(extraFields, buildPaymentSignatureUserFields("Signature1", userData, user));
          Object.assign(extraFields, clearPaymentSignatureUserFields(["Signature2", "Signature3"]));
          // reset previous period approvals when re-submitting
          extraFields.periodCheckedBy = null;
          extraFields.periodCheckedByUid = null;
          extraFields.periodCheckedByEmail = null;
          extraFields.periodCheckedAt = null;
          extraFields.periodApprovedBy = null;
          extraFields.periodApprovedByUid = null;
          extraFields.periodApprovedByEmail = null;
          extraFields.periodApprovedAt = null;
        }
        await updateData("payments", p.id, { items: updatedItems, amount: netPeriodAmount, ...extraFields }, { skipLog: true });
        await logAction(
          finalize ? "Submit งวดงาน" : "Save Draft งวดงาน",
          `${finalize ? "บันทึกงวดงาน" : "บันทึก Draft งวดงาน"} | ${getPaymentLogSummary(p, { items: updatedItems, amount: netPeriodAmount, ...extraFields })} | ยอดก่อนหัก: ${formatLogCurrency(totalAmt) || "฿0"} | ส่วนลด: ${formatLogCurrency(thisPeriodDiscount) || "฿0"} | ยอดสุทธิ: ${formatLogCurrency(netPeriodAmount) || "฿0"}`,
          selectedProjectId
        );
        setActiveQtyEdits({});
        setPeriodBillingCycle("");
        setIsQtyEditMode(false);
        setViewingPayment((prev: any) => {
          if (!prev) return prev;
          return { ...prev, items: updatedItems, amount: netPeriodAmount, ...extraFields };
        });
    } catch (_) { }
    finally { setSavingActiveQty(false); }
  };

  // ─── Period (งวดงาน) Reject → กลับไป Reject ────────────────────────────────
  const handlePeriodRejectConfirm = async () => {
    if (!periodRejectModal) return;
    if (!canApprovePeriod) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธงวดงาน", "warning");
    setActioning(true);
    try {
      const reason = periodRejectReason.trim() || "-";
      const rejectedBy = userData?.name || user?.email || "";
      const rejectedAt = new Date().toISOString();
      await updateData("payments", periodRejectModal.id, {
        status: "Reject",
        periodRejectedBy: rejectedBy,
        periodRejectedAt: rejectedAt,
        periodRejectReason: reason,
        rejectReason: reason,
        rejectedBy,
        rejectedAt,
        ...clearPaymentSignatureUserFields(["Signature2", "Signature3"]),
        periodCheckedBy: null,
        periodCheckedByUid: null,
        periodCheckedByEmail: null,
        periodCheckedAt: null,
        periodApprovedBy: null,
        periodApprovedByUid: null,
        periodApprovedByEmail: null,
        periodApprovedAt: null,
      }, { skipLog: true });
      await logAction(
        "Reject งวดงาน",
        `ปฏิเสธงวดงาน | ${getPaymentLogSummary(periodRejectModal, { status: "Reject" })} | เหตุผล: ${truncateLogText(periodRejectReason.trim() || "-", 120)}`,
        selectedProjectId
      );
      setPeriodRejectModal(null);
      setPeriodRejectReason("");
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  // ─── Period Attachment Upload ─────────────────────────────────────────────
  const handleUploadPeriodAttachment = async (p: any) => {
    // _autoUploadFile มาจาก onChange trigger, periodAttachFile มาจาก manual (fallback)
    const fileToUpload: File | null = p._autoUploadFile || periodAttachFile;
    if (!fileToUpload) return;
    // สร้าง payment object สะอาด (ไม่มี _autoUploadFile field)
    const { _autoUploadFile, ...cleanP } = p;
    setUploadingAttach(true);
    try {
      const { url, name } = await uploadAttachment(fileToUpload, {
        type: "payments",
        projectId: selectedProjectId || cleanP.projectId || "",
        docId: cleanP.paymentNo || cleanP.id,
      });
      const prevAttachments = Array.isArray(cleanP.paymentAttachments) ? cleanP.paymentAttachments : [];
      const newAttachment = { url, name, uploadedBy: userData?.name || user?.email || "", uploadedAt: new Date().toISOString() };
      const updatedAttachments = [...prevAttachments, newAttachment];
      await updateData("payments", cleanP.id, { paymentAttachments: updatedAttachments }, { skipLog: true });
      await logAction(
        "Upload Payment Attachment",
        `อัปโหลดไฟล์แนบ | ${getPaymentLogSummary(cleanP, { paymentAttachments: updatedAttachments })} | ไฟล์: ${truncateLogText(name, 80)}`,
        selectedProjectId
      );
      setPeriodAttachFile(null);
      if (periodAttachFileRef.current) periodAttachFileRef.current.value = "";
      setViewingPayment((prev: any) => prev ? { ...prev, paymentAttachments: updatedAttachments } : prev);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setUploadingAttach(false); }
  };

  const handleDeletePeriodAttachment = async (p: any, index: number) => {
    const attachmentToDelete = p.paymentAttachments?.[index];
    if (!attachmentToDelete) return;
    try {
      if (attachmentToDelete.url) await deleteStorageFile(attachmentToDelete.url);
      const updatedAttachments = [...p.paymentAttachments];
      updatedAttachments.splice(index, 1);
      await updateData("payments", p.id, { paymentAttachments: updatedAttachments }, { skipLog: true });
      await logAction(
        "Delete Payment Attachment",
        `ลบไฟล์แนบ | ${getPaymentLogSummary(p, { paymentAttachments: updatedAttachments })} | ไฟล์: ${truncateLogText(attachmentToDelete.name, 80)}`,
        selectedProjectId
      );
      setViewingPayment((prev: any) => prev ? { ...prev, paymentAttachments: updatedAttachments } : prev);
    } catch (e: any) {
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    }
  };

  // ─── Period (งวดงาน) Approve ─────────────────────────────────────────────────
  const handlePeriodApprove = async (p: any) => {
    if (!canApprovePeriod) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติงวดงาน", "warning");
    const isCheckStep = p.status === "งวดงาน Pending CM";
    const nextStatus = isCheckStep ? "งวดงาน Pending PM" : "Wait Pay";
    const sigField = isCheckStep ? "periodCheckedBy" : "periodApprovedBy";
    const dateField = isCheckStep ? "periodCheckedAt" : "periodApprovedAt";
    setActioning(true);
    try {
      const approver = getUserIdentity(userData, user);
      const uidField = isCheckStep ? "periodCheckedByUid" : "periodApprovedByUid";
      const emailField = isCheckStep ? "periodCheckedByEmail" : "periodApprovedByEmail";
      const signatureFields = buildPaymentSignatureUserFields(isCheckStep ? "Signature2" : "Signature3", userData, user);
      await updateData("payments", p.id, {
        status: nextStatus,
        [sigField]: approver.name || userData?.name || user?.email || "",
        [uidField]: approver.uid || null,
        [emailField]: approver.email || null,
        [dateField]: new Date().toISOString(),
        ...signatureFields,
      }, { skipLog: true });

      if (nextStatus === "Wait Pay") {
        const hasInvoice = (invoices || []).some((invoice: any) => (
          invoice.sourceType === "payment"
            ? String(invoice.paymentId || invoice.poId || "") === String(p.id)
            : String(invoice.poId || "") === String(p.id)
        ));
        if (!hasInvoice) {
          const paymentVendor = (vendors || []).find((vendor: any) => String(vendor.id) === String(p.contractorId || p.vendorId || ""));
          const paymentVendorName = p.contractorName || p.vendorName || paymentVendor?.name || "";
           const invoiceItemsGross = Array.isArray(p.items)
             ? p.items.map((item: any, idx: number) => ({
                poItemIndex: idx,
                materialNo: item.materialNo || "",
                description: item.description || "งานจ้างเหมา/ค่าแรง",
                unit: item.unit || "งวด",
                quantity: 1,
                invoiceQty: 1,
                price: Number(item.thisPeriodAmount) || 0,
                 amount: Number(item.thisPeriodAmount) || 0,
               }))
             : [];
           const invoiceItems = appendPaymentDiscountAdjustment(
             invoiceItemsGross,
             p.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION ? (Number(p.thisPeriodDiscount) || 0) : 0,
             p.discountPrNo || "",
           );
          await addData("invoices", {
            invNo: "",
            invDate: new Date().toISOString().split("T")[0],
            paymentType: "เครดิต",
            bankAccountNo: "",
            poId: p.id,
            poNo: p.paymentNo || p.id,
            poRef: p.paymentNo || p.id,
            vendorId: p.contractorId || "",
            vendorName: paymentVendorName,
            items: invoiceItems,
            amount: Number(p.amount) || invoiceItems.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0),
            isDeposit: false,
            depositAmount: 0,
            originalAmount: Number(p.amount) || 0,
            remainingAmount: 0,
            invoiceMode: "payment_subcontract",
            description: `Payment งวด ${p.periodNo || ""} - ${p.paymentNo || p.id}`,
            projectId: p.projectId || selectedProjectId,
            status: "Draft",
            sourceType: "payment",
            paymentId: p.id,
            paymentNo: p.paymentNo || p.id,
            paymentPeriodNo: p.periodNo || "",
             paymentPeriodSnapshot: {
               paymentNo: p.paymentNo || p.id,
               periodNo: p.periodNo || "",
               billingCycle: p.billingCycle || "",
               amount: Number(p.amount) || 0,
               grossPeriodAmount: Number(p.grossPeriodAmount) || getPaymentGrossPeriodAmount(p),
               thisPeriodDiscount: p.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION ? (Number(p.thisPeriodDiscount) || 0) : 0,
               discountPrId: p.discountPrId || null,
               discountPrNo: p.discountPrNo || null,
               items: Array.isArray(p.items) ? p.items : [],
              statusBeforeInvoice: p.status,
            },
            invoiceAttachments: [],
            createdAt: new Date().toISOString(),
            createdBy: userData?.name || user?.email || "",
          }, null, { skipLog: true });
        }
      }



      await logAction(
        "Approve งวดงาน",
        `${isCheckStep ? "CM Check" : "PM Approve"} | ${getPaymentLogSummary(p, { status: nextStatus })} | สถานะ: ${p.status} → ${nextStatus}`,
        selectedProjectId
      );
      setViewingPayment(null);
    } catch (e) { showAlert("เกิดข้อผิดพลาด", String(e), "error"); }
    finally { setActioning(false); }
  };

  const handlePayConfirm = async () => {
    if (!waitPayModalPayment) return;
    if (!canPayPayment) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์จ่าย Payment", "warning");
    if (!paySlipFile) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาอัปโหลดไฟล์ Payin/สลิปก่อนกด Pay", "warning");
      return;
    }
    setActioning(true);
    try {
      const items = waitPayModalPayment.items || [];
      const contractTotal = items.reduce((s: number, it: any) => s + ((Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0)), 0);
      const accumTotal = items.length > 0
        ? items.reduce((s: number, it: any) => s + (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0), 0)
        : Number(waitPayModalPayment.amount) || 0;
      const progressPct = contractTotal > 0 ? (accumTotal / contractTotal) * 100 : 0;
      const nextStatus = progressPct >= 99.99 ? "Paid" : "In Process";

      const safeNo = (waitPayModalPayment.paymentNo || "payment").replace(/[^a-zA-Z0-9\-_]/g, "_");
      const path = `payments/${selectedProjectId}/pay-slip/${safeNo}_${Date.now()}`;
      const { url: slipUrl, name: slipName } = await uploadAttachment(paySlipFile, path);
      await updateData("payments", waitPayModalPayment.id, {
        status: nextStatus,
        paidAt: new Date().toISOString(),
        paidBy: userData?.name || user?.email || "",
        paySlipUrl: slipUrl,
        paySlipName: slipName,
        holdReason: null,
      }, { skipLog: true });

      // หาก Payment เป็น "Paid" (ครบ 100% หรือเลือกจบงาน) ให้เปลี่ยนสถานะ PO เป็น "Closed PO"
      if (nextStatus === "Paid") {
        const selectedPrIds = waitPayModalPayment.selectedPrIds || [];
        for (const poId of selectedPrIds) {
          const po = (pos || []).find((x: any) => x.id === poId);
          if (po && po.status !== "Closed PO") {
            await updateData("pos", poId, {
              status: "Closed PO",
              statusNow: "Closed PO",
            }, { skipLog: true });
          }
        }
      }

      await logAction(
        "Pay Payment",
        `จ่ายเงิน | ${getPaymentLogSummary(waitPayModalPayment, { status: nextStatus })} | สถานะ: ${waitPayModalPayment.status} → ${nextStatus}`,
        selectedProjectId
      );
      setWaitPayModalPayment(null);
      setPaySlipFile(null);
      if (viewingPayment?.id === waitPayModalPayment.id) {
        setViewingPayment((prev: any) => prev ? ({
          ...prev,
          status: nextStatus,
          paidAt: new Date().toISOString(),
          paidBy: userData?.name || user?.email || "",
          paySlipUrl: slipUrl,
          paySlipName: slipName,
          holdReason: null,
        }) : prev);
      }
    } catch (e) {
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    } finally {
      setActioning(false);
    }
  };

  const handleHoldConfirm = async () => {
    if (!holdModalPayment) return;
    if (!canHoldPayment) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ Hold Payment", "warning");
    if (!holdReasonInput.trim()) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุเหตุผล Hold", "warning");
      return;
    }
    setActioning(true);
    try {
      const nextStatus = holdDecision === "backToEdit" ? "Reject" : "Hold";
      await updateData("payments", holdModalPayment.id, {
        status: nextStatus,
        holdReason: holdReasonInput.trim(),
        holdAt: new Date().toISOString(),
        holdBy: userData?.name || user?.email || "",
      }, { skipLog: true });
      await logAction(
        "Hold Payment",
        `Hold Payment | ${getPaymentLogSummary(holdModalPayment, { status: holdDecision === "backToEdit" ? "Reject" : "Hold" })} | การตัดสินใจ: ${holdDecision === "backToEdit" ? "Reject ส่งกลับแก้ไข" : "คง Hold"} | เหตุผล: ${truncateLogText(holdReasonInput.trim() || "-", 120)}`,
        selectedProjectId
      );
      setHoldModalPayment(null);
      setHoldReasonInput("");
      setHoldDecision("keepHold");
      if (viewingPayment?.id === holdModalPayment.id) {
        setViewingPayment((prev: any) => prev ? ({
          ...prev,
          status: nextStatus,
          holdReason: holdReasonInput.trim(),
          holdAt: new Date().toISOString(),
          holdBy: userData?.name || user?.email || "",
        }) : prev);
      }
    } catch (e) {
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    } finally {
      setActioning(false);
    }
  };

  // ─── Job Complete + Evaluation Submit ────────────────────────────────────────
  const handleEvalSubmit = async () => {
    if (!evalModalPayment) return;
    if (!canCompleteJob) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์จบงาน", "warning");
    const missing = [];
    if (!evalForm.evaluatorName.trim()) missing.push("ชื่อผู้ประเมิน");
    if (!evalForm.jobName.trim()) missing.push("ระบุชื่องาน");
    if (!evalForm.q1) missing.push("ข้อ 1");
    if (!evalForm.q2) missing.push("ข้อ 2");
    if (!evalForm.q3) missing.push("ข้อ 3");
    if (!evalForm.q4) missing.push("ข้อ 4");
    if (!evalForm.q5) missing.push("ข้อ 5");
    if (missing.length > 0) {
      showAlert("ข้อมูลไม่ครบ", `กรุณากรอก: ${missing.join(", ")}`, "warning");
      return;
    }
    setEvaluating(true);
    try {
      // ใช้ข้อมูล Vendor จาก Payment object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
      const contractor = evalModalPayment.contractorName 
        ? { id: evalModalPayment.contractorId, name: evalModalPayment.contractorName, code: evalModalPayment.contractorCode, type: evalModalPayment.contractorType }
        : vendors.find((v: any) => v.id === evalModalPayment.contractorId);
      const project = (projects || []).find((p: any) => p.id === evalModalPayment.projectId);
      const rateMap: Record<string, number> = { good: 1, fair: 0.75, poor: 0.5 };
      const questions = [
        { key: "q1", max: 1, label: "วัสดุที่นำมาใช้ต้องมีคุณภาพและตรงตามข้อกำหนด" },
        { key: "q2", max: 1, label: "การจัดสรรแรงงานที่มีความรู้และเพียงพอต่องาน" },
        { key: "q3", max: 1, label: "การปฏิบัติตามกฎหมาย ข้อกำหนดของโครงการ และกฎระเบียบข้อบังคับด้านความปลอดภัยและอาชีวอนามัย" },
        { key: "q4", max: 1, label: "การจัดสรรเครื่องมือและอุปกรณ์ให้พร้อมใช้งานและตรงตามข้อกำหนดของโครงการและความปลอดภัย" },
        { key: "q5", max: 1, label: "การส่งมอบงานตามเวลาที่กำหนด" },
      ];
      let totalScore = 0;
      const scores: any = {};
      for (const q of questions) {
        const rate = evalForm[q.key as keyof typeof evalForm] as string;
        const rateValue = rateMap[rate] || 0;
        const score = q.max * rateValue;
        totalScore += score;
        scores[q.key] = { rate, rateValue, maxScore: q.max, score, label: q.label };
      }
      const evalPayload = {
        vendorId: evalModalPayment.contractorId || "",
        vendorName: contractor?.name || "",
        paymentId: evalModalPayment.id,
        paymentNo: evalModalPayment.paymentNo,
        projectId: evalModalPayment.projectId || "",
        projectName: project?.name || "",
        evaluatorName: evalForm.evaluatorName.trim(),
        evaluationDate: evalForm.evaluationDate,
        jobName: evalForm.jobName.trim(),
        jobNo: evalForm.jobNo.trim(),
        scores,
        totalScore,
        maxTotalScore: 5,
        recommendations: evalForm.recommendations.trim(),
        createdAt: new Date().toISOString(),
        createdBy: userData?.name || user?.email || "",
      };
      await addData("vendorEvaluations", evalPayload, null, { skipLog: true });
      await updateData("payments", evalModalPayment.id, {
        status: "Paid",
        jobCompleted: true,
        completedAt: new Date().toISOString(),
        completedBy: userData?.name || user?.email || "",
      }, { skipLog: true });
      const selectedPrIds = evalModalPayment.selectedPrIds || [];
      for (const poId of selectedPrIds) {
        const po = (pos || []).find((x: any) => x.id === poId);
        if (po && po.status !== "Closed PO") {
          await updateData("pos", poId, { status: "Closed PO", statusNow: "Closed PO" }, { skipLog: true });
        }
      }
      await logAction(
        "Complete Job & Evaluate",
        `จบงานและประเมินผู้รับเหมา | ${getPaymentLogSummary(evalModalPayment, { status: "Paid" })} | คะแนนรวม: ${Number(totalScore || 0).toLocaleString("th-TH")}/5`,
        selectedProjectId
      );
      setEvalModalPayment(null);
      setViewingPayment(null);
      setEvalForm({
        jobName: "", jobNo: "", evaluatorName: "",
        evaluationDate: new Date().toISOString().split("T")[0],
        q1: "", q2: "", q3: "", q4: "", q5: "",
        recommendations: "",
      });
    } catch (e) {
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    } finally {
      setEvaluating(false);
    }
  };

  // ─── View Payment PDF ───────────────────────────────────────────────────────
  const handleViewPdf = async (payment: any) => {
    if (generatingPdf) return;
    setGeneratingPdf(true);
    try {
      // ใช้ข้อมูล Vendor จาก Payment object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
      const contractor = payment.contractorName 
        ? { id: payment.contractorId, name: payment.contractorName, code: payment.contractorCode, type: payment.contractorType }
        : vendors.find((v: any) => v.id === payment.contractorId);
      const project = (projects || []).find((p: any) => p.id === payment.projectId);
      let bytes = await generatePaymentPdfBytes(payment, { project, contractor, pos });
      bytes = await stampPaymentSignaturesToPdf(bytes, payment, {
        currentUserData: userData,
        currentAuthUser: user,
        logPrefix: "[Payment PDF]",
      });
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPdfPreviewPayment(payment);
    } catch (e) {
      console.warn("[Payment PDF] Generation failed:", e);
      showAlert("ไม่สามารถสร้าง PDF", String(e), "error");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleClosePdfPreview = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
    }
    setPdfPreviewUrl(null);
    setPdfPreviewPayment(null);
  };

  // ─── Start next period (Create NEW Document for Next Period) ──────────────
  const handleStartNextPeriod = async (p: any) => {
    if (!canStartNextPeriod) return showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์เปิดงวดถัดไป", "warning");

    // Derive the next period from every existing Payment in this chain, rather
    // than from the current row only. This prevents old periods from being
    // overwritten when records were imported or created out of order.
    const baseNo = getPaymentBaseNo(p.paymentNo);
    const relatedPayments = (payments || []).filter((candidate: any) => {
      if (candidate.projectId !== (p.projectId || selectedProjectId)) return false;
      if (getPaymentBaseNo(candidate.paymentNo) !== baseNo) return false;
      const sourceIds = new Set(p.selectedPrIds || []);
      const candidateIds = candidate.selectedPrIds || [];
      return sourceIds.size === 0 || candidateIds.some((id: string) => sourceIds.has(id));
    });
    const periodNumbers = [
      ...relatedPayments,
      p,
      ...(Array.isArray(p.periods) ? p.periods : []),
    ].map(getPaymentPeriodNo);
    let nextPeriodNoInt = Math.max(0, ...periodNumbers) + 1;
    const existingPaymentNos = new Set((payments || []).map((candidate: any) => String(candidate.paymentNo || "")));
    let nextPaymentNo = `${baseNo}-${String(nextPeriodNoInt).padStart(3, '0')}`;
    while (existingPaymentNos.has(nextPaymentNo)) {
      nextPeriodNoInt += 1;
      nextPaymentNo = `${baseNo}-${String(nextPeriodNoInt).padStart(3, '0')}`;
    }

    setActioning(true);
    try {
      const creator = getUserIdentity(userData, user);
      const currentItems = p.items || [];
      const paymentDiscountEnabled = p.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION;

      // Carry over accumulated quantities and reset thisPeriod
      const nextItems = currentItems.map((it: any) => ({
        ...it,
        prevAccumQty: (Number(it.prevAccumQty) || 0) + (Number(it.thisPeriodQty) || 0),
        prevAccumAmount: (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0),
        thisPeriodQty: 0,
        thisPeriodAmount: 0,
        thisPeriodPct: 0,
        remark: "",
      }));

      const newPayload = {
        paymentNo: nextPaymentNo,
        paymentType: p.paymentType,
        contractorId: p.contractorId,
        contractorName: p.contractorName || p.vendorName || (vendors || []).find((vendor: any) => String(vendor.id) === String(p.contractorId || ""))?.name || "",
        contractorCode: p.contractorCode || (vendors || []).find((vendor: any) => String(vendor.id) === String(p.contractorId || ""))?.code || "",
        contractTitle: p.contractTitle,
        periodNo: String(nextPeriodNoInt),
        openDate: new Date().toISOString().split("T")[0],
        billingCycle: "",
        note: "",
        selectedPrIds: p.selectedPrIds || [],
        items: nextItems,
        amount: 0,
        ...(paymentDiscountEnabled ? {
          discountAllocationVersion: PO_DISCOUNT_ALLOCATION_VERSION,
          poGrossAmount: Number(p.poGrossAmount) || getPaymentContractGrossAmount(p),
          poDiscountAmount: Number(p.poDiscountAmount) || 0,
          discountPrId: p.discountPrId || null,
          discountPrNo: p.discountPrNo || null,
          discountRate: Number(p.discountRate) || 0,
          prevAccumDiscount: (Number(p.prevAccumDiscount) || 0) + (Number(p.thisPeriodDiscount) || 0),
          thisPeriodDiscount: 0,
          discountAppliedAmount: (Number(p.prevAccumDiscount) || 0) + (Number(p.thisPeriodDiscount) || 0),
          grossPeriodAmount: 0,
          netPeriodAmount: 0,
        } : {}),
        projectId: selectedProjectId,
        status: "Active",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: creator.name || userData?.name || user?.email || '',
        createdByUid: creator.uid || null,
        createdByEmail: creator.email || null,
        createdByName: creator.name || null,
        activatedBy: creator.name || userData?.name || user?.email || '',
        activatedByUid: creator.uid || null,
        activatedByEmail: creator.email || null,
        activatedAt: new Date().toISOString(),
        poRef: p.poRef || p.selectedPrIds?.[0] || null,
        previousPaymentId: p.id,
        ...clearPaymentSignatureUserFields(["Signature1", "Signature2", "Signature3"]),
      };

      await addData("payments", newPayload, null, { skipLog: true });

      // Mark current payment as having started the next period and set status to Paid
      await updateData("payments", p.id, {
        hasNextPeriodStarted: true,
        status: "Paid",
      }, { skipLog: true });

      await logAction(
        "Start Next Period",
        `เริ่มงวดถัดไปจาก ${p.paymentNo} | งวดใหม่: ${nextPaymentNo} | งวด: ${nextPeriodNoInt} | ผู้รับเหมา: ${truncateLogText(p.contractorName || p.contractorCode || p.contractorId || "-", 80)}`,
        selectedProjectId
      );

      setViewingPayment(null);
    } catch (e) {
      showAlert("เกิดข้อผิดพลาด", String(e), "error");
    } finally {
      setActioning(false);
    }
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
    return (payments || []).filter((p: any) => p.projectId === selectedProjectId && p.status !== "Paid");
  }, [payments, selectedProjectId]);

  // ─── PO SP/DC ที่ Approved แต่ยังไม่มี Payment document (Auto Draft) ────────
  const linkedPoIds = useMemo(() => {
    const set = new Set<string>();
    (payments || []).forEach((pay: any) => {
      if (pay.projectId !== selectedProjectId) return;
      (pay.selectedPrIds || []).forEach((id: string) => set.add(id));
    });
    return set;
  }, [payments, selectedProjectId]);

  const unlinkedSPDCPos = useMemo(() => {
    return (pos || []).filter((po: any) =>
      po.projectId === selectedProjectId &&
      (po.poType === 'SP' || po.poType === 'DC') &&
      po.status === 'Approved' &&
      !linkedPoIds.has(po.id)
    );
  }, [pos, selectedProjectId, linkedPoIds]);

  // ─── Permission: PM/PCM/Admin สามารถ Activate Payment ได้ ─────────────────
  const canActivatePayment =
    myRoles.includes('Administrator') ||
    myRoles.some((r) => ['PM', 'PCM'].includes(r)) ||
    canUseFunction?.('payment-subcontract', 'activate') !== false;

  // ─── Activate: สร้าง Payment document จาก PO (PM กด) ─────────────────────
  const handleActivatePayment = async (po: any, contractTitleOverride?: string) => {
    if (!canActivatePayment) {
      showAlert('ไม่มีสิทธิ์', 'เฉพาะ PM หรือ Administrator เท่านั้นที่สามารถ Activate Payment ได้', 'warning');
      return;
    }
    setActioning(true);
    try {
      const discountEnabledForPayment = po.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION;
      const poGrossAmount = getPoItemsGrossSubtotal(po);
      const poDiscountAmount = discountEnabledForPayment ? getPoDiscountAmount(po) : 0;
      const discountTarget = discountEnabledForPayment ? getPoDiscountTarget(po) : { prId: null, prNo: "" };
      const items = (po.items || []).map((item: any, idx: number) => ({
        prId: po.id,
        prItemIndex: idx,
        description: item.description || '',
        unit: item.unit || '',
        contractQty: Number(item.quantity) || 0,
        contractPrice: Number(item.price) || Number(item.unitPrice) || 0,
        contractAmount: (Number(item.quantity) || 0) * (Number(item.price) || Number(item.unitPrice) || 0),
        thisPeriodQty: 0,
        thisPeriodAmount: 0,
        thisPeriodPct: 0,
        prevAccumQty: 0,
        prevAccumAmount: 0,
        remark: '',
        budgetId: item.budgetId || null,
        budgetSubItemId: item.budgetSubItemId || null,
      }));
      
      // เพิ่มข้อมูล Vendor จาก PO เพื่อให้ Role อื่นๆ ที่ไม่มีสิทธิ์เข้าถึง Vendor Management สามารถเห็นชื่อ Vendor ได้
      const linkedVendor = (vendors || []).find((vendor: any) => String(vendor.id) === String(po.vendorId || ""));
      const vendorInfo = {
        contractorName: po.vendorName || po.vendor || po.supplierName || linkedVendor?.name || '',
        contractorCode: po.vendorCode || linkedVendor?.code || linkedVendor?.vendorCode || '',
        contractorType: po.vendorType || linkedVendor?.type || linkedVendor?.vendorType || '',
      };
      const creator = getUserIdentity(userData, user);
      const paymentBaseNo = getPaymentBaseNo(`${po.poNo || po.id}-001`);
      const priorPaymentsForPo = (payments || []).filter((payment: any) =>
        payment.projectId === selectedProjectId &&
        (payment.selectedPrIds || []).includes(po.id) &&
        getPaymentBaseNo(payment.paymentNo) === paymentBaseNo
      );
      const firstPeriodNo = Math.max(0, ...priorPaymentsForPo.map(getPaymentPeriodNo)) + 1;
      const firstPaymentNo = `${paymentBaseNo}-${String(firstPeriodNo).padStart(3, '0')}`;
      
      const payload = {
        paymentNo: firstPaymentNo,
        paymentType: po.poType,
        contractorId: po.vendorId || linkedVendor?.id || '',
        ...vendorInfo,
        contractTitle: contractTitleOverride || po.contractTitle || po.poNo || '',
        periodNo: String(firstPeriodNo),
        openDate: new Date().toISOString().split('T')[0],
        billingCycle: '',
        note: '',
        selectedPrIds: [po.id],
        items,
        amount: 0,
        ...(discountEnabledForPayment ? {
          discountAllocationVersion: PO_DISCOUNT_ALLOCATION_VERSION,
          poGrossAmount,
          poDiscountAmount,
          discountPrId: discountTarget.prId,
          discountPrNo: discountTarget.prNo || null,
          discountRate: getPoDiscountRate(po),
          prevAccumDiscount: 0,
          thisPeriodDiscount: 0,
          discountAppliedAmount: 0,
          grossPeriodAmount: 0,
          netPeriodAmount: 0,
        } : {}),
        projectId: selectedProjectId,
        status: 'Active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: creator.name || userData?.name || user?.email || '',
        createdByUid: creator.uid || null,
        createdByEmail: creator.email || null,
        createdByName: creator.name || null,
        activatedBy: creator.name || userData?.name || user?.email || '',
        activatedByUid: creator.uid || null,
        activatedByEmail: creator.email || null,
        activatedAt: new Date().toISOString(),
        rejectReason: null,
        rejectedBy: null,
        rejectedAt: null,
      };
      await addData('payments', payload, null, { skipLog: true });

      await updateData("pos", po.id, {
        statusNow: "PMT In Process"
      }, { skipLog: true });

      await logAction(
        "Activate Payment",
        `เปิด Active Payment จาก PO | ${buildRecordSummary("pos", po, po.id)} | Payment ใหม่: ${payload.paymentNo} | ผู้รับเหมา: ${truncateLogText(payload.contractorName || payload.contractorCode || payload.contractorId || "-", 80)}`,
        selectedProjectId
      );

    } catch (e) {
      showAlert('เกิดข้อผิดพลาด', String(e), 'error');
    } finally {
      setActioning(false);
    }
  };

  const progressScaleSteps = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  const getPaymentProgressPct = (payment: any) => {
    const items = payment?.items || [];
    const contractTotal = items.reduce(
      (s: number, it: any) => s + ((Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0)),
      0
    );
    // รวมสะสมทุกงวดถึงปัจจุบัน = prevAccumAmount (งวดก่อนหน้าทั้งหมด) + thisPeriodAmount (งวดนี้)
    const accumTotal = items.length > 0
      ? items.reduce((s: number, it: any) => s + (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0), 0)
      : Number(payment?.amount) || 0;
    if (contractTotal <= 0) return 0;
    return Math.min(100, Math.max(0, (accumTotal / contractTotal) * 100));
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 w-full min-w-0">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 flex items-center justify-center shadow-sm">
            <CreditCard size={19} className="text-orange-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-orange-800 leading-none">Payment Subcontractor</h2>
            <p className="text-[10px] text-orange-400 mt-1">จัดการการเบิกจ่ายงานผู้รับเหมาช่วง</p>
          </div>
          <div className="ml-2">
            <ColumnVisibilityToggle tableId="payment" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* ปุ่มสร้าง Payment ถูกลบออกแล้ว — PO SP/DC ที่ Approved จะแสดง Auto เป็น Draft */}
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-x-auto w-full min-w-0">
        <table className="w-full min-w-[1120px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              {isColumnVisible("payment", "actions") && (
                <th className="py-2 px-3 text-left md:hidden" style={{ width: paymentMainColWidths.actions }}>
                  Action
                </th>
              )}
              {isColumnVisible("payment", "paymentNo") && (
                <ResizableTh tableId="paymentMain" colKey="paymentNo" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.paymentNo} className="py-2 px-3">
                  Payment No.
                </ResizableTh>
              )}
              {isColumnVisible("payment", "type") && (
                <ResizableTh tableId="paymentMain" colKey="type" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.type} className="py-2 px-3 text-center">
                  Type
                </ResizableTh>
              )}
              {isColumnVisible("payment", "contractor") && (
                <ResizableTh tableId="paymentMain" colKey="contractor" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.contractor} className="py-2 px-3">
                  ผู้รับเหมา
                </ResizableTh>
              )}
              {isColumnVisible("payment", "contractTitle") && (
                <ResizableTh tableId="paymentMain" colKey="contractTitle" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.contractTitle} className="py-2 px-3">
                  ชื่อสัญญา
                </ResizableTh>
              )}
              {isColumnVisible("payment", "billingCycle") && (
                <ResizableTh tableId="paymentMain" colKey="billingCycle" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.billingCycle} className="py-2 px-3">
                  รอบวางบิล
                </ResizableTh>
              )}
              {isColumnVisible("payment", "totalAmount") && (
                <ResizableTh tableId="paymentMain" colKey="totalAmount" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.totalAmount} className="py-2 px-3 text-right">
                  ยอดเงินทั้งหมด
                </ResizableTh>
              )}
              {isColumnVisible("payment", "accumAmount") && (
                <ResizableTh tableId="paymentMain" colKey="accumAmount" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.accumAmount} className="py-2 px-3 text-right">
                  ยอดเงินสะสม
                </ResizableTh>
              )}
              {isColumnVisible("payment", "periodAmount") && (
                <ResizableTh tableId="paymentMain" colKey="periodAmount" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.periodAmount} className="py-2 px-3 text-right">
                  ยอดเงินงวดนี้
                </ResizableTh>
              )}
              {isColumnVisible("payment", "progress") && (
                <ResizableTh tableId="paymentMain" colKey="progress" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.progress} className="py-1 px-2">
                  % Progress
                </ResizableTh>
              )}
              {isColumnVisible("payment", "status") && (
                <ResizableTh tableId="paymentMain" colKey="status" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.status} className="py-2 px-3 text-center">
                  Status
                </ResizableTh>
              )}
              {isColumnVisible("payment", "actions") && (
                <ResizableTh tableId="paymentMain" colKey="actions" isAdmin={isPaymentMainTableAdmin} onResize={handlePaymentMainColResize} currentWidth={paymentMainColWidths.actions} className="py-2 px-3 text-right">
                  Action
                </ResizableTh>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {/* ── Draft rows: PO SP/DC ที่ Approved แต่ยังไม่ Activate ── */}
            {unlinkedSPDCPos.map((po: any) => {
              // ใช้ข้อมูล Vendor จาก PO object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
              const vendor = po.vendorName 
                ? { id: po.vendorId, name: po.vendorName, code: po.vendorCode, type: po.vendorType }
                : vendors.find((v: any) => v.id === po.vendorId);
              const contractTotal = (po.items || []).reduce(
                (s: number, it: any) => s + ((Number(it.quantity) || 0) * (Number(it.price) || Number(it.unitPrice) || 0)), 0
              );
              return (
                <tr key={`po-draft-${po.id}`} className="bg-sky-50/60 border-b border-sky-100 hover:bg-sky-100/50 transition-colors cursor-pointer" onClick={() => { setActivatingPO(po); setActivatingContractTitle(po.contractTitle || ""); }}>
                  {isColumnVisible("payment", "actions") && (
                    <td className="py-2 px-3 md:hidden" onClick={(e) => e.stopPropagation()}>
                      {canActivatePayment && (
                        <Button
                          variant="success"
                          size="sm"
                          className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                          disabled={actioning}
                          onClick={(e) => { e.stopPropagation(); setActivatingPO(po); setActivatingContractTitle(po.contractTitle || ""); }}
                        >
                          Active
                        </Button>
                      )}
                    </td>
                  )}
                  {isColumnVisible("payment", "paymentNo") && (
                    <td className="py-2 px-3 font-medium text-sky-700">{po.poNo}</td>
                  )}
                  {isColumnVisible("payment", "type") && (
                    <td className="py-2 px-3 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700 border border-sky-200">{po.poType}</span>
                    </td>
                  )}
                  {isColumnVisible("payment", "contractor") && (
                    <td className="py-2 px-3 truncate text-slate-600">{vendor?.name || '-'}</td>
                  )}
                  {isColumnVisible("payment", "contractTitle") && (
                    <td className="py-2 px-3 text-slate-400 italic text-xs">-</td>
                  )}
                  {isColumnVisible("payment", "billingCycle") && (
                    <td className="py-2 px-3 text-slate-400 italic text-xs">-</td>
                  )}
                  {isColumnVisible("payment", "totalAmount") && (
                    <td className="py-2 px-3 text-right font-semibold text-slate-700">{formatCurrency(contractTotal)}</td>
                  )}
                  {isColumnVisible("payment", "accumAmount") && (
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                  )}
                  {isColumnVisible("payment", "periodAmount") && (
                    <td className="py-2 px-3 text-right text-slate-400">-</td>
                  )}
                  {isColumnVisible("payment", "progress") && (
                    <td className="py-1 px-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded overflow-hidden border border-slate-200 flex bg-slate-100 flex-1 min-w-0">
                          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((step) => (
                            <div key={step} className="h-full flex-1 bg-slate-200" />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400">0%</span>
                      </div>
                    </td>
                  )}
                  {isColumnVisible("payment", "status") && (
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Draft</span>
                      <div className="text-[9px] text-sky-500 mt-0.5 font-semibold">รอ PM Activate</div>
                    </td>
                  )}
                  {isColumnVisible("payment", "actions") && (
                    <td className="py-2 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {canActivatePayment && (
                        <Button
                          variant="success"
                          size="sm"
                          className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                          disabled={actioning}
                          onClick={(e) => { e.stopPropagation(); setActivatingPO(po); setActivatingContractTitle(po.contractTitle || ""); }}
                        >
                          Active
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {/* ── Empty state เมื่อไม่มีทั้ง Draft PO และ Payment docs ── */}
            {unlinkedSPDCPos.length === 0 && projectPayments.length === 0 ? (
              <tr>
                <td colSpan={["paymentNo", "type", "contractor", "contractTitle", "billingCycle", "totalAmount", "accumAmount", "periodAmount", "progress", "status", "actions"].filter(k => isColumnVisible("payment", k)).length} className="py-10 text-center text-slate-400 text-sm">
                  ยังไม่มีรายการ Payment — PO ประเภท SP/DC ที่ได้รับการอนุมัติจะแสดงที่นี่โดยอัตโนมัติ
                </td>
              </tr>
            ) : (
              projectPayments.map((p: any) => {

                // ใช้ข้อมูล Vendor จาก Payment object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
                const contractor = p.contractorName 
                  ? { id: p.contractorId, name: p.contractorName, code: p.contractorCode, type: p.contractorType }
                  : vendors.find((v: any) => v.id === p.contractorId);
                const progressPct = getPaymentProgressPct(p);
                return (
                  <tr
                    key={p.id}
                    className={`cursor-pointer transition-colors border-b ${p.status === "Wait Pay"
                        ? "bg-orange-50 hover:bg-orange-100"
                        : "hover:bg-orange-50 odd:bg-white even:bg-slate-50"
                      }`}
                    onClick={() => setViewingPayment(p)}
                  >
                    {isColumnVisible("payment", "actions") && (
                      <td
                        className="py-2 px-3 md:hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-start gap-1 flex-wrap">
                          {canApprovePeriod && isPeriodFlow(p.status) && isPeriodPendingForMe(p.status, myRoles) && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => handlePeriodApprove(p)}
                              >
                                {p.status === "งวดงาน Pending CM" ? "CM Check" : "PM Approve"}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => { setPeriodRejectModal(p); setPeriodRejectReason(""); }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {p.status === "Wait Pay" && canHoldPayment && (
                            <>
                              <Button
                                variant="danger"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => { setHoldModalPayment(p); setHoldReasonInput(""); setHoldDecision("keepHold"); }}
                              >
                                Hold
                              </Button>
                            </>
                          )}
                          {(p.status || "Draft") === "Draft" && canDeletePayment && (
                            <button title="ลบ" className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" onClick={() => handleDelete(p)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
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
                    {isColumnVisible("payment", "contractTitle") && (
                      <td className="py-2 px-3 truncate text-slate-600 text-xs">{p.contractTitle || "-"}</td>
                    )}
                    {isColumnVisible("payment", "billingCycle") && (
                      <td className="py-2 px-3 text-xs text-slate-500">{p.billingCycle || "-"}</td>
                    )}
                    {isColumnVisible("payment", "totalAmount") && (
                      <td className="py-2 px-3 text-right font-semibold text-slate-700">
                        {formatCurrency((p.items || []).reduce((s: number, it: any) => s + ((Number(it.contractQty) || 0) * (Number(it.contractPrice) || 0)), 0))}
                      </td>
                    )}
                    {isColumnVisible("payment", "accumAmount") && (
                      <td className="py-2 px-3 text-right font-semibold text-blue-700">
                        {formatCurrency((p.items || []).reduce((s: number, it: any) => s + (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0), 0))}
                      </td>
                    )}
                    {isColumnVisible("payment", "periodAmount") && (
                      <td className="py-2 px-3 text-right font-semibold text-orange-700">
                        {formatCurrency((p.items || []).length > 0
                           ? getPaymentNetPeriodAmount(p)
                           : (Number(p.amount) || 0))}
                      </td>
                    )}
                    {isColumnVisible("payment", "progress") && (
                      <td className="py-1 px-2">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 rounded overflow-hidden border border-slate-200 flex bg-slate-100 flex-1 min-w-0">
                            {progressScaleSteps.map((step) => {
                              const hue = Math.round((step / 100) * 120);
                              const filled = progressPct >= step;
                              return (
                                <div
                                  key={step}
                                  className="h-full flex-1"
                                  style={{ backgroundColor: filled ? `hsl(${hue} 85% 42%)` : "#e5e7eb" }}
                                  title={`${step}%`}
                                />
                              );
                            })}
                          </div>
                          <span className="text-[10px] leading-none font-semibold text-slate-700 whitespace-nowrap">
                            {progressPct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    )}
                    {isColumnVisible("payment", "status") && (
                      <td className="py-2 px-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <PaymentStatusBadge status={p.status || "Draft"} />
                          {p.revisionRequested && (
                            <span className="text-[9px] text-rose-600 font-semibold">ขอแก้ไข</span>
                          )}
                          {["Reject", "Rejected"].includes(p.status) && p.rejectReason && (
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
                          {/* Period flow approve + reject */}
                          {canApprovePeriod && isPeriodFlow(p.status) && isPeriodPendingForMe(p.status, myRoles) && (
                            <>
                              <Button
                                variant="success"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => handlePeriodApprove(p)}
                              >
                                {p.status === "งวดงาน Pending CM" ? "CM Check" : "PM Approve"}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => { setPeriodRejectModal(p); setPeriodRejectReason(""); }}
                              >
                                Reject
                              </Button>
                            </>
                          )}
                          {/* ปุ่ม Submit Draft→Pending ถูกลบแล้ว — ใช้ PM Active จาก Draft row แทน */}
                          {/* Revision request pending — for current approver */}
                          {p.revisionRequested && isPendingForMe(p.status === "Active" ? "Pending Procurement" : p.status, myRoles) && (
                            <>
                              {canApproveRevision && <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveRevision(p)}>
                                Approve Rev
                              </Button>}
                              {canRejectRevision && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleRejectRevision(p)}>
                                Reject Rev
                              </Button>}
                            </>
                          )}
                          {/* Revision request button (orange circle) */}
                          {canRequestRevision && (isFlowActive(p.status) || p.status === "Active") && !p.revisionRequested && (
                            <button
                              title="ขอแก้ไข"
                              className="w-5 h-5 rounded-full bg-orange-500 hover:bg-orange-600 text-white flex items-center justify-center transition-colors"
                              onClick={() => { setRevisionModalPayment(p); setRevisionNote(""); }}
                            >
                              <RotateCcw size={10} />
                            </button>
                          )}
                          {/* Edit button ถูกลบออกแล้ว — ไม่สามารถ edit Draft อีกต่อไป */}
                          {/* Delete (Draft only) */}
                          {(p.status || "Draft") === "Draft" && canDeletePayment && (
                            <button title="ลบ" className="p-1 rounded text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors" onClick={() => handleDelete(p)}>
                              <Trash2 size={13} />
                            </button>
                          )}
                          {p.status === "Wait Pay" && canHoldPayment && (
                            <>
                              <Button
                                variant="danger"
                                size="sm"
                                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                onClick={() => { setHoldModalPayment(p); setHoldReasonInput(""); setHoldDecision("keepHold"); }}
                              >
                                Hold
                              </Button>
                            </>
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
        // ใช้ข้อมูล Vendor จาก Payment object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
        const contractor = vp.contractorName 
          ? { id: vp.contractorId, name: vp.contractorName, code: vp.contractorCode, type: vp.contractorType }
          : vendors.find((v: any) => v.id === vp.contractorId);
        const project = (projects || []).find((p: any) => p.id === vp.projectId);
        const refPRs = (vp.selectedPrIds || []).map((id: string) => (pos || []).find((p: any) => p.id === id)).filter(Boolean);
        const contractTitle = refPRs.map((po: any) => po.poNo).join(", ");

        const allPeriods = vp.periods || [];
        const isViewingOldPeriod = viewPeriodIdx >= 0 && viewPeriodIdx < allPeriods.length;
        const activePeriod = isViewingOldPeriod ? allPeriods[viewPeriodIdx] : null;
        const displayPeriodNo = isViewingOldPeriod
          ? getPaymentPeriodNo(activePeriod)
          : getPaymentPeriodNo(vp);
        const displayPaymentNo = isViewingOldPeriod ? activePeriod.paymentNo : vp.paymentNo;

        const rawPaySlipUrl = isViewingOldPeriod ? activePeriod.paySlipUrl : vp.paySlipUrl;
        const displayPaySlipUrl = rawPaySlipUrl && typeof rawPaySlipUrl === "object" ? rawPaySlipUrl.url : rawPaySlipUrl;
        const rawPaySlipName = isViewingOldPeriod ? activePeriod.paySlipName : vp.paySlipName;
        const displayPaySlipName = rawPaySlipName && typeof rawPaySlipName === "object" ? rawPaySlipName.name : rawPaySlipName;

        const vpItems = isViewingOldPeriod ? (activePeriod.items || []) : (vp.items || []);
        const contractGrandTotal = vpItems.reduce((s: number, it: any) => s + ((it.contractQty || 0) * (it.contractPrice || 0)), 0);
        // ตรวจสอบว่ามี item ใดที่สะสมเกิน 100% หรือไม่
        const hasOverCumulative = !isViewingOldPeriod && (vp.items || []).some((it: any) => {
          const contractAmt = (it.contractQty || 0) * (it.contractPrice || 0);
          if (contractAmt <= 0) return false;
          const k = `${it.prId}_${it.prItemIndex}`;
          const ed = activeQtyEdits[k];
          const tpAmt = ed?.thisPeriodAmount !== undefined ? Number(ed.thisPeriodAmount) : (Number(it.thisPeriodAmount) || 0);
          return (Number(it.prevAccumAmount) || 0) + tpAmt > contractAmt;
        });
        // ทุกรายการสะสมครบ 100% แล้ว → ไม่ให้ใส่ปริมาณอีก
        const allItemsComplete = !isViewingOldPeriod && (vp.items || []).length > 0 && (vp.items || []).every((it: any) => {
          const contractAmt = (it.contractQty || 0) * (it.contractPrice || 0);
          if (contractAmt <= 0) return true;
          return (Number(it.prevAccumAmount) || 0) + (Number(it.thisPeriodAmount) || 0) >= contractAmt;
        });
        const thisPeriodGrandTotal = vpItems.reduce((s: number, it: any) => {
          if (isViewingOldPeriod) return s + (Number(it.thisPeriodAmount) || 0);
          const k = `${it.prId}_${it.prItemIndex}`;
          const ed = activeQtyEdits[k];
          return s + (ed?.thisPeriodAmount !== undefined ? Number(ed.thisPeriodAmount) : (Number(it.thisPeriodAmount) || 0));
         }, 0);
         const thisPeriodPctTotal = contractGrandTotal > 0 ? ((thisPeriodGrandTotal / contractGrandTotal) * 100) : 0;
         const paymentDiscountEnabled = vp.discountAllocationVersion === PO_DISCOUNT_ALLOCATION_VERSION;
         const displayPoGrossAmount = Number(vp.poGrossAmount) || getPaymentContractGrossAmount(vp);
         const displayPoDiscountAmount = paymentDiscountEnabled ? (Number(vp.poDiscountAmount) || 0) : 0;
         const displayPreviousDiscount = isViewingOldPeriod
           ? (Number(activePeriod?.prevAccumDiscount) || 0)
           : (Number(vp.prevAccumDiscount) || 0);
         const displayCumulativeGross = isViewingOldPeriod
           ? getPaymentAccumulatedGrossAmount({ ...vp, ...activePeriod })
           : vpItems.reduce((s: number, it: any) => {
               const k = `${it.prId}_${it.prItemIndex}`;
               const ed = activeQtyEdits[k];
               const current = ed?.thisPeriodAmount !== undefined ? Number(ed.thisPeriodAmount) : (Number(it.thisPeriodAmount) || 0);
               return s + (Number(it.prevAccumAmount) || 0) + current;
             }, 0);
         const displayDiscount = paymentDiscountEnabled
           ? (isViewingOldPeriod
               ? (Number(activePeriod?.thisPeriodDiscount) || 0)
               : calculatePeriodDiscount({
                   grossPeriodAmount: thisPeriodGrandTotal,
                   poGrossAmount: displayPoGrossAmount,
                   poDiscountAmount: displayPoDiscountAmount,
                   previousDiscountAmount: displayPreviousDiscount,
                   cumulativeGrossAmount: displayCumulativeGross,
                   contractGrossAmount: contractGrandTotal,
                 }))
           : 0;
         const displayNetPeriodAmount = paymentDiscountEnabled
           ? calculateNetPeriodAmount(thisPeriodGrandTotal, displayDiscount)
           : thisPeriodGrandTotal;
         const totalPeriodCount = allPeriods.length + 1;

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[10010] p-4">
            <div className="bg-white shadow-2xl border border-slate-300 w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col rounded-2xl overflow-hidden">

              {/* ─ Title bar ─ */}
              <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewPdf(vp)}
                    disabled={generatingPdf}
                    className="text-white/70 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all disabled:opacity-50"
                    title="ดู PDF"
                  >
                    {generatingPdf && pdfPreviewPayment?.id === vp.id ? (
                      <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full inline-block" />
                    ) : (
                      <FileText size={18} />
                    )}
                  </button>
                  <PaymentStatusBadge status={vp.status || "Draft"} />
                  {vp.revisionRequested && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500 text-white">
                      <RotateCcw size={9} /> ขอแก้ไข
                    </span>
                  )}
                  <button onClick={() => { setViewingPayment(null); setViewPeriodIdx(-1); setIsQtyEditMode(false); }} className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
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
                        <span className="w-52 text-slate-500 font-semibold shrink-0">อ้างอิง PO / REF PO NO. :</span>
                        <span className="font-medium text-slate-700">{contractTitle || "-"}</span>
                      </div>
                      <div className="flex">
                        <span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อสัญญา / CONTRACT TITLE :</span>
                        {isQtyEditMode && !isViewingOldPeriod && (vp.status || "Draft") === "Draft" ? (
                          <input
                            type="text"
                            value={vp.contractTitle || ""}
                            onChange={(e) => setViewingPayment((prev: any) => prev ? { ...prev, contractTitle: e.target.value } : prev)}
                            placeholder="กรอกชื่อสัญญา"
                            className="w-full max-w-[28rem] border border-orange-400 bg-orange-50 text-orange-800 rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-400"
                          />
                       ) : (
                          <span className="font-medium text-slate-700">{vp.contractTitle || "-"}</span>
                        )}
                      </div>
                      {paymentDiscountEnabled && (
                        <div className="flex">
                          <span className="w-52 text-slate-500 font-semibold shrink-0">ส่วนลด / DISCOUNT :</span>
                          <span className="font-medium text-red-700">
                            {formatCurrency(displayDiscount)}{vp.discountPrNo ? ` (PR ${vp.discountPrNo})` : ""}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Right */}
                    <div className="space-y-1.5">
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">เลขที่เบิกงวดงาน / PAYMENT NO. :</span>
                        <span className="font-bold text-blue-800">{displayPaymentNo}</span>
                      </div>
                      <div className="flex">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">Payment Type :</span>
                        <span className="font-bold text-slate-800">{vp.paymentType || "-"}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">งวดงาน / PERIOD NO. :</span>
                        <div className="flex items-center gap-1">
                          {totalPeriodCount > 1 && (
                            <button
                              className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={isViewingOldPeriod && viewPeriodIdx <= 0}
                              onClick={() => setViewPeriodIdx((prev) => {
                                if (prev === -1) return allPeriods.length - 1;
                                return Math.max(0, prev - 1);
                              })}
                              title="งวดก่อนหน้า"
                            >
                              <ChevronLeft size={14} />
                            </button>
                          )}
                          <span
                            title="ระบบกำหนดเลขงวดงานอัตโนมัติและไม่สามารถแก้ไขได้"
                            className={`font-bold px-2 py-0.5 rounded border ${isViewingOldPeriod ? "text-slate-600 bg-slate-100 border-slate-300" : "text-orange-700 bg-orange-50 border-orange-200"}`}
                          >
                            {displayPeriodNo} / {displayPeriodNo}
                          </span>
                          {!isViewingOldPeriod && (
                            <span className="text-[10px] text-slate-400 ml-1">(อัตโนมัติ)</span>
                          )}
                          {totalPeriodCount > 1 && (
                            <button
                              className="p-0.5 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={!isViewingOldPeriod}
                              onClick={() => setViewPeriodIdx((prev) => {
                                if (prev >= allPeriods.length - 1) return -1;
                                return prev + 1;
                              })}
                              title="งวดถัดไป"
                            >
                              <ChevronRight size={14} />
                            </button>
                          )}
                          {isViewingOldPeriod && (
                            <span className="text-[10px] text-slate-400 ml-1">(ดูข้อมูลย้อนหลัง)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className="w-56 text-slate-500 font-semibold shrink-0">รอบวางบิล :</span>
                        {isQtyEditMode && !isViewingOldPeriod ? (
                          <select
                            value={periodBillingCycle}
                            onChange={(e) => setPeriodBillingCycle(e.target.value)}
                            className={`border rounded px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 ${periodBillingCycle ? "border-orange-400 bg-orange-50 text-orange-800" : "border-red-400 bg-red-50 text-red-600"
                              }`}
                          >
                            <option value="">-- กรุณาเลือกรอบวางบิล --</option>
                            {BILLING_CYCLES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-slate-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">{vp.billingCycle || "-"}</span>
                        )}
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
                      {/* ── Payment Attachments (uploaded via Upload File button) ── */}
                      {Array.isArray(vp.paymentAttachments) && vp.paymentAttachments.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          <span className="w-56 text-blue-700 font-semibold shrink-0 text-[11px]">ไฟล์แนบ PAYMENT ({vp.paymentAttachments.length}):</span>
                          {vp.paymentAttachments.map((att: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-1 ml-1 group">
                              <Paperclip size={10} className="text-blue-400 shrink-0" />
                              <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-[11px] truncate max-w-[220px]">
                                {att.name || `ไฟล์แนบ ${idx + 1}`}
                              </a>
                              <span className="text-[9px] text-slate-400 shrink-0">โดย {att.uploadedBy || "-"}</span>
                              {isQtyEditMode && !isViewingOldPeriod && (
                                <button
                                  onClick={() => handleDeletePeriodAttachment(vp, idx)}
                                  className="ml-2 p-0.5 rounded hover:bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="ลบไฟล์แนบ"
                                >
                                  <Trash2 size={11} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {displayPaySlipUrl && (
                        <div className="flex items-center">
                          <span className="w-56 text-emerald-600 font-semibold shrink-0">เอกสารการจ่ายเงิน (Pay / Slip) :</span>
                          <a href={displayPaySlipUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 bg-emerald-50 px-2 py-0.5 border border-emerald-200 rounded underline font-medium flex items-center gap-1 text-[11px]">
                            <Paperclip size={11} /> {displayPaySlipName || "ดูเอกสารการจ่ายเงิน"}
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Upload File strip — แสดงเฉพาะเมื่ออยู่ใน mode ใส่ปริมาณ ── */}
                  {isQtyEditMode && !isViewingOldPeriod && (
                    <div className="flex items-center gap-3 border border-blue-200 rounded-lg px-4 py-2 bg-blue-50">
                      <Paperclip size={13} className="text-blue-500 shrink-0" />
                      <span className="text-[12px] text-blue-700 font-semibold whitespace-nowrap">อัปโหลดไฟล์แนบ :</span>
                      {uploadingAttach ? (
                        <span className="flex items-center gap-2 text-[11px] text-blue-600">
                          <span className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                          กำลังอัปโหลด...
                        </span>
                      ) : (
                        <input
                          ref={periodAttachFileRef}
                          type="file"
                          className="text-[11px] text-slate-600 flex-1 min-w-0"
                          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            setPeriodAttachFile(file);
                            if (file) handleUploadPeriodAttachment({ ...vp, _autoUploadFile: file });
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* ── Items table ── */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse min-w-max table-fixed">
                        <colgroup>
                          <col id="col-payItems-item" style={{ width: payItemColWidths.item }} />
                          <col id="col-payItems-description" style={{ width: payItemColWidths.description }} />
                          <col id="col-payItems-unit" style={{ width: payItemColWidths.unit }} />
                          <col id="col-payItems-cQty" style={{ width: payItemColWidths.cQty }} />
                          <col id="col-payItems-cPrice" style={{ width: payItemColWidths.cPrice }} />
                          <col id="col-payItems-cAmount" style={{ width: payItemColWidths.cAmount }} />
                          <col id="col-payItems-tQty" style={{ width: payItemColWidths.tQty }} />
                          <col id="col-payItems-tAmount" style={{ width: payItemColWidths.tAmount }} />
                          <col id="col-payItems-tProgress" style={{ width: payItemColWidths.tProgress }} />
                          <col id="col-payItems-pSum" style={{ width: payItemColWidths.pSum }} />
                          <col id="col-payItems-pAmt" style={{ width: payItemColWidths.pAmt }} />
                          <col id="col-payItems-pPrev" style={{ width: payItemColWidths.pPrev }} />
                          <col id="col-payItems-currQty" style={{ width: payItemColWidths.currQty }} />
                          <col id="col-payItems-currAmt" style={{ width: payItemColWidths.currAmt }} />
                          <col id="col-payItems-currPct" style={{ width: payItemColWidths.currPct }} />
                          <col id="col-payItems-remark" style={{ width: payItemColWidths.remark }} />
                        </colgroup>
                        <thead>
                          {/* Row 1: Group headers */}
                          <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <ResizableTh tableId="payItems" colKey="item" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.item} rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              ITEM<br /><span className="font-normal text-[9px] text-slate-500">ลำดับ</span>
                            </ResizableTh>
                            <ResizableTh tableId="payItems" colKey="description" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.description} rowSpan={2} className="border border-slate-300 px-2 py-2 text-left font-bold text-slate-700 bg-slate-100">
                              DESCRIPTION<br /><span className="font-normal text-[9px] text-slate-500">รายละเอียด</span>
                            </ResizableTh>
                            <ResizableTh tableId="payItems" colKey="unit" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.unit} rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หน่วย<br /><span className="font-normal text-[9px] text-slate-500">Unit</span>
                            </ResizableTh>
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
                            <ResizableTh tableId="payItems" colKey="remark" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.remark} rowSpan={2} className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 bg-slate-100">
                              หมายเหตุ<br /><span className="font-normal text-[9px] text-slate-500">REMARK</span>
                            </ResizableTh>
                          </tr>
                          {/* Row 2: Sub-column headers */}
                          <tr className="bg-slate-50 border-b border-slate-300 text-[9px] font-bold text-slate-600">
                            {/* CONTRACT / PO PRICE */}
                            <ResizableTh tableId="payItems" colKey="cQty" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.cQty} className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ปริมาณ<br />QUANTITY</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="cPrice" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.cPrice} className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">ราคา/หน่วย<br />PRICE</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="cAmount" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.cAmount} className="border border-slate-300 px-1.5 py-1 text-center bg-purple-50/50 text-purple-700">จำนวนเงิน<br />AMOUNT</ResizableTh>
                            {/* TOTAL ACCUMULATED */}
                            <ResizableTh tableId="payItems" colKey="tQty" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.tQty} className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">ปริมาณ<br />TOTAL QTY</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="tAmount" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.tAmount} className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">จำนวนเงิน<br />AMOUNT</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="tProgress" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.tProgress} className="border border-slate-300 px-1.5 py-1 text-center bg-blue-50/50 text-blue-700">%<br />PROGRESS</ResizableTh>
                            {/* PREVIOUS ACCUMULATED */}
                            <ResizableTh tableId="payItems" colKey="pSum" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.pSum} className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">ปริมาณ<br />PREV SUM</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="pAmt" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.pAmt} className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">จำนวนเงิน<br />PREV AMT</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="pPrev" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.pPrev} className="border border-slate-300 px-1.5 py-1 text-center bg-amber-50/50 text-amber-700">%<br />PREV</ResizableTh>
                            {/* THIS PERIOD */}
                            <ResizableTh tableId="payItems" colKey="currQty" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.currQty} className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">ปริมาณ<br />QUANTITY</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="currAmt" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.currAmt} className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">จำนวนเงิน<br />AMOUNT</ResizableTh>
                            <ResizableTh tableId="payItems" colKey="currPct" isAdmin={isPayTableAdmin} onResize={handlePayItemColResize} currentWidth={payItemColWidths.currPct} className="border border-slate-300 px-1.5 py-1 text-center bg-green-50/50 text-green-700">%<br />CURR</ResizableTh>
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
                              const canEditQty = ["Active", "Draft", "Reject", "Rejected"].includes(vp.status || "Draft") && isQtyEditMode && !isViewingOldPeriod;
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
                              const isOverCumulative = cAmount > 0 && totalAmt > cAmount;

                              return (
                                <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                                  <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500 font-medium">{i + 1}</td>
                                  <td className="border border-slate-200 px-2 py-1.5 text-slate-700 font-medium overflow-hidden max-w-0">
                                    <div className="line-clamp-2 break-words leading-tight" title={it.description || "-"}>
                                      {it.description || "-"}
                                    </div>
                                  </td>
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
                                  <td className={`border px-1 py-1 ${isOverCumulative ? "border-red-400 bg-red-50" : "border-slate-200 bg-green-50/40"}`}>
                                    {canEditQty ? (
                                      <>
                                        <input
                                          type="number" min={0} step={0.01}
                                          className={`w-full border rounded px-1 py-0.5 text-xs text-right focus:outline-none focus:ring-1 bg-white font-mono ${isOverCumulative ? "border-red-500 focus:ring-red-500 text-red-700" : "border-green-400 focus:ring-green-500"}`}
                                          value={edit.thisPeriodQty !== undefined ? edit.thisPeriodQty : (it.thisPeriodQty || "")}
                                          onChange={(e) => updateActiveQty(key, "thisPeriodQty", e.target.value, cPrice, cAmount, prevAmt)}
                                        />
                                        {isOverCumulative && (
                                          <span className="text-[9px] text-red-600 font-semibold leading-none block mt-0.5">เกิน 100%</span>
                                        )}
                                      </>
                                    ) : (
                                      <span className="block text-right font-mono px-1">{tpQty > 0 ? tpQty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "-"}</span>
                                    )}
                                  </td>
                                  <td className={`border px-2 py-1.5 text-right font-mono font-semibold ${isOverCumulative ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-green-50/40 text-green-700"}`}>{tpAmt > 0 ? formatCurrency(tpAmt) : "-"}</td>
                                  <td className={`border px-2 py-1.5 text-right font-mono ${isOverCumulative ? "border-red-300 bg-red-50 text-red-600 font-bold" : "border-slate-200 bg-green-50/40 text-green-600"}`}>{tpPct > 0 ? tpPct.toFixed(2) + "%" : "-"}</td>
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
                            {paymentDiscountEnabled && (
                              <tr className="bg-red-50 text-[11px]">
                                <td colSpan={16} className="border border-red-200 px-4 py-2">
                                  <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 font-mono">
                                    <span className="text-slate-600">ยอดงวดก่อนส่วนลด: <b>{formatCurrency(thisPeriodGrandTotal)}</b></span>
                                    <span className="text-red-700">ส่วนลด{vp.discountPrNo ? ` (PR ${vp.discountPrNo})` : ""}: <b>-{formatCurrency(displayDiscount)}</b></span>
                                    <span className="text-emerald-700">ยอดสุทธิงวดนี้: <b>{formatCurrency(displayNetPeriodAmount)}</b></span>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {/* ── Signature section ── */}
                  <div className="grid grid-cols-3 gap-4 text-xs mt-6 px-2">
                    {(() => {
                      const src = isViewingOldPeriod ? activePeriod : vp;
                      return [
                        {
                          slot: "Signature1", title: "PREPARE BY", position: "ผู้จัดทำ",
                          name: src?.periodPreparedBy, date: src?.periodPreparedAt,
                          filled: !!(src?.periodPreparedBy || src?.periodPreparedByUid || src?.periodPreparedByEmail || src?.signature1UserSignatureUrl),
                        },
                        {
                          slot: "Signature2", title: "CHECK BY", position: "Construction Manager",
                          name: src?.periodCheckedBy, date: src?.periodCheckedAt,
                          filled: !!(src?.periodCheckedBy || src?.periodCheckedByUid || src?.periodCheckedByEmail || src?.signature2UserSignatureUrl),
                        },
                        {
                          slot: "Signature3", title: "APPROVE BY", position: "Project Manager",
                          name: src?.periodApprovedBy, date: src?.periodApprovedAt,
                          filled: !!(src?.periodApprovedBy || src?.periodApprovedByUid || src?.periodApprovedByEmail || src?.signature3UserSignatureUrl),
                        },
                      ];
                    })().map((sig) => {
                      const hasResolvedSignature = Object.prototype.hasOwnProperty.call(paymentSignatureImages, sig.slot);
                      const signatureImageUrl = paymentSignatureImages[sig.slot];
                      return (
                        <div key={sig.title} className={`border rounded-lg p-3 text-center space-y-3 ${sig.filled ? "border-green-300 bg-green-50/40" : "border-slate-200 bg-slate-50/50"}`}>
                          <p className="font-bold text-slate-700 text-[11px]">{sig.title}</p>
                          <div className={`h-12 flex items-center justify-center px-2 py-1 ${sig.filled ? "border-b-2 border-green-500" : ""}`}>
                            {sig.filled ? (
                              signatureImageUrl ? (
                                <img
                                  src={signatureImageUrl}
                                  alt={`ลายเซ็น ${sig.title}`}
                                  className="max-h-full max-w-full object-contain"
                                />
                              ) : (
                                <span className="text-[10px] text-slate-400 italic">
                                  {hasResolvedSignature ? "— ไม่มีรูปลายเซ็น —" : "กำลังโหลดลายเซ็น..."}
                                </span>
                              )
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
                      );
                    })}
                  </div>

                  {/* Note */}
                  {vp.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                      <span className="font-bold">หมายเหตุ:</span> {vp.note}
                    </div>
                  )}

                  {/* ── Rejection banner ── */}
                  {["Reject", "Rejected"].includes(vp.status) && (
                    <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3 text-xs text-red-800 flex items-start gap-2">
                      <ThumbsDown size={14} className="mt-0.5 shrink-0 text-red-600" />
                      <div className="space-y-0.5">
                        <p className="font-bold text-red-700">สถานะ Reject — กรุณาแก้ไขรายการ ใส่ปริมาณ และส่งอนุมัติใหม่</p>
                        {vp.rejectReason && vp.rejectReason !== "-" && (
                          <p>เหตุผล: <span className="font-semibold">{vp.rejectReason}</span></p>
                        )}
                        {vp.holdReason && (
                          <p>หมายเหตุจาก Hold: <span className="font-semibold">{vp.holdReason}</span></p>
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
                  {(vp.status || "Draft") === "Draft" && canSubmitPayment && (
                    <button
                      disabled={actioning}
                      onClick={() => handleSubmit(vp)}
                      className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                    >
                      <Send size={14} /> ส่งอนุมัติ
                    </button>
                  )}
                  {/* Approve/Reject (Pending ยกเว้น Pending Procurement ซึ่งใช้ปุ่ม Active แทน) */}
                  {canApproveFlow && isFlowActive(vp.status) && vp.status !== "Pending Procurement" && !vp.revisionRequested && isPendingForMe(vp.status, myRoles) && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => handleApprove(vp)}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsUp size={14} /> อนุมัติ
                      </button>
                      {canRejectFlow && <button
                        disabled={actioning}
                        onClick={() => { setRejectModalPayment(vp); setRejectReason(""); }}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsDown size={14} /> ปฏิเสธ
                      </button>}
                    </>
                  )}
                  {/* Pending Procurement → Active + Reject */}
                  {canApproveFlow && vp.status === "Pending Procurement" && !vp.revisionRequested && isPendingForMe(vp.status, myRoles) && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => handleApprove(vp)}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsUp size={14} /> Active
                      </button>
                      {canRejectFlow && <button
                        disabled={actioning}
                        onClick={() => { setRejectModalPayment(vp); setRejectReason(""); }}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsDown size={14} /> Reject
                      </button>}
                    </>
                  )}
                  {/* Revision pending — for current approver */}
                  {vp.revisionRequested && isPendingForMe(vp.status === "Active" ? "Pending Procurement" : vp.status, myRoles) && (
                    <>
                      {canApproveRevision && <button
                        disabled={actioning}
                        onClick={() => handleApproveRevision(vp)}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-60"
                      >
                        <ShieldCheck size={14} /> อนุมัติขอแก้ไข
                      </button>}
                      {canRejectRevision && <button
                        disabled={actioning}
                        onClick={() => handleRejectRevision(vp)}
                        className="px-4 py-2 rounded-lg border border-red-300 text-red-600 text-sm font-medium flex items-center gap-2 hover:bg-red-50 disabled:opacity-60"
                      >
                        <XCircle size={14} /> ปฏิเสธขอแก้ไข
                      </button>}
                    </>
                  )}
                  {/* งวดงาน Period Approve + Reject */}
                  {canApprovePeriod && isPeriodFlow(vp.status) && isPeriodPendingForMe(vp.status, myRoles) && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => handlePeriodApprove(vp)}
                        className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsUp size={14} />
                        {vp.status === "งวดงาน Pending CM" ? "CHECK — ตรวจสอบ (CM)" : "APPROVE — อนุมัติ (PM)"}
                      </button>
                      <button
                        disabled={actioning}
                        onClick={() => { setPeriodRejectModal(vp); setPeriodRejectReason(""); }}
                        className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      >
                        <ThumbsDown size={14} />
                        {vp.status === "งวดงาน Pending CM" ? "Reject (CM)" : "Reject (PM)"}
                      </button>
                    </>
                  )}
                  {/* Active: ใส่ปริมาณ / บันทึกงวดงาน + Save Draft */}
                  {["Active", "Reject", "Rejected"].includes(vp.status) && !isQtyEditMode && !isViewingOldPeriod && (
                    allItemsComplete ? (
                      <span className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                        <CheckCircle size={13} /> ผลงานครบ 100% ทุกรายการแล้ว
                      </span>
                    ) : (
                      <button
                        onClick={() => { setIsQtyEditMode(true); setPeriodBillingCycle(vp.billingCycle || ""); setActiveQtyEdits({}); }}
                        className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold flex items-center gap-2"
                      >
                        <Edit size={14} /> ใส่ปริมาณ
                      </button>
                    )
                  )}
                  {["Active", "Draft", "Reject", "Rejected"].includes(vp.status || "Draft") && isQtyEditMode && !isViewingOldPeriod && (
                    <>
                      {hasOverCumulative ? (
                        <span className="px-3 py-2 rounded-lg bg-red-50 border border-red-300 text-red-600 text-xs font-semibold flex items-center gap-1.5">
                          <AlertTriangle size={13} /> มีรายการเกิน 100% — แก้ไขก่อนบันทึก
                        </span>
                      ) : (
                        <>
                          {["Active", "Reject", "Rejected"].includes(vp.status) && canSubmitPeriod && (
                            <button
                              disabled={savingActiveQty || uploadingAttach}
                              onClick={() => handleSaveActiveQty(vp, true)}
                              className="px-4 py-2 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                              title={uploadingAttach ? "กำลังอัปโหลดไฟล์แนบ กรุณารอ..." : undefined}
                            >
                              {savingActiveQty ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : uploadingAttach ? <span className="animate-spin w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full" /> : <Save size={14} />}
                              {uploadingAttach ? "กำลังอัปโหลด..." : "บันทึกงวดงาน"}
                            </button>
                          )}
                          {canSavePeriodDraft && <button
                            disabled={savingActiveQty || uploadingAttach}
                            onClick={() => handleSaveActiveQty(vp, false)}
                            className="px-4 py-2 rounded-lg border border-green-400 text-green-700 hover:bg-green-50 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                            title={uploadingAttach ? "กำลังอัปโหลดไฟล์แนบ กรุณารอ..." : undefined}
                          >
                            {savingActiveQty ? <span className="animate-spin w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full" /> : <Save size={14} />}
                            {["Active", "Reject", "Rejected"].includes(vp.status) ? "Save Draft" : "บันทึกอัปเดต"}
                          </button>}
                        </>
                      )}
                    </>
                  )}
                  {/* Wait Pay → Invoice (Pay button removed) / Hold */}
                  {vp.status === "Wait Pay" && canHoldPayment && (
                    <>
                      <button
                        disabled={actioning}
                        onClick={() => { setHoldModalPayment(vp); setHoldReasonInput(""); setHoldDecision("keepHold"); }}
                        className="px-4 py-2 rounded-lg border border-amber-400 text-amber-700 hover:bg-amber-50 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                      >
                        <Clock size={14} /> Hold
                      </button>
                    </>
                  )}
                  {/* In Process → จบงาน (PM/CM) */}
                  {vp.status === "In Process" && canCompleteJob && (
                    <button
                      disabled={actioning}
                      onClick={() => {
                        setEvalModalPayment(vp);
                        setEvalForm((prev) => ({
                          ...prev,
                          jobName: vp.contractTitle || "",
                          evaluatorName: userData?.name || user?.email || "",
                        }));
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      <CheckCircle size={14} /> จบงาน
                    </button>
                  )}
                  {/* In Process / Paid → ใส่ปริมาณ (start next period) — ซ่อนเมื่อครบ 100% ทุกรายการ หรือ Procurement */}
                  {(vp.status === "Paid" || vp.status === "In Process") && !vp.hasNextPeriodStarted && !isViewingOldPeriod && !allItemsComplete && !myRoles.some(r => r === "Procurement") && canStartNextPeriod && (
                    <button
                      disabled={actioning}
                      onClick={() => handleStartNextPeriod(vp)}
                      className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                    >
                      {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Edit size={14} />}
                      ใส่ปริมาณ (เปิดงวดถัดไป)
                    </button>
                  )}
                  {/* Request Revision (orange circle) */}
                  {canRequestRevision && (isFlowActive(vp.status) || vp.status === "Active") && !vp.revisionRequested && !isViewingOldPeriod && (
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
                  {["Draft", "Reject", "Rejected"].includes(vp.status || "Draft") && !isQtyEditMode && !isViewingOldPeriod && canEditPayment && !["Reject", "Rejected"].includes(vp.status) && (
                    <button
                      onClick={() => { setIsQtyEditMode(true); setPeriodBillingCycle(vp.billingCycle || ""); setActiveQtyEdits({}); }}
                      className={`px-4 py-2 rounded-lg text-white text-sm font-medium flex items-center gap-2 ${["Reject", "Rejected"].includes(vp.status) ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
                    >
                      <Edit size={14} /> แก้ไข{["Reject", "Rejected"].includes(vp.status) ? " (ส่งใหม่)" : ""}
                    </button>
                  )}
                </div>
                {/* Right: close */}
                <button
                  onClick={() => { setViewingPayment(null); setActiveQtyEdits({}); setIsQtyEditMode(false); setPeriodBillingCycle(""); setViewPeriodIdx(-1); }}
                  className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2"
                >
                  <XCircle size={15} /> ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ─── Period Reject Modal ──────────────────────────────────────────────── */}
      {periodRejectModal && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10020] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <ThumbsDown size={18} className="text-red-500" />
              {periodRejectModal.status === "งวดงาน Pending CM" ? "Reject งวดงาน (CM)" : "Reject งวดงาน (PM)"}
            </h3>
            <p className="text-xs text-slate-500">
              Payment: <strong>{periodRejectModal.paymentNo}</strong><br />
              สถานะจะกลับเป็น <strong className="text-red-600">Reject</strong> — สามารถแก้ไขและส่งอนุมัติใหม่ได้
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">เหตุผลที่ปฏิเสธ (ไม่บังคับ)</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                rows={3}
                placeholder="กรอกเหตุผล..."
                value={periodRejectReason}
                onChange={(e) => setPeriodRejectReason(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPeriodRejectModal(null)} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                disabled={actioning}
                onClick={handlePeriodRejectConfirm}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <ThumbsDown size={13} />}
                Reject
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── Revision Request Modal ─────────────────────────────────────────────── */}
      {revisionModalPayment && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10010] p-4">
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10010] p-4">
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

      {/* ─── Wait Pay: Pay Modal ────────────────────────────────────────────────── */}
      {waitPayModalPayment && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10010] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Upload size={18} className="text-emerald-600" /> Pay Payment
            </h3>
            <p className="text-xs text-slate-500">
              Payment: <strong>{waitPayModalPayment.paymentNo}</strong><br />
              กรุณาแนบไฟล์ Payin หรือสลิปเพื่อยืนยันการชำระเงิน
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Upload File Payin / สลิป</label>
              <input
                type="file"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs"
                onChange={(e) => setPaySlipFile(e.target.files?.[0] || null)}
                accept="image/*,.pdf"
              />
              <p className="text-[11px] text-slate-400">{paySlipFile ? `ไฟล์ที่เลือก: ${paySlipFile.name}` : "ยังไม่ได้เลือกไฟล์"}</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setWaitPayModalPayment(null); setPaySlipFile(null); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                disabled={actioning}
                onClick={handlePayConfirm}
                className="px-4 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60 bg-emerald-600 hover:bg-emerald-700"
              >
                {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Upload size={13} />}
                Pay
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── Wait Pay: Hold Modal ───────────────────────────────────────────────── */}
      {holdModalPayment && createPortal((
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[10010] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <Clock size={18} className="text-amber-600" /> Hold Payment
            </h3>
            <p className="text-xs text-slate-500">
              Payment: <strong>{holdModalPayment.paymentNo}</strong><br />
              ระบุเหตุผล Hold และเลือกการดำเนินการ หากส่งกลับแก้ไข ระบบจะเปลี่ยนเป็นสถานะ <strong className="text-red-600">Reject</strong>
            </p>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">เหตุผล Hold</label>
              <textarea
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
                rows={3}
                placeholder="กรอกเหตุผล..."
                value={holdReasonInput}
                onChange={(e) => setHoldReasonInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">การดำเนินการ</label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="hold-decision"
                  checked={holdDecision === "keepHold"}
                  onChange={() => setHoldDecision("keepHold")}
                />
                คงสถานะ Hold ไว้ก่อน
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="radio"
                  name="hold-decision"
                  checked={holdDecision === "backToEdit"}
                  onChange={() => setHoldDecision("backToEdit")}
                />
                ส่งกลับไปแก้ไขเป็นสถานะ Reject
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setHoldModalPayment(null); setHoldReasonInput(""); setHoldDecision("keepHold"); }} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                ยกเลิก
              </button>
              <button
                disabled={actioning}
                onClick={handleHoldConfirm}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Clock size={13} />}
                Hold
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ─── Subcontractor Evaluation Modal ─────────────────────────────────────── */}
      {evalModalPayment && createPortal((() => {
        // ใช้ข้อมูล Vendor จาก Payment object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
        const contractor = evalModalPayment.contractorName 
          ? { id: evalModalPayment.contractorId, name: evalModalPayment.contractorName, code: evalModalPayment.contractorCode, type: evalModalPayment.contractorType }
          : vendors.find((v: any) => v.id === evalModalPayment.contractorId);
        const project = (projects || []).find((p: any) => p.id === evalModalPayment.projectId);
        const rateMap: Record<string, number> = { good: 1, fair: 0.75, poor: 0.5 };
        const questions = [
          {
            key: "q1", max: 1, label: "1. วัสดุที่นำมาใช้ต้องมีคุณภาพและตรงตามข้อกำหนด",
            desc: "เต็ม 1 คะแนน",
            criteria: {
              good: "วัสดุมีคุณภาพและถูกต้องตามข้อกำหนด",
              fair: "วัสดุมีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 1-3 ครั้ง",
              poor: "วัสดุมีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือมีปัญหาด้านคุณภาพที่สำคัญและกระทบกับลูกค้า 1 ครั้งขึ้นไป",
            },
          },
          {
            key: "q2", max: 1, label: "2. การจัดสรรแรงงานที่มีความรู้และเพียงพอต่องาน",
            desc: "เต็ม 1 คะแนน",
            criteria: {
              good: "ไม่พบปัญหาเกิดขึ้นเลย",
              fair: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 1-3 ครั้ง",
              poor: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือมีปัญหาด้านคุณภาพที่สำคัญและกระทบกับลูกค้า 1 ครั้งขึ้นไป",
            },
          },
          {
            key: "q3", max: 1, label: "3. การปฏิบัติตามกฎหมาย ข้อกำหนดของโครงการ และกฎระเบียบข้อบังคับด้านความปลอดภัยและอาชีวอนามัย",
            desc: "เต็ม 1 คะแนน",
            criteria: {
              good: "ส่งรวดเร็วทันเวลาที่กำหนดทุกครั้ง",
              fair: "ส่งล่าช้ากว่าเวลาที่กำหนด 1-3 ครั้ง",
              poor: "ส่งล่าช้ากว่าเวลาที่กำหนด 3 ครั้ง",
            },
          },
          {
            key: "q4", max: 1, label: "4. การจัดสรรเครื่องมือและอุปกรณ์ให้พร้อมใช้งานและตรงตามข้อกำหนดของโครงการและความปลอดภัย",
            desc: "เต็ม 1 คะแนน",
            criteria: {
              good: "มีความพร้อมจัดหาและเตรียมเครื่องมือ",
              fair: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 1-3 ครั้ง",
              poor: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือมีปัญหาด้านคุณภาพที่สำคัญและกระทบกับลูกค้า 1 ครั้งขึ้นไป",
            },
          },
          {
            key: "q5", max: 1, label: "5. การส่งมอบงานตามเวลาที่กำหนด",
            desc: "เต็ม 1 คะแนน",
            criteria: {
              good: "จัดส่งสินค้าภายในระยะเวลาที่กำหนดทุกครั้ง",
              fair: "มีปัญหาเล็กน้อยไม่กระทบลูกค้า 1-3 ครั้ง",
              poor: "จัดส่งล่าช้าแต่ไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือก่อให้เกิดความเดือดร้อน 1 ครั้งขึ้นไป",
            },
          },
        ];
        const totalScore = questions.reduce((s, q) => {
          const rate = evalForm[q.key as keyof typeof evalForm] as string;
          return s + (q.max * (rateMap[rate] || 0));
        }, 0);
        const ratingLabels: Record<string, string> = { good: "ดี", fair: "พอใช้", poor: "ปรับปรุง" };
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10030] p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
              <div className="px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 flex items-center justify-between rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบประเมินผู้รับเหมาช่วง / Subcontractor Evaluation Form</h3>
                <button onClick={() => setEvalModalPayment(null)} className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
                  <XCircle size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                <p className="text-xs text-slate-500">
                  Payment: <strong>{evalModalPayment.paymentNo}</strong> | ผู้รับเหมา: <strong>{contractor?.name || "-"}</strong> | โครงการ: <strong>{project?.name || "-"}</strong>
                </p>
                {/* ── Basic info (1-5) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">1. ข้อมูลผู้จำหน่าย / SUBCONTRACTOR</label>
                    <input type="text" readOnly value={contractor?.name || ""} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-slate-100 text-slate-600" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">2. ระบุชื่องาน <span className="text-red-500">*</span></label>
                    <input type="text" value={evalForm.jobName} onChange={(e) => setEvalForm((prev) => ({ ...prev, jobName: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="ระบุชื่องาน..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">3. โครงการ / JOB No.</label>
                    <input type="text" value={evalForm.jobNo} onChange={(e) => setEvalForm((prev) => ({ ...prev, jobNo: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="เช่น J50 J52 J55" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">4. ชื่อผู้ประเมิน <span className="text-red-500">*</span></label>
                    <input type="text" value={evalForm.evaluatorName} onChange={(e) => setEvalForm((prev) => ({ ...prev, evaluatorName: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="ชื่อผู้ประเมิน..." />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-slate-700">5. วันที่ประเมิน <span className="text-red-500">*</span></label>
                    <input type="date" value={evalForm.evaluationDate} onChange={(e) => setEvalForm((prev) => ({ ...prev, evaluationDate: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                </div>
                {/* ── Questions (6-13) ── */}
                <div className="space-y-4">
                  {questions.map((q) => (
                    <div key={q.key} className="border border-slate-200 rounded-lg p-4 space-y-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-slate-800 leading-relaxed">{q.label}</p>
                        <span className="text-[10px] text-slate-500 shrink-0 bg-slate-100 px-2 py-0.5 rounded">{q.desc}</span>
                      </div>
                      {/* ── Criteria descriptions ── */}
                      <div className="space-y-1.5 text-[11px] text-slate-600 bg-slate-50 rounded-lg p-3 border border-slate-100">
                        <p><span className="inline-block w-16 font-semibold text-green-700 shrink-0">ดี :</span>{q.criteria.good}</p>
                        <p><span className="inline-block w-16 font-semibold text-amber-700 shrink-0">พอใช้ :</span>{q.criteria.fair}</p>
                        <p><span className="inline-block w-16 font-semibold text-red-700 shrink-0">ปรับปรุง :</span>{q.criteria.poor}</p>
                      </div>
                      <div className="flex flex-wrap gap-3 pt-1">
                        {(["good", "fair", "poor"] as const).map((r) => (
                          <label key={r} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-[11px] font-medium transition-all ${
                            evalForm[q.key as keyof typeof evalForm] === r
                              ? r === "good" ? "bg-green-50 border-green-400 text-green-800"
                                : r === "fair" ? "bg-amber-50 border-amber-400 text-amber-800"
                                : "bg-red-50 border-red-400 text-red-800"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}>
                            <input
                              type="radio"
                              name={q.key}
                              value={r}
                              checked={evalForm[q.key as keyof typeof evalForm] === r}
                              onChange={() => setEvalForm((prev) => ({ ...prev, [q.key]: r }))}
                              className="accent-blue-600 w-3.5 h-3.5"
                            />
                            {ratingLabels[r]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {/* ── Recommendations (14) ── */}
                <div className="space-y-1 border border-slate-200 rounded-lg p-4 bg-white">
                  <label className="text-[11px] font-semibold text-slate-700">14. คำแนะนำเพิ่มเติมที่ต้องการให้ผู้รับเหมาช่วงแก้ไขปรับปรุง</label>
                  <textarea
                    rows={4}
                    value={evalForm.recommendations}
                    onChange={(e) => setEvalForm((prev) => ({ ...prev, recommendations: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400"
                    placeholder="ระบุคำแนะนำ..."
                  />
                </div>
                {/* ── Score summary ── */}
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                  <span className="text-xs font-semibold text-blue-800">คะแนนรวมทั้งหมด / TOTAL SCORE</span>
                  <span className="text-sm font-bold text-blue-900">{totalScore.toFixed(2)} / 100</span>
                </div>
              </div>
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 rounded-b-2xl">
                <button onClick={() => setEvalModalPayment(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                  <XCircle size={15} /> ยกเลิก
                </button>
                <button
                  disabled={evaluating}
                  onClick={handleEvalSubmit}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
                >
                  {evaluating ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <CheckCircle size={14} />}
                  ส่งการประเมินและจบงาน
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ─── Activate PO Modal (แบบฟอร์มเบิกงวดงาน) ─────────────────────────── */}
      {activatingPO && createPortal((() => {
        const po = activatingPO;
        // ใช้ข้อมูล Vendor จาก PO object โดยตรง (fallback ไปที่ vendors array ถ้าไม่มี)
        const vendor = po.vendorName 
          ? { id: po.vendorId, name: po.vendorName, code: po.vendorCode, type: po.vendorType }
          : vendors.find((v: any) => v.id === po.vendorId);
        const project = (projects || []).find((p: any) => p.id === (po.projectId || selectedProjectId));
        const contractTotal = (po.items || []).reduce(
          (s: number, it: any) => s + ((Number(it.quantity) || 0) * (Number(it.price) || Number(it.unitPrice) || 0)), 0
        );
        const activationBaseNo = getPaymentBaseNo(`${po.poNo || po.id}-001`);
        const activationPriorPayments = (payments || []).filter((payment: any) =>
          payment.projectId === (po.projectId || selectedProjectId) &&
          (payment.selectedPrIds || []).includes(po.id) &&
          getPaymentBaseNo(payment.paymentNo) === activationBaseNo
        );
        const activationPeriodNo = Math.max(0, ...activationPriorPayments.map(getPaymentPeriodNo)) + 1;
        const activationPaymentNo = `${activationBaseNo}-${String(activationPeriodNo).padStart(3, '0')}`;
        const canActivate = activatingContractTitle.trim().length > 0;
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[10010] p-4">
            <div className="bg-white shadow-2xl border border-slate-300 w-[80vw] max-w-[900px] max-h-[90vh] flex flex-col rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-blue-900 to-blue-700 shrink-0 rounded-t-2xl">
                <h3 className="text-sm font-bold text-white tracking-wide">แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION</h3>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">Draft</span>
                  <button onClick={() => { setActivatingPO(null); setActivatingContractTitle(""); }} className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all">
                    <XCircle size={18} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                    <div className="space-y-2">
                      <div className="flex"><span className="w-52 text-slate-500 font-semibold shrink-0">ชื่อโครงการ / PROJECT NAME :</span><span className="font-bold text-slate-800">{project?.name || selectedProjectId || "-"}</span></div>
                      <div className="flex"><span className="w-52 text-slate-500 font-semibold shrink-0">ผู้รับเหมาช่วง / SUBCONTRACTOR :</span><span className="font-bold text-slate-800">{vendor?.name || "-"}</span></div>
                      <div className="flex"><span className="w-52 text-slate-500 font-semibold shrink-0">อ้างอิง PO / REF PO NO. :</span><span className="font-medium text-slate-700">{po.poNo || "-"}</span></div>
                      <div className="flex items-center gap-2">
                        <span className="w-52 text-red-600 font-semibold shrink-0 text-xs">ชื่อสัญญา / CONTRACT TITLE : <span className="text-red-500">*</span></span>
                        <input
                          type="text"
                          value={activatingContractTitle}
                          onChange={(e) => setActivatingContractTitle(e.target.value)}
                          placeholder="กรอกชื่อสัญญา..."
                          className={`flex-1 border rounded px-2 py-1 text-xs font-medium focus:outline-none focus:ring-2 ${activatingContractTitle.trim() ? "border-green-400 focus:ring-green-400 text-slate-800" : "border-red-400 focus:ring-red-400 bg-red-50 text-slate-600"}`}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex"><span className="w-56 text-slate-500 font-semibold shrink-0">เลขที่เบิกงวดงาน / PAYMENT NO. :</span><span className="font-bold text-blue-800">{activationPaymentNo}</span></div>
                      <div className="flex"><span className="w-56 text-slate-500 font-semibold shrink-0">Payment Type :</span><span className="font-bold text-slate-800">{po.poType || "-"}</span></div>
                      <div className="flex items-center"><span className="w-56 text-slate-500 font-semibold shrink-0">งวดงาน / PERIOD NO. :</span><span title="ระบบกำหนดเลขงวดงานอัตโนมัติและไม่สามารถแก้ไขได้" className="font-bold px-2 py-0.5 rounded border text-orange-700 bg-orange-50 border-orange-200">{activationPeriodNo} / {activationPeriodNo}</span><span className="text-[10px] text-slate-400 ml-1">(อัตโนมัติ)</span></div>
                      <div className="flex"><span className="w-56 text-slate-500 font-semibold shrink-0">วันที่จัดทำเอกสาร / Date :</span><span className="font-medium text-slate-700">{new Date().toISOString().split("T")[0]}</span></div>
                    </div>
                  </div>
                  <div className="border border-slate-300 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-slate-100 border-b-2 border-slate-300">
                            <th className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 w-10">ITEM</th>
                            <th className="border border-slate-300 px-2 py-2 text-left font-bold text-slate-700">DESCRIPTION / รายละเอียด</th>
                            <th className="border border-slate-300 px-2 py-2 text-center font-bold text-slate-700 w-16">หน่วย</th>
                            <th className="border border-slate-300 px-2 py-2 text-right font-bold text-purple-700 bg-purple-50/50 w-24">ปริมาณ</th>
                            <th className="border border-slate-300 px-2 py-2 text-right font-bold text-purple-700 bg-purple-50/50 w-28">ราคา/หน่วย</th>
                            <th className="border border-slate-300 px-2 py-2 text-right font-bold text-purple-700 bg-purple-50/50 w-32">จำนวนเงิน</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(po.items || []).length === 0 ? (
                            <tr><td colSpan={6} className="py-8 text-center text-slate-400 text-xs border border-slate-200">ยังไม่มีรายการ</td></tr>
                          ) : (po.items || []).map((it: any, i: number) => {
                            const qty = Number(it.quantity) || 0;
                            const price = Number(it.price) || Number(it.unitPrice) || 0;
                            return (
                              <tr key={i} className="border-b border-slate-200 hover:bg-slate-50/50">
                                <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{i + 1}</td>
                                <td className="border border-slate-200 px-2 py-1.5 text-slate-700 font-medium">{it.description || "-"}</td>
                                <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-500">{it.unit || "-"}</td>
                                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-purple-50/20">{qty.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono bg-purple-50/20">{formatCurrency(price)}</td>
                                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono font-semibold bg-purple-50/20">{formatCurrency(qty * price)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {(po.items || []).length > 0 && (
                          <tfoot>
                            <tr className="bg-slate-700 text-white font-bold">
                              <td colSpan={5} className="border border-slate-600 px-3 py-2 text-right text-[11px] tracking-wide">ยอดรวมทั้งสิ้น / GRAND TOTAL</td>
                              <td className="border border-slate-600 px-2 py-2 text-right font-mono text-sm">{formatCurrency(contractTotal)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                  {!activatingContractTitle.trim() && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs text-amber-800">
                      <AlertTriangle size={14} className="shrink-0 text-amber-600" />
                      <span>กรุณากรอก <strong>ชื่อสัญญา / CONTRACT TITLE</strong> ก่อนกด Active</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2 shrink-0 rounded-b-2xl">
                <button
                  disabled={actioning || !canActivate}
                  onClick={async () => { await handleActivatePayment(po, activatingContractTitle.trim()); setActivatingPO(null); setActivatingContractTitle(""); }}
                  className={`px-5 py-2 rounded-lg text-white text-sm font-semibold flex items-center gap-2 transition-colors ${canActivate ? "bg-green-600 hover:bg-green-700 disabled:opacity-60" : "bg-slate-300 cursor-not-allowed"}`}
                  title={!canActivate ? "กรุณากรอกชื่อสัญญาก่อน" : undefined}
                >
                  {actioning ? <span className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> : <Zap size={14} />}
                  Active
                </button>
                <button onClick={() => { setActivatingPO(null); setActivatingContractTitle(""); }} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 flex items-center gap-2">
                  <XCircle size={15} /> ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* ─── PDF Preview Modal ───────────────────────────────────────────────────── */}
      {pdfPreviewUrl && createPortal((
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[10050]">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-white rounded-none shadow-2xl w-[95vw] max-w-[1400px] h-screen flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-6 py-3 bg-gradient-to-r from-slate-800 to-slate-700 shrink-0">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                <FileText size={16} />
                แบบฟอร์มเบิกงวดงาน / PAYMENT APPLICATION
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewUrl}
                  download={`${pdfPreviewPayment?.paymentNo || "payment"}.pdf`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors"
                >
                  <Download size={14} />
                  ดาวน์โหลด PDF
                </a>
                <button
                  onClick={handleClosePdfPreview}
                  className="text-white/60 hover:text-white hover:bg-white/20 p-1.5 rounded-lg transition-all"
                >
                  <XCircle size={18} />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 overflow-hidden">
              <iframe
                src={`${pdfPreviewUrl}#view=FitH&toolbar=1&navpanes=0&scrollbar=1`}
                title="Payment PDF Preview"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Create/Edit Modal ถูกลบออกแล้ว — Payment สร้างอัตโนมัติจาก PO (PM กด Active) */}
    </div>
  );
});

export default PaymentView;

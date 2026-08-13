// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, Info, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList, FileSpreadsheet, Upload, Download,
  BarChart3, Zap, Building2, Wallet, ShoppingCart, FileInput, RefreshCw, UserCheck, History,
  Bell, CircleDot, AtSign, MapPinned, UserCircle, Square, CheckSquare, Flame, Mail, Settings, Send
} from "lucide-react";
import { doc, setDoc, updateDoc, deleteDoc, deleteField, runTransaction } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import {
  COST_CATEGORIES, PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, getPurchaseTypeDisplayLabel,
  PO_REVISION_PENDING_PCM, PO_REVISION_PENDING_GM, PR_PENDING_ACTIVE,
} from "../lib/constants";
import { getResumeStatusForPR } from "../lib/prAllocation";
import { uploadAttachment } from "../lib/uploadAttachment";
import { scalePrItemsToTotal, sumSubItemAmounts } from "../lib/prBudgetReturn";
import { isPaidStatus, isSpentInvoiceRecord } from "../lib/billingPayUtils";
import { useProportionalTableLayout, chainTableResizeHandlers } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import {
  buildDeleteLogDetails,
  buildRecordSummary,
} from "../lib/systemLogDetails";

const BudgetView = React.memo(() => {
  const { budgets, projects, prs, pos, invoices, receives, payments = [], addData, updateData, deleteData,
    showAlert, openConfirm, logAction, userRole, userRoles, userData, columnWidths, handleColumnResize,
    visibleProjects, handlePRAction, handlePOAction, handlePORevisionAllow, handlePORevisionDeny,
    db, appId, canUseFunction, isColumnVisible } = useAppData();
  const canSubmitBudget = canUseFunction("budget", "submit");
  const canRequestBudgetRevision = canUseFunction("budget", "requestRevision");
  const canApproveBudget = canUseFunction("budget", "approve");
  const canRejectBudget = canUseFunction("budget", "reject");
  const canAllowEditBudget = canUseFunction("budget", "allowEdit");
  const canRejectBudgetRevision = canUseFunction("budget", "rejectRevision");
  const canAddSubItem = canUseFunction("budget", "addSubItem");
  const canEditSubItem = canUseFunction("budget", "editSubItem");
  const canDeleteSubItem = canUseFunction("budget", "deleteSubItem");
  const canSubmitSubItem = canUseFunction("budget", "submitSubItem");
  const canRequestSubItemRevision = canUseFunction("budget", "requestRevisionSubItem");
  const canApproveSubItem = canUseFunction("budget", "approveSubItem");
  const canRejectSubItem = canUseFunction("budget", "rejectSubItem");
  const canAllowEditSubItem = canUseFunction("budget", "allowEditSubItem");
  const canRejectSubItemRevision = canUseFunction("budget", "rejectRevisionSubItem");
  const canClearAllBudgets = canUseFunction("budget", "clearAll");
  const canRecalculateBudget = canUseFunction("budget", "recalculate");
  const canApprovePoFromBudget = canUseFunction("po", "approve");
  const canRejectPoFromBudget = canUseFunction("po", "reject");
  const canAllowPoRevisionFromBudget = canUseFunction("po", "allowRevision");
  const canDenyPoRevisionFromBudget = canUseFunction("po", "denyRevision");
  const { selectedProjectId,
    budgetCategory, setBudgetCategory,
    expandedBudgetRows, setExpandedBudgetRows,
    scrollToPendingAfterRender, setScrollToPendingAfterRender,
    pendingSectionRef, setIsFullScreenModalOpen } = useUI();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importData, setImportData] = useState({});
  const [importFile, setImportFile] = useState(null);
  const [selectedImportCategories, setSelectedImportCategories] = useState(
    []
  );
  const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const modalMainPendingFileRef = useRef<HTMLInputElement>(null);
  const modalSubPendingFileRef = useRef<HTMLInputElement>(null);
  const [attachmentTarget, setAttachmentTarget] = useState<{ budgetId: string; subItemId?: string | null } | null>(null);
  const [attachmentUploadingKey, setAttachmentUploadingKey] = useState<string | null>(null);
  /** ไฟล์ที่เลือกในโมดัล — จะอัปโหลดหลังสร้าง Budget ใหม่ (ยังไม่มี budgetId) */
  const [pendingMainAttachments, setPendingMainAttachments] = useState<File[]>([]);
  /** ไฟล์ที่เลือกในโมดัล — จะอัปโหลดหลังบันทึก Sub-Item ใหม่ */
  const [pendingSubAttachments, setPendingSubAttachments] = useState<File[]>([]);
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "ascending",
  });
  const [budgetTableFilter, setBudgetTableFilter] = useState("");
  const [editingBudgetId, setEditingBudgetId] = useState(null);
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [editingSubItem, setEditingSubItem] = useState(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonModalType, setReasonModalType] = useState("revision"); // 'revision' | 'reject'
  const [reasonModalValue, setReasonModalValue] = useState("");
  const [reasonModalContext, setReasonModalContext] = useState({ budgetId: null, subItemId: null });
  const [selectedBudgetIds, setSelectedBudgetIds] = useState([]); // สำหรับหน้า 001-009: เลือกรายการงบ
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const [pendingSelectedBudgetIds, setPendingSelectedBudgetIds] = useState([]); // สำหรับ Pending Approval Tasks
  const [pendingActionDropdownOpen, setPendingActionDropdownOpen] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    description: "",
    amount: 0,
  });
  const [subItemData, setSubItemData] = useState({
    description: "",
    quantity: 1,
    unit: "งาน",
    unitPrice: 0,
    amount: 0,
  });
  // รายการหน่วยสำหรับ Sub-Item dropdown (เก็บใน localStorage เพื่อให้ persistent)
  const [unitOptions, setUnitOptions] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("subItemUnitOptions");
      return saved ? JSON.parse(saved) : ["งาน", "ชิ้น", "ชุด", "เดือน", "วัน", "ครั้ง", "ตร.ม.", "ม.", "ก.ก.", "ลิตร", "Job"];
    } catch { return ["งาน", "ชิ้น", "ชุด", "เดือน", "วัน", "ครั้ง", "ตร.ม.", "ม.", "ก.ก.", "ลิตร", "Job"]; }
  });
  const [unitInputText, setUnitInputText] = useState("");
  const [unitDropdownOpen, setUnitDropdownOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const unitInputRef = useRef<HTMLInputElement>(null);
  const budgetTableContainerRef = useRef<HTMLDivElement>(null);
  const dashBudgetTableRef = useRef<HTMLDivElement>(null);
  const dashSubitemTableRef = useRef<HTMLDivElement>(null);
  const dashPrTableRef = useRef<HTMLDivElement>(null);
  const dashPoTableRef = useRef<HTMLDivElement>(null);

  const budgetMainLayout = useProportionalTableLayout({
    tableId: "budget",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.budget,
    savedWidths: columnWidths.budget,
    containerRef: budgetTableContainerRef,
    enabled: budgetCategory !== "OVERVIEW",
    driftKey: "description",
    handleColumnResize,
    fitToContainer: false,
  });

  const dashBudgetLayout = useProportionalTableLayout({
    tableId: "dash-budget",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["dash-budget"],
    savedWidths: columnWidths["dash-budget"],
    containerRef: dashBudgetTableRef,
    enabled: budgetCategory === "OVERVIEW",
    driftKey: "description",
    handleColumnResize,
  });

  const dashSubitemLayout = useProportionalTableLayout({
    tableId: "dash-subitem",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["dash-subitem"],
    savedWidths: columnWidths["dash-subitem"],
    containerRef: dashSubitemTableRef,
    enabled: budgetCategory === "OVERVIEW",
    driftKey: "description",
    handleColumnResize,
  });

  const dashPrLayout = useProportionalTableLayout({
    tableId: "dash-pr",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["dash-pr"],
    savedWidths: columnWidths["dash-pr"],
    containerRef: dashPrTableRef,
    enabled: budgetCategory === "OVERVIEW",
    driftKey: "description",
    handleColumnResize,
  });

  const dashPoLayout = useProportionalTableLayout({
    tableId: "dash-po",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["dash-po"],
    savedWidths: columnWidths["dash-po"],
    containerRef: dashPoTableRef,
    enabled: budgetCategory === "OVERVIEW",
    driftKey: "costCode",
    handleColumnResize,
  });

  const onBudgetViewColumnResize = useMemo(
    () =>
      chainTableResizeHandlers(
        budgetMainLayout.handleResize,
        dashBudgetLayout.handleResize,
        dashSubitemLayout.handleResize,
        dashPrLayout.handleResize,
        dashPoLayout.handleResize
      ),
    [
      budgetMainLayout.handleResize,
      dashBudgetLayout.handleResize,
      dashSubitemLayout.handleResize,
      dashPrLayout.handleResize,
      dashPoLayout.handleResize,
    ]
  );

  const saveUnitOptions = (opts: string[]) => {
    setUnitOptions(opts);
    try { localStorage.setItem("subItemUnitOptions", JSON.stringify(opts)); } catch { }
  };

  // เมื่อกดกระดิ่งแล้วเลือกโปรเจกต์ — เลื่อนลงไปที่รายการรออนุมัติ
  useEffect(() => {
    if (budgetCategory === "OVERVIEW" && scrollToPendingAfterRender && pendingSectionRef?.current) {
      pendingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
      setScrollToPendingAfterRender(false);
    }
  }, [budgetCategory, scrollToPendingAfterRender]);

  const selectedProjectBudgets = useMemo(
    () => budgets.filter((b) => b.projectId === selectedProjectId),
    [budgets, selectedProjectId]
  );

  const budgetsByCategory = useMemo(() => {
    const grouped = new Map<string, any[]>();
    selectedProjectBudgets.forEach((budget) => {
      const key = budget.category || "";
      const rows = grouped.get(key);
      if (rows) rows.push(budget);
      else grouped.set(key, [budget]);
    });
    return grouped;
  }, [selectedProjectBudgets]);

  const currentBudgets = useMemo(
    () => budgetsByCategory.get(budgetCategory) || [],
    [budgetsByCategory, budgetCategory]
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId]
  );
  const projectPrs = useMemo(
    () => prs.filter((pr) => pr.projectId === selectedProjectId),
    [prs, selectedProjectId]
  );
  const projectPos = useMemo(
    () => pos.filter((po) => po.projectId === selectedProjectId),
    [pos, selectedProjectId]
  );
  const projectReceives = useMemo(
    () => (receives || []).filter((receive: any) => receive.projectId === selectedProjectId),
    [receives, selectedProjectId]
  );
  const projectPayments = useMemo(
    () => (payments || []).filter((payment: any) => payment.projectId === selectedProjectId),
    [payments, selectedProjectId]
  );
  const projectPrById = useMemo(() => {
    const map = new Map();
    projectPrs.forEach((pr) => map.set(pr.id, pr));
    return map;
  }, [projectPrs]);
  const duplicateBudgetCodeSet = useMemo(() => {
    const counts = new Map<string, number>();
    selectedProjectBudgets.forEach((budget) => {
      const code = budget.code || "";
      counts.set(code, (counts.get(code) || 0) + 1);
    });
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([code]) => code)
    );
  }, [selectedProjectBudgets]);
  const invoiceAmountByPoRef = useMemo(() => {
    const map = new Map<string, number>();
    const uniqueInvoices = new Map();
    
    const projectPoNos = new Set(
      projectPos.map((po: any) => po.poNo).filter(Boolean)
    );
    const paymentById = new Map(
      (payments || []).map((payment: any) => [String(payment.id), payment])
    );

    invoices.forEach((invoice: any) => {
      const belongsToProject = 
        invoice.projectId === selectedProjectId || 
        projectPoNos.has(invoice?.poRef) || 
        projectPoNos.has(invoice?.poNo);

      if (belongsToProject && isSpentInvoiceRecord(invoice)) {
        uniqueInvoices.set(invoice.id, invoice);
      }
    });

    uniqueInvoices.forEach((invoice: any) => {
      const amount = Number(invoice.amount) || (Number(invoice.invoiceQty || 0) * Number(invoice.price || 0)) || 0;
      if (invoice.sourceType === "payment") {
        const payment = paymentById.get(String(invoice.paymentId || invoice.poId || ""));
        const sourceRefs = [
          invoice.sourcePoId,
          ...(Array.isArray(payment?.selectedPrIds) ? payment.selectedPrIds : []),
          payment?.poRef,
        ].filter(Boolean);
        const sourcePoNos = Array.from(new Set(sourceRefs.map((sourceRef: any) => {
          const sourcePo = projectPos.find((po: any) => String(po.id) === String(sourceRef));
          return sourcePo?.poNo || (projectPoNos.has(sourceRef) ? sourceRef : "");
        }).filter(Boolean)));
        if (sourcePoNos.length > 0) {
          const allocatedAmount = amount / sourcePoNos.length;
          sourcePoNos.forEach((poNo: string) => {
            map.set(poNo, (map.get(poNo) || 0) + allocatedAmount);
          });
          return;
        }
      }
      if (invoice.poRef && projectPoNos.has(invoice.poRef)) {
        map.set(invoice.poRef, (map.get(invoice.poRef) || 0) + amount);
      } else if (invoice.poNo && projectPoNos.has(invoice.poNo)) {
        map.set(invoice.poNo, (map.get(invoice.poNo) || 0) + amount);
      }
    });

    return map;
  }, [invoices, payments, projectPos, selectedProjectId]);
  const receiveQtyByPoItemKey = useMemo(() => {
    const map = new Map<string, number>();
    projectReceives.forEach((receive: any) => {
      (receive.items || []).forEach((item: any) => {
        const key = `${receive.poId}:${item.poItemIndex}`;
        map.set(key, (map.get(key) || 0) + (Number(item.receivedQty) || 0));
      });
    });
    return map;
  }, [projectReceives]);
  const spPaymentsForProject = useMemo(
    () => projectPayments.filter((payment: any) => payment.paymentType === "SP" && Array.isArray(payment.selectedPrIds) && payment.selectedPrIds.length > 0),
    [projectPayments]
  );
  const getItemAmount = useCallback((item) => {
    const qty = Number(item?.quantity);
    const price = Number(item?.price);
    if (Number.isFinite(qty) && Number.isFinite(price)) return qty * price;
    return Number(item?.amount) || 0;
  }, []);
  const sumSubItemAmounts = useCallback((subItems = []) => {
    return subItems.reduce((sum, sub) => {
      const amount = Number(sub?.amount);
      if (Number.isFinite(amount)) return sum + amount;
      return sum + (Number(sub?.quantity || 0) * Number(sub?.unitPrice || 0));
    }, 0);
  }, []);
  const updateSubItemsWithMainBudgetGuard = useCallback(async (
    budgetId,
    transformSubItems,
    actionLabel = "ดำเนินการ"
  ) => {
    const budgetRef = doc(db, "artifacts", appId, "public", "data", "budgets", budgetId);

    try {
      return await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(budgetRef);
        if (!snapshot.exists()) {
          throw Object.assign(new Error("Budget not found"), { guardCode: "BUDGET_NOT_FOUND" });
        }

        const latestBudget = { id: snapshot.id, ...snapshot.data() };
        const currentSubItems = Array.isArray(latestBudget.subItems) ? latestBudget.subItems : [];
        const nextSubItems = transformSubItems(currentSubItems, latestBudget);
        if (!Array.isArray(nextSubItems)) {
          throw new Error("Sub-item update must return an array");
        }

        const mainAmount = Number(latestBudget.amount) || 0;
        const subTotal = sumSubItemAmounts(nextSubItems);
        if (subTotal > mainAmount + 0.005) {
          throw Object.assign(new Error("Sub-items exceed main budget"), {
            guardCode: "SUB_TOTAL_EXCEEDS_MAIN",
            mainAmount,
            subTotal,
          });
        }

        transaction.update(budgetRef, { subItems: nextSubItems });
        return { budget: latestBudget, subItems: nextSubItems };
      });
    } catch (error) {
      if (error?.guardCode === "SUB_TOTAL_EXCEEDS_MAIN") {
        showAlert(
          `${actionLabel}ไม่ได้ — ยอด Sub เกิน Main Budget`,
          `ยอดรวม Sub-Items ${formatCurrency(error.subTotal)} เกิน Main Budget ${formatCurrency(error.mainAmount)} อยู่ ${formatCurrency(error.subTotal - error.mainAmount)} กรุณาปรับยอดให้ถูกต้องก่อน`,
          "error"
        );
        return null;
      }
      if (error?.guardCode === "MAIN_NOT_APPROVED") {
        showAlert(
          `${actionLabel}ไม่ได้`,
          "Main item ยังไม่ได้รับการอนุมัติ กรุณาส่งขออนุมัติ Main item ก่อน",
          "warning"
        );
        return null;
      }
      if (error?.guardCode === "SUB_ITEM_NOT_FOUND") {
        showAlert("ไม่พบรายการ", "ไม่พบ Sub-Item ล่าสุด กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง", "warning");
        return null;
      }
      if (error?.guardCode === "BUDGET_NOT_FOUND") {
        showAlert("ไม่พบข้อมูล", "ไม่พบ Budget ล่าสุด กรุณาโหลดข้อมูลใหม่แล้วลองอีกครั้ง", "warning");
        return null;
      }

      console.error(`[Budget Guard] ${actionLabel}:`, error);
      showAlert("Error", `${actionLabel}ไม่สำเร็จ: ${error?.message || "เกิดข้อผิดพลาด"}`, "error");
      return null;
    }
  }, [appId, db, showAlert, sumSubItemAmounts]);
  const getSubItemAmount = useCallback((sub) => {
    const amount = Number(sub?.amount);
    if (Number.isFinite(amount)) return amount;
    return (Number(sub?.quantity || 0) * Number(sub?.unitPrice || 0)) || 0;
  }, []);
  const getSubItemPrUsed = useCallback((budget, sub) => {
    if (!budget || !sub) return 0;

    const budgetCode = budget.code || "";
    const budgetDocId = budget.id;
    const subItemId = sub.id || "";
    const subDescription = (sub.description || "").trim();
    const hasDuplicateCostCode = duplicateBudgetCodeSet.has(budgetCode);

    const itemBelongsToBudget = (pr, item) => {
      if (item?.budgetId) return item.budgetId === budgetDocId;
      if (pr?.budgetId) return pr.budgetId === budgetDocId;
      const itemCode = item?.costCode || pr?.costCode || "";
      return !hasDuplicateCostCode && itemCode === budgetCode;
    };

    const itemMatchesSubItem = (pr, item) => {
      if (subItemId && (item?.subItemId === subItemId || item?.budgetSubItemId === subItemId)) return true;
      if (!itemBelongsToBudget(pr, item)) return false;

      const itemDescription = (item?.description || "").trim();
      if (!item?.subItemId && !item?.budgetSubItemId && itemDescription === subDescription) {
        const hasAnySubItemId = (pr.items || []).some((prItem) => prItem?.subItemId || prItem?.budgetSubItemId);
        return !hasAnySubItemId;
      }

      return false;
    };

    return projectPrs
      .filter((pr) => pr.status !== "Rejected")
      .reduce((sum, pr) => {
        const usedInPr = (pr.items || [])
          .filter((item) => itemMatchesSubItem(pr, item))
          .reduce((itemSum, item) => itemSum + getItemAmount(item), 0);
        return sum + usedInPr;
      }, 0);
  }, [duplicateBudgetCodeSet, getItemAmount, projectPrs]);
  const isSelectedProjectActive = (selectedProject?.status || "Active") === "Active";
  const latestRevisionBudgetTotal = Number(selectedProject?.budgetTotal || 0);
  const shouldEnforceRevisionBudgetTotal = isSelectedProjectActive && latestRevisionBudgetTotal > 0;
  const budgetSetupDisabledByActiveProject = isSelectedProjectActive;
  const currentBudgetRevisionNo = Number.isFinite(Number(selectedProject?.currentBudgetRevision))
    ? Number(selectedProject.currentBudgetRevision)
    : -1;
  const isBudgetNewInCurrentRevisionCycle = useCallback((budget) => {
    if (!budget || selectedProject?.status !== "Prepare Budget") return false;
    if (budget.createdAfterRevision === undefined || budget.createdAfterRevision === null) return false;
    return Number(budget.createdAfterRevision) === currentBudgetRevisionNo;
  }, [selectedProject?.status, currentBudgetRevisionNo]);

  const getProjectBudgetGrandTotal = useCallback((overrideBudgetId = null, overrideAmount = null, extraAmount = 0) => {
    const baseTotal = selectedProjectBudgets.reduce((sum, b) => {
        if (overrideBudgetId && b.id === overrideBudgetId) return sum + (Number(overrideAmount) || 0);
        return sum + (Number(b.amount) || 0);
      }, 0);
    if (!overrideBudgetId && overrideAmount != null) return baseTotal + (Number(overrideAmount) || 0) + (Number(extraAmount) || 0);
    return baseTotal + (Number(extraAmount) || 0);
  }, [selectedProjectBudgets]);

  const validateGrandTotalWithinLatestRevision = useCallback((nextGrandTotal, actionLabel = "ดำเนินการ") => {
    if (!shouldEnforceRevisionBudgetTotal) return true;
    if (Number(nextGrandTotal || 0) <= latestRevisionBudgetTotal) return true;
    showAlert(
      "เกิน Budget Total ล่าสุด",
      `${actionLabel}ไม่ได้ เนื่องจาก Grand Total ${formatCurrency(nextGrandTotal)} เกิน Budget Total ของ Revision ล่าสุด ${formatCurrency(latestRevisionBudgetTotal)}`,
      "warning"
    );
    return false;
  }, [shouldEnforceRevisionBudgetTotal, latestRevisionBudgetTotal, showAlert]);

  // V.20: Explicitly define pending lists with Admin Super-Powers
  const pendingBudgetsForProject = useMemo(() => {
    if (!selectedProjectId) return [];
    // MD or Admin sees pending budgets
    if (userRole !== "MD" && userRole !== "Administrator") return [];

    return selectedProjectBudgets.filter(
      (b) =>
        (b.status === "Wait MD Approve" || b.status === "Revision Pending")
    );
  }, [selectedProjectBudgets, selectedProjectId, userRole]);

  const pendingPRsForProject = useMemo(() => {
    if (!selectedProjectId) return [];
    return projectPrs.filter((pr) => {
      if (pr.status === "Rejected" || pr.status === "Approved" || pr.status === "PO Issued") return false;

      if (userRoles.includes("Administrator")) return true;
      if (userRoles.includes("CM") && pr.status === "Pending CM") return true;
      if (userRoles.includes("PM") && pr.status === "Pending PM") return true;
      if (userRoles.includes("GM") && pr.status === "Pending GM") return true;
      if (userRoles.includes("MD") && pr.status === "Pending MD") return true;
      // PCM เห็น PR ที่ขอ Active
      if (userRoles.includes("PCM") && pr.status === PR_PENDING_ACTIVE) return true;

      return false;
    });
  }, [projectPrs, selectedProjectId, userRoles]);

  const pendingSubItemsForProject = useMemo(() => {
    if (!selectedProjectId) return [];
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    const pendingSubs = [];
    selectedProjectBudgets.forEach((b) => {
      if (b.subItems?.length > 0) {
        b.subItems.forEach((sub) => {
          if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") {
            pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
          }
        });
      }
    });
    return pendingSubs;
  }, [selectedProjectBudgets, selectedProjectId, userRole]);

  const pendingPOsForProject = useMemo(() => projectPos.filter((po) => {
    if (userRoles.includes("Administrator") && (
      po.status?.startsWith("Pending") ||
      po.status === PO_REVISION_PENDING_PCM ||
      po.status === PO_REVISION_PENDING_GM
    )) return true;
    if (userRoles.includes("PCM") && (po.status === "Pending PCM" || po.status === PO_REVISION_PENDING_PCM)) return true;
    if (userRoles.includes("GM") && (po.status === "Pending GM" || po.status === PO_REVISION_PENDING_GM)) return true;
    return false;
  }), [projectPos, selectedProjectId, userRoles]);

  const sortedBudgets = useMemo(() => {
    let sortableItems = [...currentBudgets];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === "ascending" ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === "ascending" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [currentBudgets, sortConfig]);

  const requestSort = (key) => {
    let direction = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  const isAllowedAttachmentFile = (file: File) => {
    const name = (file?.name || "").toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    const okExt = new Set(["pdf", "xls", "xlsx", "doc", "docx", "jpg", "jpeg", "png"]);
    if (ext && okExt.has(ext)) return true;
    const t = file?.type || "";
    if (t.startsWith("image/")) return true;
    const okMime = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ]);
    return okMime.has(t);
  };

  /** แนบไฟล์ที่ระดับ Budget หลัก (Firestore: budget.attachments) */
  const appendMainBudgetAttachments = async (budgetId: string, files: File[]) => {
    if (!selectedProjectId) throw new Error("กรุณาเลือกโครงการก่อนแนบไฟล์");
    if (!files?.length) return;
    const budget = budgets.find((b) => b.id === budgetId);
    const existing = [...(budget?.attachments || [])];
    const uploaded = [];
    for (const f of files) {
      const up = await uploadAttachment(f, {
        type: "budget",
        projectId: selectedProjectId,
        docId: budgetId,
        subPath: "mainItem",
      });
      uploaded.push({
        ...up,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.email || userData?.displayName || userRole || "unknown",
      });
    }
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { attachments: [...existing, ...uploaded] }
    );
    await logAction?.(
      "Update",
      `[Budget Attachments] ${budgetId} | main | +${files.length} files`,
      selectedProjectId
    );
  };

  /**
   * แนบไฟล์ที่ Sub-Item
   * @param subItemsHint ถ้ามี (เช่น หลังเพิ่ง updateDoc) ใช้แทน state เพื่อกันช้าของ onSnapshot
   */
  const appendSubItemAttachments = async (
    budgetId: string,
    subItemId: string,
    files: File[],
    subItemsHint: any[] | null
  ) => {
    if (!selectedProjectId) throw new Error("กรุณาเลือกโครงการก่อนแนบไฟล์");
    if (!files?.length) return;
    const uploaded = [];
    for (const f of files) {
      const up = await uploadAttachment(f, {
        type: "budget",
        projectId: selectedProjectId,
        docId: budgetId,
        subPath: `subItem_${subItemId}`,
      });
      uploaded.push({
        ...up,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.email || userData?.displayName || userRole || "unknown",
      });
    }
    const budget = budgets.find((b) => b.id === budgetId);
    const baseSubs = Array.isArray(subItemsHint)
      ? [...subItemsHint]
      : Array.isArray(budget?.subItems)
        ? [...budget.subItems]
        : [];
    const nextSubs = baseSubs.map((s) =>
      s.id !== subItemId
        ? s
        : { ...s, attachments: [...(s.attachments || []), ...uploaded] }
    );
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { subItems: nextSubs }
    );
    await logAction?.(
      "Update",
      `[Budget Attachments] ${budgetId} / SubItem ${subItemId} | +${files.length} files`,
      selectedProjectId
    );
  };

  const closeBudgetModal = () => {
    setIsModalOpen(false);
    setPendingMainAttachments([]);
  };

  const closeSubItemModal = () => {
    setIsSubItemModalOpen(false);
    setPendingSubAttachments([]);
  };

  useEffect(() => {
    const shouldHideShellChrome = isModalOpen || isSubItemModalOpen;
    setIsFullScreenModalOpen(shouldHideShellChrome);

    return () => {
      setIsFullScreenModalOpen(false);
    };
  }, [isModalOpen, isSubItemModalOpen, setIsFullScreenModalOpen]);

  const onModalMainPendingFilesSelected = (e: any) => {
    const files: File[] = Array.from(e?.target?.files || []);
    if (e?.target) e.target.value = "";
    if (!files.length) return;
    const invalid = files.filter((f) => !isAllowedAttachmentFile(f));
    if (invalid.length > 0) {
      showAlert(
        "ไฟล์ไม่รองรับ",
        `รองรับเฉพาะ PDF/EXCEL/WORD/JPG/JPEG/PNG\nไฟล์ที่ไม่รองรับ: ${invalid.map((f) => f.name).join(", ")}`,
        "warning"
      );
      return;
    }
    setPendingMainAttachments((prev) => [...prev, ...files]);
  };

  const onModalSubPendingFilesSelected = (e: any) => {
    const files: File[] = Array.from(e?.target?.files || []);
    if (e?.target) e.target.value = "";
    if (!files.length) return;
    const invalid = files.filter((f) => !isAllowedAttachmentFile(f));
    if (invalid.length > 0) {
      showAlert(
        "ไฟล์ไม่รองรับ",
        `รองรับเฉพาะ PDF/EXCEL/WORD/JPG/JPEG/PNG\nไฟล์ที่ไม่รองรับ: ${invalid.map((f) => f.name).join(", ")}`,
        "warning"
      );
      return;
    }
    setPendingSubAttachments((prev) => [...prev, ...files]);
  };

  const openAttachmentPicker = (budgetId: string, subItemId?: string | null) => {
    if (!selectedProjectId) {
      showAlert("แจ้งเตือน", "กรุณาเลือกโครงการก่อนแนบไฟล์", "warning");
      return;
    }
    setAttachmentTarget({ budgetId, subItemId: subItemId || null });
    // ใช้ timeout เล็กน้อยให้ state set ก่อน (กันกรณี click รัว)
    setTimeout(() => attachmentInputRef.current?.click(), 0);
  };

  const handleAttachmentFilesSelected = async (e: any) => {
    const files: File[] = Array.from(e?.target?.files || []);
    // reset เพื่อให้เลือกไฟล์เดิมซ้ำได้
    if (e?.target) e.target.value = "";
    if (!files.length) return;

    const target = attachmentTarget;
    if (!target?.budgetId) return;

    const invalid = files.filter((f) => !isAllowedAttachmentFile(f));
    if (invalid.length > 0) {
      showAlert(
        "ไฟล์ไม่รองรับ",
        `รองรับเฉพาะ PDF/EXCEL/WORD/JPG/JPEG/PNG\nไฟล์ที่ไม่รองรับ: ${invalid.map((f) => f.name).join(", ")}`,
        "warning"
      );
      return;
    }

    const key = `${target.budgetId}:${target.subItemId || "main"}`;
    setAttachmentUploadingKey(key);
    try {
      const budget = budgets.find((b) => b.id === target.budgetId);
      if (!budget) throw new Error("ไม่พบรายการ Budget");

      if (!target.subItemId) {
        await appendMainBudgetAttachments(target.budgetId, files);
      } else {
        await appendSubItemAttachments(target.budgetId, target.subItemId, files, null);
      }

      showAlert("อัปโหลดสำเร็จ", `แนบไฟล์เรียบร้อย (${files.length} ไฟล์)`, "success");
    } catch (err: any) {
      console.error("[Budget Attachments] upload error:", err);
      showAlert("อัปโหลดไม่สำเร็จ", err?.message || "เกิดข้อผิดพลาด", "error");
    } finally {
      setAttachmentUploadingKey(null);
      setAttachmentTarget(null);
    }
  };

  const handleDownloadTemplate = () => {
    if (!selectedProjectId) {
      showAlert("แจ้งเตือน", "กรุณาเลือกโครงการก่อนดาวน์โหลด Template", "warning");
      return;
    }
    if (budgetSetupDisabledByActiveProject) {
      showAlert("ไม่สามารถ Download Template ได้", "Project สถานะ Active ปิดใช้งาน Download Template ในเมนู Budget", "warning");
      return;
    }
    // ฟังก์ชัน escape ค่าสำหรับ CSV
    const esc = (val: any) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };

    // คอลัมน์: เพิ่ม MainBudget (งบประมาณหลักที่ตั้งไว้) ให้เห็นยอดรวมของ main item
    const headers = "MainCostCode,MainDescription,MainBudget,MainStatus,SubDescription,Quantity,Unit,UnitPrice,SubStatus";

    const dataRows: string[] = [];

    if (currentBudgets.length > 0) {
      currentBudgets.forEach((budget: any) => {
        const mainCode = budget.code || "";
        const mainDesc = budget.description || "";
        const mainBudget = budget.amount ?? 0;
        const mainStatus = budget.status || "Draft";

        if (budget.subItems && budget.subItems.length > 0) {
          budget.subItems.forEach((sub: any) => {
            dataRows.push([
              mainCode, mainDesc, mainBudget, mainStatus,
              sub.description || "",
              sub.quantity ?? 0,
              sub.unit || "",
              sub.unitPrice ?? 0,
              sub.status || "Draft",
            ].map(esc).join(","));
          });
        } else {
          // งบหลักที่ยังไม่มี sub-items
          dataRows.push([
            mainCode, mainDesc, mainBudget, mainStatus,
            "", "", "", "", "",
          ].map(esc).join(","));
        }
      });
    } else {
      // ไม่มีข้อมูล — ใส่แถวตัวอย่างเพื่อให้รู้รูปแบบ
      dataRows.push([
        "001001", "(ตัวอย่าง) ค่าจัดเตรียมพื้นที่", "200000", "Draft",
        "ทำความสะอาดพื้นที่หน้างาน", "1", "งาน", "30000", "Draft",
      ].map(esc).join(","));
    }

    const projectCode = projects.find((p) => p.id === selectedProjectId)?.jobNo
      || projects.find((p) => p.id === selectedProjectId)?.name?.slice(0, 10)
      || selectedProjectId.slice(0, 8);

    const bom = "\uFEFF";
    const content = bom + headers + "\n" + dataRows.join("\n");
    const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(content);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", `budget_${budgetCategory}_${projectCode}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event) => {
    if (budgetSetupDisabledByActiveProject) {
      showAlert("ไม่สามารถ Import CSV ได้", "Project สถานะ Active ปิดใช้งาน Import CSV ในเมนู Budget", "warning");
      if (event?.target) event.target.value = "";
      return;
    }
    const file = event.target.files[0];
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const rows = text.split(/\r?\n/).slice(1);
      const parsedData: any = {};
      rows.forEach((row) => {
        if (!row.trim()) return;

        const cols: string[] = [];
        let inQuotes = false;
        let currentVal = "";
        for (let i = 0; i < row.length; i++) {
          const char = row[i];
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === "," && !inQuotes) {
            cols.push(currentVal);
            currentVal = "";
          } else {
            currentVal += char;
          }
        }
        cols.push(currentVal);

        // รองรับ 3 รูปแบบ:
        // 8-col (Export+Status): MainCostCode,MainDescription,MainStatus,SubDescription,Quantity,Unit,UnitPrice,SubStatus
        // 6-col (Template ใหม่): MainCostCode,MainDescription,SubDescription,Quantity,Unit,UnitPrice
        // 3-col (Legacy):        Cost Code,Description,Budget
        // 9-col (Export+Status): MainCostCode,MainDescription,MainBudget,MainStatus,SubDescription,Quantity,Unit,UnitPrice,SubStatus
        // 6-col (Template ใหม่): MainCostCode,MainDescription,SubDescription,Quantity,Unit,UnitPrice
        const isExportFormat = cols.length >= 9;
        if (isExportFormat || cols.length >= 6) {
          // export format (9 col): cols[2]=MainBudget(ข้าม), cols[3]=MainStatus(ข้าม), cols[4..8]=Sub fields
          // template  format (6 col): cols[2..5]=Sub fields
          const cIdx = isExportFormat ? 4 : 2; // index เริ่มต้นของ SubDescription
          const clean = (v: any) => (v || "").toString().trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
          const rawMainCode = clean(cols[0]);
          const mainDescription = clean(cols[1]);
          // cols[2] = MainBudget (export) — ไม่ใช้ตอน import (ระบบใช้ budget.amount จาก Firestore)
          // cols[3] = MainStatus (export) — ไม่ใช้ตอน import
          const subDescription = clean(cols[cIdx]);
          let qtyStr = clean(cols[cIdx + 1]);
          let unit = clean(cols[cIdx + 2]);
          let unitPriceStr = clean(cols[cIdx + 3]);
          // cols[cIdx+4] = SubStatus (export) — ไม่ใช้ตอน import

          if (!rawMainCode) return;

          // Normalize Main Cost Code (รองรับทั้ง 6 / 9 หลัก และกรณี Excel ตัด 0 นำหน้า)
          const strippedMain = rawMainCode.replace(/^0+/, "") || "0";
          const normalizedMainCode =
            strippedMain.length <= 6
              ? strippedMain.padStart(6, "0")
              : strippedMain.padStart(9, "0");

          const category = normalizedMainCode.substring(0, 3);
          const ALLOWED_PREFIXES = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
          if (!ALLOWED_PREFIXES.includes(category)) return;

          qtyStr = qtyStr.replace(/,/g, "");
          unitPriceStr = unitPriceStr.replace(/,/g, "");

          const quantity = qtyStr ? Number(qtyStr) || 0 : 0;
          const unitPrice = unitPriceStr ? Number(unitPriceStr) || 0 : 0;
          const amount = quantity * unitPrice;

          if (!parsedData[category]) parsedData[category] = [];
          parsedData[category].push({
            mainCode: normalizedMainCode,
            mainDescription,
            subDescription,
            quantity,
            unit: unit || "งาน",
            unitPrice,
            amount,
            isLegacy: false,
          });
        } else if (cols.length >= 3) {
          // Template เก่า: Cost Code,Description,Budget — ยังรองรับอยู่เพื่อ backward compatibility
          let costCode = cols[0].trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
          const description = cols[1].trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
          let amountStr = cols[2].trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();

          amountStr = amountStr.replace(/,/g, "");
          if (amountStr === "-" || amountStr === "") {
            amountStr = "0";
          }

          const amount = Number(amountStr) || 0;

          if (costCode.length >= 1) {
            const strippedNum = costCode.replace(/^0+/, "") || "0";
            const normalizedCode =
              strippedNum.length <= 6
                ? strippedNum.padStart(6, "0")
                : strippedNum.padStart(9, "0");

            const category = normalizedCode.substring(0, 3);
            const ALLOWED_PREFIXES = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
            if (!ALLOWED_PREFIXES.includes(category)) return;

            if (!parsedData[category]) parsedData[category] = [];
            parsedData[category].push({
              mainCode: normalizedCode,
              mainDescription: description,
              subDescription: "",
              quantity: 0,
              unit: "",
              unitPrice: 0,
              amount,
              isLegacy: true,
            });
          }
        }
      });
      setImportData(parsedData);
      setSelectedImportCategories(Object.keys(parsedData));
      setIsImportModalOpen(true);
    };
    reader.readAsText(file);
  };

  const handleConfirmImport = async () => {
    if (!selectedProjectId)
      return showAlert("Error", "กรุณาเลือกโครงการก่อน Import", "error");
    if (budgetSetupDisabledByActiveProject)
      return showAlert("ไม่สามารถ Import CSV ได้", "Project สถานะ Active ปิดใช้งาน Import CSV ในเมนู Budget", "warning");

    const normalizeDesc = (s: string) => (s || "").trim().toLowerCase();

    // ---- Phase 1: สร้าง budgetMap ทั้งหมด + ตรวจ violation ทั้งหมดก่อน ----
    // ไม่มีการ write Firestore ใด ๆ ในขั้นนี้
    const allViolationMessages: string[] = [];   // บล็อก import ทั้งหมด (ยอดเกินงบหลัก)
    const allSkipMessages: string[] = [];   // ข้ามรายการนั้น แต่ยังทำรายการอื่นต่อ
    const allBudgetMaps: Array<{ cat: string; isLegacy: boolean; budgetMap?: any; legacyRows?: any[] }> = [];

    for (const cat of selectedImportCategories) {
      const rows = importData[cat] || [];
      if (rows.length === 0) continue;

      const isLegacyTemplate = rows.every((r: any) => r.isLegacy);

      if (isLegacyTemplate) {
        rows.forEach((row: any) => {
          const existingBudget = budgets.find(
            (b) =>
              b.projectId === selectedProjectId &&
              b.code === row.mainCode &&
              normalizeDesc(b.description) === normalizeDesc(row.mainDescription)
          );
          if (existingBudget) {
            const minAmount = getMinimumBudgetAmountForNonNegativeBalance(existingBudget);
            const nextAmount = Number(row.amount) || 0;
            if (nextAmount < minAmount) {
              allViolationMessages.push(
                `❌ ${row.mainCode} — ${row.mainDescription || ""}\n` +
                `   Amount ใหม่: ${formatCurrency(nextAmount)}  |  ขั้นต่ำที่ต้องมีเพื่อไม่ให้ Balance ติดลบ: ${formatCurrency(minAmount)}`
              );
            }
          }
        });
        allBudgetMaps.push({ cat, isLegacy: true, legacyRows: rows });
      } else {
        // สร้าง budgetMap สำหรับ category นี้
        const budgetMap: any = {};
        rows.forEach((row: any) => {
          const key = `${row.mainCode}||${(row.mainDescription || "").trim()}`;
          if (!budgetMap[key]) {
            budgetMap[key] = {
              projectId: selectedProjectId,
              category: cat,
              code: row.mainCode,
              description: row.mainDescription || "",
              amount: 0,
              status: "Draft",
              subItems: [],
            };
          }
          const hasSub = !!row.subDescription;
          if (hasSub) {
            const subAmount = Number(row.amount) || 0;
            budgetMap[key].subItems.push({
              id: crypto.randomUUID(),
              description: row.subDescription,
              quantity: row.quantity || 0,
              unit: row.unit || "งาน",
              unitPrice: row.unitPrice || 0,
              amount: subAmount,
              status: "Draft",
              rejectReason: "",
            });
            budgetMap[key].amount += subAmount;
          } else {
            budgetMap[key].amount += Number(row.amount) || 0;
          }
        });

        // ตรวจ violation + skip ทุก budget ใน map นี้
        Object.values(budgetMap).forEach((budgetItem: any) => {
          const existingBudget = budgets.find(
            (b) =>
              b.projectId === selectedProjectId &&
              b.code === budgetItem.code &&
              normalizeDesc(b.description) === normalizeDesc(budgetItem.description)
          );

          if (existingBudget) {
            const existingSubs: any[] = existingBudget.subItems || [];

            // 2. กรอง sub-items ที่ซ้ำกับที่มีอยู่แล้ว
            const duplicateSubs: any[] = [];
            const newSubs: any[] = [];
            budgetItem.subItems.forEach((s: any) => {
              const isDupe = existingSubs.some(
                (e: any) => normalizeDesc(e.description) === normalizeDesc(s.description)
              );
              if (isDupe) duplicateSubs.push(s);
              else newSubs.push(s);
            });

            if (duplicateSubs.length > 0) {
              const dupeNames = duplicateSubs.map((s: any) => `"${s.description}"`).join(", ");
              allSkipMessages.push(
                `⚠️ ${budgetItem.code} — ${budgetItem.description || ""} : ข้ามรายการซ้ำ ${duplicateSubs.length} รายการ (${dupeNames})`
              );
            }

            // ใช้เฉพาะ sub-items ใหม่ที่ไม่ซ้ำ
            budgetItem.subItems = newSubs;

            // 3. ตรวจยอดเงิน — คำนวณจาก sub-items ที่จะ merge จริง
            if (newSubs.length > 0) {
              const existingTotal = existingSubs.reduce(
                (sum: number, s: any) => sum + Number(s.amount || 0), 0
              );
              const newTotal = newSubs.reduce(
                (sum: number, s: any) => sum + Number(s.amount || 0), 0
              );
              const combined = existingTotal + newTotal;
              if (combined > Number(existingBudget.amount || 0)) {
                const overAmount = combined - Number(existingBudget.amount || 0);
                const subLines = newSubs
                  .map(
                    (s: any) =>
                      `    • ${s.description || "-"} : ${Number(s.quantity || 0).toLocaleString("th-TH")} ${s.unit || ""} × ${formatCurrency(s.unitPrice)} = ${formatCurrency(s.amount)}`
                  )
                  .join("\n");
                allViolationMessages.push(
                  `❌ ${budgetItem.code} — ${budgetItem.description || ""}\n` +
                  `   งบหลัก: ${formatCurrency(existingBudget.amount || 0)}  |  ยอดรวมปัจจุบัน+ใหม่: ${formatCurrency(combined)}  (เกิน ${formatCurrency(overAmount)})\n` +
                  `   รายการที่กำลัง Import:\n${subLines}`
                );
              }
            }
          }
        });

        allBudgetMaps.push({ cat, isLegacy: false, budgetMap });
      }
    }

    // ---- หากมี violation (ยอดเกิน) → ยกเลิกทั้งหมด ----
    if (allViolationMessages.length > 0) {
      showAlert(
        "Import ไม่สำเร็จ — ยกเลิกทั้งหมด",
        "ยอดรวม Sub-Items เกินงบหลักในรายการต่อไปนี้ กรุณาแก้ไขไฟล์แล้วลองใหม่:\n" +
        allViolationMessages.join("\n\n"),
        "error"
      );
      setIsImportModalOpen(false);
      setImportData({});
      setImportFile(null);
      setSelectedImportCategories([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const importNewBudgetTotal = allBudgetMaps.reduce((sum, entry: any) => {
      if (entry.isLegacy) {
        return sum + (entry.legacyRows || []).reduce((s: number, row: any) => {
          const existingBudget = budgets.find(
            (b) =>
              b.projectId === selectedProjectId &&
              b.code === row.mainCode &&
              normalizeDesc(b.description) === normalizeDesc(row.mainDescription)
          );
          return existingBudget ? s : s + (Number(row.amount) || 0);
        }, 0);
      }
      return sum + Object.values(entry.budgetMap || {}).reduce((s: number, budgetItem: any) => {
        const existingBudget = budgets.find(
          (b) =>
            b.projectId === selectedProjectId &&
            b.code === budgetItem.code &&
            normalizeDesc(b.description) === normalizeDesc(budgetItem.description)
        );
        return existingBudget ? s : s + (Number(budgetItem.amount) || 0);
      }, 0);
    }, 0);
    const nextImportGrandTotal = getProjectBudgetGrandTotal(null, null, importNewBudgetTotal);
    if (!validateGrandTotalWithinLatestRevision(nextImportGrandTotal, "Import CSV ")) {
      return;
    }

    // ---- Phase 2: ไม่มี violation → อัปโหลดไฟล์แนบ แล้ว write Firestore ทั้งหมด ----
    try {
      if (importFile) {
        await uploadAttachment(importFile, { type: "imports", subPath: "budget", projectId: selectedProjectId });
        setImportFile(null);
      }
    } catch (e) {
      showAlert("Error", "อัปโหลดไฟล์ไม่สำเร็จ: " + (e?.message || e), "error");
      return;
    }

    let importCount = 0;
    const batchPromises = [];

    for (const entry of allBudgetMaps) {
      if (entry.isLegacy) {
        for (const row of (entry.legacyRows || [])) {
          const budgetItem = {
            projectId: selectedProjectId,
            category: entry.cat,
            code: row.mainCode,
            description: row.mainDescription,
            amount: row.amount,
            status: "Draft",
            subItems: [],
            createdAfterRevision: currentBudgetRevisionNo,
            createdAsRevisionNewItem: true,
            createdAsRevisionNewItemAt: new Date().toISOString(),
          };
          const safeDesc = (budgetItem.description || "")
            .replace(/\//g, "-").replace(/[.#$[\]]/g, "").trim();
          const budgetDocId = `${budgetItem.projectId}-${budgetItem.code}-${safeDesc}`;
          batchPromises.push(addData("budgets", budgetItem, budgetDocId));
          importCount++;
        }
      } else {
        Object.values(entry.budgetMap || {}).forEach((budgetItem: any) => {
          const safeDesc = (budgetItem.description || "")
            .replace(/\//g, "-").replace(/[.#$[\]]/g, "").trim();
          const budgetDocId = `${budgetItem.projectId}-${budgetItem.code}-${safeDesc}`;
          const existingBudget = budgets.find(
            (b) =>
              b.projectId === selectedProjectId &&
              b.code === budgetItem.code &&
              normalizeDesc(b.description) === normalizeDesc(budgetItem.description)
          );
          if (existingBudget) {
            const mergedSubItems = [...(existingBudget.subItems || []), ...budgetItem.subItems];
            batchPromises.push(
              updateData("budgets", existingBudget.id, { subItems: mergedSubItems })
            );
          } else {
            batchPromises.push(addData("budgets", {
              ...budgetItem,
              createdAfterRevision: currentBudgetRevisionNo,
              createdAsRevisionNewItem: true,
              createdAsRevisionNewItemAt: new Date().toISOString(),
            }, budgetDocId));
          }
          importCount++;
        });
      }
    }

    await Promise.all(batchPromises);
    await logAction("Import", `Imported ${importCount} budget items`, selectedProjectId);
    setIsImportModalOpen(false);
    setImportData({});
    setImportFile(null);
    setSelectedImportCategories([]);
    if (fileInputRef.current) fileInputRef.current.value = "";

    const skipSummary = allSkipMessages.length > 0
      ? `\n\nรายการที่ถูกข้าม (${allSkipMessages.length} กลุ่ม):\n${allSkipMessages.join("\n")}`
      : "";
    // เดิมจะแสดง Modal แจ้งผล Import ที่นี่ ตัดออกตามคำขอ
  };

  const calculateTotalBudget = (item) => {
    // Rule 1 & 3: Main Budget amount is fixed. 
    // It is no longer overwritten by sum of sub-items.
    return item.amount;
  };

  const getBudgetStats = useCallback((budget) => {
    const budgetCode = budget.code;
    const budgetDocId = budget.id;
    const hasSubItems = budget.subItems && budget.subItems.length > 0;
    const budgetDesc = (budget.description || "").trim();
    const hasDuplicateCostCode = duplicateBudgetCodeSet.has(budgetCode);

    // Collect all sub-item IDs for this budget
    const subItemIds = hasSubItems ? new Set((budget.subItems || []).map((sub) => sub.id).filter(Boolean)) : null;
    const hasSubItemReference = (item) => Boolean(item?.budgetSubItemId || item?.subItemId);
    const matchesCurrentSubItem = (item) => Boolean(
      (item?.budgetSubItemId && subItemIds?.has(item.budgetSubItemId)) ||
      (item?.subItemId && subItemIds?.has(item.subItemId))
    );
    const getPrItemForAllocation = (item, allocation) => {
      const allocationPrId = allocation?.prId || item?.prId;
      const pr = projectPrById.get(allocationPrId);
      if (!pr) return { pr: null, prItem: null };

      const explicitIndex = allocation?.prItemIndex;
      if (explicitIndex != null && pr.items?.[explicitIndex]) {
        return { pr, prItem: pr.items[explicitIndex] };
      }

      // Existing allocation records usually do not have prItemIndex. When
      // the allocation is for the PO item's own PR, use the PO item's index.
      if (allocationPrId === item?.prId && item?.prItemIndex != null && pr.items?.[item.prItemIndex]) {
        return { pr, prItem: pr.items[item.prItemIndex] };
      }

      // A PR with one item is unambiguous even in legacy allocation records.
      if (Array.isArray(pr.items) && pr.items.length === 1) {
        return { pr, prItem: pr.items[0] };
      }

      return { pr, prItem: null };
    };
    const allocationBelongsToBudget = (item, allocation) => {
      const { pr, prItem } = getPrItemForAllocation(item, allocation);
      if (!pr) return false;

      if (hasSubItems) {
        if (prItem) {
          return matchesCurrentSubItem(prItem) ||
            (prItem.budgetId && prItem.budgetId === budgetDocId && !hasSubItemReference(prItem));
        }
        return false;
      }

      if (prItem) {
        if (prItem.budgetId && prItem.budgetId === budgetDocId) return true;
        if (!hasDuplicateCostCode && prItem.costCode === budgetCode) return true;
        return (prItem.description || "").trim() === budgetDesc;
      }

      return pr.budgetId === budgetDocId || (!hasDuplicateCostCode && pr.costCode === budgetCode);
    };

    const itemBelongsToBudget = (item, parentDoc = null) => {
      // For budgets with sub-items, only match items that reference specific sub-items
      if (hasSubItems) {
        // Check if item has budgetSubItemId that matches one of our sub-items
        if (matchesCurrentSubItem(item)) return true;

        // A stale sub-item ID must not be accepted only because its old
        // budgetId still points to this Budget document. Keep the budgetId
        // fallback only for legacy records that have no sub-item reference.
        if (item?.budgetId && item.budgetId === budgetDocId && !hasSubItemReference(item)) return true;

        // IMPORTANT: For PO items created from PR items, trace back to find the original sub-item ID
        if (item.prId != null && item.prItemIndex != null) {
          const pr = projectPrById.get(item.prId);
          const prItem = pr?.items?.[item.prItemIndex];
          if (prItem) {
            if (matchesCurrentSubItem(prItem)) return true;
            if (prItem.budgetId && prItem.budgetId === budgetDocId && !hasSubItemReference(prItem)) return true;
          }
        }

        // Fallback for Dis PR allocations or legacy mixed items without direct sub-item fields
        if (Array.isArray(item.disPrAllocations) && item.disPrAllocations.length > 0) {
          return item.disPrAllocations.some((alloc) => allocationBelongsToBudget(item, alloc));
        }

        // Don't count items that only match by costCode when budget has sub-items
        return false;
      }

      // For budgets without sub-items, use original logic
      // Prefer direct budgetId match
      if (item.budgetId) return item.budgetId === budgetDocId;
      // Fallback for legacy: PR-level budgetId
      if (parentDoc?.budgetId) return parentDoc.budgetId === budgetDocId;
      // Fallback for Dis PR allocations
      if (Array.isArray(item.disPrAllocations) && item.disPrAllocations.length > 0) {
        if (item.disPrAllocations.some((alloc) => {
          const pr = projectPrById.get(alloc?.prId);
          return !!pr && (pr.budgetId === budgetDocId || (!hasDuplicateCostCode && pr.costCode === budgetCode));
        })) {
          return true;
        }
      }
      // Fallback for legacy item cost code
      if (!hasDuplicateCostCode && item.costCode) return item.costCode === budgetCode;
      // Match by description for legacy items
      const iDesc = (item.description || "").trim();
      return iDesc === budgetDesc;
    };

    // PO lines can distribute one amount across multiple PRs/Budgets.
    // Count only this Budget's allocation instead of the whole PO line.
    const getBudgetItemAmount = (item, parentDoc = null) => {
      if (Array.isArray(item?.disPrAllocations) && item.disPrAllocations.length > 0) {
        return item.disPrAllocations.reduce((sum, allocation) => {
          return allocationBelongsToBudget(item, allocation)
            ? sum + (Number(allocation.amount) || 0)
            : sum;
        }, 0);
      }

      return itemBelongsToBudget(item, parentDoc) ? getItemAmount(item) : 0;
    };

    const relatedPRs = projectPrs.filter((pr) => {
      if (pr.status === "Rejected") return false;

      // For budgets with sub-items, only include PRs that have items belonging to this budget
      if (hasSubItems) {
        if (!pr.items || pr.items.length === 0) return false;
        return pr.items.some(i => itemBelongsToBudget(i, pr));
      }

      // For budgets without sub-items, use original logic
      // Match by budgetId (direct link)
      if (pr.budgetId === budgetDocId) return true;
      // Match by item-level budgetId
      if (pr.items?.some(i => i.budgetId === budgetDocId)) return true;
      // Fallback: match by cost code (legacy data without budgetId)
      if (!hasDuplicateCostCode && !pr.budgetId && pr.costCode === budgetCode) return true;
      return false;
    });

    const relatedPOs = projectPos.filter((po) => {
      if (po.status === "Rejected") return false;

      // For budgets with sub-items, only include POs that have items belonging to this budget
      if (hasSubItems) {
        if (!po.items || po.items.length === 0) return false;
        return po.items.some(i => itemBelongsToBudget(i));
      }

      // For budgets without sub-items, use original logic
      if (po.items?.some(i => i.budgetId === budgetDocId)) return true;
      // Fallback: match by cost code
      if (!hasDuplicateCostCode && po.items?.some(i => i.costCode === budgetCode)) return true;
      return false;
    });

    // PR document IDs are unique. Legacy data can contain duplicate PR numbers,
    // so deduplicating by prNo incorrectly removes real PR amounts.
    const seenPrIds = new Set();
    const prTotal = relatedPRs.reduce((sum, pr) => {
      if (pr.id && seenPrIds.has(pr.id)) return sum;
      if (pr.id) seenPrIds.add(pr.id);

      let subtotal = 0;
      if (pr.items && pr.items.length > 0) {
        subtotal = pr.items.reduce((iSum, i) => {
          return iSum + getBudgetItemAmount(i, pr);
        }, 0);
      }

      if (subtotal > 0) {
        const prSubtotal = pr.items.reduce((s, i) => s + getItemAmount(i), 0);
        const itemRatio = prSubtotal > 0 ? subtotal / prSubtotal : 0;
        const discount = Number(pr.discount || 0);
        const proportionalDiscount = discount * itemRatio;
        const prAmount = Math.max(0, subtotal - proportionalDiscount);
        return sum + prAmount;
      }

      // Fallback for legacy PRs without items
      if (!pr.items || pr.items.length === 0) {
        return sum + Number(pr.totalAmount || 0);
      }
      return sum;
    }, 0);

    // PO numbers are human-readable and can be duplicated in legacy data.
    // The Firestore document ID is the unique record identity; deduplicating
    // by poNo can silently remove a real PO from a Budget total.
    const seenPoIdsForPO = new Set();
    const poTotal = relatedPOs.reduce((sum, po) => {
      const poIdentity = po.id || po.poNo;
      if (poIdentity && seenPoIdsForPO.has(poIdentity)) return sum;
      if (poIdentity) seenPoIdsForPO.add(poIdentity);

      let subtotal = 0;
      if (po.items && po.items.length > 0) {
        subtotal = po.items.reduce((iSum, i) => {
          return iSum + getBudgetItemAmount(i);
        }, 0);
      }

      if (subtotal > 0) {
        const poSubtotal = po.items.reduce((s, i) => s + getItemAmount(i), 0);
        const itemRatio = poSubtotal > 0 ? subtotal / poSubtotal : 0;
        const discount = Number(po.discount || 0);
        const proportionalDiscount = discount * itemRatio;
        const poAmount = Math.max(0, subtotal - proportionalDiscount);
        return sum + poAmount;
      }
      
      if (!po.items || po.items.length === 0) {
         return sum + Number(po.totalAmount || 0);
      }
      return sum;
    }, 0);

    const seenPoIdsForInvoice = new Set();
    const invoiceTotal = relatedPOs.reduce((sum, po) => {
      if (po.status === "Rejected") return sum;
      
      const poIdentity = po.id || po.poNo || "";
      if (poIdentity && seenPoIdsForInvoice.has(poIdentity)) return sum;
      if (poIdentity) seenPoIdsForInvoice.add(poIdentity);

      const invAmt = invoiceAmountByPoRef.get(po.poNo) || 0;
      if (invAmt === 0) return sum;

      let subtotal = 0;
      if (po.items && po.items.length > 0) {
        subtotal = po.items.reduce((iSum, i) => {
          return iSum + getBudgetItemAmount(i);
        }, 0);
      }
      
      if (subtotal > 0) {
        const poSubtotal = po.items.reduce((s, i) => s + getItemAmount(i), 0);
        const itemRatio = poSubtotal > 0 ? subtotal / poSubtotal : 1;
        return sum + (invAmt * itemRatio);
      }
      
      if (!po.items || po.items.length === 0) {
         return sum + invAmt;
      }
      return sum;
    }, 0);

    const seenSpDocNos = new Set();
    const spTotal = (spPaymentsForProject || []).reduce((sum, sp) => {
      // If SP has PO reference, it is already handled by invoiceTotal via relatedPOs loop
      if (sp.poRef || sp.poNo) return sum;
      
      if (!isPaidStatus(sp.status)) return sum;
      
      const docNo = sp.docNo || sp.id;
      if (seenSpDocNos.has(docNo)) return sum;
      
      const relatedPrIds = new Set(relatedPRs.map(pr => pr.id));
      const isRelated = sp.selectedPrIds && sp.selectedPrIds.some(prId => relatedPrIds.has(prId));
      
      if (!isRelated) return sum;
      
      seenSpDocNos.add(docNo);
      
      let budgetSubtotal = 0;
      let totalPrSubtotal = 0;
      
      if (Array.isArray(sp.selectedPrIds)) {
        sp.selectedPrIds.forEach(prId => {
          const pr = projectPrById.get(prId);
          if (!pr || !pr.items) return;
          
          pr.items.forEach(i => {
             const amt = getItemAmount(i);
             totalPrSubtotal += amt;
             if (itemBelongsToBudget(i, pr)) {
                budgetSubtotal += amt;
             }
          });
        });
      }
      
      const spAmt = Number(sp.amount) || 0;
      
      if (totalPrSubtotal > 0) {
        const itemRatio = budgetSubtotal / totalPrSubtotal;
        return sum + (spAmt * itemRatio);
      } else {
        return sum + spAmt;
      }
    }, 0);

    const poExcessAmount = Math.max(0, poTotal - prTotal);

    return {
      prTotal,
      poTotal,
      invoiceTotal: invoiceTotal + spTotal,
      relatedPRs,
      relatedPOs,
      // Read-only audit flag. This intentionally does not modify Firestore.
      poExceedsPr: poExcessAmount > 0.01,
      poExcessAmount,
    };
  }, [duplicateBudgetCodeSet, invoiceAmountByPoRef, projectPos, projectPrById, projectPrs, getItemAmount, spPaymentsForProject]);

  const budgetStatsById = useMemo(() => {
    const statsMap = new Map();
    selectedProjectBudgets.forEach((budget) => {
      statsMap.set(budget.id, getBudgetStats(budget));
    });
    return statsMap;
  }, [selectedProjectBudgets, getBudgetStats]);

  const getMinimumBudgetAmountForNonNegativeBalance = (budget) => {
    if (!budget) return 0;
    const hasSubItems = Array.isArray(budget.subItems) && budget.subItems.length > 0;
    if (hasSubItems) {
      return sumSubItemAmounts(budget.subItems);
    }
    return Number(budgetStatsById.get(budget.id)?.invoiceTotal || 0);
  };

  const NOW_STATUS_COLOR_MAP = {
    green: "bg-blue-50 text-blue-800 border-blue-200",
    blue: "bg-sky-50 text-sky-800 border-sky-200",
    orange: "bg-orange-50 text-orange-800 border-orange-200",
    yellow: "bg-yellow-50 text-yellow-800 border-yellow-200",
    red: "bg-rose-50 text-rose-800 border-rose-200",
    indigo: "bg-indigo-50 text-indigo-800 border-indigo-200",
    purple: "bg-violet-50 text-violet-800 border-violet-200",
    emerald: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
    cyan: "bg-cyan-50 text-cyan-800 border-cyan-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };

  const NOW_STATUS_LABEL_COLOR_MAP = {
    "Budget รอ MD อนุมัติ": "bg-violet-50 text-violet-800 border-violet-200",
    "Budget อนุมัติ": "bg-sky-50 text-sky-800 border-sky-200",
    "Budget Rejected": "bg-rose-50 text-rose-800 border-rose-200",
    "PR Wait CM": "bg-cyan-50 text-cyan-800 border-cyan-200",
    "PR Wait PM": "bg-blue-50 text-blue-800 border-blue-200",
    "PR Approve": "bg-indigo-50 text-indigo-800 border-indigo-200",
    "PO Wait PCM": "bg-amber-50 text-amber-800 border-amber-200",
    "PO Wait GM": "bg-orange-50 text-orange-800 border-orange-200",
    "PO Approve": "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
    Receiving: "bg-teal-50 text-teal-800 border-teal-200",
    Received: "bg-red-50 text-red-800 border-red-200",
    "SP Progress": "bg-blue-50 text-blue-800 border-blue-200",
  };

  const getNowStatus = useCallback((budget, stats, filterMode = "ALL", targetSubId = null) => {
    const budgetCode = budget.code;
    const budgetDocId = budget.id;
    const hasSubItems = Array.isArray(budget.subItems) && budget.subItems.length > 0;
    const budgetSubItemIdSet = hasSubItems
      ? new Set((budget.subItems || []).map((sub) => sub.id).filter(Boolean))
      : null;
    const budgetSubDescriptionSet = hasSubItems
      ? new Set((budget.subItems || []).map((sub) => (sub.description || "").trim()).filter(Boolean))
      : null;
    const targetSub = filterMode === "SUB_ITEM" && targetSubId
      ? (budget.subItems || []).find((s) => s.id === targetSubId)
      : null;

    const resolveSubItemId = (item) => {
      if (item?.budgetSubItemId) return item.budgetSubItemId;
      if (item?.subItemId) return item.subItemId;
      if (item?.prId != null && item?.prItemIndex != null) {
        const pr = projectPrById.get(item.prId);
        return pr?.items?.[item.prItemIndex]?.budgetSubItemId
          || pr?.items?.[item.prItemIndex]?.subItemId
          || pr?.subItemId
          || null;
      }
      return null;
    };

    const matchesTargetSubByAllocations = (item, targetSub) => {
      if (!targetSub || !Array.isArray(item?.disPrAllocations) || item.disPrAllocations.length === 0) return false;
      return item.disPrAllocations.some((alloc) => {
        const pr = projectPrById.get(alloc?.prId);
        if (!pr) return false;

        // Most precise: PR item linked via index from allocation
        if (alloc?.prItemIndex != null && Array.isArray(pr.items)) {
          const prItem = pr.items[alloc.prItemIndex];
          if (!prItem) return false;
          return prItem.budgetSubItemId === targetSub.id || prItem.subItemId === targetSub.id;
        }

        // Fallback: any PR item mapped to this sub
        if (Array.isArray(pr.items) && pr.items.some((prItem) => prItem.budgetSubItemId === targetSub.id || prItem.subItemId === targetSub.id)) {
          return true;
        }

        // Legacy fallback
        return pr.subItemId === targetSub.id;
      });
    };

    const matchesFilter = (item, itemCostCode, parentDoc = null) => {
      if (filterMode === "SUB_ITEM" && targetSubId) {
        if (!targetSub) return false;
        const matchedByAlloc = matchesTargetSubByAllocations(item, targetSub);

        if (item?.budgetId) {
          if (item.budgetId !== budgetDocId && !matchedByAlloc) return false;
        } else if (itemCostCode !== budgetCode && !matchedByAlloc) {
          return false;
        }

        const iDesc = (item?.description || "").trim();
        const effectiveSubItemId = resolveSubItemId(item);
        if (effectiveSubItemId) return effectiveSubItemId === targetSub.id;
        if (matchedByAlloc) return true;
        const docSubId = parentDoc?.selectedSubItemId || parentDoc?.subItemId;
        if (docSubId && docSubId === targetSub.id) return true;
        const targetDesc = (targetSub.description || "").trim();
        return iDesc === targetDesc;
      }

      if (item?.budgetId) {
        if (item.budgetId !== budgetDocId) return false;
      } else if (itemCostCode !== budgetCode) {
        return false;
      }

      const iDesc = (item?.description || "").trim();
      const effectiveSubItemId = resolveSubItemId(item);

      if (filterMode === "MAIN_ONLY" && hasSubItems) {
        if (effectiveSubItemId) {
          return !budgetSubItemIdSet?.has(effectiveSubItemId);
        }
        return !budgetSubDescriptionSet?.has(iDesc);
      }

      return true;
    };

    const getPendingRole = (docType, status) => {
      if (docType === "PR") {
        if (status === "Pending CM") return "CM";
        if (status === "Pending PM") return "PM";
        if (status === "Pending GM") return "GM";
        if (status === "Pending MD") return "MD";
      }
      if (docType === "PO") {
        if (status === "Pending PCM") return "PCM";
        if (status === "Pending GM") return "GM";
      }
      return null;
    };

    const statusesToReturn = [];

    // Budget stage
    const budgetStage = targetSub?.status || budget.status || "Draft";
    if (budgetStage === "Wait MD Approve") {
      statusesToReturn.push({ label: "Budget รอ MD อนุมัติ", color: "purple", amount: null });
    } else if (budgetStage === "Approved") {
      statusesToReturn.push({ label: "Budget อนุมัติ", color: "green", amount: null });
    } else if (budgetStage === "Rejected") {
      statusesToReturn.push({ label: "Budget Rejected", color: "red", amount: null });
    } else {
      statusesToReturn.push({ label: `Budget ${budgetStage}`, color: "slate", amount: null });
    }

    // PR stage
    const prGroups = {};
    let prOpenedAmount = 0;
    (stats.relatedPRs || []).forEach((pr) => {
      let amount = 0;
      if (Array.isArray(pr.items) && pr.items.length > 0) {
        amount = pr.items
          .filter((i) => matchesFilter(i, i.costCode || pr.costCode, pr))
          .reduce((sum, i) => sum + getItemAmount(i), 0);
      } else if (filterMode !== "SUB_ITEM" && pr.costCode === budgetCode) {
        amount = Number(pr.totalAmount || pr.amount || 0);
      }
      if (amount <= 0) return;
      prOpenedAmount += amount;
      const s = pr.status || "Draft";
      prGroups[s] = (prGroups[s] || 0) + amount;
    });

    if (prOpenedAmount > 0) {
      ["Pending CM", "Pending PM"].forEach((st) => {
        if ((prGroups[st] || 0) > 0) {
          const role = getPendingRole("PR", st);
          statusesToReturn.push({ label: `PR Wait ${role}`, amount: prGroups[st], color: "cyan" });
        }
      });
      const prApprovedAmount = (prGroups["Approved"] || 0) + (prGroups["PO Issued"] || 0) + (prGroups["Closed PR"] || 0) + (prGroups["Closed PR Auto"] || 0);
      if (prApprovedAmount > 0) {
        statusesToReturn.push({ label: "PR Approve", amount: prApprovedAmount, color: "green" });
      }
    }

    // PO stage
    const poGroups = {};
    let poOpenedAmount = 0;
    const matchedPoItemKeys = [];
    (stats.relatedPOs || []).forEach((po) => {
      let amount = 0;
      (po.items || []).forEach((i, idx) => {
        const itemCode = i.costCode || projectPrById.get(i.prId)?.costCode;
        if (!matchesFilter(i, itemCode, po)) return;
        amount += getItemAmount(i);
        matchedPoItemKeys.push({ poId: po.id, idx, orderedQty: Number(i.quantity || 0) });
      });
      if (amount <= 0) return;
      poOpenedAmount += amount;
      const s = po.statusNow || po.status || "Pending PCM";
      poGroups[s] = (poGroups[s] || 0) + amount;
    });

    if (poOpenedAmount > 0) {
      ["Pending PCM", "Pending GM"].forEach((st) => {
        if ((poGroups[st] || 0) > 0) {
          const role = getPendingRole("PO", st);
          statusesToReturn.push({ label: `PO Wait ${role}`, amount: poGroups[st], color: "orange" });
        }
      });
      const poApprovedAmount = (poGroups["Approved"] || 0) + (poGroups["Partial Receive"] || 0) + (poGroups["Received"] || 0);
      if (poApprovedAmount > 0) {
        statusesToReturn.push({ label: "PO Approve", amount: poApprovedAmount, color: "green" });
      }
    }

    // Receive stage
    if (matchedPoItemKeys.length > 0) {
      let orderedQty = 0;
      let receivedQty = 0;
      matchedPoItemKeys.forEach((k) => { orderedQty += Number(k.orderedQty || 0); });
      matchedPoItemKeys.forEach((k) => {
        receivedQty += Number(receiveQtyByPoItemKey.get(`${k.poId}:${k.idx}`) || 0);
      });

      const receivePercent = orderedQty > 0
        ? Math.max(0, Math.min(100, Math.round((receivedQty / orderedQty) * 100)))
        : 0;

      if (receivePercent > 0 && receivePercent < 100) {
        statusesToReturn.push({ label: "Receiving", color: "cyan", amount: null, receivePercent });
      } else if (orderedQty > 0 && receivePercent >= 100) {
        statusesToReturn.push({ label: "Received", color: "emerald", amount: null, receivePercent: 100 });
      }
    }

    // ── SP Payment Progress stage ──────────────────────────────────────────────
    // สำหรับ PO ที่มี Payment ประเภท SP (ผู้รับเหมาย่อย) เท่านั้น
    // แสดง % ความก้าวหน้าของงาน (Activity Bar) — ใช้เฉพาะงวดล่าสุดของแต่ละสัญญา
    // เพราะ prevAccumAmount ใน items ของงวดใหม่สะสมยอดจากงวดก่อนหน้าแล้ว

    // หากอยู่ใน SUB_ITEM mode ให้กรอง PO เฉพาะที่มี items ตรงกับ sub-item นั้น
    // เพื่อป้องกัน sub-item ทุกตัวแสดง % เดียวกัน
    const spRelevantPoIds: Set<string> = filterMode === "SUB_ITEM" && targetSubId
      ? new Set(
          (stats.relatedPOs || [])
            .filter((po) =>
              (po.items || []).some((item) => {
                const itemCode = item.costCode || projectPrById.get(item.prId)?.costCode;
                return matchesFilter(item, itemCode, po);
              })
            )
            .map((po) => po.id)
        )
      : new Set((stats.relatedPOs || []).map((po) => po.id));

    const spPayments = spPaymentsForProject.filter((pmt) => {
      return pmt.selectedPrIds.some((id) => spRelevantPoIds.has(id));
    });

    if (spPayments.length > 0) {
      // จัดกลุ่มตาม selectedPrIds (เรียงแล้ว) เพื่อหาแต่ละสัญญา
      // แล้วเลือกเฉพาะงวดล่าสุด (periodNo สูงสุด) ของแต่ละสัญญา
      const spGroupMap = new Map();
      spPayments.forEach((pmt) => {
        const key = (pmt.selectedPrIds || []).slice().sort().join(",");
        const existing = spGroupMap.get(key);
        if (!existing) {
          spGroupMap.set(key, pmt);
        } else {
          const existingPeriod = parseInt(existing.periodNo) || 0;
          const newPeriod = parseInt(pmt.periodNo) || 0;
          if (newPeriod > existingPeriod) {
            spGroupMap.set(key, pmt);
          } else if (newPeriod === existingPeriod && (pmt.createdAt || "") > (existing.createdAt || "")) {
            spGroupMap.set(key, pmt);
          }
        }
      });

      let totalContract = 0;
      let totalAccum = 0;
      spGroupMap.forEach((pmt) => {
        (pmt.items || []).forEach((item) => {
          const cAmt = (Number(item.contractQty) || 0) * (Number(item.contractPrice) || 0);
          // prevAccumAmount สะสมยอดงวดก่อนหน้าทั้งหมดแล้ว + thisPeriodAmount งวดปัจจุบัน
          const accumAmt = (Number(item.prevAccumAmount) || 0) + (Number(item.thisPeriodAmount) || 0);
          totalContract += cAmt;
          totalAccum += accumAmt;
        });
      });

      const spProgressPct = totalContract > 0
        ? Math.max(0, Math.min(100, Math.round((totalAccum / totalContract) * 100)))
        : 0;
      statusesToReturn.push({
        label: "SP Progress",
        color: "blue",
        amount: null,
        spPaymentProgress: spProgressPct,
      });
    }

    return statusesToReturn;
  }, [getItemAmount, projectPrById, receiveQtyByPoItemKey, spPaymentsForProject]);

  const renderNowStatusBadges = (statuses = []) => {
    if (!statuses.length) return <span className="text-[10px] text-slate-400">-</span>;
    return (
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        {statuses.map((s, idx) => {
          const badgeClass = NOW_STATUS_LABEL_COLOR_MAP[s.label] || NOW_STATUS_COLOR_MAP[s.color] || NOW_STATUS_COLOR_MAP.slate;
          if (typeof s.spPaymentProgress === "number") {
            const pct = s.spPaymentProgress;
            const barColor = pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-blue-500" : "bg-blue-400";
            const trackColor = pct >= 100 ? "bg-emerald-100" : "bg-blue-100";
            return (
              <span key={idx} className="flex flex-col items-center gap-0.5 min-w-[80px]">
                <span className="text-[9px] px-1.5 py-0 rounded border bg-blue-50 text-blue-800 border-blue-200 whitespace-nowrap w-full text-center">
                  <span className="font-semibold">SP Progress</span>
                  <span className="ml-1 font-extrabold text-blue-900">{pct}%</span>
                </span>
                <div className={`w-full h-1.5 ${trackColor} rounded-full overflow-hidden`}>
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </span>
            );
          }
          if (typeof s.receivePercent === "number" && s.receivePercent > 0 && s.receivePercent < 100) {
            return (
              <span key={idx} className="flex flex-col items-center gap-0.5 min-w-[72px]">
                <span className={`text-[9px] px-1.5 py-0 rounded border ${badgeClass} whitespace-nowrap w-full text-center`}>
                  <span className="font-semibold">{s.label}</span>
                  <span className="ml-1 font-extrabold text-slate-900">{s.receivePercent}%</span>
                </span>
                <div className="w-full h-1 bg-cyan-100 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${s.receivePercent}%` }} />
                </div>
              </span>
            );
          }
          return (
            <span key={idx} className={`text-[9px] px-1.5 py-0 rounded border ${badgeClass} whitespace-nowrap`}>
              <span className="font-semibold">{s.label}</span>
              {s.amount != null && (
                <span className="ml-1 font-extrabold text-slate-900">{formatCurrency(s.amount)}</span>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  const pickLatestNowStatus = (statuses = []) => {
    if (!Array.isArray(statuses) || statuses.length === 0) return null;

    const getRank = (label = "") => {
      if (label === "Received") return 100;
      if (label === "Receiving") return 90;
      if (label === "SP Progress") return 85;
      if (label === "PO Approve") return 80;
      if (label === "PO Wait GM") return 70;
      if (label === "PO Wait PCM") return 60;
      if (label === "PR Approve") return 50;
      if (label === "PR Wait PM") return 40;
      if (label === "PR Wait CM") return 30;
      if (label === "Budget อนุมัติ") return 20;
      if (label === "Budget รอ MD อนุมัติ") return 10;
      return 0;
    };

    return [...statuses].sort((a, b) => getRank(b.label) - getRank(a.label))[0] || null;
  };

  const hasBudgetTableFilter = useMemo(
    () => String(budgetTableFilter || "").trim() !== "",
    [budgetTableFilter]
  );

  const normalizeBudgetFilterText = useCallback((value) => {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[,\s฿]/g, "");
  }, []);

  const getBudgetFilterText = useCallback((budget) => {
    const totalBudget = Number(calculateTotalBudget(budget)) || 0;
    const hasSubItems = Array.isArray(budget.subItems) && budget.subItems.length > 0;
    const sumSubItemsAmount = hasSubItems ? sumSubItemAmounts(budget.subItems) : 0;
    const stats = budgetStatsById.get(budget.id) || { prTotal: 0, poTotal: 0, invoiceTotal: 0, relatedPRs: [], relatedPOs: [] };
    const budgetBalance = hasSubItems ? totalBudget - sumSubItemsAmount : totalBudget - stats.invoiceTotal;
    const subItems = Array.isArray(budget.subItems) ? budget.subItems : [];
    const mainAttachments = Array.isArray(budget.attachments) ? budget.attachments : [];
    const subAttachments = subItems.flatMap((sub) => Array.isArray(sub.attachments) ? sub.attachments : []);
    const nowStatuses = getNowStatus(budget, stats, "ALL");
    const latestNowStatus = pickLatestNowStatus(nowStatuses);
    const statusText = nowStatuses
      .map((status) => [
        status.label,
        status.amount != null ? formatCurrency(status.amount) : "",
        typeof status.receivePercent === "number" ? `${status.receivePercent}%` : "",
        typeof status.spPaymentProgress === "number" ? `${status.spPaymentProgress}%` : "",
      ].filter(Boolean).join(" "))
      .join(" ");

    return [
      budget.code,
      budget.description,
      budget.revisionReason,
      budget.rejectReason,
      totalBudget,
      formatCurrency(totalBudget),
      budget.status,
      ...mainAttachments.map((att) => att?.name || att?.url || "file"),
      budgetBalance,
      formatCurrency(budgetBalance),
      stats.prTotal || 0,
      formatCurrency(stats.prTotal || 0),
      stats.poTotal || 0,
      formatCurrency(stats.poTotal || 0),
      latestNowStatus?.label,
      statusText,
      ...subItems.flatMap((sub) => {
        const subPrUsed = getSubItemPrUsed(budget, sub);
        const subBalance = getSubItemAmount(sub) - subPrUsed;
        return [
          sub.quantity,
          sub.description,
          sub.rejectReason,
          sub.unit,
          sub.unitPrice,
          sub.amount,
          formatCurrency(Number(sub.amount) || 0),
          subPrUsed,
          formatCurrency(subPrUsed),
          subBalance,
          formatCurrency(subBalance),
          sub.status || "Approved",
        ];
      }),
      ...subAttachments.map((att) => att?.name || att?.url || "file"),
    ].join(" ");
  }, [budgetStatsById, getNowStatus, getSubItemAmount, getSubItemPrUsed, normalizeBudgetFilterText, pickLatestNowStatus, sumSubItemAmounts]);

  const filteredBudgets = useMemo(() => {
    if (!hasBudgetTableFilter) return sortedBudgets;
    const filterValue = normalizeBudgetFilterText(budgetTableFilter);

    return sortedBudgets.filter((budget) =>
      normalizeBudgetFilterText(getBudgetFilterText(budget)).includes(filterValue)
    );
  }, [
    budgetTableFilter,
    getBudgetFilterText,
    hasBudgetTableFilter,
    normalizeBudgetFilterText,
    sortedBudgets,
  ]);

  const headerTotals = useMemo(() => {
    return filteredBudgets.reduce(
      (acc, b) => {
        const totalBudget = Number(calculateTotalBudget(b)) || 0;
        const hasSubItems = Array.isArray(b.subItems) && b.subItems.length > 0;
        const sumSubItemsAmount = hasSubItems ? sumSubItemAmounts(b.subItems) : 0;
        const stats = budgetStatsById.get(b.id) || { prTotal: 0, poTotal: 0, invoiceTotal: 0 };
        const budgetBalance = hasSubItems ? totalBudget - sumSubItemsAmount : totalBudget - stats.invoiceTotal;

        acc.budget += totalBudget;
        acc.prTotal += stats.prTotal || 0;
        acc.poTotal += stats.poTotal || 0;
        acc.balance += budgetBalance;
        return acc;
      },
      { budget: 0, prTotal: 0, poTotal: 0, balance: 0 }
    );
  }, [filteredBudgets, budgetStatsById, sumSubItemAmounts]);

  const getBudgetReturnNotifications = (budget) => {
    if (!budget || !Array.isArray(budget.budgetReturnNotifications)) return [];
    return [...budget.budgetReturnNotifications].sort(
      (a: any, b: any) => Number(new Date(b?.createdAt || 0)) - Number(new Date(a?.createdAt || 0))
    );
  };

  const getPendingBudgetReturnNotifications = (budget) =>
    getBudgetReturnNotifications(budget).filter((n: any) => (n?.status || "pending") !== "accepted");

  const getPendingSubBudgetReturnNotifications = (budget, subItemId) =>
    getPendingBudgetReturnNotifications(budget).filter((n: any) => (n?.subItemId || null) === (subItemId || null));

  const getCategorySummary = () => {
    return Object.entries(COST_CATEGORIES).map(([code, name]) => {
      const catBudgets = budgetsByCategory.get(code) || [];
      // Overview summary ต้องมาจากผลรวม Main item ของแต่ละหน้า (001-009)
      const mainRows = catBudgets.map((b) => {
        const totalBudget = Number(calculateTotalBudget(b)) || 0;
        const stats = budgetStatsById.get(b.id) || { prTotal: 0, poTotal: 0, invoiceTotal: 0 };
        const hasSubItems = Array.isArray(b.subItems) && b.subItems.length > 0;
        const sumSubItems = hasSubItems ? sumSubItemAmounts(b.subItems) : 0;
        // ใช้สูตรเดียวกับหน้า category ของแถว Main
        const balance = hasSubItems
          ? totalBudget - sumSubItems
          : totalBudget - (Number(stats.invoiceTotal) || 0);

        return {
          totalBudget,
          prTotal: Number(stats.prTotal) || 0,
          poTotal: Number(stats.poTotal) || 0,
          invoiceTotal: Number(stats.invoiceTotal) || 0,
          poExcessAmount: Number(stats.poExcessAmount) || 0,
          poExceedsPr: Boolean(stats.poExceedsPr),
          balance,
        };
      });

      const totalBudget = mainRows.reduce((sum, r) => sum + r.totalBudget, 0);
      const totalPR = mainRows.reduce((sum, r) => sum + r.prTotal, 0);
      const totalPO = mainRows.reduce((sum, r) => sum + r.poTotal, 0);
      const totalInvoice = mainRows.reduce((sum, r) => sum + r.invoiceTotal, 0);
      const poExcessAmount = Math.max(0, totalPO - totalPR);
      const poExceedsPr = poExcessAmount > 0.01 || mainRows.some((r) => r.poExceedsPr);
      let categoryStatus = "No Budget";
      if (catBudgets.length > 0) {
        const hasDraft = catBudgets.some((b) => b.status === "Draft");
        const hasRevision = catBudgets.some(
          (b) => b.status === "Revision Pending"
        );
        const allApproved = catBudgets.every((b) => b.status === "Approved");
        if (hasDraft) categoryStatus = "Budget - Draft";
        else if (hasRevision) categoryStatus = "Budget - Revision Pending";
        else if (allApproved) categoryStatus = "Budget - MD Approved";
        else categoryStatus = "Budget - In Progress";
      }
      const catBalance = mainRows.reduce((sum, r) => sum + r.balance, 0);

      return {
        code,
        name,
        budget: totalBudget,
        pr: totalPR,
        po: totalPO,
        invoice: totalInvoice,
        balance: catBalance,
        status: categoryStatus,
        poExceedsPr,
        poExcessAmount,
      };
    });
  };

  const categorySummary = useMemo(() => getCategorySummary(), [
    budgetsByCategory,
    budgetStatsById,
    sumSubItemAmounts,
  ]);

  const categorySummaryTotals = useMemo(() => ({
    budget: categorySummary.reduce((sum, c) => sum + c.budget, 0),
    invoice: categorySummary.reduce((sum, c) => sum + c.invoice, 0),
    balance: categorySummary.reduce((sum, c) => sum + c.balance, 0),
    pr: categorySummary.reduce((sum, c) => sum + c.pr, 0),
    po: categorySummary.reduce((sum, c) => sum + c.po, 0),
  }), [categorySummary]);

  const handleSaveBudget = async (newStatus = null) => {
    if (editingBudgetId && !canUseFunction("budget", "edit")) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์แก้ไขงบประมาณ", "warning");
      return;
    }
    if (!editingBudgetId && !canUseFunction("budget", "add")) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ตั้งงบประมาณ", "warning");
      return;
    }
    if (!editingBudgetId && budgetSetupDisabledByActiveProject) {
      showAlert("ไม่สามารถตั้งงบประมาณได้", "Project สถานะ Active ปิดใช้งานการตั้งงบประมาณในเมนู Budget", "warning");
      return;
    }
    if (newStatus === "Wait MD Approve" && !canSubmitBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
      return;
    }
    const editingBudget = editingBudgetId
      ? budgets.find((b) => b.id === editingBudgetId)
      : null;
    if (editingBudgetId) {
      const minAmount = getMinimumBudgetAmountForNonNegativeBalance(editingBudget);
      const nextAmount = Number(formData.amount) || 0;
      if (nextAmount < minAmount) {
        showAlert(
          "ไม่สามารถบันทึก Amount ได้",
          `Amount ใหม่ต้องไม่ต่ำกว่า ${formatCurrency(minAmount)} เพื่อไม่ให้ Balance ของรายการนี้ติดลบ`,
          "warning"
        );
        return;
      }
    }
    const nextGrandTotal = editingBudgetId
      ? getProjectBudgetGrandTotal(editingBudgetId, Number(formData.amount) || 0)
      : getProjectBudgetGrandTotal(null, Number(formData.amount) || 0);
    if (!validateGrandTotalWithinLatestRevision(nextGrandTotal, editingBudgetId ? "แก้ไขงบประมาณ " : "ตั้งงบประมาณ ")) {
      return;
    }
    let success = false;
    try {
      if (editingBudgetId) {
        const updatePayload = {
          description: formData.description,
          amount: formData.amount,
          code: `${budgetCategory}${formData.code}`,
        };
        if (newStatus) updatePayload.status = newStatus;

        await updateDoc(
          doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "budgets",
            editingBudgetId
          ),
          updatePayload
        );
        await logAction(
          "Update",
          `อัปเดต Budget | ${buildRecordSummary("budgets", { ...(editingBudget || {}), ...updatePayload }, editingBudgetId)}${newStatus ? ` | สถานะใหม่: ${newStatus}` : ""}`,
          selectedProjectId
        );
      } else {
        const budgetData = {
          ...formData,
          projectId: selectedProjectId,
          category: budgetCategory,
          code: `${budgetCategory}${formData.code}`,
          status: "Draft",
          revisionReason: "",
          subItems: [],
          createdAfterRevision: currentBudgetRevisionNo,
          createdAsRevisionNewItem: true,
          createdAsRevisionNewItemAt: new Date().toISOString(),
        };
        const budgetDocId = `${selectedProjectId}-${budgetData.code}-${budgetData.description}`;
        await setDoc(
          doc(db, "artifacts", appId, "public", "data", "budgets", budgetDocId),
          budgetData
        );
        await logAction(
          "Create",
          `สร้าง Budget | ${buildRecordSummary("budgets", budgetData, budgetDocId)}`,
          selectedProjectId
        );
        if (pendingMainAttachments.length > 0) {
          try {
            await appendMainBudgetAttachments(budgetDocId, pendingMainAttachments);
          } catch (attErr) {
            console.error("[Budget] post-create attachments:", attErr);
            showAlert(
              "บันทึกงบแล้ว แต่แนบไฟล์ไม่สำเร็จ",
              attErr?.message || "เกิดข้อผิดพลาด",
              "warning"
            );
          }
        }
      }
      setPendingMainAttachments([]);
      setIsModalOpen(false);
      setEditingBudgetId(null);
      setFormData({ code: "", description: "", amount: 0 });
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handleDeleteBudget = async (id) => {
    if (!canUseFunction("budget", "delete")) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ลบงบประมาณ", "warning");
      return;
    }
    openConfirm(
      "ยืนยันการลบ",
      "คุณต้องการลบรายการงบประมาณนี้ใช่หรือไม่?",
      async () => {
        try {
          const b = budgets.find((x) => x.id === id);
          await deleteDoc(
            doc(db, "artifacts", appId, "public", "data", "budgets", id)
          );
          const desc =
            b?.description && String(b.description).length > 80
              ? `${String(b.description).slice(0, 77)}…`
              : b?.description || "";
          await logAction(
            "Delete",
            b
              ? buildDeleteLogDetails("budgets", b, id)
              : `ลบ Budget ID: ${id}`,
            selectedProjectId
          );
        } catch (e) {
          showAlert("Error", e.message, "error");
        }
      },
      "danger"
    );
  };

  const handleClearAllBudgets = () => {
    if (!canClearAllBudgets) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ล้างงบทั้งหมวด", "warning");
      return;
    }
    openConfirm(
      "⚠️ ล้างข้อมูลทั้งหมด",
      `คุณต้องการลบข้อมูลงบประมาณทั้งหมดในหน้านี้ (${currentBudgets.length} รายการ) ใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      () => {
        setClearConfirmText("");
        setIsClearConfirmOpen(true);
      },
      "danger"
    );
  };

  const handleConfirmClearAll = async () => {
    if (clearConfirmText !== "Confirm") return;
    try {
      await Promise.all(
        currentBudgets.map((b) =>
          deleteDoc(doc(db, "artifacts", appId, "public", "data", "budgets", b.id))
        )
      );
      await logAction("Delete", `Cleared all ${currentBudgets.length} budget items in category ${budgetCategory}`, selectedProjectId);
      setIsClearConfirmOpen(false);
      setClearConfirmText("");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handleEditClick = (item) => {
    const suffix = item.code.substring(3);
    setFormData({
      code: suffix,
      description: item.description,
      amount: item.amount,
    });
    setPendingMainAttachments([]);
    setEditingBudgetId(item.id);
    setSelectedBudget(item);
    setIsModalOpen(true);
  };

  const handleApproveBudget = async (budgetId) => {
    if (!canApproveBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติงบประมาณ", "warning");
      return;
    }
    const b = budgets.find((x) => x.id === budgetId);
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { status: "Approved", revisionReason: "", rejectReason: "" }
    );
    const desc =
      b?.description && String(b.description).length > 80
        ? `${String(b.description).slice(0, 77)}…`
        : b?.description || "";
    await logAction(
      "Approve",
      b
        ? `Approved Budget ${b.code}${desc ? ` — ${desc}` : ""}`
        : `Approved Budget ID: ${budgetId}`,
      selectedProjectId
    );
    // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve สำเร็จ เพื่อลด pop-up ตามคำขอ
  };

  const handleSubmitBudget = async (id) => {
    if (!canSubmitBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
      return;
    }
    openConfirm(
      "ยืนยันการส่ง",
      "คุณต้องการส่งขออนุมัติรายการนี้ใช่หรือไม่?",
      async () => {
        const b = budgets.find((x) => x.id === id);
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "budgets", id),
          { status: "Wait MD Approve" }
        );
        const desc =
          b?.description && String(b.description).length > 80
            ? `${String(b.description).slice(0, 77)}…`
            : b?.description || "";
        await logAction(
          "Submit Budget",
          b
            ? `ส่ง Budget ${b.code}${desc ? ` — ${desc}` : ""} เพื่ออนุมัติ MD`
            : `ส่ง Budget ID ${id} เพื่ออนุมัติ MD`,
          selectedProjectId
        );
        showAlert(
          "ส่งคำขอสำเร็จ",
          "ส่งรายการ Budget ให้ MD ตรวจสอบแล้ว",
          "success"
        );
      }
    );
  };

  // ล้างการเลือกเมื่อเปลี่ยนหมวด
  useEffect(() => {
    setSelectedBudgetIds([]);
    setActionDropdownOpen(false);
  }, [budgetCategory]);

  const handleBulkSubmitBudgets = () => {
    if (!canSubmitBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
      return;
    }
    setActionDropdownOpen(false);
    if (selectedBudgetIds.length === 0) {
      showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการที่ต้องการส่งอนุมัติก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
      return;
    }
    const toSubmit = selectedBudgetIds.filter((id) => {
      const b = budgets.find((x) => x.id === id);
      return b && b.status === "Draft";
    });
    if (toSubmit.length === 0) {
      showAlert("ไม่สามารถส่งได้", "ไม่มีรายการที่สถานะ Draft ในรายการที่เลือก (ส่งได้เฉพาะรายการแบบร่าง)", "warning");
      return;
    }
    openConfirm(
      "ยืนยันส่ง MD Approve",
      `ส่งรายการที่เลือก ${toSubmit.length} รายการไปยัง MD อนุมัติใช่หรือไม่?`,
      async () => {
        try {
          for (const id of toSubmit) {
            await updateDoc(
              doc(db, "artifacts", appId, "public", "data", "budgets", id),
              { status: "Wait MD Approve" }
            );
          }
          await logAction("Bulk", `Sent ${toSubmit.length} budgets to Wait MD Approve`, selectedProjectId);
          setSelectedBudgetIds([]);
          setActionDropdownOpen(false);
        } catch (e) {
          showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถส่งได้", "error");
        }
      }
    );
  };

  const handleBulkDeleteBudgets = () => {
    if (!canUseFunction("budget", "delete")) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ลบงบประมาณ", "warning");
      return;
    }
    setActionDropdownOpen(false);
    if (selectedBudgetIds.length === 0) {
      showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการที่ต้องการลบก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
      return;
    }
    const toDelete = selectedBudgetIds.filter((id) => {
      const b = budgets.find((x) => x.id === id);
      return b && (b.status === "Draft" || userRole === "MD" || userRole === "Administrator");
    });
    if (toDelete.length === 0) {
      showAlert("ไม่สามารถลบได้", "ไม่มีรายการที่ลบได้ในรายการที่เลือก (เฉพาะ Draft หรือ MD/Admin ลบได้)", "warning");
      return;
    }
    openConfirm(
      "ยืนยันลบหลายรายการ",
      `คุณต้องการลบรายการที่เลือก ${toDelete.length} รายการใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
      async () => {
        try {
          for (const id of toDelete) {
            await deleteDoc(
              doc(db, "artifacts", appId, "public", "data", "budgets", id)
            );
          }
          await logAction("Bulk", `Deleted ${toDelete.length} budgets`, selectedProjectId);
          setSelectedBudgetIds([]);
          setActionDropdownOpen(false);
          showAlert("สำเร็จ", `ลบ ${toDelete.length} รายการเรียบร้อย`, "success");
        } catch (e) {
          showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถลบได้", "error");
        }
      },
      "danger"
    );
  };

  const handleBulkApprovePendingBudgets = async () => {
    if (!canApproveBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติงบประมาณ", "warning");
      return;
    }
    setPendingActionDropdownOpen(false);
    if (pendingSelectedBudgetIds.length === 0) {
      showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการงบที่ต้องการ Approve ก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
      return;
    }
    const toApprove = pendingSelectedBudgetIds.filter((id) => {
      const b = pendingBudgetsForProject.find((x) => x.id === id);
      return !!b;
    });
    if (toApprove.length === 0) {
      showAlert("ไม่พบรายการ", "ไม่มีรายการรออนุมัติที่ตรงกับการเลือก", "warning");
      return;
    }
    try {
      for (const id of toApprove) {
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "budgets", id),
          { status: "Approved", revisionReason: "", rejectReason: "" }
        );
      }
      await logAction("Bulk", `Approved ${toApprove.length} pending budgets from dashboard`, selectedProjectId);
      setPendingSelectedBudgetIds([]);
      setPendingActionDropdownOpen(false);
      // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve สำเร็จ เพื่อลด pop-up ตามคำขอ
    } catch (e) {
      showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถ Approve ได้", "error");
    }
  };

  const handleBulkRejectPendingBudgets = () => {
    if (!canRejectBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธงบประมาณ", "warning");
      return;
    }
    setPendingActionDropdownOpen(false);
    if (pendingSelectedBudgetIds.length === 0) {
      showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการงบที่ต้องการ Reject ก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
      return;
    }
    const toReject = pendingSelectedBudgetIds.filter((id) => {
      const b = pendingBudgetsForProject.find((x) => x.id === id);
      return !!b;
    });
    if (toReject.length === 0) {
      showAlert("ไม่พบรายการ", "ไม่มีรายการรออนุมัติที่ตรงกับการเลือก", "warning");
      return;
    }
    openConfirm(
      "ยืนยัน Reject หลายรายการ",
      `คุณต้องการ Reject Budget ที่เลือก ${toReject.length} รายการใช่หรือไม่?`,
      async () => {
        try {
          for (const id of toReject) {
            await updateDoc(
              doc(db, "artifacts", appId, "public", "data", "budgets", id),
              { status: "Rejected" }
            );
          }
          await logAction("Bulk", `Rejected ${toReject.length} pending budgets from dashboard`, selectedProjectId);
          setPendingSelectedBudgetIds([]);
          setPendingActionDropdownOpen(false);
          showAlert("สำเร็จ", `Reject งบประมาณ ${toReject.length} รายการเรียบร้อย`, "success");
        } catch (e) {
          showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถ Reject ได้", "error");
        }
      },
      "danger"
    );
  };

  const handleRequestRevision = async () => {
    if (!canRequestBudgetRevision) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ขอแก้ไขงบประมาณ", "warning");
      return;
    }
    if (!selectedBudget || !revisionReason) return;
    await updateDoc(
      doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "budgets",
        selectedBudget.id
      ),
      { status: "Revision Pending", revisionReason: revisionReason }
    );
    await logAction(
      "Request",
      `Requested Revision for Budget: ${selectedBudget.code}`,
      selectedProjectId
    );
    setIsRevisionModalOpen(false);
    setRevisionReason("");
    setSelectedBudget(null);
  };

  const handleAllowEdit = async (budgetId) => {
    if (!canAllowEditBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุญาตแก้ไขงบประมาณ", "warning");
      return;
    }
    const b = budgets.find((x) => x.id === budgetId);
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { status: "Draft", revisionReason: "", rejectReason: "" }
    );
    const desc =
      b?.description && String(b.description).length > 80
        ? `${String(b.description).slice(0, 77)}…`
        : b?.description || "";
    await logAction(
      "Approve",
      b
        ? `Allowed Edit for Budget ${b.code}${desc ? ` — ${desc}` : ""}`
        : `Allowed Edit for Budget ID: ${budgetId}`,
      selectedProjectId
    );
  };

  const handleRejectRevision = async (budgetId) => {
    if (!canRejectBudgetRevision) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธคำขอแก้ไขงบประมาณ", "warning");
      return;
    }
    const b = budgets.find((x) => x.id === budgetId);
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { status: "Approved", revisionReason: "" }
    );
    const desc =
      b?.description && String(b.description).length > 80
        ? `${String(b.description).slice(0, 77)}…`
        : b?.description || "";
    await logAction(
      "Reject Revision",
      b
        ? `Rejected revision request for Budget ${b.code}${desc ? ` — ${desc}` : ""} — สถานะกลับเป็น Approved`
        : `Rejected revision request for Budget ID: ${budgetId} — สถานะกลับเป็น Approved`,
      selectedProjectId
    );
  };

  const openRejectModal = (budget) => {
    setSelectedBudget(budget);
    setRejectReason("");
    setIsRejectModalOpen(true);
  };

  const handleRejectBudget = async () => {
    if (!selectedBudget || !rejectReason) return;
    if (!canRejectBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธงบประมาณ", "warning");
      return;
    }
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", selectedBudget.id),
      { status: "Rejected", rejectReason: rejectReason }
    );
    await logAction("Reject", `Rejected Budget: ${selectedBudget.code} - ${rejectReason}`, selectedProjectId);
    setIsRejectModalOpen(false);
    setRejectReason("");
    setSelectedBudget(null);
    showAlert("ปฏิเสธแล้ว", "รายการ Budget ถูกปฏิเสธเรียบร้อย", "error");
  };

  const subItemLogDescription = (budget, subItemId) => {
    const sub = budget?.subItems?.find((s) => s.id === subItemId);
    const raw = (sub?.description ?? "").trim() || "(no description)";
    return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
  };

  const handleAcceptBudgetReturnNotification = useCallback((budget, notification) => {
    if (!budget?.id || !notification?.id) return;
    const sub = budget?.subItems?.find((s) => s.id === notification.subItemId);
    const amount = Number(notification.amount || 0);
    const reason = String(notification.reason || "-");
    const createdAtText = notification.createdAt ? new Date(notification.createdAt).toLocaleString("th-TH") : "-";

    openConfirm(
      "รับยอด Budget คืนจาก PR",
      `PR: ${notification.prNo || notification.prId || "-"}\nยอดคืน: ${formatCurrency(amount)}\nเหตุผล: ${reason}\nเวลาแจ้งคืน: ${createdAtText}\n\nกด "ยืนยัน" เพื่อรับยอดคืนเข้ารายการ Budget`,
      async () => {
        const latestBudget = budgets.find((b) => b.id === budget.id);
        if (!latestBudget) {
          showAlert("ไม่พบข้อมูล", "ไม่พบ Budget ล่าสุด", "warning");
          return;
        }

        const latestNotifications = Array.isArray(latestBudget.budgetReturnNotifications) ? latestBudget.budgetReturnNotifications : [];
        const latestNotification = latestNotifications.find((n: any) => n?.id === notification.id);
        if (!latestNotification || (latestNotification?.status || "pending") === "accepted") {
          showAlert("รายการไม่พร้อมใช้งาน", "รายการนี้ถูกรับยอดแล้วหรือไม่พบข้อมูลล่าสุด", "info");
          return;
        }

        const acceptedBy = userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : (userRole || "Unknown");
        const acceptedAt = new Date().toISOString();
        try {
          await runTransaction(db, async (transaction) => {
            const budgetRef = doc(db, "artifacts", appId, "public", "data", "budgets", latestBudget.id);
            const budgetSnap = await transaction.get(budgetRef);
            if (!budgetSnap.exists()) throw new Error("ไม่พบ Budget ล่าสุด");

            const currentBudget = budgetSnap.data() || {};
            const currentNotifications = Array.isArray(currentBudget.budgetReturnNotifications)
              ? currentBudget.budgetReturnNotifications
              : [];
            const currentNotification = currentNotifications.find((n: any) => n?.id === latestNotification.id);
            if (!currentNotification || (currentNotification.status || "pending") === "accepted") {
              throw new Error("รายการนี้ถูกรับยอดแล้วหรือไม่พบข้อมูลล่าสุด");
            }

            const budgetPayload: any = {
              budgetReturnNotifications: currentNotifications.map((n: any) =>
                n?.id === currentNotification.id
                  ? { ...n, status: "accepted", acceptedAt, acceptedBy: acceptedBy || "Unknown" }
                  : n
              ),
            };

            if (currentNotification.applyOnAccept) {
              const prId = currentNotification.prId;
              const prRef = doc(db, "artifacts", appId, "public", "data", "prs", prId);
              const prSnap = await transaction.get(prRef);
              if (!prSnap.exists()) throw new Error("ไม่พบ PR ล่าสุดสำหรับคำขอคืนยอดนี้");

              const currentPr = prSnap.data() || {};
              const pendingReturn = currentPr.pendingBudgetReturn;
              if (!pendingReturn || pendingReturn.requestId !== currentNotification.id) {
                throw new Error("คำขอคืนยอดนี้ไม่ตรงกับข้อมูล PR ล่าสุด");
              }

              const currentPrTotal = Number(currentPr.totalAmount ?? currentPr.amount ?? 0);
              const oldPrTotal = Number(pendingReturn.oldTotalAmount ?? currentNotification.oldPrTotal ?? currentPrTotal);
              if (Math.abs(currentPrTotal - oldPrTotal) > 0.01) {
                throw new Error("PR ถูกแก้ไขระหว่างรอรับยอด กรุณาตรวจสอบรายการก่อนรับยอด");
              }

              const history = Array.isArray(currentPr.budgetReturnRevisions)
                ? currentPr.budgetReturnRevisions
                : [];
              const {
                requestId,
                newItems,
                newStatus,
                ...revision
              } = pendingReturn;
              const revisedTotal = Number(pendingReturn.newTotalAmount ?? currentNotification.newPrTotal ?? 0);
              const revisionToStore = {
                ...revision,
                revNo: history.length + 1,
                acceptedAt,
                acceptedBy: acceptedBy || "Unknown",
              };
              const appliedItems = Array.isArray(newItems)
                ? newItems
                : scalePrItemsToTotal(currentPr.items || [], revisedTotal);

              transaction.update(prRef, {
                items: appliedItems,
                totalAmount: revisedTotal,
                amount: revisedTotal,
                status: newStatus || (revisedTotal <= 0 ? "Closed PR Auto" : currentPr.status || "Approved"),
                budgetReturnRevisions: [...history, revisionToStore],
                budgetReturnRevNo: revisionToStore.revNo,
                lastBudgetReturnAt: revisionToStore.at,
                lastBudgetReturnAmount: revisionToStore.returnedAmount,
                lastBudgetReturnReason: revisionToStore.returnReason,
                pendingBudgetReturn: deleteField(),
              });

              const currentUsedAmount = Number(currentBudget.usedAmount);
              if (Number.isFinite(currentUsedAmount)) {
                budgetPayload.usedAmount = Math.max(0, currentUsedAmount - Number(currentNotification.amount || 0));
              }
            }

            transaction.update(budgetRef, budgetPayload);
          });
        } catch (error: any) {
          showAlert("รับยอดไม่สำเร็จ", error?.message || "ไม่สามารถรับยอดคืน Budget ได้", "error");
          return;
        }

        await logAction?.(
          "Accept Budget Return",
          `รับยอดคืน Budget ${latestBudget.code} จาก PR ${latestNotification.prNo || latestNotification.prId}: ${formatCurrency(amount)} | เหตุผล: ${reason}`,
          latestBudget.projectId || selectedProjectId
        );
        showAlert("รับยอดสำเร็จ", `รับยอดคืน ${formatCurrency(amount)} เข้างบประมาณเรียบร้อย`, "success");
      },
      "warning"
    );
  }, [budgets, logAction, openConfirm, selectedProjectId, showAlert, updateData, userData, userRole]);

  const handleApproveSubItem = async (budgetId, subItemId) => {
    if (!canApproveSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติรายการย่อย", "warning");
      return;
    }
    const result = await updateSubItemsWithMainBudgetGuard(
      budgetId,
      (latestSubItems) => {
        if (!latestSubItems.some((sub) => sub.id === subItemId)) {
          throw Object.assign(new Error("Sub-item not found"), { guardCode: "SUB_ITEM_NOT_FOUND" });
        }
        return latestSubItems.map((sub) =>
          sub.id === subItemId ? { ...sub, status: "Approved", rejectReason: "" } : sub
        );
      },
      "อนุมัติ Sub-Item"
    );
    if (!result) return;

    const latestBudget = { ...result.budget, subItems: result.subItems };
    await logAction("Approve Sub-Item", `Approved Sub-Item "${subItemLogDescription(latestBudget, subItemId)}" (Budget ${latestBudget.code})`, latestBudget.projectId || selectedProjectId);
    // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve รายการย่อยสำเร็จ เพื่อลด pop-up ตามคำขอ
  };

  const handleRequestRevisionSubItem = async (budgetId, subItemId, reason) => {
    if (!canRequestSubItemRevision) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ขอแก้ไขงบประมาณ", "warning");
      return;
    }
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;
    const newSubItems = budget.subItems.map(sub =>
      sub.id === subItemId ? { ...sub, status: "Revision Pending", revisionReason: reason } : sub
    );
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { subItems: newSubItems }
    );
    await logAction("Request Revision Sub-Item", `Requested Revision for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`, budget.projectId || selectedProjectId);
    showAlert("ส่งคำขอแก้ไข", "ส่งเรื่องรอ MD อนุมัติการแก้ไขรายการย่อยแล้ว", "info");
  };

  const handleAllowEditSubItem = async (budgetId, subItemId) => {
    if (!canAllowEditSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุญาตแก้ไขรายการย่อย", "warning");
      return;
    }
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;
    const newSubItems = budget.subItems.map(sub =>
      sub.id === subItemId ? { ...sub, status: "Draft", revisionReason: "", rejectReason: "" } : sub
    );
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { subItems: newSubItems }
    );
    await logAction("Allow Edit Sub-Item", `Allowed Edit for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`, budget.projectId || selectedProjectId);
    showAlert("อนุญาตแล้ว", "ปลดล็อครายการย่อยให้แก้ไขได้ (สถานะ Draft)", "success");
  };

  const handleRejectRevisionSubItem = async (budgetId, subItemId) => {
    if (!canRejectSubItemRevision) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธคำขอแก้ไขรายการย่อย", "warning");
      return;
    }
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;
    const newSubItems = budget.subItems.map(sub =>
      sub.id === subItemId ? { ...sub, status: "Approved", revisionReason: "" } : sub
    );
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { subItems: newSubItems }
    );
    await logAction("Reject Revision Sub-Item", `Rejected revision for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code}) — สถานะกลับเป็น Approved`, budget.projectId || selectedProjectId);
    showAlert("ไม่อนุญาตแก้ไข", "สถานะรายการย่อยกลับเป็น Approved ตามเดิม", "info");
  };

  const handleRecalculateTotals = async () => {
    if (!canRecalculateBudget) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์คำนวณยอดใหม่", "warning");
      return;
    }
    if (!selectedProjectId) {
      showAlert("แจ้งเตือน", "กรุณาเลือกโครงการก่อน", "warning");
      return;
    }

    setIsRecalculating(true);
    try {
      // Force refresh data to get the latest calculations with the new logic
      await updateData();
      showAlert("สำเร็จ", "คำนวณยอด PO TOTAL ใหม่เรียบร้อยแล้ว", "success");
      await logAction("Recalculate", `Recalculated PO totals for project`, selectedProjectId);
    } catch (error) {
      console.error("Error recalculating totals:", error);
      showAlert("ข้อผิดพลาด", "ไม่สามารถคำนวณยอดใหม่ได้", "error");
    } finally {
      setIsRecalculating(false);
    }
  };

  const openReasonModal = (type, budgetId, subItemId) => {
    setReasonModalType(type);
    setReasonModalContext({ budgetId, subItemId });
    setReasonModalValue("");
    setReasonModalOpen(true);
  };

  const handleReasonModalSubmit = () => {
    const { budgetId, subItemId } = reasonModalContext;
    if (!reasonModalValue.trim()) return;
    if (reasonModalType === "revision") {
      if (!canRequestSubItemRevision) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ขอแก้ไขงบประมาณ", "warning");
        return;
      }
      handleRequestRevisionSubItem(budgetId, subItemId, reasonModalValue.trim());
    } else {
      handleRejectSubItem(budgetId, subItemId, reasonModalValue.trim());
    }
    setReasonModalOpen(false);
    setReasonModalValue("");
  };

  const handleSubmitSubItem = async (budgetId, subItemId) => {
    if (!canSubmitSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
      return;
    }
    const result = await updateSubItemsWithMainBudgetGuard(
      budgetId,
      (latestSubItems, latestBudget) => {
        if (latestBudget.status !== "Approved") {
          throw Object.assign(new Error("Main budget is not approved"), { guardCode: "MAIN_NOT_APPROVED" });
        }
        if (!latestSubItems.some((sub) => sub.id === subItemId)) {
          throw Object.assign(new Error("Sub-item not found"), { guardCode: "SUB_ITEM_NOT_FOUND" });
        }
        return latestSubItems.map((sub) =>
          sub.id === subItemId ? { ...sub, status: "Wait MD Approve", rejectReason: "" } : sub
        );
      },
      "ส่งอนุมัติ Sub-Item"
    );
    if (!result) return;

    const latestBudget = { ...result.budget, subItems: result.subItems };
    await logAction("Submit Sub-Item", `Submitted Sub-Item "${subItemLogDescription(latestBudget, subItemId)}" (Budget ${latestBudget.code}) for approval`, latestBudget.projectId || selectedProjectId);
  };

  const handleRejectSubItem = async (budgetId, subItemId, reason) => {
    if (!canRejectSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธรายการย่อย", "warning");
      return;
    }
    const budget = budgets.find(b => b.id === budgetId);
    if (!budget) return;

    const newSubItems = budget.subItems.map(sub =>
      sub.id === subItemId ? { ...sub, status: "Rejected", rejectReason: reason } : sub
    );

    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
      { subItems: newSubItems }
    );
    await logAction("Reject Sub-Item", `Rejected Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`, budget.projectId || selectedProjectId);
    showAlert("ปฏิเสธแล้ว", "ปฏิเสธรายการย่อย (Sub-Item) เรียบร้อย", "error");
  };

  const toggleRow = (id) => {
    setExpandedBudgetRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const openSubItemModal = (item) => {
    if (!canAddSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์เพิ่มรายการย่อย", "warning");
      return;
    }
    setSelectedBudget(item);
    setEditingSubItem(null);
    setPendingSubAttachments([]);
    setSubItemData({ description: "", quantity: 1, unit: "งาน", unitPrice: 0, amount: 0 });
    setUnitInputText("งาน");
    setUnitDropdownOpen(false);
    setIsSubItemModalOpen(true);
  };

  const openEditSubItemModal = (mainItem, subItem) => {
    if (!canEditSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์แก้ไขรายการย่อย", "warning");
      return;
    }
    setSelectedBudget(mainItem);
    setPendingSubAttachments([]);
    setEditingSubItem(subItem);
    setSubItemData({
      description: subItem.description,
      quantity: subItem.quantity,
      unit: subItem.unit || "งาน",
      unitPrice: subItem.unitPrice || 0,
      amount: subItem.amount,
    });
    setUnitInputText(subItem.unit || "งาน");
    setUnitDropdownOpen(false);
    setIsSubItemModalOpen(true);
  };

  const handleResubmitSubItemFromModal = async () => {
    if (!canSubmitSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
      return;
    }
    if (!selectedBudget || !editingSubItem) return;
    const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
    const editingSubItemId = editingSubItem.id;
    const result = await updateSubItemsWithMainBudgetGuard(
      selectedBudget.id,
      (latestSubItems, latestBudget) => {
        if (latestBudget.status !== "Approved") {
          throw Object.assign(new Error("Main budget is not approved"), { guardCode: "MAIN_NOT_APPROVED" });
        }
        if (!latestSubItems.some((sub) => sub.id === editingSubItemId)) {
          throw Object.assign(new Error("Sub-item not found"), { guardCode: "SUB_ITEM_NOT_FOUND" });
        }
        return latestSubItems.map((sub) =>
          sub.id === editingSubItemId
            ? {
              ...sub,
              description: subItemData.description,
              quantity: Number(subItemData.quantity),
              unit: subItemData.unit || "งาน",
              unitPrice: Number(subItemData.unitPrice),
              amount: amountToAdd,
              status: "Wait MD Approve",
              rejectReason: "",
            }
            : sub
        );
      },
      "ส่งอนุมัติ Sub-Item อีกครั้ง"
    );
    if (!result) return;

    setPendingSubAttachments([]);
    setIsSubItemModalOpen(false);
    setEditingSubItem(null);
    setExpandedBudgetRows((prev) => ({ ...prev, [selectedBudget.id]: true }));
  };

  const handleSaveSubItem = async () => {
    if (!selectedBudget) return;
    if (editingSubItem && !canEditSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์แก้ไขรายการย่อย", "warning");
      return;
    }
    if (!editingSubItem && !canAddSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์เพิ่มรายการย่อย", "warning");
      return;
    }
    if (!subItemData.description.trim()) return showAlert("ข้อมูลไม่ครบ", "กรุณากรอกชื่อรายการ", "warning");
    const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
    
    if (editingSubItem) {
      const subPrUsed = getSubItemPrUsed(selectedBudget, editingSubItem);
      if (amountToAdd < subPrUsed) {
        return showAlert(
          "ไม่สามารถบันทึก Amount ได้",
          `ยอดเงินใหม่ (${formatCurrency(amountToAdd)}) ต่ำกว่ายอดที่มีการเปิด PR ไปแล้ว (${formatCurrency(subPrUsed)}) เพื่อไม่ให้ Balance ติดลบ`,
          "warning"
        );
      }
    }
    const newSubItem = {
      ...(editingSubItem || {}),
      id: editingSubItem ? editingSubItem.id : crypto.randomUUID(),
      description: subItemData.description,
      quantity: Number(subItemData.quantity),
      unit: subItemData.unit || "งาน",
      unitPrice: Number(subItemData.unitPrice),
      amount: amountToAdd,
      status: editingSubItem?.status === "Rejected" ? "Rejected" : "Draft",
      rejectReason: editingSubItem?.status === "Rejected" ? (editingSubItem.rejectReason || "") : ""
    };
    let updatedSubItems;
    if (editingSubItem) {
      updatedSubItems = selectedBudget.subItems.map((sub) =>
        sub.id === editingSubItem.id ? newSubItem : sub
      );
    } else {
      updatedSubItems = [...(selectedBudget.subItems || []), newSubItem];
    }
    const newTotal = updatedSubItems.reduce(
      (sum, sub) => sum + sub.amount,
      0
    );

    // Rule 3 Validation: Sub-items cannot exceed Main Budget's original amount
    if (newTotal > selectedBudget.amount) {
      return showAlert(
        "ยอดเงินเกินกำหนด",
        `ยอดรวมรายการย่อย (${formatCurrency(newTotal)}) ห้ามเกินงบประมาณหลักที่ตั้งไว้ (${formatCurrency(selectedBudget.amount)})`,
        "error"
      );
    }

    // Rule 4: Do NOT update main budget amount.
    await updateDoc(
      doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "budgets",
        selectedBudget.id
      ),
      { subItems: updatedSubItems }
    );
    if (pendingSubAttachments.length > 0 && !editingSubItem) {
      try {
        await appendSubItemAttachments(
          selectedBudget.id,
          newSubItem.id,
          pendingSubAttachments,
          updatedSubItems
        );
      } catch (attErr) {
        console.error("[Sub-Item] post-save attachments:", attErr);
        showAlert(
          "บันทึก Sub แล้ว แต่แนบไฟล์ไม่สำเร็จ",
          attErr?.message || "เกิดข้อผิดพลาด",
          "warning"
        );
      }
    }
    setPendingSubAttachments([]);
    setIsSubItemModalOpen(false);
    setExpandedBudgetRows((prev) => ({ ...prev, [selectedBudget.id]: true }));
  };

  const handleDeleteSubItem = async (mainId, subId) => {
    if (!canDeleteSubItem) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ลบรายการย่อย", "warning");
      return;
    }
    const mainBudget = budgets.find((b) => b.id === mainId);
    if (!mainBudget) return;
    
    const subToDelete = mainBudget.subItems?.find(s => s.id === subId);
    if (subToDelete) {
      const subPrUsed = getSubItemPrUsed(mainBudget, subToDelete);
      if (subPrUsed > 0) {
        showAlert(
          "ไม่สามารถลบได้",
          `รายการนี้มีการเบิกใช้งาน PR ไปแล้ว (${formatCurrency(subPrUsed)}) ไม่สามารถลบได้`,
          "warning"
        );
        return;
      }
    }

    openConfirm(
      "ยืนยันการลบ",
      "ต้องการลบรายการย่อยนี้หรือไม่?",
      async () => {
        const updatedSubItems = mainBudget.subItems.filter(
          (sub) => sub.id !== subId
        );
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "budgets", mainId),
          { subItems: updatedSubItems }
        );
      },
      "danger"
    );
  };

  return (
    <div className="space-y-4 w-full min-w-0">
      {/* ── Page Header + Tabs ── */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm w-full min-w-0">
        <div className="flex items-center gap-3 md:gap-4 w-full min-w-0 flex-wrap md:flex-nowrap">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center shadow-sm">
              <Briefcase size={19} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-blue-800 leading-none">Budget (งบประมาณ)</h2>
              <p className="text-[10px] text-blue-400 mt-1">วางแผนและควบคุมงบประมาณโครงการ</p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 bg-blue-50/50 rounded-xl border border-blue-100/50 p-1 max-w-full min-w-0 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setBudgetCategory("OVERVIEW")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${budgetCategory === "OVERVIEW"
                  ? "bg-white text-blue-600 shadow-sm ring-1 ring-blue-200"
                  : "text-blue-400 hover:text-blue-600 hover:bg-white/50"
                }`}
            >
              <BarChart3 size={13} />
              Overview
            </button>
            {Object.entries(COST_CATEGORIES).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setBudgetCategory(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${budgetCategory === key
                    ? "bg-white text-blue-600 shadow-sm ring-1 ring-blue-200"
                    : "text-blue-400 hover:text-blue-600 hover:bg-white/50"
                  }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <ColumnVisibilityToggle tableId="budget" />
        </div>
      </div>

      {budgetCategory === "OVERVIEW" ? (
        <>
          <Card className="overflow-x-auto w-full min-w-0">
            <div className="p-3 bg-slate-50 border-b">
              <h3 className="font-bold text-sm text-slate-800">
                สรุปภาพรวมงบประมาณโครงการ (Project Budget Summary)
              </h3>
            </div>
            <table className="w-full min-w-[760px] text-left text-sm text-slate-600 table-fixed md:min-w-0">
              <colgroup>
                <col style={{ width: "7%" }} />
                <col style={{ width: "28%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "13%" }} />
                <col style={{ width: "14%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead className="bg-slate-200 text-slate-900 uppercase font-bold border-b text-sm">
                <tr>
                  <th className="py-3 px-4 border-r">Code</th>
                  <th className="py-3 px-4 border-r min-w-0">หมวดงาน</th>
                  <th className="py-3 px-4 text-right bg-blue-100">
                    Budget Total
                  </th>
                  <th className="py-3 px-4 text-right text-slate-600">
                    PR Total
                  </th>
                  <th className="py-3 px-4 text-right border-r font-bold text-green-800">
                    Balance
                  </th>
                  <th className="py-3 px-4 text-right text-slate-600">
                    PO Total
                  </th>
                  <th className="py-3 px-4 text-right text-orange-700 border-r-0">
                    Spent (Inv)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categorySummary.map((cat) => (
                  <tr key={cat.code} className="hover:bg-slate-50">
                    <td className="py-2 px-4 border-r font-bold text-center bg-slate-50">
                      {cat.code}
                    </td>
                    <td className="py-2 px-4 border-r font-medium min-w-0 truncate" title={cat.name}>
                      {cat.name}
                    </td>
                    <td className="py-2 px-4 text-right bg-blue-50/50 font-semibold text-slate-900">
                      {formatCurrency(cat.budget)}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-500">
                      {formatCurrency(cat.pr)}
                    </td>
                    <td
                      className={`py-2 px-4 text-right border-r font-bold ${cat.balance < 0 ? "text-red-600" : "text-green-600"
                        }`}
                    >
                      {formatCurrency(cat.balance)}
                    </td>
                    <td
                      className={`py-2 px-4 text-right ${cat.poExceedsPr ? "text-red-600 font-bold" : "text-slate-500"}`}
                      title={cat.poExceedsPr ? `แจ้งเตือน: PO มากกว่า PR ${formatCurrency(cat.poExcessAmount)}` : undefined}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {cat.poExceedsPr && <AlertCircle size={14} aria-label="PO มากกว่า PR" />}
                        {formatCurrency(cat.po)}
                      </span>
                    </td>
                    <td className="py-2 px-4 text-right text-orange-600 border-r-0">
                      {formatCurrency(cat.invoice)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-800 text-white font-bold">
                <tr>
                  <td colSpan="2" className="py-2 px-3 text-right">
                    Grand Total
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatCurrency(
                      categorySummaryTotals.budget
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {formatCurrency(
                      categorySummaryTotals.pr
                    )}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {formatCurrency(
                      categorySummaryTotals.balance
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {formatCurrency(
                      categorySummaryTotals.po
                    )}
                  </td>
                  <td className="py-2 px-3 text-right text-orange-300 border-r-0">
                    {formatCurrency(
                      categorySummaryTotals.invoice
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>

          {/* ===== Approval Tasks Section (เลื่อนลงมาดูเมื่อกดกระดิ่ง) ===== */}
          {(pendingBudgetsForProject.length > 0 || pendingPRsForProject.length > 0 || pendingPOsForProject.length > 0 || pendingSubItemsForProject.length > 0) && (
            <div ref={pendingSectionRef} id="pending-approval-tasks" className="space-y-4 scroll-mt-4">
              <div className="flex items-center gap-2 pt-2">
                <Bell size={16} className="text-amber-500" />
                <h3 className="text-sm font-bold text-slate-700">
                  รายการรออนุมัติ (Pending Approval Tasks)
                </h3>
                <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
                  {pendingBudgetsForProject.length + pendingSubItemsForProject.length + pendingPRsForProject.length + pendingPOsForProject.length} รายการ
                </span>
              </div>

              {/* ----- Budget Approval Table (MD only) ----- */}
              {pendingBudgetsForProject.length > 0 && (
                <Card className="overflow-hidden border-l-4 border-l-blue-500 w-full min-w-0">
                  <div className="p-3 bg-blue-50 border-b flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle size={15} className="text-blue-600" />
                      <h4 className="font-bold text-xs text-blue-800 uppercase tracking-wide">
                        Project Budget — รออนุมัติ ({pendingBudgetsForProject.length} รายการ)
                      </h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          className="flex items-center gap-1 px-3 py-1.5 h-8 rounded-md font-medium text-[11px] shadow-sm bg-slate-700 text-white hover:bg-slate-800"
                          onClick={() => setPendingActionDropdownOpen((v) => !v)}
                        >
                          Action
                          <ChevronDown size={12} className={pendingActionDropdownOpen ? "rotate-180" : ""} />
                        </button>
                        {pendingActionDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 z-20 py-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]">
                            {canApproveBudget && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 text-green-700 flex items-center gap-2"
                                onClick={handleBulkApprovePendingBudgets}
                              >
                                Approve ({pendingSelectedBudgetIds.length} รายการ)
                              </button>
                            )}
                            {canRejectBudget && (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-700 flex items-center gap-2"
                                onClick={handleBulkRejectPendingBudgets}
                              >
                                Reject ({pendingSelectedBudgetIds.length} รายการ)
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div ref={dashBudgetTableRef} className="w-full min-w-0">
                    <table className="w-full text-left text-xs text-slate-600 table-fixed">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-2.5 px-3 text-center" style={{ width: dashBudgetLayout.scaled.checkbox }}>
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={pendingSelectedBudgetIds.length > 0 && pendingSelectedBudgetIds.length === pendingBudgetsForProject.length}
                              onChange={(e) => {
                                if (e.target.checked) setPendingSelectedBudgetIds(pendingBudgetsForProject.map((b) => b.id));
                                else setPendingSelectedBudgetIds([]);
                              }}
                            />
                          </th>
                          <ResizableTh tableId="dash-budget" colKey="costCode" className="py-2.5 px-4" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="description" className="py-2.5 px-4" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.description}>รายการ</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="amount" className="py-2.5 px-4 text-right" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="status" className="py-2.5 px-4 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="py-2.5 px-4 text-center" style={{ width: dashBudgetLayout.scaled.actions }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingBudgetsForProject.map((b) => {
                          const totalBudget =
                            b.subItems && b.subItems.length > 0
                              ? b.subItems.reduce((sum, s) => sum + Number(s.amount), 0)
                              : Number(b.amount);
                          const isRevisionPending = b.status === "Revision Pending";
                          return (
                            <tr key={b.id} className={`hover:bg-blue-50/50 ${isRevisionPending ? "bg-orange-50/30" : ""}`}>
                              <td className="py-2 px-3 text-center align-middle">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={pendingSelectedBudgetIds.includes(b.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setPendingSelectedBudgetIds((prev) => [...prev, b.id]);
                                    } else {
                                      setPendingSelectedBudgetIds((prev) => prev.filter((id) => id !== b.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-800" title={b.code}><span className="cell-text">{b.code}</span></td>
                              <td className="py-2 px-3" title={b.description + (b.revisionReason ? ` | ขอแก้: ${b.revisionReason}` : "") + (b.rejectReason ? ` | ปฏิเสธ: ${b.rejectReason}` : "")}>
                                <span className="cell-text">{b.description}</span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-blue-700">
                                {formatCurrency(totalBudget)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge status={b.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1">
                                  {!isRevisionPending && (canApproveBudget || canRejectBudget) && (
                                    <>
                                      {canApproveBudget && <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleApproveBudget(b.id)}
                                      >
                                        <CheckCircle size={11} /> Approve
                                      </Button>}
                                      {canRejectBudget && <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => openRejectModal(b)}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>}
                                    </>
                                  )}
                                  {isRevisionPending && (canAllowEditBudget || canRejectBudgetRevision) && (
                                    <>
                                      {canAllowEditBudget && <Button
                                        variant="warning"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleAllowEdit(b.id)}
                                      >
                                        อนุญาตแก้ไข
                                      </Button>}
                                      {canRejectBudgetRevision && <Button
                                        variant="secondary"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleRejectRevision(b.id)}
                                      >
                                        ไม่อนุญาตแก้ไข
                                      </Button>}
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* ----- Sub-Item Approval Table (MD only) ----- */}
              {pendingSubItemsForProject.length > 0 && (
                <Card className="overflow-hidden border-l-4 border-l-purple-500 w-full min-w-0">
                  <div className="p-3 bg-purple-50 border-b flex items-center gap-2">
                    <CheckCircle size={15} className="text-purple-600" />
                    <h4 className="font-bold text-xs text-purple-800 uppercase tracking-wide">
                      Project Budget (Sub-Items) — รออนุมัติ ({pendingSubItemsForProject.length} รายการ)
                    </h4>
                  </div>
                  <div ref={dashSubitemTableRef} className="w-full min-w-0">
                    <table className="w-full text-left text-xs text-slate-600 table-fixed">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <ResizableTh tableId="dash-subitem" colKey="costCode" className="py-1.5 px-3" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="description" className="py-1.5 px-3" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.description}>รายการ</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="amount" className="py-1.5 px-3 text-right" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.amount}>จำนวนเงินรวม</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="status" className="py-1.5 px-3 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="py-1.5 px-3 text-center" style={{ width: dashSubitemLayout.scaled.actions }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const groupedSubs = pendingSubItemsForProject.reduce((acc, sub) => {
                            if (!acc[sub.budgetId]) acc[sub.budgetId] = { budgetCode: sub.budgetCode, subItems: [] };
                            acc[sub.budgetId].subItems.push(sub);
                            return acc;
                          }, {});

                          return Object.entries(groupedSubs).map(([bId, group]) => {
                            const b = budgets.find(bg => bg.id === bId);
                            if (!b) return null;
                            const isExpanded = expandedBudgetRows[b.id];

                            return (
                              <React.Fragment key={bId}>
                                <tr className="hover:bg-purple-50/40 cursor-pointer" onClick={() => toggleRow(b.id)}>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                    <div className="flex items-center gap-2">
                                      <span className="flex items-center justify-center w-7 h-7 rounded-md bg-purple-100 text-purple-600 shrink-0">
                                        {isExpanded ? <ChevronDown size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
                                      </span>
                                      {b.code}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-900">{b.description}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-purple-700">
                                    {formatCurrency(group.subItems.reduce((sum, s) => sum + s.amount, 0))}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Badge status={group.subItems.some(s => s.status === "Revision Pending") ? "Revision Pending" : "Wait MD Approve"} />
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="text-[10px] text-slate-400">คลิกเพื่อดูรายการย่อยที่รออนุมัติ</span>
                                  </td>
                                </tr>
                                {isExpanded && group.subItems.map((sub, index) => (
                                  <tr key={sub.id} className="bg-slate-50/50 text-xs">
                                    <td className="py-1 px-3 border-r text-right text-slate-500 pr-4 font-mono relative">
                                      <span className="text-[9px] font-bold text-slate-400 absolute left-2 top-2.5">QTY</span>
                                      {sub.quantity}
                                    </td>
                                    <td className="py-1 px-3 border-r pl-8 flex items-center justify-between text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <CornerDownRight size={12} className="text-slate-300" />
                                        {sub.description}
                                      </div>
                                      <div className="text-slate-400 text-[10px]">
                                        @ {formatCurrency(sub.unitPrice)}
                                      </div>
                                    </td>
                                    <td className="py-1 px-3 text-right text-red-600 pr-4 font-medium border-b border-slate-100">
                                      -{formatCurrency(sub.amount)}
                                    </td>
                                    <td className="py-1 px-3 text-center border-b border-slate-100">
                                      <Badge status={sub.status} />
                                    </td>
                                    <td className="py-1 px-3 text-center border-b border-slate-100">
                                      <div className="flex justify-center gap-1">
                                        {(canAllowEditSubItem || canRejectSubItemRevision) && sub.status === "Revision Pending" ? (
                                          <>
                                            {canAllowEditSubItem && <Button variant="warning" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAllowEditSubItem(b.id, sub.id)}>
                                              อนุญาตแก้ไข
                                            </Button>}
                                            {canRejectSubItemRevision && <Button variant="secondary" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleRejectRevisionSubItem(b.id, sub.id)}>
                                              ไม่อนุญาตแก้ไข
                                            </Button>}
                                          </>
                                        ) : (canApproveSubItem || canRejectSubItem) ? (
                                          <>
                                            {canApproveSubItem && <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>
                                              <CheckCircle size={11} /> Approve
                                            </Button>}
                                            {canRejectSubItem && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => openReasonModal("reject", b.id, sub.id)}>
                                              <XCircle size={11} /> Reject
                                            </Button>}
                                          </>
                                        ) : null}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* ----- PR Approval Table (PM / GM / MD by role) ----- */}
              {pendingPRsForProject.length > 0 && (
                <Card className="overflow-hidden border-l-4 border-l-green-500 w-full min-w-0">
                  <div className="p-3 bg-green-50 border-b flex items-center gap-2">
                    <FileText size={15} className="text-green-600" />
                    <h4 className="font-bold text-xs text-green-800 uppercase tracking-wide">
                      Purchase Request (PR) — รออนุมัติ ({pendingPRsForProject.length} รายการ)
                    </h4>
                  </div>
                  <div ref={dashPrTableRef} className="w-full min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[860px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-0.5 px-2 text-center md:hidden" style={{ width: dashPrLayout.scaled.actions }}>Actions</th>
                          <ResizableTh tableId="dash-pr" colKey="prNo" className="py-0.5 px-2" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.prNo}>PR No.</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="date" className="py-0.5 px-2" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.date}>วันที่</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="costCode" className="py-0.5 px-2" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="type" className="py-0.5 px-2" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.type}>ประเภท</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="requestor" className="py-0.5 px-2" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.requestor}>ผู้ขอซื้อ</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="amount" className="py-0.5 px-2 text-right" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="status" className="py-0.5 px-2 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="hidden py-0.5 px-2 text-center md:table-cell" style={{ width: dashPrLayout.scaled.actions }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingPRsForProject.map((pr) => {
                          const approveLabel =
                            pr.status === "Pending CM"
                              ? "CM Approve"
                              : pr.status === "Pending PM"
                                ? "PM Approve"
                                : pr.status === "Pending GM"
                                  ? "GM Approve"
                                  : pr.status === "Pending MD"
                                    ? "MD Approve"
                                    : "Approve";

                          const isActivePr = pr.status === PR_PENDING_ACTIVE;
                          const canApprove =
                            (pr.status === "Pending CM" && (userRoles.includes("CM") || userRoles.includes("Administrator"))) ||
                            (pr.status === "Pending PM" && (userRoles.includes("PM") || userRoles.includes("Administrator"))) ||
                            (pr.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator"))) ||
                            (pr.status === "Pending MD" && (userRoles.includes("MD") || userRoles.includes("Administrator"))) ||
                            (isActivePr && (userRoles.includes("PCM") || userRoles.includes("Administrator")));

                          if (!canApprove) return null;

                          return (
                            <tr key={pr.id} className={`hover:bg-green-50/40 ${isActivePr ? "bg-teal-50/30" : ""}`}>
                              <td className="py-0.5 px-2 text-center md:hidden">
                                <div className="flex justify-center gap-1">
                                  {isActivePr ? (
                                    <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={async () => {
                                        const { status: resume, usedAmount, totalAmount } = getResumeStatusForPR(pr, pos);
                                        await updateData("prs", pr.id, { status: resume, preCloseStatus: null, activeRequestedAt: null });
                                        logAction(
                                          "Approved Active PR",
                                          `อนุมัติ Active PR ${pr.prNo || pr.id} → ${resume} (PO linked ${formatCurrency(usedAmount)} / PR ${formatCurrency(totalAmount)})`,
                                          selectedProjectId
                                        );
                                        const returnedAmount = Math.max(0, totalAmount - usedAmount);
                                        showAlert(
                                          "สำเร็จ",
                                          `PR กลับสถานะ ${resume} แล้ว ยอดคงเหลือที่เปิดใช้ได้ ${formatCurrency(returnedAmount)}${usedAmount > 0 ? ` (ยังมี PO ผูกอยู่ ${formatCurrency(usedAmount)})` : ""}`,
                                          "success"
                                        );
                                      }}
                                    >
                                      <CheckCircle size={11} /> Active PR
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePRAction(pr.id, "approve")}
                                      >
                                        <CheckCircle size={11} /> {approveLabel}
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePRAction(pr.id, "reject")}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className="py-0.5 px-2 font-medium text-slate-800" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>
                              <td className="py-0.5 px-2 text-slate-500" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>
                              <td className="py-0.5 px-2">
                                <span className="bg-gray-100 px-1.5 py-0 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
                                  {pr.costCode}
                                </span>
                              </td>
                              <td className="py-0.5 px-2" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>
                              <td className="py-0.5 px-2" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>
                              <td className="py-0.5 px-2 text-right font-semibold text-green-700">
                                {formatCurrency(pr.totalAmount || pr.amount)}
                              </td>
                              <td className="hidden py-0.5 px-2 text-center md:table-cell">
                                <Badge status={pr.status} />
                              </td>
                              <td className="py-0.5 px-2 text-center">
                                <div className="flex justify-center gap-1">
                                  {isActivePr ? (
                                    <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={async () => {
                                        const { status: resume, usedAmount, totalAmount } = getResumeStatusForPR(pr, pos);
                                        await updateData("prs", pr.id, { status: resume, preCloseStatus: null, activeRequestedAt: null });
                                        logAction(
                                          "Approved Active PR",
                                          `อนุมัติ Active PR ${pr.prNo || pr.id} → ${resume} (PO linked ${formatCurrency(usedAmount)} / PR ${formatCurrency(totalAmount)})`,
                                          selectedProjectId
                                        );
                                        const returnedAmount = Math.max(0, totalAmount - usedAmount);
                                        showAlert(
                                          "สำเร็จ",
                                          `PR กลับสถานะ ${resume} แล้ว ยอดคงเหลือที่เปิดใช้ได้ ${formatCurrency(returnedAmount)}${usedAmount > 0 ? ` (ยังมี PO ผูกอยู่ ${formatCurrency(usedAmount)})` : ""}`,
                                          "success"
                                        );
                                      }}
                                    >
                                      <CheckCircle size={11} /> Active PR
                                    </Button>
                                  ) : (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePRAction(pr.id, "approve")}
                                      >
                                        <CheckCircle size={11} /> {approveLabel}
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePRAction(pr.id, "reject")}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* ----- PO Approval Table (PCM / GM by role) ----- */}
              {pendingPOsForProject.length > 0 && (
                <Card className="overflow-hidden border-l-4 border-l-orange-500 w-full min-w-0">
                  <div className="p-3 bg-orange-50 border-b flex items-center gap-2">
                    <FileText size={15} className="text-orange-600" />
                    <h4 className="font-bold text-xs text-orange-800 uppercase tracking-wide">
                      Purchase Order (PO) — รออนุมัติ ({pendingPOsForProject.length} รายการ)
                    </h4>
                  </div>
                  <div ref={dashPoTableRef} className="w-full min-w-0 overflow-x-auto">
                    <table className="w-full min-w-[780px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-1.5 px-3 text-center md:hidden" style={{ width: dashPoLayout.scaled.actions }}>Actions</th>
                          <ResizableTh tableId="dash-po" colKey="poNo" className="py-1.5 px-3" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.poNo}>PO No.</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="date" className="py-1.5 px-3" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.date}>วันที่</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="costCode" className="py-1.5 px-3" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="amount" className="py-1.5 px-3 text-right" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="status" className="py-1.5 px-3 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="hidden py-1.5 px-3 text-center md:table-cell" style={{ width: dashPoLayout.scaled.actions }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingPOsForProject.map((po) => {
                          const isPoRevPcm = po.status === PO_REVISION_PENDING_PCM;
                          const isPoRevGm = po.status === PO_REVISION_PENDING_GM;
                          const approveLabel =
                            isPoRevPcm || isPoRevGm
                              ? "—"
                              : po.status === "Pending PCM"
                                ? "PCM Approve"
                                : po.status === "Pending GM"
                                  ? "GM Approve"
                                  : "Approve";

                          const canApprove =
                            (po.status === "Pending PCM" && (userRoles.includes("PCM") || userRoles.includes("Administrator"))) ||
                            (po.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator"))) ||
                            (isPoRevPcm && (userRoles.includes("PCM") || userRoles.includes("Administrator"))) ||
                            (isPoRevGm && (userRoles.includes("GM") || userRoles.includes("Administrator")));

                          if (!canApprove) return null;

                          return (
                            <tr key={po.id} className="hover:bg-orange-50/40">
                              <td className="py-2 px-3 text-center md:hidden">
                                <div className="flex justify-center gap-1 flex-wrap">
                                  {(canAllowPoRevisionFromBudget || canDenyPoRevisionFromBudget) && (isPoRevPcm || isPoRevGm) ? (
                                    <>
                                      {canAllowPoRevisionFromBudget && <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionAllow(po.id)}
                                      >
                                        <CheckCircle size={11} /> อนุญาตแก้ไข
                                      </Button>}
                                      {canDenyPoRevisionFromBudget && <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionDeny(po.id)}
                                      >
                                        <XCircle size={11} /> ไม่อนุญาต
                                      </Button>}
                                    </>
                                  ) : (canApprovePoFromBudget || canRejectPoFromBudget) ? (
                                    <>
                                      {canApprovePoFromBudget && <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "approve")}
                                      >
                                        <CheckCircle size={11} /> {approveLabel}
                                      </Button>}
                                      {canRejectPoFromBudget && <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "reject")}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>
                              <td className="py-2 px-3 text-slate-500" title={po.date || po.poDate}><span className="cell-text">{po.date || po.poDate}</span></td>
                              <td className="py-2 px-3">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={po.costCode}>
                                  {po.costCode}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-orange-700">
                                {formatCurrency(po.amount || po.totalAmount || po.grandTotal)}
                              </td>
                              <td className="hidden py-2 px-3 text-center md:table-cell">
                                <div className="flex flex-col items-center gap-0.5">
                                  <Badge status={po.status} />
                                  {po.poEditRevisionReason ? (
                                    <span className="text-[9px] text-amber-700 max-w-[120px] truncate" title={po.poEditRevisionReason}>
                                      เหตุผล: {po.poEditRevisionReason}
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1 flex-wrap">
                                  {(canAllowPoRevisionFromBudget || canDenyPoRevisionFromBudget) && (isPoRevPcm || isPoRevGm) ? (
                                    <>
                                      {canAllowPoRevisionFromBudget && <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionAllow(po.id)}
                                      >
                                        <CheckCircle size={11} /> อนุญาตแก้ไข
                                      </Button>}
                                      {canDenyPoRevisionFromBudget && <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionDeny(po.id)}
                                      >
                                        <XCircle size={11} /> ไม่อนุญาต
                                      </Button>}
                                    </>
                                  ) : (canApprovePoFromBudget || canRejectPoFromBudget) ? (
                                    <>
                                      {canApprovePoFromBudget && <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "approve")}
                                      >
                                        <CheckCircle size={11} /> {approveLabel}
                                      </Button>}
                                      {canRejectPoFromBudget && <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "reject")}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>}
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex justify-between items-center gap-2 mb-2 flex-wrap bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
            <div className="flex gap-2 items-center">
              {budgetCategory !== "OVERVIEW" && (
                <div className="relative z-[10]">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-3 py-1.5 h-8 rounded-lg font-bold text-xs shadow-sm bg-slate-600 text-white hover:bg-slate-700 transition-all active:scale-95"
                    onClick={() => setActionDropdownOpen((v) => !v)}
                  >
                    <Settings size={12} />
                    Action
                    <ChevronDown size={12} className={actionDropdownOpen ? "rotate-180" : ""} />
                  </button>
                  {actionDropdownOpen && (
                    <div
                      className="absolute left-0 top-full mt-1 z-[20] py-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]"
                    >
                      {canSubmitBudget && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 text-blue-700 flex items-center gap-2 font-medium"
                          onClick={handleBulkSubmitBudgets}
                        >
                          <Send size={12} /> ส่งไปยัง MD Approve ({selectedBudgetIds.length} รายการ)
                        </button>
                      )}
                      {canUseFunction("budget", "delete") && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-700 flex items-center gap-2 font-medium"
                          onClick={handleBulkDeleteBudgets}
                        >
                          <Trash2 size={12} /> ลบทิ้ง ({selectedBudgetIds.length} รายการ)
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1">
                {!budgetSetupDisabledByActiveProject && (
                  <Button
                    variant="outline"
                    onClick={handleDownloadTemplate}
                    className="text-[10px] h-8 px-2 border-slate-200 text-slate-500"
                    title="Download Template"
                  >
                    <Download size={12} />
                  </Button>
                )}
                {canUseFunction("budget", "import") && !budgetSetupDisabledByActiveProject && (
                  <label className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 hover:bg-emerald-100 cursor-pointer transition-colors" title="Import CSV">
                    <FileSpreadsheet size={14} />
                    <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                  </label>
                )}
              </div>
            </div>

            {budgetCategory !== "OVERVIEW" && (
              <div className="flex-1 min-w-[260px] max-w-[430px]">
                <label className="relative block">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={budgetTableFilter}
                    onChange={(e) => setBudgetTableFilter(e.target.value)}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white/95 pl-9 pr-10 text-xs font-medium text-slate-700 placeholder:text-slate-400 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    placeholder="ค้นหาทุกคอลัมน์"
                    title="Filter all columns"
                  />
                  {hasBudgetTableFilter && (
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      onClick={() => setBudgetTableFilter("")}
                      title="Clear filter"
                    >
                      Clear
                    </button>
                  )}
                </label>
              </div>
            )}

            <div className="flex gap-2 flex-wrap">
              {canClearAllBudgets && (
                <Button
                  variant="outline"
                  onClick={handleClearAllBudgets}
                  className="text-[10px] h-8 border-red-200 text-red-500 hover:bg-red-50 px-2"
                  disabled={currentBudgets.length === 0}
                >
                  <Trash2 size={12} /> ล้างทั้งหมด
                </Button>
              )}



              {canUseFunction("budget", "add") && !budgetSetupDisabledByActiveProject && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-100 border-none rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
                  onClick={() => {
                    setEditingBudgetId(null);
                    setSelectedBudget(null);
                    setFormData({ code: "", description: "", amount: 0 });
                    setPendingMainAttachments([]);
                    setIsModalOpen(true);
                  }}
                >
                  <Plus size={16} /> ตั้งงบประมาณ
                </Button>
              )}
            </div>
          </div>
          <Card className="overflow-hidden w-full min-w-0 max-w-full">
            <div
              ref={budgetTableContainerRef}
              className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain"
            >
              <table
                className="w-full min-w-[1120px] text-left text-xs text-slate-600 table-fixed md:min-w-0"
                style={{ width: "max-content", minWidth: "100%" }}
              >
                <thead className="bg-slate-200 text-slate-900 uppercase font-bold border-b text-sm">
                  <tr>
                    {budgetCategory !== "OVERVIEW" && isColumnVisible("budget", "checkbox") && (
                      <th
                        className="py-3 px-2 border-r text-center align-middle"
                        style={{ width: budgetMainLayout.scaled.checkbox, minWidth: budgetMainLayout.scaled.checkbox }}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={filteredBudgets.length > 0 && filteredBudgets.every((b) => selectedBudgetIds.includes(b.id))}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBudgetIds(filteredBudgets.map((b) => b.id));
                            else setSelectedBudgetIds((prev) => prev.filter((id) => !filteredBudgets.some((b) => b.id === id)));
                          }}
                        />
                        <span className="block text-[9px] text-slate-500 mt-0.5">Select all</span>
                      </th>
                    )}
                    {isColumnVisible("budget", "code") && (
                      <th
                        className="py-3 px-4 border-r cursor-pointer hover:bg-slate-300 transition-colors"
                        style={{ width: budgetMainLayout.scaled.code, minWidth: budgetMainLayout.scaled.code }}
                        onClick={() => requestSort("code")}
                      >
                        <div className="flex items-center justify-between">
                          Cost Code
                          {sortConfig.key === "code" &&
                            (sortConfig.direction === "ascending" ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronUp size={14} />
                            ))}
                        </div>
                      </th>
                    )}
                    {isColumnVisible("budget", "description") && <ResizableTh tableId="budget" colKey="description" className="py-3 px-4 border-r" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.description}>รายการ</ResizableTh>}
                    {isColumnVisible("budget", "budget") && <ResizableTh tableId="budget" colKey="budget" className="py-3 px-4 text-right bg-blue-100" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.budget}>Budget<span className="block mt-1 text-[15px] font-black text-blue-700 tracking-tight opacity-100 drop-shadow-sm">{formatCurrency(headerTotals.budget)}</span></ResizableTh>}
                    {isColumnVisible("budget", "status") && <ResizableTh tableId="budget" colKey="status" className="py-3 px-4 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.status}>สถานะ</ResizableTh>}
                    {isColumnVisible("budget", "attachment") && <ResizableTh tableId="budget" colKey="attachment" className="py-3 px-4 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.attachment}>Attachment</ResizableTh>}
                    {isColumnVisible("budget", "balance") && <ResizableTh tableId="budget" colKey="balance" className="py-3 px-4 text-right text-green-800 font-bold border-r" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.balance}>Balance<span className="block mt-1 text-[15px] font-black text-green-700 tracking-tight opacity-100 drop-shadow-sm">{formatCurrency(headerTotals.balance)}</span></ResizableTh>}
                    {isColumnVisible("budget", "prTotal") && <ResizableTh tableId="budget" colKey="prTotal" className="py-3 px-4 text-right text-slate-600" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.prTotal}>PR Total<span className="block mt-1 text-[15px] font-black text-slate-800 tracking-tight opacity-100 drop-shadow-sm">{formatCurrency(headerTotals.prTotal)}</span></ResizableTh>}
                    {isColumnVisible("budget", "poTotal") && <ResizableTh tableId="budget" colKey="poTotal" className="py-3 px-4 text-right text-slate-600" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.poTotal}>PO Total<span className="block mt-1 text-[15px] font-black text-slate-800 tracking-tight opacity-100 drop-shadow-sm">{formatCurrency(headerTotals.poTotal)}</span></ResizableTh>}
                    {isColumnVisible("budget", "nowStatus") && <ResizableTh tableId="budget" colKey="nowStatus" className="py-3 px-4 text-center" isAdmin={userRole === "Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.nowStatus}>Now Status</ResizableTh>}
                    {isColumnVisible("budget", "actions") && <th className="py-3 px-4 text-right" style={{ width: budgetMainLayout.scaled.actions, minWidth: budgetMainLayout.scaled.actions }}>Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredBudgets.map((b) => {
                    const totalBudget = calculateTotalBudget(b);
                    const hasSubItems = b.subItems && b.subItems.length > 0;
                    const sumSubItems = hasSubItems ? sumSubItemAmounts(b.subItems) : 0;
                    const pendingReturnNotifications = getPendingBudgetReturnNotifications(b);
                    const hasPendingBudgetReturn = pendingReturnNotifications.length > 0;
                    const stats = budgetStatsById.get(b.id) || { prTotal: 0, poTotal: 0, invoiceTotal: 0, relatedPRs: [], relatedPOs: [] };
                    // Calculate balance based on whether budget has subitems
                    // For budgets with subitems: Balance = Budget Total - Sum of Subitems
                    // For budgets without subitems: Balance = Budget Total - Invoice Total
                    const budgetBalance = hasSubItems ? totalBudget - sumSubItems : totalBudget - stats.invoiceTotal;
                    const isLocked =
                      b.status === "Approved" || b.status === "Wait MD Approve";
                    const canDelete = (userRole === "MD" || b.status === "Draft") && canUseFunction("budget", "delete");
                    const isExpanded = expandedBudgetRows[b.id];
                    const canEdit =
                      !isLocked && b.status !== "Revision Pending" && canUseFunction("budget", "edit");
                    const isRevisionPending = b.status === "Revision Pending";
                    const isNewRevisionBudget = isBudgetNewInCurrentRevisionCycle(b);
                    return (
                      <React.Fragment key={b.id}>
                        <tr
                          className={`cursor-pointer transition-colors group ${
                            hasPendingBudgetReturn
                              ? "bg-yellow-50 ring-1 ring-yellow-300 ring-inset hover:bg-yellow-100"
                              : isNewRevisionBudget
                              ? "bg-emerald-50 ring-2 ring-emerald-300 ring-inset hover:bg-emerald-100"
                              : isExpanded
                                ? "bg-amber-50/80 ring-1 ring-amber-200 ring-inset"
                                : "hover:bg-blue-50 odd:bg-white even:bg-slate-50"
                          }`}
                          onClick={() => toggleRow(b.id)}
                        >
                          {budgetCategory !== "OVERVIEW" && isColumnVisible("budget", "checkbox") && (
                            <td
                              className="py-1 px-2 border-r text-center align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={selectedBudgetIds.includes(b.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) setSelectedBudgetIds((prev) => [...prev, b.id]);
                                  else setSelectedBudgetIds((prev) => prev.filter((id) => id !== b.id));
                                }}
                              />
                            </td>
                          )}
                          {isColumnVisible("budget", "code") && <td className="py-1 px-3 border-r font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              {hasSubItems ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRow(b.id); }}
                                  className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-100 text-blue-600 hover:bg-blue-200 hover:text-blue-700 transition-all duration-200 shrink-0"
                                  title={isExpanded ? "ย่อรายการ" : "ขยายดู sublist"}
                                >
                                  {isExpanded ? <ChevronDown size={16} strokeWidth={2.5} /> : <ChevronRight size={16} strokeWidth={2.5} />}
                                </button>
                              ) : (
                                <span className="w-7 h-7 flex items-center justify-center shrink-0 text-slate-300">
                                  <span className="w-2 h-2 rounded-full bg-slate-200" aria-hidden />
                                </span>
                              )}
                              <span>{b.code}</span>
                              {isNewRevisionBudget && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold shadow-sm">
                                  NEW REV ITEM
                                </span>
                              )}
                            </div>
                          </td>}
                          {isColumnVisible("budget", "description") && <td className="py-1 px-3 border-r min-w-0 overflow-hidden" title={b.description}>
                            <div className="flex items-center justify-between group min-w-0">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate block" title={b.description}>{b.description}</span>
                                {b.revisionReason && (
                                  <span className="text-xs text-orange-600 bg-orange-50 px-1 rounded w-fit mt-1 truncate block max-w-full" title={b.revisionReason}>
                                    เหตุผลขอแก้: {b.revisionReason}
                                  </span>
                                )}
                                {b.rejectReason && (
                                  <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit mt-1 inline-block truncate max-w-full" title={b.rejectReason}>
                                    เหตุผลปฏิเสธ: {b.rejectReason}
                                  </span>
                                )}
                                {hasPendingBudgetReturn && (
                                  <button
                                    type="button"
                                    className="mt-1 w-fit text-[10px] px-1.5 py-0.5 rounded border border-yellow-300 bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAcceptBudgetReturnNotification(b, pendingReturnNotifications[0]);
                                    }}
                                    title="คลิกเพื่อดูรายละเอียดและกดรับยอดคืน"
                                  >
                                    แจ้งเตือนคืน Budget {pendingReturnNotifications.length} รายการ
                                  </button>
                                )}
                              </div>
                              {b.status === "Approved" && canAddSubItem && (
                                <button
                                  onClick={() => openSubItemModal(b)}
                                  className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all ml-2"
                                  title="เพิ่มรายการย่อย"
                                >
                                  <PlusCircle size={14} />
                                </button>
                              )}
                            </div>
                          </td>}
                          {isColumnVisible("budget", "budget") && (
                            <td className="py-1 px-3 text-right bg-blue-50/50 font-semibold">
                              {formatCurrency(totalBudget)}
                            </td>
                          )}
                          {isColumnVisible("budget", "status") && (
                            <td className="py-1 px-3 text-center">
                              <Badge status={b.status} />
                            </td>
                          )}
                          {isColumnVisible("budget", "attachment") && <td className="py-1 px-3 border-r align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-start gap-2">
                              <button
                                type="button"
                                className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 disabled:opacity-50"
                                title="แนบไฟล์ (หลายไฟล์ได้)"
                                disabled={attachmentUploadingKey === `${b.id}:main`}
                                onClick={() => openAttachmentPicker(b.id, null)}
                              >
                                {attachmentUploadingKey === `${b.id}:main` ? (
                                  <RefreshCw size={14} className="animate-spin" />
                                ) : (
                                  <Upload size={14} />
                                )}
                              </button>
                              <div className="min-w-0 flex-1">
                                {(b.attachments || []).length === 0 ? (
                                  <div className="text-[10px] text-slate-400 truncate">-</div>
                                ) : (
                                  <div className="space-y-0.5">
                                    {(b.attachments || []).slice(0, 3).map((att: any, i: number) => (
                                      <a
                                        key={`${att.url || att.name || i}`}
                                        href={att.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block text-[10px] text-blue-600 hover:underline truncate"
                                        title={att.name}
                                      >
                                        {att.name || "file"}
                                      </a>
                                    ))}
                                    {(b.attachments || []).length > 3 && (
                                      <div className="text-[10px] text-slate-400">
                                        +{(b.attachments || []).length - 3} ไฟล์
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>}
                          {isColumnVisible("budget", "balance") && (
                            <td
                              className={`py-1 px-3 text-right border-r font-bold ${budgetBalance < 0
                                ? "text-red-600"
                                : "text-green-600"
                                }`}
                            >
                              {formatCurrency(budgetBalance)}
                            </td>
                          )}
                          {isColumnVisible("budget", "prTotal") && (
                            <td className="py-1 px-3 text-right text-slate-400">
                              {formatCurrency(stats.prTotal)}
                            </td>
                          )}
                          {isColumnVisible("budget", "poTotal") && (
                            <td
                              className={`py-1 px-3 text-right ${stats.poExceedsPr ? "text-red-600 font-bold" : "text-slate-400"}`}
                              title={stats.poExceedsPr ? `แจ้งเตือน: PO มากกว่า PR ${formatCurrency(stats.poExcessAmount)}` : undefined}
                            >
                              {stats.poExceedsPr && <AlertCircle size={13} className="inline mr-1" aria-label="PO มากกว่า PR" />}
                              {formatCurrency(stats.poTotal)}
                            </td>
                          )}
                          {isColumnVisible("budget", "nowStatus") && (
                            <td className="py-1 px-3 min-w-0 overflow-hidden">
                              {/* ตาม requirement: Main row ไม่ต้องแสดง NOW STATUS */}
                            </td>
                          )}
                          {isColumnVisible("budget", "actions") && <td className="py-1 px-3 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(canApproveBudget || canRejectBudget) && (userRole === "MD" || userRole === "Administrator") &&
                                b.status === "Wait MD Approve" && (
                                  <>
                                    {canApproveBudget && <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => handleApproveBudget(b.id)}
                                    >
                                      Approve
                                    </Button>}
                                    {canRejectBudget && <Button
                                      variant="danger"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => openRejectModal(b)}
                                    >
                                      Reject
                                    </Button>}
                                  </>
                                )}
                              {(canAllowEditBudget || canRejectBudgetRevision) && isRevisionPending && (userRole === "MD" || userRole === "Administrator") && (
                                <>
                                  {canAllowEditBudget && <Button
                                    variant="warning"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleAllowEdit(b.id); }}
                                  >
                                    อนุญาตแก้ไข
                                  </Button>}
                                  {canRejectBudgetRevision && <Button
                                    variant="secondary"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleRejectRevision(b.id); }}
                                  >
                                    ไม่อนุญาตแก้ไข
                                  </Button>}
                                </>
                              )}
                              {canEdit && (
                                <>
                                  <button
                                    className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                    title="แก้ไข"
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(b); }}
                                  >
                                    <Edit size={14} />
                                  </button>
                                  {canDelete && (
                                    <button
                                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                      title="ลบ"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteBudget(b.id); }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </>
                              )}
                              {canRequestBudgetRevision && b.status === "Approved" && (
                                <button
                                  className="text-orange-500 hover:text-orange-700 p-1 hover:bg-orange-50 rounded"
                                  title="ขอแก้ไข (Revise)"
                                  onClick={() => {
                                    setSelectedBudget(b);
                                    setIsRevisionModalOpen(true);
                                  }}
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                              {canSubmitBudget && b.status === "Draft" && (
                                <button
                                  className="text-green-500 hover:text-green-700 p-1 hover:bg-green-50 rounded"
                                  title="ส่งขออนุมัติ"
                                  onClick={() => handleSubmitBudget(b.id)}
                                >
                                  <Play size={14} fill="currentColor" />
                                </button>
                              )}
                            </div>
                          </td>}
                        </tr>
                        {isExpanded &&
                          b.subItems &&
                          <>
                            {b.subItems.map((sub, index) => (
                              (() => {
                                const pendingSubReturns = getPendingSubBudgetReturnNotifications(b, sub.id);
                                const hasPendingSubReturn = pendingSubReturns.length > 0;
                                const subPrUsed = getSubItemPrUsed(b, sub);
                                const subBalance = getSubItemAmount(sub) - subPrUsed;
                                return (
                              <tr
                                key={sub.id}
                                className={`text-xs group ${hasPendingSubReturn ? "bg-red-50 ring-1 ring-red-200 ring-inset hover:bg-red-100" : "bg-slate-50/50"}`}
                              >
                                {budgetCategory !== "OVERVIEW" && isColumnVisible("budget", "checkbox") && (
                                  <td className="py-0.5 px-2 border-r bg-slate-50/50" />
                                )}
                                {isColumnVisible("budget", "code") && <td className="py-0.5 px-3 border-r text-right text-slate-500 pr-4 font-mono relative">
                                  <span className="text-[9px] font-bold text-slate-400 absolute left-2 top-1.5">
                                    QTY
                                  </span>
                                  {sub.quantity}
                                </td>}
                                {isColumnVisible("budget", "description") && <td className="py-0.5 px-3 border-r pl-8 min-w-0 overflow-hidden text-slate-600" title={sub.description}>
                                  <div className="flex items-center justify-between min-w-0 gap-1">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className="text-slate-400 w-4 text-center shrink-0">{index + 1}</span>
                                      <CornerDownRight size={11} className="text-slate-300 shrink-0" />
                                      <span className="truncate" title={sub.description}>{sub.description}</span>
                                      {sub.status === "Rejected" && sub.rejectReason && (
                                        <span className="text-[9px] text-red-500 truncate shrink-0" title={sub.rejectReason}>
                                          ({sub.rejectReason})
                                        </span>
                                      )}
                                      {hasPendingSubReturn && (
                                        <button
                                          type="button"
                                          className="text-[9px] px-1.5 py-0.5 rounded border border-red-300 bg-red-100 text-red-700 hover:bg-red-200"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleAcceptBudgetReturnNotification(b, pendingSubReturns[0]);
                                          }}
                                          title="คลิกเพื่อดูรายละเอียดและกดรับยอดคืน"
                                        >
                                          รอรับยอดคืน {pendingSubReturns.length}
                                        </button>
                                      )}
                                    </div>
                                    <div className="text-slate-400 text-[10px] shrink-0">@ {formatCurrency(sub.unitPrice)}</div>
                                  </div>
                                </td>}
                                {isColumnVisible("budget", "budget") && (
                                  <td className="py-0.5 px-3 text-right pr-4 font-medium border-b border-slate-100">
                                    <span className="text-red-600">-{formatCurrency(sub.amount)}</span>
                                  </td>
                                )}
                                {isColumnVisible("budget", "status") && (
                                  <td className="py-0.5 px-3 text-center border-b border-slate-100">
                                    {sub.status ? <Badge status={sub.status} /> : <Badge status="Approved" />}
                                  </td>
                                )}
                                {isColumnVisible("budget", "attachment") && <td className="py-0.5 px-3 border-r border-b border-slate-100 align-top" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-start gap-2">
                                    <button
                                      type="button"
                                      className="p-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800 disabled:opacity-50"
                                      title="แนบไฟล์ (Sub item)"
                                      disabled={attachmentUploadingKey === `${b.id}:${sub.id}`}
                                      onClick={() => openAttachmentPicker(b.id, sub.id)}
                                    >
                                      {attachmentUploadingKey === `${b.id}:${sub.id}` ? (
                                        <RefreshCw size={14} className="animate-spin" />
                                      ) : (
                                        <Upload size={14} />
                                      )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      {(sub.attachments || []).length === 0 ? (
                                        <div className="text-[10px] text-slate-400 truncate">-</div>
                                      ) : (
                                        <div className="space-y-0.5">
                                          {(sub.attachments || []).slice(0, 2).map((att: any, i: number) => (
                                            <a
                                              key={`${att.url || att.name || i}`}
                                              href={att.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block text-[10px] text-blue-600 hover:underline truncate"
                                              title={att.name}
                                            >
                                              {att.name || "file"}
                                            </a>
                                          ))}
                                          {(sub.attachments || []).length > 2 && (
                                            <div className="text-[10px] text-slate-400">
                                              +{(sub.attachments || []).length - 2} ไฟล์
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>}
                                {isColumnVisible("budget", "balance") && (
                                  <td
                                    className="py-0.5 px-3 text-right border-r border-b border-slate-100 font-bold text-blue-600"
                                    title={`ใช้ไปจาก PR: ${formatCurrency(subPrUsed)}`}
                                  >
                                    {formatCurrency(subBalance)}
                                  </td>
                                )}
                                {(() => { const cnt = [isColumnVisible("budget", "prTotal"), isColumnVisible("budget", "poTotal")].filter(Boolean).length; return cnt > 0 ? <td colSpan={cnt} className="border-b border-slate-100"></td> : null; })()}
                                {isColumnVisible("budget", "nowStatus") && <td className="py-0.5 px-3 text-center min-w-0 border-b border-slate-100">{renderNowStatusBadges((() => {
                                  const latest = pickLatestNowStatus(getNowStatus(b, stats, "SUB_ITEM", sub.id));
                                  return latest ? [latest] : [];
                                })())}</td>}
                                {isColumnVisible("budget", "actions") && <td className="py-0.5 px-3 text-right border-b border-slate-100">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {(sub.status === "Rejected" && canEditSubItem && (userRole === "PM" || userRole === "CM" || userRole === "MD" || userRole === "Administrator")) && (
                                      <button
                                        className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                        title="แก้ไขรายการที่ถูกปฏิเสธ"
                                        onClick={(e) => { e.stopPropagation(); openEditSubItemModal(b, sub); }}
                                      >
                                        <Edit size={14} />
                                      </button>
                                    )}
                                    {sub.status === "Draft" && (
                                      <>
                                        {canEditSubItem && (
                                          <button
                                            className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                            title="แก้ไข"
                                            onClick={(e) => { e.stopPropagation(); openEditSubItemModal(b, sub); }}
                                          >
                                            <Edit size={14} />
                                          </button>
                                        )}
                                        {canDeleteSubItem && (
                                          <button
                                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                            title="ลบ"
                                            onClick={() => handleDeleteSubItem(b.id, sub.id)}
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                        {canSubmitSubItem && b.status === "Approved" && (
                                          <button
                                            className="text-green-500 hover:text-green-700 p-1 hover:bg-green-50 rounded"
                                            title="ส่งขออนุมัติ"
                                            onClick={() => handleSubmitSubItem(b.id, sub.id)}
                                          >
                                            <Play size={14} fill="currentColor" />
                                          </button>
                                        )}
                                      </>
                                    )}
                                    {canRequestSubItemRevision && sub.status === "Approved" && (
                                      <button
                                        className="text-orange-500 hover:text-orange-700 p-1 hover:bg-orange-50 rounded"
                                        title="ขอแก้ไข (Revise)"
                                        onClick={(e) => { e.stopPropagation(); openReasonModal("revision", b.id, sub.id); }}
                                      >
                                        <RefreshCw size={14} />
                                      </button>
                                    )}
                                    {(canAllowEditSubItem || canRejectSubItemRevision) && (userRole === "MD" || userRole === "Administrator") && sub.status === "Revision Pending" && (
                                      <>
                                        {canAllowEditSubItem && <Button
                                          variant="warning"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleAllowEditSubItem(b.id, sub.id); }}
                                        >
                                          อนุญาตแก้ไข
                                        </Button>}
                                        {canRejectSubItemRevision && <Button
                                          variant="secondary"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleRejectRevisionSubItem(b.id, sub.id); }}
                                        >
                                          ไม่อนุญาตแก้ไข
                                        </Button>}
                                      </>
                                    )}
                                    {(canApproveSubItem || canRejectSubItem) && (userRole === "MD" || userRole === "Administrator") && sub.status === "Wait MD Approve" && (
                                      <>
                                        {canApproveSubItem && <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>Approve</Button>}
                                        {canRejectSubItem && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={(e) => { e.stopPropagation(); openReasonModal("reject", b.id, sub.id); }}>Reject</Button>}
                                      </>
                                    )}
                                  </div>
                                </td>}
                              </tr>
                                );
                              })()
                            ))}
                            {/* เว้นพื้นที่ว่างใต้รายการ Sub เมื่อกาง (แยกตารางย่อยจากตารางหลัก) */}
                            <tr className="bg-transparent" aria-hidden="true">
                              <td colSpan={["checkbox", "code", "description", "budget", "status", "attachment", "balance", "prTotal", "poTotal", "actions"].filter(k => k === "checkbox" ? (budgetCategory !== "OVERVIEW" && isColumnVisible("budget", "checkbox")) : isColumnVisible("budget", k)).length || 1} className="py-4 border-0 bg-slate-100/50"></td>
                            </tr>
                          </>
                        }
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
      <input
        ref={attachmentInputRef}
        type="file"
        multiple
        accept=".pdf,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
        className="hidden"
        onChange={handleAttachmentFilesSelected}
      />
      {/* Modals - Same as previous version, condensed for brevity */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <FileSpreadsheet size={20} /> นำเข้าข้อมูลงบประมาณ
            </h3>
            <div className="min-h-[150px] max-h-80 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 mb-4">
              {Object.keys(importData).length === 0 ? (
                <div className="flex items-center justify-center h-[130px] text-slate-400 text-sm">
                  ไม่มีรายการให้เลือก
                </div>
              ) : Object.keys(importData).map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-3 p-3 hover:bg-white rounded cursor-pointer border-b border-slate-100 last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={selectedImportCategories.includes(cat)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setSelectedImportCategories([
                          ...selectedImportCategories,
                          cat,
                        ]);
                      else
                        setSelectedImportCategories(
                          selectedImportCategories.filter((c) => c !== cat)
                        );
                    }}
                    className="w-4 h-4 rounded text-blue-600"
                  />
                  <div className="flex-1">
                    <span className="font-bold text-slate-800">{cat}</span>{" "}
                    <span className="text-xs text-slate-500">
                      ({importData[cat].length} items)
                    </span>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportData({});
                  setImportFile(null);
                  setSelectedImportCategories([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleConfirmImport}
                disabled={selectedImportCategories.length === 0}
              >
                ยืนยันการนำเข้า
              </Button>
            </div>
          </Card>
        </div>
      )}
      {isClearConfirmOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-sm p-6 border-red-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">ยืนยันการล้างข้อมูล</h3>
                <p className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              พิมพ์ <span className="font-bold text-red-600 bg-red-50 px-1 rounded">Confirm</span> เพื่อยืนยันการลบข้อมูลงบประมาณ <span className="font-bold">{currentBudgets.length} รายการ</span>
            </p>
            <input
              type="text"
              className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
              placeholder='พิมพ์ "Confirm" เพื่อยืนยัน'
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleConfirmClearAll(); }}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => { setIsClearConfirmOpen(false); setClearConfirmText(""); }}
              >
                ยกเลิก
              </Button>
              <Button
                onClick={handleConfirmClearAll}
                disabled={clearConfirmText !== "Confirm"}
                className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
              >
                <Trash2 size={14} /> ล้างข้อมูลทั้งหมด
              </Button>
            </div>
          </Card>
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-[10010] animate-in fade-in duration-200 p-4 pt-8 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mb-4">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-700 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Tag size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingBudgetId ? (budgets.find(b => b.id === editingBudgetId)?.status === "Rejected" ? "แก้ไขรายการ (ถูกปฏิเสธ)" : "แก้ไขรายการ Budget") : "เพิ่มรายการ Budget"}
                  </h3>
                  <p className="text-slate-300 text-xs mt-0.5">
                    {COST_CATEGORIES[budgetCategory] || budgetCategory} ({budgetCategory})
                  </p>
                </div>
              </div>
              <button type="button" onClick={closeBudgetModal} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all">
                <XCircle size={18} />
              </button>
            </div>

            {/* Reject banner */}
            {editingBudgetId && budgets.find(b => b.id === editingBudgetId)?.status === "Rejected" && budgets.find(b => b.id === editingBudgetId)?.rejectReason && (
              <div className="mx-6 mt-4 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 flex items-start gap-2">
                <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                <span><span className="font-semibold">เหตุผลปฏิเสธ:</span> {budgets.find(b => b.id === editingBudgetId)?.rejectReason}</span>
              </div>
            )}

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Cost Code Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">Cost Code</p>
                <div className="text-2xl font-black text-slate-800 tracking-tight flex items-center justify-center gap-1">
                  <span className="text-slate-400">{budgetCategory}</span>
                  {formData.code ? (
                    <span className="text-blue-600">{formData.code}</span>
                  ) : (
                    <span className="text-slate-300">____</span>
                  )}
                </div>
              </div>

              {/* รหัสต่อท้าย */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">รหัสต่อท้าย <span className="text-red-500">*</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 font-semibold">{budgetCategory}</span>
                  </div>
                  <input
                    type="text"
                    className="w-full border border-slate-200 rounded-lg pl-12 pr-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all font-semibold"
                    placeholder="เช่น 001, 123"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    autoFocus
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">รายละเอียด (Description) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
                  placeholder="ระบุรายละเอียด..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">งบประมาณ (Amount) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="w-full border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: Number(e.target.value) })}
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-slate-400 text-xs font-semibold">THB</span>
                  </div>
                </div>
              </div>

              {/* แนบไฟล์ — แก้ไข: ดูไฟล์เดิม + อัปโหลดเพิ่ม | เพิ่มใหม่: เลือกไฟล์ค้าง แล้วอัปโหลดหลัง Save */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/90 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip size={12} className="text-slate-400" />
                  แนบไฟล์ (PDF / Office / รูป)
                </div>
                {editingBudgetId ? (
                  <>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {((budgets.find((b) => b.id === editingBudgetId)?.attachments) || []).length === 0 ? (
                        <p className="text-xs text-slate-400">ยังไม่มีไฟล์แนบ</p>
                      ) : (
                        (budgets.find((b) => b.id === editingBudgetId)?.attachments || []).map((att, i) => (
                          <a
                            key={`${att.url || att.name || i}`}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-blue-600 hover:underline truncate"
                            title={att.name}
                          >
                            {att.name || "เปิดไฟล์"}
                          </a>
                        ))
                      )}
                    </div>
                    {selectedProjectId ? (
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={attachmentUploadingKey === `${editingBudgetId}:main`}
                        onClick={() => openAttachmentPicker(editingBudgetId, null)}
                      >
                        {attachmentUploadingKey === `${editingBudgetId}:main` ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        แนบไฟล์เพิ่ม
                      </button>
                    ) : (
                      <p className="text-[10px] text-amber-600">เลือกโครงการก่อนเพื่อแนบไฟล์</p>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      ref={modalMainPendingFileRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                      onChange={onModalMainPendingFilesSelected}
                    />
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => modalMainPendingFileRef.current?.click()}
                    >
                      <Upload size={14} />
                      เลือกไฟล์แนบ
                    </button>
                    {pendingMainAttachments.length > 0 && (
                      <ul className="space-y-1 max-h-24 overflow-y-auto">
                        {pendingMainAttachments.map((f, idx) => (
                          <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-100 rounded-lg px-2 py-1">
                            <span className="truncate min-w-0" title={f.name}>{f.name}</span>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 shrink-0 p-0.5"
                              onClick={() => setPendingMainAttachments((prev) => prev.filter((_, j) => j !== idx))}
                              title="เอาออก"
                            >
                              <Trash2 size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      หลังกด Save ระบบจะอัปโหลดและบันทึกเป็น Attachment ของรายการนี้
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 rounded-b-2xl border-t border-slate-100 flex justify-end gap-2">
              {editingBudgetId && budgets.find(b => b.id === editingBudgetId)?.status === "Rejected" ? (
                <>
                  <Button variant="secondary" onClick={closeBudgetModal}>ยกเลิก (Cancel)</Button>
                  <Button variant="warning" onClick={() => handleSaveBudget("Draft")}>บันทึก (Draft)</Button>
                  {canSubmitBudget && (
                    <Button variant="primary" onClick={() => handleSaveBudget("Wait MD Approve")}>ส่งขออนุมัติ (Resubmit)</Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={closeBudgetModal}>Cancel</Button>
                  <Button onClick={() => handleSaveBudget()}>Save</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {isSubItemModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-[10010] animate-in fade-in duration-200 p-4 pt-8 overflow-y-auto" onClick={() => setUnitDropdownOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mb-4" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 bg-slate-700 rounded-t-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                  <Tag size={16} className="text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingSubItem ? (editingSubItem.status === "Rejected" ? "แก้ไขรายการ (ถูกปฏิเสธ)" : "แก้ไข Sub-Item") : "เพิ่ม Sub-Item"}
                  </h3>
                  {selectedBudget && <p className="text-slate-300 text-xs mt-0.5">{selectedBudget.code} — {selectedBudget.description}</p>}
                </div>
              </div>
              <button type="button" onClick={closeSubItemModal} className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all">
                <XCircle size={18} />
              </button>
            </div>

            {/* Reject banner */}
            {editingSubItem?.status === "Rejected" && editingSubItem?.rejectReason && (
              <div className="mx-6 mt-4 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200 flex items-start gap-2">
                <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
                <span><span className="font-semibold">เหตุผลปฏิเสธ:</span> {editingSubItem.rejectReason}</span>
              </div>
            )}

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* ชื่อรายการ */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ชื่อรายการ <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
                  placeholder="ระบุชื่อรายการ..."
                  value={subItemData.description}
                  onChange={(e) => setSubItemData({ ...subItemData, description: e.target.value })}
                  autoFocus
                />
              </div>

              {/* จำนวน + หน่วย */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">จำนวน</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
                    value={subItemData.quantity}
                    onChange={(e) => setSubItemData({ ...subItemData, quantity: Number(e.target.value) })}
                  />
                </div>

                {/* หน่วย — combobox */}
                <div className="relative">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">หน่วย</label>
                  <input
                    ref={unitInputRef}
                    type="text"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all pr-8"
                    placeholder="พิมพ์หรือเลือกหน่วย..."
                    value={unitInputText}
                    onChange={(e) => {
                      setUnitInputText(e.target.value);
                      setSubItemData({ ...subItemData, unit: e.target.value });
                      setUnitDropdownOpen(true);
                    }}
                    onFocus={() => setUnitDropdownOpen(true)}
                  />
                  <ChevronDown size={13} className="absolute right-2.5 top-[2.1rem] text-slate-400 pointer-events-none" />
                  {unitDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                      {/* ตัวกรอง */}
                      {unitOptions.filter(u => u.toLowerCase().includes(unitInputText.toLowerCase())).map(u => (
                        <button
                          key={u}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between group"
                          onMouseDown={(e) => { e.preventDefault(); setUnitInputText(u); setSubItemData({ ...subItemData, unit: u }); setUnitDropdownOpen(false); }}
                        >
                          <span>{u}</span>
                          <button
                            type="button"
                            className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs px-1"
                            title="ลบหน่วยนี้"
                            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); saveUnitOptions(unitOptions.filter(x => x !== u)); }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </button>
                      ))}
                      {/* เพิ่มใหม่ */}
                      {unitInputText.trim() && !unitOptions.some(u => u.toLowerCase() === unitInputText.trim().toLowerCase()) && (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 border-t border-slate-100"
                          onMouseDown={(e) => { e.preventDefault(); const newUnit = unitInputText.trim(); saveUnitOptions([...unitOptions, newUnit]); setSubItemData({ ...subItemData, unit: newUnit }); setUnitDropdownOpen(false); }}
                        >
                          <Plus size={12} /> เพิ่ม "{unitInputText.trim()}"
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ราคา */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">ราคา / หน่วย</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-300 focus:border-slate-400 transition-all"
                  placeholder="0.00"
                  value={subItemData.unitPrice}
                  onChange={(e) => setSubItemData({ ...subItemData, unitPrice: Number(e.target.value) })}
                />
              </div>

              {/* ยอดรวม (auto) */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">ยอดรวม</span>
                <span className="text-base font-bold text-slate-800">{formatCurrency(Number(subItemData.quantity) * Number(subItemData.unitPrice))}</span>
              </div>

              {/* แนบไฟล์ Sub-Item */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/90 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip size={12} className="text-slate-400" />
                  แนบไฟล์ (PDF / Office / รูป)
                </div>
                {editingSubItem ? (
                  <>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {(() => {
                        const liveSub = selectedBudget
                          ? (budgets.find((b) => b.id === selectedBudget.id)?.subItems || []).find(
                            (s) => s.id === editingSubItem.id
                          )
                          : null;
                        const attList = liveSub?.attachments || editingSubItem.attachments || [];
                        if (attList.length === 0) {
                          return <p className="text-xs text-slate-400">ยังไม่มีไฟล์แนบ</p>;
                        }
                        return attList.map((att, i) => (
                          <a
                            key={`${att.url || att.name || i}`}
                            href={att.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-xs text-blue-600 hover:underline truncate"
                            title={att.name}
                          >
                            {att.name || "เปิดไฟล์"}
                          </a>
                        ));
                      })()}
                    </div>
                    {selectedBudget && selectedProjectId ? (
                      <button
                        type="button"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        disabled={attachmentUploadingKey === `${selectedBudget.id}:${editingSubItem.id}`}
                        onClick={() => openAttachmentPicker(selectedBudget.id, editingSubItem.id)}
                      >
                        {attachmentUploadingKey === `${selectedBudget.id}:${editingSubItem.id}` ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Upload size={14} />
                        )}
                        แนบไฟล์เพิ่ม
                      </button>
                    ) : (
                      <p className="text-[10px] text-amber-600">เลือกโครงการก่อนเพื่อแนบไฟล์</p>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      ref={modalSubPendingFileRef}
                      type="file"
                      multiple
                      className="hidden"
                      accept=".pdf,.xls,.xlsx,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/jpeg,image/png"
                      onChange={onModalSubPendingFilesSelected}
                    />
                    <button
                      type="button"
                      className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => modalSubPendingFileRef.current?.click()}
                    >
                      <Upload size={14} />
                      เลือกไฟล์แนบ
                    </button>
                    {pendingSubAttachments.length > 0 && (
                      <ul className="space-y-1 max-h-24 overflow-y-auto">
                        {pendingSubAttachments.map((f, idx) => (
                          <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 text-xs bg-white border border-slate-100 rounded-lg px-2 py-1">
                            <span className="truncate min-w-0" title={f.name}>{f.name}</span>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 shrink-0 p-0.5"
                              onClick={() => setPendingSubAttachments((prev) => prev.filter((_, j) => j !== idx))}
                              title="เอาออก"
                            >
                              <Trash2 size={12} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      หลังกดบันทึก ระบบจะสร้าง Sub-Item แล้วอัปโหลดแนบให้อัตโนมัติ
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-5 flex justify-end gap-2">
              {editingSubItem?.status === "Rejected" ? (
                <>
                  <Button variant="secondary" onClick={() => { setEditingSubItem(null); closeSubItemModal(); }}>ยกเลิก</Button>
                  <Button variant="secondary" onClick={handleSaveSubItem}>บันทึก</Button>
                  {canSubmitSubItem && (
                    <Button onClick={handleResubmitSubItemFromModal}>ขออนุมัติ</Button>
                  )}
                </>
              ) : (
                <>
                  <Button variant="secondary" onClick={closeSubItemModal}>ยกเลิก</Button>
                  <Button onClick={handleSaveSubItem}><Save size={14} /> บันทึก</Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {isRevisionModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 text-orange-600">
              ขอแก้ไขงบประมาณ
            </h3>
            <InputGroup label="เหตุผล">
              <textarea
                className="w-full border rounded p-2 h-24"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
            </InputGroup>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => setIsRevisionModalOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="warning" onClick={handleRequestRevision}>
                Submit
              </Button>
            </div>
          </Card>
        </div>
      )}
      {isRejectModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 text-red-600">
              ปฏิเสธงบประมาณ (Reject Budget)
            </h3>
            <p className="text-sm text-slate-600 mb-3">
              รายการ: <span className="font-semibold text-slate-800">{selectedBudget?.code} — {selectedBudget?.description}</span>
            </p>
            <InputGroup label="เหตุผลที่ปฏิเสธ (Reject Reason)">
              <textarea
                className="w-full border rounded p-2 h-24"
                placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ เช่น ตรงไหนเพราะอะไร..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </InputGroup>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => setIsRejectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectBudget}
                disabled={!rejectReason.trim()}
              >
                ยืนยันปฏิเสธ
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* Modal กรอกเหตุผล (แทน window.prompt) — ขอแก้ไข / ปฏิเสธ รายการย่อย */}
      {reasonModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200 p-4">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              {reasonModalType === "revision" ? (
                <><RefreshCw size={20} className="text-orange-600" /> ระบุเหตุผลที่ขอแก้ไข (Revision Reason)</>
              ) : (
                <><XCircle size={20} className="text-red-600" /> ระบุเหตุผลที่ไม่อนุมัติ (Reject Reason)</>
              )}
            </h3>
            <InputGroup label={reasonModalType === "revision" ? "เหตุผลที่ขอแก้ไข" : "เหตุผลที่ปฏิเสธ"}>
              <textarea
                className="w-full border border-slate-200 rounded-lg p-3 h-24 text-sm"
                placeholder={reasonModalType === "revision" ? "กรุณาระบุเหตุผลที่ต้องการแก้ไข..." : "กรุณาระบุเหตุผลที่ไม่อนุมัติ..."}
                value={reasonModalValue}
                onChange={(e) => setReasonModalValue(e.target.value)}
              />
            </InputGroup>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setReasonModalOpen(false);
                  setReasonModalValue("");
                }}
              >
                ยกเลิก
              </Button>
              <Button
                variant={reasonModalType === "revision" ? "warning" : "danger"}
                onClick={handleReasonModalSubmit}
                disabled={!reasonModalValue.trim()}
              >
                {reasonModalType === "revision" ? "ส่งคำขอแก้ไข" : "ยืนยันปฏิเสธ"}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});


export default BudgetView;

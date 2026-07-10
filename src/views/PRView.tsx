// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, Info, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList,
  Mail, Flame, MapPinned, CircleDot, Zap, Building2, UserCircle, AtSign,
  FileSpreadsheet, Wallet, ShoppingCart, Settings, Upload, CheckSquare, Square
} from "lucide-react";
import { generatePRPdfBytes, uploadGeneratedPdf, stampSignatureToField, deleteGeneratedPdf, stampTextToFieldRect } from "../lib/pdfForms";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import { PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS, getPurchaseTypeDisplayLabel, COST_CATEGORIES } from "../lib/constants";
import { uploadAttachment } from "../lib/uploadAttachment";
import { getUserIdentity, resolveCurrentUserSignatureImage } from "../lib/poSignatureStamps";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { computeBudgetUsedAfterPrRevision, getLinkedPoRefsForPr, getPrBudgetReturnInfo, restorePrItemsFromRevision, scalePrItemsToTotal } from "../lib/prBudgetReturn";
import { motion, AnimatePresence } from "framer-motion";
import { doc, runTransaction } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { appId, db, storage } from "../lib/firebase";
const PRView = React.memo(() => {
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData,
    showAlert, openConfirm, logAction, userRole, userRoles, userData, user, columnWidths, handleColumnResize,
    visibleProjects, handlePRAction, canUseFunction, isColumnVisible, getAllowedPRTypes } = useAppData();
  const allowedPRTypes = getAllowedPRTypes();
  const canApprovePR = canUseFunction("pr", "approve");
  const canRejectPR = canUseFunction("pr", "reject");
  const canEditBudgetPR = canUseFunction("pr", "editBudget");
  const canViewPrBalance = canUseFunction("pr", "viewBalance");
  const canReturnPrBalance = canUseFunction("pr", "returnBalance");

  /**
   * คำนวณยอดใช้งานทั้งหมดของ budget จาก PRs ที่ตรงกันทั้ง budgetId หรือ costCode
   * จากนั้น save ค่า usedAmount ลงบน budget document (คล้าย statusNow บน PO)
   * เรียกหลัง PR save / reject / edit เพื่อให้ยอดคงเหลือใน dropdown ตรงเสมอ
   */
  const recomputeBudgetUsed = useCallback(async (budgetId: string, costCode: string, projectId: string) => {
    if (!budgetId && !costCode) return;
    const seen = new Set<string>();
    let total = 0;
    for (const p of prs) {
      if (p.projectId !== projectId || p.status === "Rejected") continue;
      const matchById = budgetId && p.budgetId === budgetId;
      const matchByCode = costCode && p.costCode === costCode;
      if ((matchById || matchByCode) && !seen.has(p.id)) {
        seen.add(p.id);
        total += Number(p.totalAmount) || 0;
      }
    }
    if (budgetId) {
      await updateData("budgets", budgetId, { usedAmount: total });
    }
  }, [prs, updateData]);

  // Helper function to get reference document info based on PR status
  const getRefDocInfo = (pr) => {
    if (!pr) return { docNo: "-", pdfUrl: null, docType: "PR" };

    const status = pr.status;
    let docType = "PR";
    let docNo = pr.prNo || "-";
    let pdfUrl = pr.pdfUrl;

    // Determine document type based on status
    if (status === "PO Issued") {
      // Show PO document for PO Issued status
      // Find PO that contains this PR (either through items.prId or prRefId)
      const associatedPO = pos.find(po => {
        if (po.prRefId === pr.id) return true;
        if (po.items && Array.isArray(po.items)) {
          return po.items.some(item => item.prId === pr.id);
        }
        return false;
      });
      if (associatedPO) {
        docType = "PO";
        docNo = associatedPO.poNo;
        pdfUrl = associatedPO.pdfUrl;
      }
    } else if (status === "Payment" || status === "Paid") {
      // Show Payment document for Payment/Paid status (future implementation)
      docType = "Payment";
      // Would need to implement payment document lookup here
      // For now, fallback to PR document
    }
    // For all other PR statuses (Draft, Pending CM, Pending PM, etc.), show PR document

    return { docNo, pdfUrl, docType };
  };

  // Handle clicking on ref doc to open PDF
  const handleRefDocClick = (pdfUrl, docNo, e) => {
    e.stopPropagation();
    if (pdfUrl) {
      window.open(pdfUrl, '_blank');
    } else {
      showAlert("ไม่พบเอกสาร", `ไม่พบ PDF สำหรับเอกสาร ${docNo}`, "warning");
    }
  };
  const { selectedProjectId,
    isFullScreenModalOpen, setIsFullScreenModalOpen,
    expandedPrRows, setExpandedPrRows, togglePrRow } = useUI();
  const prTableRef = useRef(null);
  const prTableLayout = useProportionalTableLayout({
    tableId: "pr",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.pr,
    savedWidths: columnWidths.pr,
    containerRef: prTableRef,
    enabled: true,
    driftKey: "description",
    handleColumnResize,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [savePrProgress, setSavePrProgress] = useState<{ show: boolean; pct: number; step: string }>({ show: false, pct: 0, step: "" });
  const [isPrRejectModalOpen, setIsPrRejectModalOpen] = useState(false);
  const [prRejectReason, setPrRejectReason] = useState("");
  const [isEditBudgetModalOpen, setIsEditBudgetModalOpen] = useState(false);
  const [selectedPrForEditBudget, setSelectedPrForEditBudget] = useState(null);
  const [editBudgetReason, setEditBudgetReason] = useState("");
  const [isReturnBalanceModalOpen, setIsReturnBalanceModalOpen] = useState(false);
  const [returnBalanceContext, setReturnBalanceContext] = useState<any>(null);
  const [returnBalanceValue, setReturnBalanceValue] = useState("");
  const [returnBalanceReason, setReturnBalanceReason] = useState("");
  const [viewingPR, setViewingPR] = useState(null); // PR View Modal
  /** ขณะรอ Approve: ค่า = สถานะ PR ตอนกด — ซ่อนปุ่มจน snapshot เปลี่ยนสถานะ หรือล้างเมื่อ update ล้มเหลว */
  const [prApproveFlightFromStatus, setPrApproveFlightFromStatus] = useState({});

  useEffect(() => {
    setPrApproveFlightFromStatus((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const from = prev[id];
        const p = prs.find((x: any) => x.id === id);
        if (!p || p.status !== from) delete next[id];
      }
      return next;
    });
  }, [prs]);

  const isPrApproveInFlight = (pr: any) => {
    const from = prApproveFlightFromStatus[pr?.id];
    return from != null && pr?.status === from;
  };
  const [prPdfReadyUrl, setPrPdfReadyUrl] = useState<string | null>(null);

  const [selectedPrForReject, setSelectedPrForReject] = useState(null);
  const [expandedBudgetIdsInModal, setExpandedBudgetIdsInModal] = useState({});

  const parseReturnBalanceInput = (value: any) => {
    const n = Number(String(value || "").replace(/,/g, ""));
    return Number.isFinite(n) ? n : NaN;
  };
  const formatReturnBalanceFixed2 = (value: number) => {
    if (!Number.isFinite(Number(value))) return "";
    return Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const normalizeReturnBalanceInput = (raw: string) => {
    const cleaned = String(raw || "").replace(/,/g, "").replace(/[^\d.]/g, "");
    if (!cleaned) return "";
    const hasDot = cleaned.includes(".");
    const parts = cleaned.split(".");
    const intRaw = parts[0] || "0";
    const intPart = intRaw.replace(/^0+(?=\d)/, "") || "0";
    const decPart = (parts.slice(1).join("") || "").slice(0, 2);
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    if (!hasDot) return grouped;
    return decPart.length > 0 ? `${grouped}.${decPart}` : `${grouped}.`;
  };

  const toggleBudgetInModal = (id) => {
    setExpandedBudgetIdsInModal(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRejectPrConfirm = async () => {
    if (!selectedPrForReject || !prRejectReason) return;
    if (!canRejectPR) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธ PR", "warning");
      return;
    }
    await updateData("prs", selectedPrForReject.id, {
      status: "Rejected",
      rejectReason: prRejectReason,
    });
    // Rejected PR ไม่นับงบ → recompute และ save กลับ budget document
    setTimeout(() => {
      recomputeBudgetUsed(
        selectedPrForReject.budgetId || "",
        selectedPrForReject.costCode || "",
        selectedPrForReject.projectId || ""
      );
    }, 1500);
    setIsPrRejectModalOpen(false);
    setPrRejectReason("");
    setSelectedPrForReject(null);
  };

  const handleEditBudgetConfirm = async () => {
    if (!selectedPrForEditBudget || !editBudgetReason.trim()) return;
    if (!canEditBudgetPR) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ส่ง PR กลับไปแก้ไข Budget", "warning");
      return;
    }
    await updateData("prs", selectedPrForEditBudget.id, {
      status: "Edit Budget",
      editBudgetReason: editBudgetReason.trim(),
      editBudgetBy: userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : userRole,
      editBudgetAt: new Date().toISOString(),
    });
    setIsEditBudgetModalOpen(false);
    setEditBudgetReason("");
    setSelectedPrForEditBudget(null);
    showAlert("ส่งคำขอแก้ไขแล้ว", "PR ถูกตั้งสถานะ Edit Budget — ผู้เปิด PR ต้องแก้ไขและส่งอนุมัติใหม่", "info");
  };

  const handleReturnPrBalanceToBudget = useCallback((pr) => {
    if (!pr?.id) return;
    if (!canReturnPrBalance) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์คืน Balance PR", "warning");
      return;
    }

    const info = getPrBudgetReturnInfo(pr, pos);
    if (info.returnAmount <= 0) {
      showAlert("ไม่มี Balance ให้คืน", "ยอด PR ปัจจุบันไม่มากกว่า PO Sub Total ที่ใช้ไปแล้ว", "info");
      return;
    }

    const prNo = pr.prNo || pr.id;
    const confirmMessage =
      `PR: ${prNo}\n` +
      `ยอด PR ปัจจุบัน: ${formatCurrency(info.currentTotal)}\n` +
      `PO Sub Total ที่ใช้ไปแล้ว: ${formatCurrency(info.poSubTotalUsed ?? info.poGrandTotalUsed)}\n` +
      `ยอดที่จะคืน Budget: ${formatCurrency(info.returnAmount)}\n` +
      `ยอด PR หลัง Rev: ${formatCurrency(info.revisedTotal)}\n\n` +
      "ระบบจะคง PR ID / PR No. เดิม และแก้เฉพาะยอดตัวเลขกับประวัติ Rev ของ PR นี้";

    openConfirm(
      "คืน Balance PR กลับ Budget",
      confirmMessage,
      () => {
        setReturnBalanceContext({ prId: pr.id });
        setReturnBalanceValue(formatReturnBalanceFixed2(Math.round(info.returnAmount * 100) / 100));
        setReturnBalanceReason("");
        setIsReturnBalanceModalOpen(true);
      },
      "warning"
    );
  }, [budgets, canReturnPrBalance, logAction, openConfirm, pos, prs, showAlert, updateData, user?.email, userData, userRole]);

  const handleConfirmReturnBalance = useCallback(async () => {
    const prId = returnBalanceContext?.prId;
    if (!prId) return;
    const latestPr = prs.find((p: any) => p.id === prId);
    if (!latestPr) {
      showAlert("ไม่พบ PR", "ไม่พบข้อมูล PR ล่าสุด", "warning");
      return;
    }
    const latestInfo = getPrBudgetReturnInfo(latestPr, pos);
    const maxReturnRaw = Number(latestInfo.returnAmount || 0);
    const maxReturn = Math.max(0, Math.round(maxReturnRaw * 100) / 100);
    if (maxReturn <= 0) {
      showAlert("ไม่มี Balance ให้คืน", "ข้อมูลล่าสุดไม่มียอดคงเหลือที่สามารถคืน Budget ได้", "info");
      setIsReturnBalanceModalOpen(false);
      setReturnBalanceContext(null);
      setReturnBalanceValue("");
      setReturnBalanceReason("");
      return;
    }

    const requestedRaw = parseReturnBalanceInput(returnBalanceValue);
    const requested = Math.round(requestedRaw * 100) / 100;
    if (!Number.isFinite(requested) || requested <= 0) {
      return showAlert("ยอดไม่ถูกต้อง", "กรุณากรอกยอดเงินที่ต้องการคืนมากกว่า 0", "warning");
    }
    if (requested > maxReturn) {
      return showAlert("ยอดเกิน Balance", `คืนได้สูงสุด ${formatCurrency(maxReturn)} เท่านั้น`, "warning");
    }
    const reason = (returnBalanceReason || "").trim();
    if (!reason) {
      return showAlert("กรุณาระบุเหตุผล", "กรุณากรอกเหตุผลการคืน Budget จาก PR", "warning");
    }

    const revisedTotalRaw = Math.max(0, latestInfo.currentTotal - requested);
    const revisedTotal = Math.round(revisedTotalRaw * 100) / 100;
    const nextStatus = revisedTotal <= 0 ? "Closed PR Auto" : (latestPr.status || "Approved");
    const history = Array.isArray(latestPr.budgetReturnRevisions) ? latestPr.budgetReturnRevisions : [];
    const byName = userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "";
    const revision = {
      revNo: history.length + 1,
      at: new Date().toISOString(),
      by: byName || user?.email || userRole || "Unknown",
      oldStatus: latestPr.status || null,
      oldTotalAmount: latestInfo.currentTotal,
      newTotalAmount: revisedTotal,
      oldItems: Array.isArray(latestPr.items) ? latestPr.items : [],
      poGrandTotalUsed: latestInfo.poSubTotalUsed ?? latestInfo.poGrandTotalUsed,
      returnedAmount: requested,
      returnReason: reason,
      budgetId: latestPr.budgetId || null,
      costCode: latestPr.costCode || null,
      subItemId: latestPr.selectedSubItemId || latestPr.subItemId || latestPr.items?.[0]?.budgetSubItemId || latestPr.items?.[0]?.subItemId || null,
      poRefs: getLinkedPoRefsForPr(pos, latestPr.id),
    };
    const revisedItems = scalePrItemsToTotal(latestPr.items || [], revisedTotal);
    const payload = {
      items: revisedItems,
      totalAmount: revisedTotal,
      amount: revisedTotal,
      status: nextStatus,
      budgetReturnRevisions: [...history, revision],
      budgetReturnRevNo: revision.revNo,
      lastBudgetReturnAt: revision.at,
      lastBudgetReturnAmount: requested,
      lastBudgetReturnReason: reason,
    };

    const ok = await updateData("prs", latestPr.id, payload, { skipLog: true });
    if (!ok) return;

    const budget = latestPr.budgetId
      ? budgets.find((b: any) => b.id === latestPr.budgetId)
      : budgets.find((b: any) => b.projectId === latestPr.projectId && b.code === latestPr.costCode);
    if (budget?.id) {
      const usedAmount = computeBudgetUsedAfterPrRevision(prs, latestPr, revisedTotal);
      await updateData("budgets", budget.id, { usedAmount }, { skipLog: true });
      const returnNotifications = Array.isArray(budget.budgetReturnNotifications) ? budget.budgetReturnNotifications : [];
      const notification = {
        id: `ret-${latestPr.id}-${revision.revNo}-${Date.now()}`,
        status: "pending",
        createdAt: revision.at,
        createdBy: revision.by,
        prId: latestPr.id,
        prNo: latestPr.prNo || latestPr.id,
        revNo: revision.revNo,
        amount: requested,
        reason,
        subItemId: revision.subItemId || null,
        oldPrTotal: latestInfo.currentTotal,
        newPrTotal: revisedTotal,
      };
      await updateData("budgets", budget.id, { budgetReturnNotifications: [...returnNotifications, notification] }, { skipLog: true });
    }

    await logAction?.(
      "Rev PR Return Balance",
      `Rev PR ${latestPr.prNo || latestPr.id}: คืน Budget ${formatCurrency(requested)} (${formatCurrency(latestInfo.currentTotal)} → ${formatCurrency(revisedTotal)}, PO Sub Total ${formatCurrency(latestInfo.poSubTotalUsed ?? latestInfo.poGrandTotalUsed)})`,
      latestPr.projectId
    );
    setViewingPR((prev) => prev?.id === latestPr.id ? { ...prev, ...payload } : prev);
    setIsReturnBalanceModalOpen(false);
    setReturnBalanceContext(null);
    setReturnBalanceValue("");
    setReturnBalanceReason("");
    showAlert("คืนยอดสำเร็จ", `คืน Budget จาก PR ${latestPr.prNo || latestPr.id} จำนวน ${formatCurrency(requested)} แล้ว (รอรับยอดใน Budget)`, "success");
  }, [budgets, logAction, pos, prs, returnBalanceContext?.prId, returnBalanceReason, returnBalanceValue, showAlert, updateData, user?.email, userData, userRole]);

  const handleDeletePrBudgetReturnRevision = useCallback((pr, revision) => {
    if (!userRoles.includes("Administrator")) {
      showAlert("ไม่มีสิทธิ์", "เฉพาะ Administrator เท่านั้นที่ลบประวัติ Rev ได้", "warning");
      return;
    }
    if (!pr?.id || !revision) return;

    const history = Array.isArray(pr.budgetReturnRevisions) ? pr.budgetReturnRevisions : [];
    const targetRevNo = Number(revision.revNo || 0);
    if (!targetRevNo) return;
    const prNo = pr.prNo || pr.id;
    const keptHistory = history
      .filter((rev: any) => Number(rev.revNo || 0) < targetRevNo)
      .sort((a: any, b: any) => Number(a.revNo || 0) - Number(b.revNo || 0))
      .map((rev: any, idx: number) => ({ ...rev, revNo: idx + 1 }));
    const lastKept = keptHistory[keptHistory.length - 1] || null;
    const restoreTotal = Number(revision.oldTotalAmount || 0);
    const restoreItems = restorePrItemsFromRevision(pr.items || [], revision);
    const restoreStatus = revision.oldStatus || pr.status;

    openConfirm(
      "ลบประวัติ Rev คืน Balance",
      `PR: ${prNo}\nลบ Rev ${targetRevNo} และย้อน PR กลับเป็นยอดก่อน Rev นี้\n\nยอด PR ที่จะกลับไป: ${formatCurrency(restoreTotal)}\nRev หลังจากนี้จะถูกลบออกจากประวัติด้วย เพื่อให้ timeline ตรงกัน`,
      async () => {
        const latestPr = prs.find((p: any) => p.id === pr.id) || pr;
        const payload = {
          items: restoreItems,
          totalAmount: restoreTotal,
          amount: restoreTotal,
          status: restoreStatus,
          budgetReturnRevisions: keptHistory,
          budgetReturnRevNo: lastKept?.revNo || null,
          lastBudgetReturnAt: lastKept?.at || null,
          lastBudgetReturnAmount: lastKept?.returnedAmount || null,
          lastBudgetReturnReason: lastKept?.returnReason || null,
        };

        const ok = await updateData("prs", latestPr.id, payload, { skipLog: true });
        if (!ok) return;

        const budget = latestPr.budgetId
          ? budgets.find((b: any) => b.id === latestPr.budgetId)
          : budgets.find((b: any) => b.projectId === latestPr.projectId && b.code === latestPr.costCode);
        if (budget?.id) {
          const usedAmount = computeBudgetUsedAfterPrRevision(prs, latestPr, restoreTotal);
          const allNotifications = Array.isArray(budget.budgetReturnNotifications) ? budget.budgetReturnNotifications : [];
          const removedRevNos = new Set(
            history
              .filter((rev: any) => Number(rev.revNo || 0) >= targetRevNo)
              .map((rev: any) => Number(rev.revNo || 0))
          );
          const removedNotifications = allNotifications.filter((n: any) =>
            n?.prId === latestPr.id && removedRevNos.has(Number(n?.revNo || 0))
          );
          const nextNotifications = allNotifications.filter((n: any) =>
            !(n?.prId === latestPr.id && removedRevNos.has(Number(n?.revNo || 0)))
          );

          const budgetPayload: any = { usedAmount, budgetReturnNotifications: nextNotifications };
          await updateData("budgets", budget.id, budgetPayload, { skipLog: true });
        }

        await logAction?.(
          "Delete PR Balance Rev",
          `ลบ Rev คืน Balance PR ${prNo}: Rev ${targetRevNo}, ย้อนยอด PR กลับเป็น ${formatCurrency(restoreTotal)} และย้อนผล Budget Return ที่เกี่ยวข้อง`,
          latestPr.projectId
        );
        setViewingPR((prev) => prev?.id === latestPr.id ? { ...prev, ...payload } : prev);
        showAlert("ลบ Rev แล้ว", `PR ${prNo} กลับไปเป็นยอดก่อน Rev ${targetRevNo} แล้ว`, "success");
      },
      "danger",
      {
        requireText: "Confirm",
        requireTextLabel: "พิมพ์ Confirm เพื่อยืนยันการลบ Rev และย้อนยอด PR",
        requireTextPlaceholder: "Confirm",
      }
    );
  }, [budgets, logAction, openConfirm, prs, showAlert, updateData, userRoles]);

  // ให้ PR Modal อัปเดตข้อมูลตามรายการล่าสุดเสมอ (แก้ปัญหา preview PDF ค้างเป็นไฟล์เก่า)
  useEffect(() => {
    if (!viewingPR?.id) return;
    const latest = prs.find((p: any) => p.id === viewingPR.id);
    if (latest && latest !== viewingPR) setViewingPR(latest);
  }, [prs, viewingPR?.id]);

  // โหลด fresh URL ทันทีที่เปิด Modal — เพื่อให้ปุ่มเปิดดูเป็น synchronous click (กัน popup blocker)
  useEffect(() => {
    const pr = viewingPR ? (prs.find((p: any) => p.id === viewingPR.id) || viewingPR) : null;
    if (!pr) { setPrPdfReadyUrl(null); return; }
    if (!pr.pdfPath) { setPrPdfReadyUrl(pr.pdfUrl || null); return; }
    let cancelled = false;
    (async () => {
      try {
        const freshUrl = await getDownloadURL(ref(storage, pr.pdfPath));
        if (!cancelled) setPrPdfReadyUrl(freshUrl);
      } catch (_) {
        if (!cancelled) setPrPdfReadyUrl(pr.pdfUrl || null);
      }
    })();
    return () => { cancelled = true; };
  }, [viewingPR?.id, viewingPR?.pdfUpdatedAt, viewingPR?.status]);

  // เปิดดู PDF — synchronous click (ใช้ prPdfReadyUrl ที่โหลดไว้แล้วตอนเปิด Modal)
  const openLatestPrPdf = useCallback(() => {
    if (prPdfReadyUrl) {
      window.open(prPdfReadyUrl, "_blank", "noopener,noreferrer");
    }
  }, [prPdfReadyUrl]);
  const [headerData, setHeaderData] = useState({
    prNo: "",
    subCode: "",
    requestDate: new Date().toISOString().split("T")[0],
    requestor: "",
    requestorEmail: "",
    costCode: "",
    selectedBudgetId: "", // รหัสงบที่เลือก (ใช้แสดงยอดคงเหลือที่ตรงรายการ)
    selectedSubItemId: "", // id ของ sub-item ที่เลือก
    urgency: "Normal",
    purchaseType: "",
    deliveryLocation: "",
    attachment: null as File | null,
    attachments: [] as File[],
    existingAttachments: [] as { url: string; name: string }[],
    attachmentUrl: "" as string | undefined,
    attachmentName: "" as string | undefined,
  });

  const buildPrPrefix = useCallback((subCode, purchaseType) => {
    if (!selectedProjectId) return "";
    const currentProject = projects.find((p) => p.id === selectedProjectId);
    if (!currentProject) return "";
    const rawJobNo = (currentProject.jobNo || "").trim();
    // เอา segment สุดท้ายของ Job No. และย่อให้สั้น
    // PRJ-2026-J-072 → "072" → strip 1 leading zero → "72" → "J72"
    // PRJ-2026-J-001 → "001" → strip 1 leading zero → "01" → "J01"
    // PRJ-2026-J-02A → "02A" → keep as-is               → "J02A"
    const lastSeg = rawJobNo.split("-").pop() || "";
    const compactSeg = /^0\d{2}$/.test(lastSeg) ? lastSeg.slice(1) : lastSeg;
    const jobNoClean = "J" + compactSeg; // e.g. "J72", "J01", "J02A"
    let prefix = "";
    if (purchaseType === PURCHASE_TYPE_EQUIPMENT) {
      prefix = `${jobNoClean}-EQM-`;
    } else if (purchaseType === PURCHASE_TYPE_RENTAL_LABEL) {
      prefix = `${jobNoClean}-RE-`;
    } else {
      if (!subCode) return "";
      prefix = `${jobNoClean}-${subCode}-`;
    }
    return prefix;
  }, [selectedProjectId, projects]);

  // Generate PR No. for UI preview only (เลขจริงจะจองด้วย transaction ตอนบันทึก)
  const generatePrNo = (subCode, purchaseType) => {
    const prefix = buildPrPrefix(subCode, purchaseType);
    if (!prefix) return "";
    const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existingMaxSeq = prs.reduce((max, pr) => {
      if (typeof pr?.prNo !== "string") return max;
      const m = pr.prNo.match(new RegExp(`^${escapedPrefix}(\\d+)$`));
      if (!m) return max;
      const n = Number(m[1]);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    const nextNo = String(existingMaxSeq + 1).padStart(3, "0");
    return `${prefix}${nextNo}`;
  };

  const reserveNextPrNo = useCallback(async (subCode, purchaseType) => {
    if (!selectedProjectId) throw new Error("กรุณาเลือกโครงการก่อนสร้าง PR");
    const prefix = buildPrPrefix(subCode, purchaseType);
    if (!prefix) throw new Error("ไม่สามารถสร้างเลข PR ได้: prefix ไม่ถูกต้อง");
    const existingMaxSeq = prs
      .filter((pr) => typeof pr.prNo === "string" && pr.prNo.startsWith(prefix))
      .reduce((max, pr) => {
        const m = pr.prNo.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`));
        if (!m) return max;
        const n = Number(m[1]);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);
    const counterId = `${selectedProjectId}__${prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const counterRef = doc(
      db,
      "artifacts",
      appId,
      "public",
      "data",
      "settings",
      "prRunningNo",
      "prCountersByPrefix",
      counterId
    );
    const nextPrNo = await runTransaction(db, async (tx) => {
      const snap = await tx.get(counterRef);
      const current = Number(
        snap.exists()
          ? snap.data()?.lastSeq || 0
          : existingMaxSeq
      );
      const next = current + 1;
      tx.set(
        counterRef,
        {
          projectId: selectedProjectId,
          prefix,
          lastSeq: next,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return `${prefix}${String(next).padStart(3, "0")}`;
    });
    return nextPrNo;
  }, [selectedProjectId, buildPrPrefix]);
  const [newItem, setNewItem] = useState({
    description: "",
    quantity: 1,
    unit: "Job",
    price: 0,
    requiredDate: "",
    note: "",
  });
  const [lineItems, setLineItems] = useState([]);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingPRId, setEditingPRId] = useState(null);
  const [isCostCodeModalOpen, setIsCostCodeModalOpen] = useState(false);
  const [budgetSearchText, setBudgetSearchText] = useState("");
  const [selectedSubItemsForPR, setSelectedSubItemsForPR] = useState([]); // Multi-select state
  const [prTableSearchText, setPrTableSearchText] = useState("");
  const [prSortConfig, setPrSortConfig] = useState<{ key: string | null; direction: "asc" | "desc" }>({ key: null, direction: "asc" });
  const [isContractPrModalOpen, setIsContractPrModalOpen] = useState(false);
  const [contractEditingPRId, setContractEditingPRId] = useState(null);
  const [contractHeaderData, setContractHeaderData] = useState({
    prNo: "",
    subCode: "",
    requestDate: new Date().toISOString().split("T")[0],
    requestor: "",
    requestorEmail: "",
    costCode: "",
    selectedBudgetId: "",
    selectedSubItemId: "",
    urgency: "Normal",
    purchaseType: "",
    deliveryLocation: "",
    attachment: null as File | null,
    attachmentUrl: "" as string | undefined,
    attachmentName: "" as string | undefined,
  });
  const [contractLineItems, setContractLineItems] = useState([]);
  const [isContractCostCodeModalOpen, setIsContractCostCodeModalOpen] = useState(false);
  const [contractBudgetSearchText, setContractBudgetSearchText] = useState("");
  const [selectedSubItemsForContractPR, setSelectedSubItemsForContractPR] = useState([]);

  const projectBudgets = budgets.filter(
    (b) => b.projectId === selectedProjectId
  );
  const calculateTotal = () =>
    lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  const availableBudgets = useMemo(() => {
    const approved = budgets.filter(
      (b) => b.projectId === selectedProjectId && b.status === "Approved"
    );
    return approved
      .map((b) => {
        // ถ้า budget document มี usedAmount ที่ recompute ไว้แล้ว (เหมือน statusNow บน PO) ให้ใช้ค่านั้นก่อน
        // หากยังไม่มี ให้ compute จาก PRs โดยจับคู่ทั้ง budgetId และ costCode (deduped) เพื่อไม่ให้หล่น
        let usedAmount: number;
        if (b.usedAmount != null && !isNaN(Number(b.usedAmount))) {
          usedAmount = Number(b.usedAmount);
        } else {
          const seen = new Set<string>();
          usedAmount = prs
            .filter((p) => {
              if (p.projectId !== selectedProjectId || p.status === "Rejected") return false;
              const matchById = b.id && p.budgetId === b.id;
              const matchByCode = b.code && p.costCode === b.code;
              if (!(matchById || matchByCode)) return false;
              if (seen.has(p.id)) return false;
              seen.add(p.id);
              return true;
            })
            .reduce((sum, p) => sum + (Number(p.totalAmount) || 0), 0);
        }
        const budgetAmount = Number(b.amount);
        return {
          ...b,
          budgetAmount,
          usedAmount,
          remainingBalance: budgetAmount - usedAmount,
        };
      })
      .filter((b) => {
        // If budget has sub-items, always show it so sub-items can be individually selected.
        if (b.subItems && b.subItems.length > 0) return true;
        // For budgets without sub-items: แสดงจนกว่าคงเหลือจะหมด (เปิด PR ซ้ำได้จนงบหมด)
        return b.remainingBalance > 0;
      });
  }, [budgets, prs, selectedProjectId]);

  const handleAddItem = () => {
    if (!newItem.description || newItem.quantity <= 0)
      return showAlert(
        "ข้อมูลไม่ครบ",
        "กรุณากรอกรายละเอียดและจำนวนให้ถูกต้อง",
        "warning"
      );
    const itemBudgetFields = {
      subItemId: headerData.selectedSubItemId || null,
      budgetId: headerData.selectedBudgetId || null,
      budgetSubItemId: headerData.selectedSubItemId || null,
    };
    if (editingItemId) {
      setLineItems(
        lineItems.map((item) =>
          item.id === editingItemId ? { ...newItem, ...itemBudgetFields, id: editingItemId } : item
        )
      );
      setEditingItemId(null);
    } else {
      setLineItems([...lineItems, {
        ...newItem,
        id: crypto.randomUUID(),
        ...itemBudgetFields,
      }]);
    }
    setNewItem({
      description: "",
      quantity: 1,
      unit: "Job",
      price: 0,
      requiredDate: "",
      note: "",
    });
  };

  const handleEditItem = (item) => {
    setNewItem(item);
    setEditingItemId(item.id);
  };
  const handleRemoveItem = (itemId) => {
    setLineItems(lineItems.filter((item) => item.id !== itemId));
    if (editingItemId === itemId) {
      setEditingItemId(null);
      setNewItem({
        description: "",
        quantity: 1,
        unit: "Job",
        price: 0,
        requiredDate: "",
        note: "",
      });
    }
  };

  const handleEditClick = (pr) => {
    setEditingPRId(pr.id);
    setHeaderData({
      prNo: pr.prNo,
      subCode: pr.subCode || "",
      requestDate: pr.requestDate || new Date().toISOString().split("T")[0],
      requestor: pr.requestor,
      requestorEmail: pr.requestorEmail || "",
      costCode: pr.costCode,
      selectedBudgetId: pr.budgetId || "",
      selectedSubItemId: pr.selectedSubItemId || pr.subItemId || pr.items?.[0]?.budgetSubItemId || pr.items?.[0]?.subItemId || "",
      urgency: pr.urgency || "Normal",
      purchaseType: pr.purchaseType || "",
      deliveryLocation: pr.deliveryLocation || "",
      attachment: null,
      attachments: [],
      existingAttachments: pr.attachments || [],
      attachmentUrl: pr.attachmentUrl || "",
      attachmentName: pr.attachmentName || "",
    });
    setLineItems(pr.items || []);
    setIsModalOpen(true);
    setIsFullScreenModalOpen(true);
  };

  const handleSavePR = async () => {
    let resolvedPrNo = headerData.prNo;
    const isNewPR = !editingPRId;
    if (isNewPR) {
      try {
        resolvedPrNo = await reserveNextPrNo(headerData.subCode, headerData.purchaseType);
        setHeaderData((prev) => ({ ...prev, prNo: resolvedPrNo }));
      } catch (e) {
        return showAlert("สร้างเลข PR ไม่สำเร็จ", e?.message || "ไม่สามารถจองเลข PR ใหม่ได้", "error");
      }
    }
    if (
      !resolvedPrNo ||
      !headerData.costCode ||
      !headerData.requestDate ||
      !headerData.purchaseType ||
      !headerData.deliveryLocation ||
      lineItems.length === 0
    ) {
      return showAlert(
        "ข้อมูลไม่ครบ",
        "กรุณากรอกข้อมูลให้ครบถ้วน ทุกช่อง รวมถึงรายการสินค้าอย่างน้อย 1 รายการ",
        "warning"
      );
    }

    const budgetItem = headerData.selectedBudgetId
      ? budgets.find((b) => b.id === headerData.selectedBudgetId && b.projectId === selectedProjectId)
      : budgets.find((b) => b.code === headerData.costCode && b.projectId === selectedProjectId);
    if (!budgetItem)
      return showAlert(
        "ไม่พบ Cost Code",
        "กรุณาเลือก Cost Code ที่ถูกต้อง",
        "error"
      );

    // ตรวจสอบว่า Budget ที่เลือกยังได้รับการ Approve อยู่
    if (budgetItem.status !== "Approved")
      return showAlert(
        "Budget ไม่ได้รับการ Approve",
        `Cost Code ${budgetItem.code} ยังไม่ได้รับการ Approve กรุณาเลือก Cost Code ที่ Approved แล้ว`,
        "error"
      );

    const selectedBudgetIdForItems = budgetItem.id || headerData.selectedBudgetId || null;
    const selectedSubItemIdForItems =
      budgetItem.subItems && budgetItem.subItems.length > 0
        ? (headerData.selectedSubItemId || null)
        : null;
    const lineItemsForSave = lineItems.map((item) => ({
      ...item,
      budgetId: selectedBudgetIdForItems,
      subItemId: selectedSubItemIdForItems,
      budgetSubItemId: selectedSubItemIdForItems,
    }));

    // ตรวจสอบว่า Sub-item ที่เลือกยังคง Approved อยู่ และยอดไม่เกิน (กรณีที่ budget มี sub-items)
    if (budgetItem.subItems && budgetItem.subItems.length > 0) {
      // หา sub-item ที่ตรงกับ selectedSubItemId → subItemId ใน lineItem → description ใน lineItem
      const firstLineSubId = lineItemsForSave.length > 0 && lineItemsForSave[0].subItemId ? lineItemsForSave[0].subItemId : "";
      const firstLineDesc = lineItemsForSave.length > 0 ? (lineItemsForSave[0].description || "").trim() : "";
      const resolvedSubId = headerData.selectedSubItemId || firstLineSubId;

      let selectedSub = resolvedSubId
        ? budgetItem.subItems.find(s => s.id === resolvedSubId)
        : firstLineDesc
          ? budgetItem.subItems.find(s => s.description?.trim() === firstLineDesc)
          : null;

      if (selectedSub) {
        if (selectedSub.status !== "Approved")
          return showAlert(
            "รายการยังไม่ได้รับการ Approve",
            `รายการ "${selectedSub.description}" มีสถานะ "${selectedSub.status}" ซึ่งยังไม่ได้รับการ Approve\nกรุณากลับไปเลือกรายการที่ Approved แล้ว`,
            "error"
          );

        // ตรวจสอบยอดคงเหลือของ sub-item (ไม่นับ PR ปัจจุบันที่กำลังแก้ไข)
        const subUsed = prs
          .filter(p => p.projectId === selectedProjectId && p.costCode === budgetItem.code && p.status !== "Rejected" && p.id !== editingPRId)
          .reduce((sum, p) => {
            const matchItems = (p.items || []).filter(i => {
              // Only match items that have proper sub-item IDs to avoid counting legacy records incorrectly
              if (selectedSub.id && (i.subItemId === selectedSub.id || i.budgetSubItemId === selectedSub.id)) {
                return true;
              }
              // For legacy records without subItemId, only match if this is the only sub-item with this exact description
              // and the PR was created before sub-item system (no subItemId on any items)
              if (!i.subItemId && !i.budgetSubItemId && i.description?.trim() === selectedSub.description?.trim()) {
                // Check if this PR has any items with subItemId - if yes, it's not a legacy PR
                const hasAnySubItemId = (p.items || []).some(item => item.subItemId || item.budgetSubItemId);
                return !hasAnySubItemId;
              }
              return false;
            });
            return sum + matchItems.reduce((s, i) => s + (i.quantity * i.price), 0);
          }, 0);
        const subBalance = selectedSub.amount - subUsed;
        const thisPrTotalCheck = calculateTotal();
        if (thisPrTotalCheck > subBalance) {
          return showAlert(
            "งบประมาณไม่พอ",
            `รายการ "${selectedSub.description}"\nงบที่ได้รับ: ${formatCurrency(selectedSub.amount)}\nใช้ไปแล้ว: ${formatCurrency(subUsed)}\nคงเหลือ: ${formatCurrency(subBalance)}\nขอซื้อครั้งนี้: ${formatCurrency(thisPrTotalCheck)}`,
            "error"
          );
        }
      }
    }

    // Use deduplication but keep original matching logic to avoid counting all PRs with same costCode
    const currentPrTotal = (() => {
      const seen = new Set<string>();
      return prs
        .filter((pr) => {
          if (pr.projectId !== selectedProjectId || pr.status === "Rejected" || pr.id === editingPRId) return false;
          // Keep original matching logic: budgetId match OR legacy costCode match (for PRs without budgetId)
          const matchById = budgetItem.id && pr.budgetId === budgetItem.id;
          const matchByCodeLegacy = !pr.budgetId && pr.costCode === budgetItem.code;
          if (!(matchById || matchByCodeLegacy)) return false;
          // Add deduplication to prevent double counting
          if (seen.has(pr.id)) return false;
          seen.add(pr.id);
          return true;
        })
        .reduce((sum, pr) => sum + Number(pr.totalAmount), 0);
    })();
    const thisPrTotal = calculateTotal();
    const totalBudget =
      budgetItem.subItems && budgetItem.subItems.length > 0
        ? budgetItem.subItems.reduce((sum, s) => sum + s.amount, 0)
        : budgetItem.amount;

    // Skip main budget validation if budget has sub-items and we have a selected sub-item
    // because sub-item validation above is more accurate and specific
    const hasSubItemSelected = budgetItem.subItems && budgetItem.subItems.length > 0 &&
      (headerData.selectedSubItemId || (lineItemsForSave.length > 0 && lineItemsForSave[0].subItemId));

    if (!hasSubItemSelected && currentPrTotal + thisPrTotal > totalBudget) {
      return showAlert(
        "งบประมาณไม่พอ",
        `งบทั้งหมด: ${formatCurrency(
          totalBudget
        )} \nใช้ไปแล้ว: ${formatCurrency(
          currentPrTotal
        )} \nขอซื้อครั้งนี้: ${formatCurrency(
          thisPrTotal
        )} \nคงเหลือจริง: ${formatCurrency(totalBudget - currentPrTotal)}`,
        "error"
      );
    }

    const setProgress = (pct: number, step: string) => setSavePrProgress({ show: true, pct, step });
    setProgress(5, "เตรียมข้อมูล...");

    let success = false;
    const editingPR = editingPRId ? prs.find(p => p.id === editingPRId) : null;
    const wasEditBudget = editingPR?.status === "Edit Budget";

    // อัปโหลดไฟล์แนบ
    setProgress(10, "อัปโหลดไฟล์แนบ...");
    let attachmentUrl = headerData.attachmentUrl || null;
    let attachmentName = headerData.attachmentName || null;
    let finalAttachments = [...(headerData.existingAttachments || [])];

    if (headerData.attachment && typeof headerData.attachment === "object" && (headerData.attachment as File).name) {
      try {
        const file = headerData.attachment as File;
        const res = await uploadAttachment(file, {
          type: "pr",
          projectId: selectedProjectId || undefined,
          prNo: resolvedPrNo || undefined,
        });
        attachmentUrl = res.url;
        attachmentName = res.name;
        finalAttachments.push({ url: res.url, name: res.name });
      } catch (err) {
        setSavePrProgress({ show: false, pct: 0, step: "" });
        return showAlert("อัปโหลดไฟล์แนบไม่สำเร็จ", err?.message || "ไม่สามารถอัปโหลดไฟล์ได้", "error");
      }
    }

    if (headerData.attachments && headerData.attachments.length > 0) {
      try {
        const uploadPromises = headerData.attachments.map(file => 
          uploadAttachment(file, { type: "pr", projectId: selectedProjectId || undefined, prNo: resolvedPrNo || undefined })
        );
        const results = await Promise.all(uploadPromises);
        results.forEach(r => finalAttachments.push({ url: r.url, name: r.name }));
        if (!attachmentUrl && results.length > 0) {
          attachmentUrl = results[0].url;
          attachmentName = results[0].name;
        }
      } catch (err) {
        setSavePrProgress({ show: false, pct: 0, step: "" });
        return showAlert("อัปโหลดไฟล์แนบไม่สำเร็จ", err?.message || "ไม่สามารถอัปโหลดไฟล์ได้", "error");
      }
    }

    const { attachment: _omitFile, attachments: _omitAtts, existingAttachments: _omitExisting, ...headerWithoutFile } = headerData;
    const editingPrForCreator = editingPRId ? prs.find((p: any) => p.id === editingPRId) : null;
    const prCreator = getUserIdentity(userData, user);
    const prPayload = {
      ...headerWithoutFile,
      prNo: resolvedPrNo,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      attachments: finalAttachments.length > 0 ? finalAttachments : null,
      selectedBudgetId: selectedBudgetIdForItems,
      selectedSubItemId: selectedSubItemIdForItems,
      subItemId: selectedSubItemIdForItems,
      budgetId: selectedBudgetIdForItems,
      projectId: selectedProjectId,
      items: lineItemsForSave,
      totalAmount: thisPrTotal,
      status: "Pending CM",
      createdByUid: editingPrForCreator?.createdByUid || prCreator.uid || null,
      createdByEmail: editingPrForCreator?.createdByEmail || prCreator.email || null,
      createdByFirstName: editingPrForCreator?.createdByFirstName || prCreator.firstName || null,
      createdByLastName: editingPrForCreator?.createdByLastName || prCreator.lastName || null,
      createdByName: editingPrForCreator?.createdByName || prCreator.name || null,
      ...(wasEditBudget ? { editBudgetReason: null, editBudgetBy: null, editBudgetAt: null } : {}),
    };

    // สร้าง PDF + stamp + upload
    let pdfUrl: string | undefined;
    let pdfError: string | null = null;
    try {
      const project = projects.find((p: any) => p.id === selectedProjectId) || null;
      const safePRNo = (resolvedPrNo || "unknown").replace(/[^a-zA-Z0-9\-_]/g, "_");
      const safeProjId = selectedProjectId || "unknown";
      setProgress(20, "กำลังสร้าง PDF...");
      let bytes = await generatePRPdfBytes(prPayload, {
        projectName: project?.name || "",
        budgetDesc: "",
      });

      // PR: ไม่ stamp Signature1 (ผู้สร้าง) ตาม requirement — ให้แสดงเฉพาะตอน Approve (Signature2/3) แทน

      setProgress(70, "อัปโหลด PDF ขึ้น Cloud...");
      const pdfPath = `generated/prs/${safeProjId}/${safePRNo}.pdf`;
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("PDF timeout")), 15000)
      );
      pdfUrl = await Promise.race([
        (async () => {
          // ลบไฟล์เดิมก่อนอัปโหลดใหม่ เพื่ออัปเดตข้อมูล PDF (กรณี Reject → แก้ไข → บันทึกใหม่)
          await deleteGeneratedPdf(pdfPath);
          return await uploadGeneratedPdf(bytes, pdfPath);
        })(),
        timeout,
      ]);
    } catch (e) {
      console.warn("[PR Save] PDF generation/upload failed:", e);
      const msg = e?.message || String(e);
      pdfError = /permission|unauthorized|403|rules/i.test(msg)
        ? "ไม่มีสิทธิ์เขียน Storage — กรุณาตั้งค่า Storage Rules ใน Firebase Console"
        : msg;
    }

    setProgress(85, "บันทึกข้อมูล PR...");
    if (pdfUrl) {
      prPayload.pdfUrl = pdfUrl;
      prPayload.pdfPath = `generated/prs/${(selectedProjectId || "unknown")}/${(resolvedPrNo || "unknown").replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`;
      prPayload.pdfUpdatedAt = new Date().toISOString();
    }

    if (editingPRId) {
      success = await updateData("prs", editingPRId, prPayload);
    } else {
      success = await addData("prs", prPayload, prPayload.prNo);
    }

    if (success) {
      // อัปเดต usedAmount บน budget document (เหมือน statusNow บน PO) ให้ยอดคงเหลือ dropdown ตรงเสมอ
      // ต้องรอ Firestore listener อัปเดต prs ก่อนถึงจะ count รายการใหม่ถูก
      setTimeout(() => {
        recomputeBudgetUsed(
          headerData.selectedBudgetId || prPayload.budgetId || "",
          headerData.costCode || prPayload.costCode || "",
          selectedProjectId
        );
      }, 1500);

      setProgress(100, "เสร็จสิ้น!");
      await new Promise(r => setTimeout(r, 600));
      setSavePrProgress({ show: false, pct: 0, step: "" });

      setIsModalOpen(false);
      setIsFullScreenModalOpen(false);
      setHeaderData({
        prNo: "",
        subCode: "",
        requestDate: new Date().toISOString().split("T")[0],
        requestor: "",
        requestorEmail: "",
        costCode: "",
        selectedBudgetId: "",
        selectedSubItemId: "",
        urgency: "Normal",
        purchaseType: "",
        deliveryLocation: "",
        attachment: null,
        attachments: [],
        existingAttachments: [],
        attachmentUrl: "",
        attachmentName: "",
      });
      setLineItems([]);
      setEditingItemId(null);
      setEditingPRId(null);

      if (wasEditBudget) {
        showAlert("ส่งอนุมัติใหม่แล้ว", "PR ถูกส่งให้ CM/PM อนุมัติใหม่เรียบร้อย", "success");
      } else if (pdfUrl) {
        showAlert("สำเร็จ", "บันทึก PR และสร้าง PDF เรียบร้อย", "success");
      } else if (pdfError) {
        showAlert("บันทึก PR เรียบร้อย แต่ PDF ไม่บันทึกลง Storage", pdfError, "warning");
      } else {
        showAlert("สำเร็จ", editingPRId ? "แก้ไขใบขอซื้อ (PR) เรียบร้อยแล้ว" : "บันทึกใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
      }
    } else {
      setSavePrProgress({ show: false, pct: 0, step: "" });
    }
  };

  const handleToggleSubItem = (sub, budgetCode, budgetId) => {
    setSelectedSubItemsForPR((prev) => {
      const withBudgetId = { ...sub, parentCode: budgetCode, parentBudgetId: budgetId || (typeof sub.id === "string" && sub.id.startsWith("main-") ? sub.id.replace("main-", "") : null) };
      // เลือกได้เพียง 1 รายการเท่านั้น: ถ้ากดซ้ำบนรายการเดิมให้ยกเลิก ถ้ากดรายการใหม่ให้แทนที่
      const alreadySelected = prev.length === 1 && prev[0].id === sub.id;
      if (alreadySelected) return [];
      return [withBudgetId];
    });
  };

  const handleAddSelectedSubItems = () => {
    if (selectedSubItemsForPR.length === 0) return;
    const first = selectedSubItemsForPR[0];
    const budgetCode = first.parentCode;
    const budgetId = first.parentBudgetId || (first.id && String(first.id).startsWith("main-") ? String(first.id).replace("main-", "") : null);

    // เก็บทั้ง budget ID และ sub-item ID เพื่อแสดงยอดคงเหลือของ sub-item ที่เลือก
    const isMainItem = typeof first.id === 'string' && first.id.startsWith('main-');
    const subItemId = isMainItem ? "" : (first.id || "");
    setHeaderData((prev) => ({ ...prev, costCode: budgetCode, selectedBudgetId: budgetId || "", selectedSubItemId: subItemId }));

    // Add Items
    const newItems = selectedSubItemsForPR.map((sub) => {
      const isMainItem = typeof sub.id === 'string' && sub.id.startsWith('main-');
      return {
        id: crypto.randomUUID(),
        subItemId: isMainItem ? null : sub.id,
        budgetId: budgetId || null,
        budgetSubItemId: isMainItem ? null : (sub.id || null),
        description: sub.description,
        quantity: sub.quantity || 1,
        unit: sub.unit || "Job",
        price: sub.unitPrice || 0,
        requiredDate: new Date().toISOString().split("T")[0],
        note: "",
      };
    });
    setLineItems((prev) => [
      ...prev.map((item) => ({
        ...item,
        subItemId: subItemId || null,
        budgetId: budgetId || null,
        budgetSubItemId: subItemId || null,
      })),
      ...newItems,
    ]);
    setSelectedSubItemsForPR([]);
    setIsCostCodeModalOpen(false);
  };

  // ─── Contract PR helpers ───────────────────────────────────────────────────
  const updateContractLineItem = (id, field, value) => {
    setContractLineItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };
  const removeContractLineItem = (id) => {
    setContractLineItems(prev => prev.filter(item => item.id !== id));
  };
  const addNewContractLineItem = () => {
    setContractLineItems(prev => [...prev, {
      id: crypto.randomUUID(),
      description: "",
      unit: "Job",
      quantity: 0,
      price: 0,
      note: "",
      subItemId: null,
      budgetId: contractHeaderData.selectedBudgetId || null,
      budgetSubItemId: contractHeaderData.selectedSubItemId || null,
      budgetCode: "",
    }]);
  };

  const handleToggleSubItemContract = (sub, budgetCode, budgetId) => {
    setSelectedSubItemsForContractPR((prev) => {
      const withBudgetId = { ...sub, parentCode: budgetCode, parentBudgetId: budgetId || null };
      const exists = prev.find(i => i.id === sub.id);
      if (exists) return prev.filter(i => i.id !== sub.id);
      return [...prev, withBudgetId];
    });
  };

  const handleAddSelectedSubItemsForContract = () => {
    if (selectedSubItemsForContractPR.length === 0) return;
    const first = selectedSubItemsForContractPR[0];
    const budgetCode = first.parentCode;
    const budgetId = first.parentBudgetId || null;
    const subItemId = first.id || "";
    setContractHeaderData((prev) => ({
      ...prev,
      costCode: budgetCode,
      selectedBudgetId: budgetId || "",
      selectedSubItemId: subItemId,
    }));
    const newItems = selectedSubItemsForContractPR.map((sub) => ({
      id: crypto.randomUUID(),
      subItemId: sub.id || null,
      budgetId: sub.parentBudgetId || null,
      budgetSubItemId: sub.id || null,
      description: sub.description || "",
      quantity: 0,
      unit: sub.unit || "Job",
      price: 0,
      note: "",
      budgetCode: sub.parentCode || "",
    }));
    setContractLineItems((prev) => [...prev, ...newItems]);
    setSelectedSubItemsForContractPR([]);
    setIsContractCostCodeModalOpen(false);
  };

  const handleSaveContractPR = async () => {
    let resolvedPrNo = contractHeaderData.prNo;
    try {
      resolvedPrNo = await reserveNextPrNo(contractHeaderData.subCode, contractHeaderData.purchaseType);
      setContractHeaderData((prev) => ({ ...prev, prNo: resolvedPrNo }));
    } catch (e) {
      return showAlert("สร้างเลข PR ไม่สำเร็จ", e?.message || "ไม่สามารถจองเลข PR ใหม่ได้", "error");
    }
    if (
      !resolvedPrNo ||
      !contractHeaderData.costCode ||
      !contractHeaderData.requestDate ||
      !contractHeaderData.purchaseType ||
      !contractHeaderData.deliveryLocation ||
      contractLineItems.length === 0
    ) {
      return showAlert("ข้อมูลไม่ครบ", "กรุณากรอกข้อมูลให้ครบถ้วน ทุกช่อง รวมถึงรายการสินค้าอย่างน้อย 1 รายการ", "warning");
    }
    const budgetItem = contractHeaderData.selectedBudgetId
      ? budgets.find((b) => b.id === contractHeaderData.selectedBudgetId && b.projectId === selectedProjectId)
      : budgets.find((b) => b.code === contractHeaderData.costCode && b.projectId === selectedProjectId);
    if (!budgetItem)
      return showAlert("ไม่พบ Cost Code", "กรุณาเลือก Cost Code ที่ถูกต้อง", "error");
    if (budgetItem.status !== "Approved")
      return showAlert("Budget ไม่ได้รับการ Approve", `Cost Code ${budgetItem.code} ยังไม่ได้รับการ Approve`, "error");

    const contractTotal = contractLineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
    const setProgress = (pct: number, step: string) => setSavePrProgress({ show: true, pct, step });
    setProgress(5, "เตรียมข้อมูล...");

    let attachmentUrl = contractHeaderData.attachmentUrl || null;
    let attachmentName = contractHeaderData.attachmentName || null;
    setProgress(10, "อัปโหลดไฟล์แนบ...");
    if (contractHeaderData.attachment && typeof contractHeaderData.attachment === "object" && (contractHeaderData.attachment as File).name) {
      try {
        const file = contractHeaderData.attachment as File;
        const res = await uploadAttachment(file, {
          type: "pr",
          projectId: selectedProjectId || undefined,
          prNo: resolvedPrNo || undefined,
        });
        attachmentUrl = res.url;
        attachmentName = res.name;
      } catch (err) {
        setSavePrProgress({ show: false, pct: 0, step: "" });
        return showAlert("อัปโหลดไฟล์แนบไม่สำเร็จ", err?.message || "ไม่สามารถอัปโหลดไฟล์ได้", "error");
      }
    }

    const { attachment: _omitFile, ...headerWithoutFile } = contractHeaderData;
    const prCreator = getUserIdentity(userData, user);

    const contractSelectedBudgetIdForItems = contractHeaderData.selectedBudgetId || null;
    const contractSelectedSubItemIdForItems =
      budgetItem.subItems && budgetItem.subItems.length > 0
        ? (contractHeaderData.selectedSubItemId || null)
        : null;

    const contractLineItemsForSave = contractLineItems.map((item) => ({
      ...item,
      budgetId: contractSelectedBudgetIdForItems,
      subItemId: contractSelectedSubItemIdForItems,
      budgetSubItemId: contractSelectedSubItemIdForItems,
    }));

    const prPayload = {
      ...headerWithoutFile,
      prNo: resolvedPrNo,
      attachmentUrl: attachmentUrl || null,
      attachmentName: attachmentName || null,
      budgetId: contractHeaderData.selectedBudgetId || null,
      projectId: selectedProjectId,
      items: contractLineItemsForSave,
      totalAmount: contractTotal,
      status: "Pending CM",
      prType: "contract",
      createdByUid: prCreator.uid || null,
      createdByEmail: prCreator.email || null,
      createdByFirstName: prCreator.firstName || null,
      createdByLastName: prCreator.lastName || null,
      createdByName: prCreator.name || null,
    };

    let pdfUrl: string | undefined;
    try {
      const project = projects.find((p: any) => p.id === selectedProjectId) || null;
      const safePRNo = (resolvedPrNo || "unknown").replace(/[^a-zA-Z0-9\-_]/g, "_");
      const safeProjId = selectedProjectId || "unknown";
      setProgress(20, "กำลังสร้าง PDF...");
      let bytes = await generatePRPdfBytes(prPayload, { projectName: project?.name || "", budgetDesc: "" });
      setProgress(70, "อัปโหลด PDF ขึ้น Cloud...");
      const pdfPath = `generated/prs/${safeProjId}/${safePRNo}.pdf`;
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("PDF timeout")), 15000));
      pdfUrl = await Promise.race([
        (async () => {
          await deleteGeneratedPdf(pdfPath);
          return await uploadGeneratedPdf(bytes, pdfPath);
        })(),
        timeout,
      ]);
      setProgress(85, "บันทึกข้อมูล...");
      await addData("prs", { ...prPayload, pdfUrl, pdfPath, pdfUpdatedAt: new Date().toISOString() });
      setProgress(100, "บันทึกสำเร็จ!");
      setTimeout(() => {
        setSavePrProgress({ show: false, pct: 0, step: "" });
        setIsContractPrModalOpen(false);
        setIsFullScreenModalOpen(false);
      }, 600);
      showAlert("บันทึก PR จ้าง/เหมา สำเร็จ", `PR No. ${resolvedPrNo} ถูกสร้างแล้ว`, "success");
    } catch (e) {
      setSavePrProgress({ show: false, pct: 0, step: "" });
      console.warn("[Contract PR] Save failed:", e);
      try {
        await addData("prs", prPayload);
        setIsContractPrModalOpen(false);
        setIsFullScreenModalOpen(false);
        showAlert("บันทึก PR จ้าง/เหมา สำเร็จ", `PR No. ${resolvedPrNo} ถูกสร้างแล้ว (ไม่มี PDF)`, "success");
      } catch (e2) {
        showAlert("บันทึกไม่สำเร็จ", e2?.message || "เกิดข้อผิดพลาด", "error");
      }
    }
  };

  const handleAction = async (id, action) => {
    const pr = prs.find((p) => p.id === id);
    if (!pr) return;
    if (action === "approve" && !canApprovePR) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติ PR", "warning");
      return;
    }
    if (action === "reject" && !canRejectPR) {
      showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธ PR", "warning");
      return;
    }
    if (action === "reject") {
      setSelectedPrForReject(pr);
      setPrRejectReason("");
      setIsPrRejectModalOpen(true);
      return;
    }
    let newStatus = pr.status;
    const isCMApprove = pr.status === "Pending CM" && (userRoles.includes("CM") || userRoles.includes("PM") || userRoles.includes("Administrator"));
    const isPMApprove = pr.status === "Pending PM" && (userRoles.includes("PM") || userRoles.includes("Administrator"));
    const isGMApprove = pr.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator"));
    const isMDApprove = pr.status === "Pending MD" && (userRoles.includes("MD") || userRoles.includes("Administrator"));

    const isContractPR = ["จ้างเหมา > DL"].includes(pr.purchaseType || "");
    if (isCMApprove) newStatus = "Pending PM";
    else if (isPMApprove) {
      newStatus = isContractPR ? "Pending MD" : "Approved";
    }
    else if (isGMApprove) newStatus = "Pending MD";
    else if (isMDApprove) newStatus = "Approved";

    if (newStatus !== pr.status) {
      setPrApproveFlightFromStatus((s) => ({ ...s, [id]: pr.status }));
      const emailField = isCMApprove ? "cmApproverEmail" : isPMApprove ? "pmApproverEmail" : null;
      const approverEmail = userData?.email || user?.email || "";
      const approverSig = await resolveCurrentUserSignatureImage(userData, user);
      const stampField = isCMApprove ? "Signature2" : isPMApprove ? "Signature3" : null;

      let updatedPdfUrl: string | undefined;
      let newPdfPath: string | undefined;

      try {
        const safePRNo = (pr.prNo || pr.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
        const safeProjId = pr.projectId || "unknown";
        const project = projects.find((p: any) => p.id === pr.projectId) || null;

        // สร้าง PR data อัปเดตพร้อม email ผู้ approve ปัจจุบัน
        // (ถ้า PM approve จะมี cmApproverEmail จาก Firestore อยู่แล้ว + เพิ่ม pmApproverEmail)
        const updatedPrData = {
          ...pr,
          ...(emailField && approverEmail ? { [emailField]: approverEmail } : {}),
        };

        // Regenerate PDF จาก template ใหม่ทั้งหมด (เพื่อให้ prcm/prpm ติดถูกต้องแน่นอน)
        let bytes = await generatePRPdfBytes(updatedPrData, {
          projectName: project?.name || "",
          budgetDesc: "",
        });

        // Stamp ลายเซ็นผู้ approve บน PDF ที่ regenerate แล้ว
        if (stampField && approverSig) {
          try {
            bytes = await stampSignatureToField(bytes, approverSig, stampField as "Signature2" | "Signature3");
          } catch (sigErr) {
            console.warn(`[PR Approve] Stamp ${stampField} failed:`, sigErr);
          }
        }

        newPdfPath = `generated/prs/${safeProjId}/${safePRNo}.pdf`;
        await deleteGeneratedPdf(newPdfPath);
        updatedPdfUrl = await uploadGeneratedPdf(bytes, newPdfPath);
      } catch (e) {
        console.warn("[PR Approve] Regenerate PDF failed:", e);
      }

      const ok = await updateData("prs", id, {
        status: newStatus,
        rejectReason: "",
        ...(emailField && approverEmail ? { [emailField]: approverEmail } : {}),
        ...(updatedPdfUrl ? { pdfUrl: updatedPdfUrl, pdfPath: newPdfPath } : {}),
        ...(updatedPdfUrl ? { pdfUpdatedAt: new Date().toISOString() } : {}),
      });

      if (!ok) {
        setPrApproveFlightFromStatus((s) => {
          const n = { ...s };
          delete n[id];
          return n;
        });
      } else if (viewingPR && viewingPR.id === id) {
        setViewingPR((prev) => ({
          ...prev,
          status: newStatus,
          rejectReason: "",
          ...(emailField && approverEmail ? { [emailField]: approverEmail } : {}),
          ...(updatedPdfUrl ? { pdfUrl: updatedPdfUrl, pdfPath: newPdfPath } : {}),
          ...(updatedPdfUrl ? { pdfUpdatedAt: new Date().toISOString() } : {}),
        }));
      }
    }
  };

  const groupPrsByPurchaseType = (list) =>
    list.reduce((groups, pr) => {
      const type = pr.purchaseType || "Uncategorized";
      if (!groups[type]) groups[type] = [];
      groups[type].push(pr);
      return groups;
    }, {});

  const getPrBudgetItemName = useCallback((pr) => {
    const headerBudgetItem = pr?.budgetId
      ? budgets.find((b: any) => b.id === pr.budgetId && b.projectId === pr.projectId)
      : pr?.costCode
        ? budgets.find((b: any) => b.code === pr.costCode && b.projectId === pr.projectId)
        : null;

    if (!headerBudgetItem) return "";

    const mainDesc = headerBudgetItem.description || "";
    const subItemId = pr?.selectedSubItemId || pr?.subItemId
      || (pr?.items?.[0]?.subItemId) || (pr?.items?.[0]?.budgetSubItemId);

    let subDesc = "";
    if (subItemId && headerBudgetItem?.subItems?.length > 0) {
      const sub = headerBudgetItem.subItems.find((s: any) => s.id === subItemId);
      subDesc = sub?.description || "";
    }

    return mainDesc && subDesc ? `${mainDesc} + ${subDesc}` : (mainDesc || subDesc || "");
  }, [budgets]);

  const getPrSortValue = useCallback((pr, key) => {
    const balanceAmount = getPrBudgetReturnInfo(pr, pos).returnAmount;
    switch (key) {
      case "prNo": return String(pr.prNo || pr.id || "");
      case "date": return String(pr.requestDate || "");
      case "costCode": return String(pr.costCode || "");
      case "description": {
        const budgetName = getPrBudgetItemName(pr);
        const itemDescs = pr.items?.map((it) => it.description).filter(Boolean).join(", ") || "";
        return String(budgetName || itemDescs || "");
      }
      case "type": return String(pr.purchaseType || "");
      case "requestor": return String(pr.requestor || "");
      case "items": return Number(pr.items?.length || 0);
      case "amount": return Number(pr.totalAmount || pr.amount || 0);
      case "balance": return balanceAmount;
      case "status": return String(pr.status || "");
      case "refDoc": return String(getRefDocInfo(pr)?.docNo || "");
      default: return "";
    }
  }, [getPrBudgetItemName, pos]);

  const requestPrSort = useCallback((key) => {
    setPrSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  }, []);

  const getPrSortIndicator = useCallback((key) => {
    if (prSortConfig.key !== key) return "↕";
    return prSortConfig.direction === "asc" ? "▲" : "▼";
  }, [prSortConfig]);

  const sortPrList = useCallback((list) => {
    if (!prSortConfig.key) return list;
    const { key, direction } = prSortConfig;
    const sorted = [...list].sort((a, b) => {
      const av = getPrSortValue(a, key);
      const bv = getPrSortValue(b, key);
      if (typeof av === "number" || typeof bv === "number") {
        const na = Number(av) || 0;
        const nb = Number(bv) || 0;
        return direction === "asc" ? na - nb : nb - na;
      }
      return direction === "asc"
        ? String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" })
        : String(bv).localeCompare(String(av), undefined, { numeric: true, sensitivity: "base" });
    });
    return sorted;
  }, [prSortConfig, getPrSortValue]);

  const isPrMatchSearch = useCallback((pr) => {
    const q = (prTableSearchText || "").trim().toLowerCase();
    if (!q) return true;
    const budgetName = getPrBudgetItemName(pr);
    const itemDescs = pr.items?.map((it) => it.description).filter(Boolean).join(", ") || "";
    const refDoc = getRefDocInfo(pr);
    const blob = [
      pr.prNo,
      pr.requestDate,
      pr.costCode,
      budgetName,
      itemDescs,
      pr.purchaseType,
      getPurchaseTypeDisplayLabel(pr.purchaseType),
      pr.requestor,
      pr.items?.length,
      pr.totalAmount || pr.amount,
      pr.status,
      refDoc?.docNo,
    ].filter(Boolean).join(" ").toLowerCase();
    return blob.includes(q);
  }, [prTableSearchText, getPrBudgetItemName]);

  /** ตารางบนสุด: รายการรอ Action (รอ Approve หรือ รอแก้ไข หรือ รอปิด) */
  const pendingActionStatuses = ["Pending CM", "Pending PM", "Pending GM", "Pending MD", "Edit Budget", "Rejected", "Pending Close"];
  const groupedPrEntriesPending = useMemo(() => {
    let list = prs.filter(
      (pr) =>
        pr.projectId === selectedProjectId &&
        pendingActionStatuses.includes(pr.status)
    );
    // Filter by allowed PR Types (if configured)
    if (allowedPRTypes && allowedPRTypes.length > 0) {
      list = list.filter((pr) => allowedPRTypes.includes(pr.purchaseType));
    }
    const filtered = list.filter(isPrMatchSearch);
    const sorted = sortPrList(filtered);
    return Object.entries(groupPrsByPurchaseType(sorted));
  }, [prs, selectedProjectId, isPrMatchSearch, sortPrList, allowedPRTypes]);

  /** ตารางกลาง: ทุกสถานะยกเว้น Closed PR, Closed PR Auto, PO Issued และรอ Action */
  const groupedPrEntriesMain = useMemo(() => {
    let list = prs.filter(
      (pr) =>
        pr.projectId === selectedProjectId &&
        pr.status !== "Closed PR" &&
        pr.status !== "Closed PR Auto" &&
        pr.status !== "PO Issued" &&
        !pendingActionStatuses.includes(pr.status)
    );
    // Filter by allowed PR Types (if configured)
    if (allowedPRTypes && allowedPRTypes.length > 0) {
      list = list.filter((pr) => allowedPRTypes.includes(pr.purchaseType));
    }
    const filtered = list.filter(isPrMatchSearch);
    const sorted = sortPrList(filtered);
    return Object.entries(groupPrsByPurchaseType(sorted));
  }, [prs, selectedProjectId, isPrMatchSearch, sortPrList, allowedPRTypes]);

  const showPendingActionTable = groupedPrEntriesPending.length > 0 && groupedPrEntriesPending.some(([, prs]) => prs.length > 0);

  /** ตารางล่าง C: เฉพาะ PO Issued — รวมทุกประเภท เรียงตามเลข PR */
  const flatPoIssuedPrs = useMemo(() => {
    let list = prs.filter(
      (pr) => pr.projectId === selectedProjectId && pr.status === "PO Issued"
    );
    // Filter by allowed PR Types (if configured)
    if (allowedPRTypes && allowedPRTypes.length > 0) {
      list = list.filter((pr) => allowedPRTypes.includes(pr.purchaseType));
    }
    const filtered = list.filter(isPrMatchSearch);
    if (!prSortConfig.key) {
      return [...filtered].sort((a, b) =>
        String(a.prNo || a.id || "").localeCompare(String(b.prNo || b.id || ""), undefined, { numeric: true, sensitivity: "base" })
      );
    }
    return sortPrList(filtered);
  }, [prs, selectedProjectId, isPrMatchSearch, sortPrList, prSortConfig.key, allowedPRTypes]);

  const showPoIssuedPrTable = flatPoIssuedPrs.length > 0;

  const renderPrHeaderCells = () => (
    <>
      {isColumnVisible("pr", "actions") && <th className="py-0.5 px-2 text-left md:hidden" style={{ width: prTableLayout.scaled.actions }}>Actions</th>}
      {isColumnVisible("pr", "prNo") && <ResizableTh tableId="pr" colKey="prNo" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.prNo} onClick={() => requestPrSort("prNo")}>PR No. <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("prNo")}</span></ResizableTh>}
      {isColumnVisible("pr", "date") && <ResizableTh tableId="pr" colKey="date" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.date} onClick={() => requestPrSort("date")}>Date <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("date")}</span></ResizableTh>}
      {isColumnVisible("pr", "costCode") && <ResizableTh tableId="pr" colKey="costCode" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.costCode} onClick={() => requestPrSort("costCode")}>Cost Code <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("costCode")}</span></ResizableTh>}
      {isColumnVisible("pr", "description") && <ResizableTh tableId="pr" colKey="description" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.description} onClick={() => requestPrSort("description")}>Description <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("description")}</span></ResizableTh>}
      {isColumnVisible("pr", "type") && <ResizableTh tableId="pr" colKey="type" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.type} onClick={() => requestPrSort("type")}>Type <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("type")}</span></ResizableTh>}
      {isColumnVisible("pr", "requestor") && <ResizableTh tableId="pr" colKey="requestor" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.requestor} onClick={() => requestPrSort("requestor")}>Requestor <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("requestor")}</span></ResizableTh>}
      {isColumnVisible("pr", "items") && <ResizableTh tableId="pr" colKey="items" className="py-0.5 px-2 cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.items} onClick={() => requestPrSort("items")}>Items <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("items")}</span></ResizableTh>}
      {isColumnVisible("pr", "amount") && <ResizableTh tableId="pr" colKey="amount" className="py-0.5 px-2 text-right cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.amount} onClick={() => requestPrSort("amount")}>Amount <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("amount")}</span></ResizableTh>}
      {canViewPrBalance && isColumnVisible("pr", "balance") && <ResizableTh tableId="pr" colKey="balance" className="py-0.5 px-2 text-right cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.balance} onClick={() => requestPrSort("balance")}>Balance <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("balance")}</span></ResizableTh>}
      {isColumnVisible("pr", "status") && <ResizableTh tableId="pr" colKey="status" className="py-0.5 px-2 text-center cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.status} onClick={() => requestPrSort("status")}>Status <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("status")}</span></ResizableTh>}
      {isColumnVisible("pr", "refDoc") && <ResizableTh tableId="pr" colKey="refDoc" className="py-0.5 px-2 text-center cursor-pointer select-none" isAdmin={userRole === "Administrator"} onResize={prTableLayout.handleResize} currentWidth={prTableLayout.scaled.refDoc} onClick={() => requestPrSort("refDoc")}>Ref Doc <span className="text-[10px] ml-1 opacity-70">{getPrSortIndicator("refDoc")}</span></ResizableTh>}
      {isColumnVisible("pr", "actions") && <th className="hidden py-0.5 px-2 text-right md:table-cell" style={{ width: prTableLayout.scaled.actions }}>Actions</th>}
    </>
  );

  const dataRowClassForVariant = (variant) =>
    variant === "poIssued"
      ? "hover:bg-teal-50/60 border-b cursor-pointer transition-colors odd:bg-white even:bg-teal-50/25"
      : "hover:bg-blue-50 border-b cursor-pointer transition-colors odd:bg-white even:bg-slate-50";

  const renderPrActionCell = (pr, className) => (
    isColumnVisible("pr", "actions") && (
      <td className={`py-0.5 px-2 text-right ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-start gap-1 md:justify-end">
            {canApprovePR && (userRoles.includes("CM") || userRoles.includes("PM") || userRoles.includes("Administrator")) && pr.status === "Pending CM" && !isPrApproveInFlight(pr) && (
              <>
                <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>CM Approve</Button>
                {canRejectPR && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>}
              </>
            )}
            {canApprovePR && (userRoles.includes("PM") || userRoles.includes("Administrator")) && pr.status === "Pending PM" && !isPrApproveInFlight(pr) && (
              <>
                <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>PM Approve</Button>
                {canRejectPR && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>}
              </>
            )}
            {canApprovePR && (userRoles.includes("GM") || userRoles.includes("Administrator")) && pr.status === "Pending GM" && !isPrApproveInFlight(pr) && (
              <>
                <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>GM Approve</Button>
                {canRejectPR && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>}
              </>
            )}
            {canApprovePR && (userRoles.includes("MD") || userRoles.includes("Administrator")) && pr.status === "Pending MD" && !isPrApproveInFlight(pr) && (
              <>
                <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>MD Approve</Button>
                {canRejectPR && <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>}
              </>
            )}
            {canEditBudgetPR && (userRoles.includes("Procurement") || userRoles.includes("PCM") || userRoles.includes("Administrator")) && pr.status === "Approved" && (
              <button
                className="text-red-600 hover:bg-red-50 p-1 rounded-full transition-colors"
                title="ส่งคืนให้แก้ไข Budget"
                onClick={() => {
                  setSelectedPrForEditBudget(pr);
                  setEditBudgetReason("");
                  setIsEditBudgetModalOpen(true);
                }}
              >
                <Settings size={13} />
              </button>
            )}
            {canReturnPrBalance && (() => {
              const info = getPrBudgetReturnInfo(pr, pos);
              if (info.returnAmount <= 0) return null;
              return (
                <button
                  className="text-emerald-600 hover:bg-emerald-50 p-1 rounded-full transition-colors"
                  title={`คืน Balance PR กลับ Budget (${formatCurrency(info.returnAmount)})`}
                  onClick={() => handleReturnPrBalanceToBudget(pr)}
                >
                  <Wallet size={13} />
                </button>
              );
            })()}
            {canUseFunction("pr", "edit") && (pr.status === "Rejected" || pr.status === "Edit Budget") && (
              <button
                className="text-blue-500 hover:bg-blue-50 p-1 rounded-full transition-colors"
                title="แก้ไข PR"
                onClick={() => handleEditClick(pr)}
              >
                <Edit size={13} />
              </button>
            )}
            {canUseFunction("pr", "delete") && (
              <button
                className="text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors"
                onClick={() => {
                  openConfirm(
                    "ยืนยันการลบ",
                    "คุณต้องการลบรายการ PR นี้ใช่หรือไม่?",
                    async () => {
                      if (pr.pdfUrl) {
                        const safePRNo = (pr.prNo || pr.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
                        const safeProjId = pr.projectId || "unknown";
                        await deleteGeneratedPdf(`generated/prs/${safeProjId}/${safePRNo}.pdf`);
                      }
                      await deleteData("prs", pr.id);
                    },
                    "danger"
                  );
                }}
              >
                <Trash2 size={13} />
              </button>
            )}
            {/* ยืนยัน Close PR — เฉพาะสถานะ Pending Close */}
            {canUseFunction("pr", "closePR") && pr.status === "Pending Close" && (
              <Button
                variant="success"
                className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                onClick={() => {
                  openConfirm(
                    "ยืนยันการปิด PR",
                    `คุณต้องการปิด PR ${pr.prNo} ใช่หรือไม่?`,
                    async () => {
                      await updateData("prs", pr.id, { status: "Closed PR" });
                    },
                    "success"
                  );
                }}
              >
                ยืนยัน Close
              </Button>
            )}
        </div>
      </td>
    )
  );

  const renderPrDataRows = (groupPrs, variant) => {
    const dataRowClass = dataRowClassForVariant(variant);
    return groupPrs.map((pr) => (
      <React.Fragment key={pr.id}>
        {(() => {
          const balanceAmount = getPrBudgetReturnInfo(pr, pos).returnAmount;
          return (
        <tr className={dataRowClass} onClick={() => setViewingPR(pr)}>
          {renderPrActionCell(pr, "md:hidden")}
          {isColumnVisible("pr", "prNo") && <td className="py-0.5 px-2 font-medium" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>}
          {isColumnVisible("pr", "date") && <td className="py-0.5 px-2" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>}
          {isColumnVisible("pr", "costCode") && <td className="py-0.5 px-2">
            <span className="bg-gray-100 px-1.5 py-0 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
              {pr.costCode}
            </span>
          </td>}
          {isColumnVisible("pr", "description") && <td
            className="py-0.5 px-2 text-xs text-slate-500"
            title={(() => {
              const budgetItemName = getPrBudgetItemName(pr);
              const itemDescs = pr.items && pr.items.length > 0
                ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                : "-";
              const displayText = budgetItemName || itemDescs;
              return pr.rejectReason ? `${displayText} | ปฏิเสธ: ${pr.rejectReason}` : displayText;
            })()}
          >
            <div className="leading-tight">
              <span className="cell-text font-semibold text-slate-700">
                {pr.items && pr.items.length > 0
                  ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                  : (getPrBudgetItemName(pr) || "-")}
              </span>
              {pr.items && pr.items.length > 0 && getPrBudgetItemName(pr) && (
                <div className="cell-text text-[10px] text-slate-400 mt-0.5">
                  {getPrBudgetItemName(pr)}
                </div>
              )}
            </div>
          </td>}
          {isColumnVisible("pr", "type") && <td className="py-0.5 px-2" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>}
          {isColumnVisible("pr", "requestor") && <td className="py-0.5 px-2" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>}
          {isColumnVisible("pr", "items") && <td className="py-0.5 px-2">
            <span className="font-bold text-slate-700">
              {pr.items?.length || 0} รายการ
            </span>
          </td>}
          {isColumnVisible("pr", "amount") && <td className="py-0.5 px-2 text-right font-semibold">
            {formatCurrency(pr.totalAmount || pr.amount)}
          </td>}
          {canViewPrBalance && isColumnVisible("pr", "balance") && <td className="py-0.5 px-2 text-right font-semibold text-emerald-700">
            {formatCurrency(balanceAmount)}
          </td>}
          {isColumnVisible("pr", "status") && <td className="py-0.5 px-2 text-center">
            <Badge status={pr.status} />
          </td>}
          {isColumnVisible("pr", "refDoc") && <td className="py-0.5 px-2 text-center">
            {(() => {
              const { docNo, pdfUrl, docType } = getRefDocInfo(pr);
              return pdfUrl ? (
                <button
                  className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium transition-colors"
                  onClick={(e) => handleRefDocClick(pdfUrl, docNo, e)}
                  title={`เปิด ${docType} - ${docNo}`}
                >
                  {docNo}
                </button>
              ) : (
                <span className="text-gray-400 text-xs">
                  {docNo}
                </span>
              );
            })()}
          </td>}
          {renderPrActionCell(pr, "hidden md:table-cell")}
        </tr>
          );
        })()}
      </React.Fragment>
    ));
  };

  const renderPrGroupedTableBody = (entries) => {
    const groupRowClass = "bg-slate-100 border-b border-slate-200";
    return entries.map(([type, groupPrs]) => (
      <React.Fragment key={`main-${type}`}>
        <tr className={groupRowClass}>
          <td colSpan={["prNo", "date", "costCode", "description", "type", "requestor", "items", "amount", "balance", "status", "refDoc", "actions"].filter(k => (!canViewPrBalance && k === "balance" ? false : isColumnVisible("pr", k))).length} className="py-1 px-2 font-bold text-slate-700">
            {type} ({groupPrs.length})
          </td>
        </tr>
        {renderPrDataRows(groupPrs, "main")}
      </React.Fragment>
    ));
  };

  const groupedBudgets = useMemo(() => {
    const groups = {};
    const ALLOWED_CATS = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
    availableBudgets.forEach((b) => {
      // แสดง budget ที่มี sub-item ที่อนุมัติแล้ว หรือไม่มี sub-item เลย (main budget item)
      const hasSubItems = b.subItems && b.subItems.length > 0;
      const hasApprovedSubs = hasSubItems && b.subItems.some(s => s.status === "Approved");
      // อนุญาตให้เลือกได้ถ้า: มี sub-item ที่ approved หรือไม่มี sub-item เลย
      if (hasSubItems && !hasApprovedSubs) return;
      const cat = b.code.substring(0, 3);
      if (!ALLOWED_CATS.includes(cat)) return;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(b);
    });
    return groups;
  }, [availableBudgets]);

  // ฟิลเตอร์ Cost Code / รายการ ใน Modal เลือกรายการงบประมาณ (content)
  const groupedBudgetsFiltered = useMemo(() => {
    const q = (budgetSearchText || "").trim().toLowerCase();
    if (!q) return groupedBudgets;
    const out = {};
    Object.keys(groupedBudgets).forEach((cat) => {
      const filtered = groupedBudgets[cat].filter((b) => {
        const subDesc = (b.subItems || []).map((s) => s.description || "").join(" ");
        const haystack = [b.code, b.description || "", subDesc].join(" ").toLowerCase();
        return haystack.includes(q);
      });
      if (filtered.length > 0) out[cat] = filtered;
    });
    return out;
  }, [groupedBudgets, budgetSearchText]);

  // ประเภทการขอซื้อสำหรับ PR จ้าง/เหมา
  const CONTRACT_PURCHASE_TYPES = ["จ้างเหมา > DL", "ค่าแรง > DC"];

  // งบประมาณสำหรับ Contract PR (หมวด 004 และ 006 เท่านั้น)
  const groupedBudgetsContract = useMemo(() => {
    const groups = {};
    const CONTRACT_CATS = ["004", "006"];
    availableBudgets.forEach((b) => {
      // แสดง budget ที่มี sub-item ที่อนุมัติแล้ว หรือไม่มี sub-item เลย (main budget item)
      const hasSubItems = b.subItems && b.subItems.length > 0;
      const hasApprovedSubs = hasSubItems && b.subItems.some(s => s.status === "Approved");
      // อนุญาตให้เลือกได้ถ้า: มี sub-item ที่ approved หรือไม่มี sub-item เลย
      if (hasSubItems && !hasApprovedSubs) return;
      const cat = b.code.substring(0, 3);
      if (!CONTRACT_CATS.includes(cat)) return;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(b);
    });
    return groups;
  }, [availableBudgets]);

  const groupedBudgetsContractFiltered = useMemo(() => {
    const q = (contractBudgetSearchText || "").trim().toLowerCase();
    if (!q) return groupedBudgetsContract;
    const out = {};
    Object.keys(groupedBudgetsContract).forEach((cat) => {
      const filtered = groupedBudgetsContract[cat].filter((b) => {
        const subDesc = (b.subItems || []).map((s) => s.description || "").join(" ");
        const haystack = [b.code, b.description || "", subDesc].join(" ").toLowerCase();
        return haystack.includes(q);
      });
      if (filtered.length > 0) out[cat] = filtered;
    });
    return out;
  }, [groupedBudgetsContract, contractBudgetSearchText]);

  return (
    <div className="space-y-4">

      {/* ── Progress Modal: กำลังบันทึก PR ── */}
      {savePrProgress.show && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-80 flex flex-col items-center gap-4">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                <circle
                  cx="32" cy="32" r="28" fill="none"
                  stroke={savePrProgress.pct < 100 ? "#dc2626" : "#16a34a"}
                  strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 28}`}
                  strokeDashoffset={`${2 * Math.PI * 28 * (1 - savePrProgress.pct / 100)}`}
                  style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s" }}
                />
              </svg>
              <span className={`text-base font-bold ${savePrProgress.pct < 100 ? "text-red-600" : "text-green-600"}`}>
                {savePrProgress.pct}%
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-700 text-center">{savePrProgress.step}</p>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${savePrProgress.pct < 100 ? "bg-red-500" : "bg-green-500"}`}
                style={{ width: `${savePrProgress.pct}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-400">กรุณารอสักครู่...</p>
          </div>
        </div>,
        document.body
      )}

      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-100 to-pink-100 flex items-center justify-center shadow-sm">
            <FileText size={19} className="text-rose-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-rose-800 leading-none">ระบบ PR</h2>
            <p className="text-[10px] text-rose-400 mt-1">จัดการใบขอซื้อและสถานะการอนุมัติ</p>
          </div>
          <div className="ml-2">
            <ColumnVisibilityToggle tableId="pr" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหา PR ได้ทุกคอลัมน์ (PR, Cost Code, Requestor...)"
              value={prTableSearchText}
              onChange={(e) => setPrTableSearchText(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-300 w-72"
            />
          </div>
          {canUseFunction("pr", "create") && (
            <Button
              className="bg-rose-500 hover:bg-rose-600 text-white shadow-md shadow-rose-100 border-none rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
              onClick={() => {
                setIsModalOpen(true);
                setIsFullScreenModalOpen(true);
                setEditingPRId(null);
                setHeaderData({
                  prNo: "",
                  requestDate: new Date().toISOString().split("T")[0],
                  requestor: userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "",
                  requestorEmail: userData?.email || "",
                  costCode: "",
                  selectedBudgetId: "",
                  selectedSubItemId: "",
                  urgency: "Normal",
                  purchaseType: "",
                  deliveryLocation: "",
                  attachment: null,
                  attachments: [],
                  existingAttachments: [],
                  attachmentUrl: "",
                  attachmentName: "",
                });
                setLineItems([]);
              }}
            >
              <Plus size={16} /> สร้าง PR ใหม่
            </Button>
          )}
        </div>
      </div>
      {/* ── ตารางบนสุด: รายการรอ Action (รอ Approve หรือ รอแก้ไข) ── */}
      {showPendingActionTable && (
        <Card className="overflow-hidden w-full min-w-0 border-t-4 border-t-rose-500">
          <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 flex items-center gap-2">
            <AlertCircle size={15} className="text-rose-700" />
            <h3 className="text-xs font-bold text-rose-900 uppercase tracking-wide">
              PR — รอดำเนินการ (รอ Approve / รอแก้ไข)
            </h3>
          </div>
          <div ref={prTableRef} className="w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
              <thead className="bg-rose-100/60 text-slate-900 uppercase font-semibold">
                <tr>
                  {renderPrHeaderCells()}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {renderPrGroupedTableBody(groupedPrEntriesPending)}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── ตารางกลาง: รายการปกติ (ไม่รอ Action) ── */}
      <Card className="overflow-hidden w-full min-w-0">
        <div ref={prTableRef} className="w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                {renderPrHeaderCells()}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {renderPrGroupedTableBody(groupedPrEntriesMain)}
            </tbody>
          </table>
        </div>
      </Card>

      {showPoIssuedPrTable && (
        <Card className="overflow-hidden w-full min-w-0 border-t-4 border-t-teal-500">
          <div className="px-3 py-2 bg-teal-50 border-b border-teal-200 flex items-center gap-2">
            <ClipboardList size={15} className="text-teal-700" />
            <h3 className="text-xs font-bold text-teal-900 uppercase tracking-wide">
              PR — สถานะ PO Issued (เรียงตามเลข PR · ทุกประเภทรวมกัน)
            </h3>
          </div>
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs text-slate-600 table-fixed md:min-w-0">
              <thead className="bg-teal-100/60 text-slate-900 uppercase font-semibold">
                <tr>
                  {renderPrHeaderCells()}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {renderPrDataRows(flatPoIssuedPrs, "poIssued")}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* PR View Modal — ดูข้อมูล + Approve/Reject */}
      {viewingPR && (() => {
        const prLive = prs.find((p: any) => p.id === viewingPR.id) || viewingPR;
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
              {/* Header */}
              <div className="px-6 py-4 bg-slate-700 rounded-t-2xl flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">ใบขอซื้อ (PR)</h3>
                    <p className="text-slate-300 text-xs mt-0.5">{prLive.prNo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge status={prLive.status} />
                  <button onClick={() => setViewingPR(null)} className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all ml-2">
                    <XCircle size={20} />
                  </button>
                </div>
              </div>

              {/* Edit Budget banner */}
              {prLive.status === "Edit Budget" && prLive.editBudgetReason && (
                <div className="px-6 py-3 bg-red-600 shrink-0 flex items-start gap-3">
                  <AlertCircle size={16} className="text-white mt-0.5 shrink-0" />
                  <div>
                    <p className="text-white font-bold text-sm">⚠️ ต้องการการแก้ไข Budget</p>
                    <p className="text-red-100 text-xs mt-0.5"><span className="font-semibold">เหตุผล:</span> {prLive.editBudgetReason}</p>
                    {prLive.editBudgetBy && <p className="text-red-200 text-[11px] mt-0.5">ส่งคืนโดย: {prLive.editBudgetBy}</p>}
                  </div>
                </div>
              )}

              {/* Reject reason banner */}
              {prLive.status === "Rejected" && prLive.rejectReason && (
                <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 shrink-0 flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-red-700 text-xs"><span className="font-semibold">เหตุผลปฏิเสธ:</span> {prLive.rejectReason}</p>
                </div>
              )}

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {/* PDF Preview — iframe thumbnail ใช้ fresh URL (bypass CDN cache) */}
                {(prLive.pdfUrl || prLive.pdfPath) && (() => {
                  const ready = !!prPdfReadyUrl;
                  return (
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">เอกสาร PDF</span>
                        {!ready && <span className="text-[10px] text-slate-400 animate-pulse">กำลังโหลด...</span>}
                      </div>
                      <div
                        className={`relative w-48 h-64 border rounded-xl overflow-hidden bg-slate-50 shadow-sm transition-all ${ready ? "border-slate-200" : "border-slate-100"}`}
                      >
                        {ready ? (
                          <>
                            <iframe
                              key={prPdfReadyUrl}
                              src={`${prPdfReadyUrl}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                              className="w-full h-full pointer-events-none"
                              title="PR PDF Preview"
                            />
                            {/* Overlay กดเปิดแท็บใหม่ */}
                            <button
                              type="button"
                              onClick={openLatestPrPdf}
                              className="absolute inset-0 w-full h-full flex items-end justify-center pb-3 bg-transparent hover:bg-black/10 transition-colors group"
                              title="คลิกเพื่อเปิด PDF ในแท็บใหม่"
                            >
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 backdrop-blur-sm text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold shadow flex items-center gap-1.5 translate-y-1 group-hover:translate-y-0 transition-transform">
                                <FileOutput size={13} /> เปิดดูเต็มหน้าจอ
                              </span>
                            </button>
                          </>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <div className="text-center">
                              <FileText size={28} className="mx-auto mb-2 opacity-40" />
                              <div className="text-[11px] animate-pulse">กำลังโหลด...</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Info grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  {(() => {
                    // Resolve budget item (ค้นหาจาก budgetId ก่อน แล้ว fallback ด้วย costCode)
                    const headerBudgetItem = prLive.budgetId
                      ? budgets.find((b: any) => b.id === prLive.budgetId && b.projectId === prLive.projectId)
                      : prLive.costCode
                        ? budgets.find((b: any) => b.code === prLive.costCode && b.projectId === prLive.projectId)
                        : null;

                    // ลำดับความสำคัญของ description:
                    // 1) sub-item description (ถ้า PR มี subItemId และ budget มี subItems)
                    // 2) main budget description (fallback)
                    const resolveSubDesc = (): string => {
                      // prPayload spread จาก headerWithoutFile → มี selectedSubItemId ที่ root level
                      // items[0].subItemId / items[0].budgetSubItemId → fallback สำหรับ PR เก่า
                      const subItemId = prLive.selectedSubItemId || prLive.subItemId
                        || (prLive.items?.[0]?.subItemId) || (prLive.items?.[0]?.budgetSubItemId);
                      if (subItemId && headerBudgetItem?.subItems?.length > 0) {
                        const sub = headerBudgetItem.subItems.find((s: any) => s.id === subItemId);
                        if (sub?.description) return sub.description;
                      }
                      return headerBudgetItem?.description || "";
                    };
                    const subDesc = resolveSubDesc();
                    const costCodeDisplay = prLive.costCode
                      ? `${prLive.costCode}${subDesc ? ` ${subDesc}` : ""}`
                      : "";
                    const combinedRemark = (prLive.items || []).map((i: any) => i.note).filter(Boolean).join(", ");

                    return [
                      { label: "PR No.", value: prLive.prNo },
                      { label: "วันที่", value: prLive.requestDate },
                      { label: "ผู้ขอซื้อ", value: prLive.requestor },
                      { label: "Cost Code", value: costCodeDisplay },
                      { label: "ประเภท", value: getPurchaseTypeDisplayLabel(prLive.purchaseType) },
                      { label: "ความเร่งด่วน", value: prLive.urgency || "-" },
                      { label: "สถานที่รับของ", value: prLive.deliveryLocation || "-" },
                      { label: "Email", value: prLive.requestorEmail || "-" },
                      { label: "หมายเหตุ", value: combinedRemark || "-" },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
                        <p className="font-semibold text-slate-700 truncate" title={value}>{value || "-"}</p>
                      </div>
                    ));
                  })()}
                </div>

                {/* Attachments Section - Combined Budget & PR Attachments */}
                {(() => {
                  // Get budget attachments
                  const budgetItem = prLive.budgetId
                    ? budgets.find(b => b.id === prLive.budgetId && b.projectId === prLive.projectId)
                    : prLive.costCode
                      ? budgets.find(b => b.code === prLive.costCode && b.projectId === prLive.projectId)
                      : null;

                  const budgetAttachments: { url: string; name: string }[] = budgetItem?.attachments || [];
                  const subItemAttachments: { url: string; name: string }[] = [];

                  // Get sub-item attachments if applicable
                  if (budgetItem?.subItems && prLive.items?.length > 0) {
                    const firstItem = prLive.items[0];
                    if (firstItem.subItemId || firstItem.budgetSubItemId) {
                      const subItemId = firstItem.subItemId || firstItem.budgetSubItemId;
                      const subItem = budgetItem.subItems.find(s => s.id === subItemId);
                      if (subItem?.attachments) {
                        subItemAttachments.push(...subItem.attachments);
                      }
                    }
                  }

                  const allBudgetAttachments = [...budgetAttachments, ...subItemAttachments];
                  const hasBudgetAttachments = allBudgetAttachments.length > 0;
                  const prAttachmentsList: { url: string; name: string }[] = prLive.attachments?.length > 0 
                    ? prLive.attachments 
                    : (prLive.attachmentUrl ? [{ url: prLive.attachmentUrl, name: prLive.attachmentName || "ไฟล์แนบจาก PR" }] : []);
                  const hasPrAttachments = prAttachmentsList.length > 0;

                  if (!hasBudgetAttachments && !hasPrAttachments) return null;

                  return (
                    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
                        <Paperclip size={11} /> ไฟล์แนบทั้งหมด ({allBudgetAttachments.length + prAttachmentsList.length} ไฟล์)
                      </p>
                      <div className="space-y-1">
                        {/* Budget Attachments */}
                        {hasBudgetAttachments && allBudgetAttachments.map((att, idx) => (
                          <div key={`budget-${idx}`} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400">•</span>
                            <span className="text-[9px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">งบประมาณ</span>
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                              title={att.name}
                            >
                              {att.name || `ไฟล์แนบ ${idx + 1}`}
                            </a>
                          </div>
                        ))}

                        {/* PR Attachments */}
                        {hasPrAttachments && prAttachmentsList.map((att, idx) => (
                          <div key={`pr-att-${idx}`} className="flex items-center gap-1.5 text-[11px]">
                            <span className="text-slate-400">•</span>
                            <span className="text-[9px] px-1 py-0.5 bg-green-100 text-green-700 rounded font-medium">PR</span>
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-green-600 hover:text-green-800 hover:underline truncate"
                              title={att.name}
                            >
                              {att.name || `ไฟล์แนบจาก PR ${idx + 1}`}
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Line Items */}
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100 px-4 py-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">รายการสินค้า</span>
                    <span className="bg-slate-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{prLive.items?.length || 0} รายการ</span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 w-8 text-center">#</th>
                        <th className="px-3 py-2">รายการ</th>
                        <th className="px-3 py-2 text-right">จำนวน</th>
                        <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                        <th className="px-3 py-2 text-right">รวม</th>
                        <th className="px-3 py-2 text-center">วันที่ใช้</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(prLive.items || []).map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-3 py-1.5 text-center text-slate-400">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-medium text-slate-700">{it.description}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{it.quantity} {it.unit}</td>
                          <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(it.price)}</td>
                          <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{formatCurrency(it.amount ?? (it.quantity * it.price))}</td>
                          <td className="px-3 py-1.5 text-center text-slate-400">{it.requiredDate || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-800">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-white">ยอดรวมทั้งสิ้น:</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-white">{formatCurrency(prLive.totalAmount || prLive.amount)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {Array.isArray(prLive.budgetReturnRevisions) && prLive.budgetReturnRevisions.length > 0 && (
                  <div className="rounded-xl border border-emerald-200 overflow-hidden bg-emerald-50/40">
                    <div className="bg-emerald-100 px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">ประวัติคืน Balance PR กลับ Budget</span>
                      <span className="bg-white text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-emerald-200">
                        {prLive.budgetReturnRevisions.length} Rev
                      </span>
                    </div>
                    <table className="w-full text-xs text-left">
                      <thead className="bg-white/70 text-emerald-900 font-semibold border-b border-emerald-100">
                        <tr>
                          <th className="px-3 py-2">Rev</th>
                          <th className="px-3 py-2">วันที่</th>
                          <th className="px-3 py-2 text-right">ยอดเดิม</th>
                          <th className="px-3 py-2 text-right">PO Sub Total</th>
                          <th className="px-3 py-2 text-right">คืน Budget</th>
                          <th className="px-3 py-2 text-right">ยอด PR ใหม่</th>
                          <th className="px-3 py-2">ผู้ทำรายการ</th>
                          {userRoles.includes("Administrator") && <th className="px-3 py-2 text-center">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-emerald-100 bg-white/60">
                        {[...prLive.budgetReturnRevisions].sort((a, b) => Number(b.revNo || 0) - Number(a.revNo || 0)).map((rev) => (
                          <tr key={`${rev.revNo}-${rev.at}`} className="hover:bg-emerald-50">
                            <td className="px-3 py-1.5 font-bold text-emerald-800">Rev {rev.revNo}</td>
                            <td className="px-3 py-1.5 text-slate-500 whitespace-nowrap">
                              {rev.at ? new Date(rev.at).toLocaleString("th-TH") : "-"}
                            </td>
                            <td className="px-3 py-1.5 text-right">{formatCurrency(rev.oldTotalAmount)}</td>
                            <td className="px-3 py-1.5 text-right">{formatCurrency(rev.poGrandTotalUsed)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-emerald-700">{formatCurrency(rev.returnedAmount)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(rev.newTotalAmount)}</td>
                            <td className="px-3 py-1.5 text-slate-600" title={rev.by}>{rev.by || "-"}</td>
                            {userRoles.includes("Administrator") && (
                              <td className="px-3 py-1.5 text-center">
                                <button
                                  type="button"
                                  className="p-1.5 rounded-md text-red-600 hover:bg-red-50"
                                  title="ลบ Rev และย้อน PR กลับก่อน Rev นี้"
                                  onClick={() => handleDeletePrBudgetReturnRevision(prLive, rev)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Footer — ปุ่ม Approve/Reject ตาม Role */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between gap-2 shrink-0">
                <button onClick={() => setViewingPR(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2">
                  <XCircle size={15} /> ปิด
                </button>
                <div className="flex items-center gap-2">
                  {canReturnPrBalance && (() => {
                    const info = getPrBudgetReturnInfo(prLive, pos);
                    if (info.returnAmount <= 0) return null;
                    return (
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => handleReturnPrBalanceToBudget(prLive)}>
                        คืน Balance
                      </Button>
                    );
                  })()}
                  {canApprovePR && (userRoles.includes("CM") || userRoles.includes("PM") || userRoles.includes("Administrator")) && prLive.status === "Pending CM" && !isPrApproveInFlight(prLive) && (
                    <>
                      {canRejectPR && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(prLive.id, "reject"); }}>Reject</Button>}
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(prLive.id, "approve"); setViewingPR(null); }}>CM Approve</Button>
                    </>
                  )}
                  {canApprovePR && (userRoles.includes("PM") || userRoles.includes("Administrator")) && prLive.status === "Pending PM" && !isPrApproveInFlight(prLive) && (
                    <>
                      {canRejectPR && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(prLive.id, "reject"); }}>Reject</Button>}
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(prLive.id, "approve"); setViewingPR(null); }}>PM Approve</Button>
                    </>
                  )}
                  {canApprovePR && (userRoles.includes("GM") || userRoles.includes("Administrator")) && prLive.status === "Pending GM" && !isPrApproveInFlight(prLive) && (
                    <>
                      {canRejectPR && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(prLive.id, "reject"); }}>Reject</Button>}
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(prLive.id, "approve"); setViewingPR(null); }}>GM Approve</Button>
                    </>
                  )}
                  {canApprovePR && (userRoles.includes("MD") || userRoles.includes("Administrator")) && prLive.status === "Pending MD" && !isPrApproveInFlight(prLive) && (
                    <>
                      {canRejectPR && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setViewingPR(null); handleAction(prLive.id, "reject"); }}>Reject</Button>}
                      <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(prLive.id, "approve"); setViewingPR(null); }}>MD Approve</Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {isPrRejectModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 text-red-600">
              ปฏิเสธ PR (Reject PR)
            </h3>
            <p className="text-sm text-slate-600 mb-3">
              PR No.: <span className="font-semibold text-slate-800">{selectedPrForReject?.prNo}</span>
            </p>
            <InputGroup label="เหตุผลที่ปฏิเสธ (Reject Reason)">
              <textarea
                className="w-full border rounded p-2 h-24"
                placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ..."
                value={prRejectReason}
                onChange={(e) => setPrRejectReason(e.target.value)}
              />
            </InputGroup>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="secondary"
                onClick={() => setIsPrRejectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleRejectPrConfirm}
                disabled={!prRejectReason.trim()}
              >
                ยืนยันปฏิเสธ
              </Button>
            </div>
          </Card>
        </div>
      )}
      {/* Modal Edit Budget — กรอกเหตุผลให้แก้ไข */}
      {isEditBudgetModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010]">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 p-6 w-full max-w-md mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">ส่งคืนให้แก้ไข Budget</h3>
                <p className="text-xs text-slate-500 mt-0.5">PR: <span className="font-semibold text-slate-700">{selectedPrForEditBudget?.prNo}</span></p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-700">
              PR จะถูกเปลี่ยนสถานะเป็น <span className="font-bold">Edit Budget</span> และผู้เปิด PR ต้องแก้ไขและส่งอนุมัติใหม่
            </div>
            <label className="block text-xs font-bold text-slate-600 mb-1.5">เหตุผลที่ต้องแก้ไข <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
              rows={4}
              placeholder="ระบุเหตุผลที่ต้องการให้แก้ไข Budget..."
              value={editBudgetReason}
              onChange={(e) => setEditBudgetReason(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => { setIsEditBudgetModalOpen(false); setEditBudgetReason(""); setSelectedPrForEditBudget(null); }}>
                ยกเลิก
              </Button>
              <button
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
                disabled={!editBudgetReason.trim()}
                onClick={handleEditBudgetConfirm}
              >
                ยืนยัน Edit Budget
              </button>
            </div>
          </div>
        </div>
      )}
      {isReturnBalanceModalOpen && (() => {
        const latestPr = prs.find((p: any) => p.id === returnBalanceContext?.prId);
        const latestInfo = latestPr ? getPrBudgetReturnInfo(latestPr, pos) : null;
        const maxReturn = Math.max(0, Math.round(Number(latestInfo?.returnAmount || 0) * 100) / 100);
        const requested = Math.round(parseReturnBalanceInput(returnBalanceValue) * 100) / 100;
        const isRequestedValid = Number.isFinite(requested) && requested > 0 && requested <= maxReturn;
        return (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[10011] p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-emerald-200 p-6 w-full max-w-md">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Wallet size={19} className="text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">ยืนยันคืน Balance PR</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    PR: <span className="font-semibold text-slate-700">{latestPr?.prNo || latestPr?.id || "-"}</span>
                  </p>
                </div>
              </div>

              {latestInfo ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-xs text-slate-700 space-y-1.5 mb-4">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">ยอด PR ปัจจุบัน</span>
                    <span className="font-semibold">{formatCurrency(latestInfo.currentTotal)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">PO Sub Total ที่ใช้ไปแล้ว</span>
                    <span className="font-semibold">{formatCurrency(latestInfo.poSubTotalUsed ?? latestInfo.poGrandTotalUsed)}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Balance คืนได้สูงสุด</span>
                    <span className="font-bold text-emerald-700">{formatCurrency(maxReturn)}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 mb-4">
                  ไม่พบข้อมูล PR ล่าสุด กรุณาปิดแล้วลองใหม่
                </div>
              )}

              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                ยอดเงินที่จะคืนเข้า Budget <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={returnBalanceValue}
                onChange={(e) => setReturnBalanceValue(normalizeReturnBalanceInput(e.target.value))}
                onBlur={() => {
                  const n = parseReturnBalanceInput(returnBalanceValue);
                  if (Number.isFinite(n)) setReturnBalanceValue(formatReturnBalanceFixed2(n));
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-lg font-extrabold text-red-600 focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                placeholder="0.00"
                autoFocus
              />
              <p className={`mt-1.5 text-[11px] ${isRequestedValid ? "text-emerald-700" : "text-slate-500"}`}>
                {isRequestedValid
                  ? `ยอด PR หลัง Rev: ${formatCurrency(Math.max(0, Number(latestInfo?.currentTotal || 0) - requested))}`
                  : `กรอกจำนวนมากกว่า 0 และไม่เกิน ${formatCurrency(maxReturn)}`}
              </p>
              <label className="block text-xs font-bold text-slate-600 mt-3 mb-1.5">
                เหตุผลการคืน Budget <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                value={returnBalanceReason}
                onChange={(e) => setReturnBalanceReason(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                placeholder="ระบุเหตุผลที่ต้องคืนยอดจาก PR รายการนี้..."
              />

              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsReturnBalanceModalOpen(false);
                    setReturnBalanceContext(null);
                    setReturnBalanceValue("");
                    setReturnBalanceReason("");
                  }}
                >
                  ยกเลิก
                </Button>
                <button
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50"
                  disabled={!latestPr || maxReturn <= 0 || !isRequestedValid || !String(returnBalanceReason || "").trim()}
                  onClick={handleConfirmReturnBalance}
                >
                  ยืนยันคืนยอด
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal สร้าง/แก้ไข PR — ทับ Header, เต็มความสูง, Footer เลื่อนตามเนื้อหา */}
      {isModalOpen && (
        <motion.div
          className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[10010] p-3 sm:p-5"
          initial="hidden"
          animate="visible"
          variants={modalOverlayVariants}
          transition={overlayTransition}
        >
          <motion.div
            className="w-full max-w-5xl xl:max-w-[1040px] max-h-[88vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            initial="hidden"
            animate="visible"
            variants={modalContentVariants}
            transition={modalTransition}
          >
            {/* Sticky Header - โทนอ่อนใช้งานภายในองค์กร */}
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-600 shrink-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-500 rounded-lg flex items-center justify-center">
                    <ClipboardList size={22} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-wide">
                      {editingPRId
                        ? "แก้ไขใบขอซื้อ (Edit PR)"
                        : "สร้างใบขอซื้อ (Create PR)"}
                    </h3>
                    <p className="text-slate-300 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบขอซื้อ</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setIsFullScreenModalOpen(false);
                  }}
                  className="text-slate-300 hover:text-white hover:bg-slate-500 p-2 rounded-lg transition-all duration-200"
                >
                  <XCircle size={22} />
                </button>
              </div>
            </div>

            {/* Banner แสดงเหตุผล Edit Budget */}
            {editingPRId && (() => {
              const pr = prs.find(p => p.id === editingPRId); return pr?.status === "Edit Budget" ? (
                <div className="px-6 py-3 bg-red-600 shrink-0 flex items-start gap-3">
                  <AlertCircle size={18} className="text-white mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm">⚠️ PR นี้ต้องการการแก้ไข Budget</p>
                    <p className="text-red-100 text-xs mt-0.5">
                      <span className="font-semibold">เหตุผล:</span> {pr.editBudgetReason || "-"}
                    </p>
                    {pr.editBudgetBy && (
                      <p className="text-red-200 text-[11px] mt-0.5">
                        ส่งคืนโดย: <span className="font-semibold">{pr.editBudgetBy}</span>
                        {pr.editBudgetAt && ` · ${new Date(pr.editBudgetAt).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                      </p>
                    )}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/50">
              {/* Header Fields - Section 1: ข้อมูลใบขอซื้อ */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                  <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                    <FileText size={13} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">ข้อมูลใบขอซื้อ</span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-4">
                    {/* Row 1: PR No. / ประเภท / Sub-Code */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <Hash size={11} className="text-slate-500" /> PR No.
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700 font-mono font-semibold"
                        value={headerData.prNo}
                        readOnly
                        placeholder="(auto)"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <Tag size={11} className="text-slate-500" /> ประเภทการขอซื้อ
                      </label>
                      <select
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                        value={headerData.purchaseType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          const codes = PURCHASE_TYPE_CODES[newType] || [];
                          const isEquipment = newType === PURCHASE_TYPE_EQUIPMENT;
                          const isRental = newType === PURCHASE_TYPE_RENTAL_LABEL;
                          const autoCode = codes.length === 1 && !isRental ? codes[0] : "";
                          const newSubCode = isEquipment || isRental ? "" : autoCode;
                          const newPrNo = (isEquipment || isRental) ? generatePrNo("", newType) : (newSubCode ? generatePrNo(newSubCode, newType) : "");
                          setHeaderData({
                            ...headerData,
                            purchaseType: newType,
                            subCode: newSubCode,
                            prNo: newPrNo,
                          });
                        }}
                      >
                        <option value="">-- เลือกประเภท --</option>
                        {PURCHASE_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {getPurchaseTypeDisplayLabel(t)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {headerData.purchaseType && headerData.purchaseType !== PURCHASE_TYPE_EQUIPMENT && headerData.purchaseType !== PURCHASE_TYPE_RENTAL_LABEL && (PURCHASE_TYPE_CODES[headerData.purchaseType] || []).length > 1 && (
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <CircleDot size={11} className="text-slate-500" />
                          Sub-Code
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                          value={headerData.subCode}
                          onChange={(e) => {
                            const newSubCode = e.target.value;
                            const newPrNo = generatePrNo(newSubCode, headerData.purchaseType);
                            setHeaderData({
                              ...headerData,
                              subCode: newSubCode,
                              prNo: newPrNo,
                            });
                          }}
                        >
                          <option value="">-- เลือก --</option>
                          {(PURCHASE_TYPE_CODES[headerData.purchaseType] || []).map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Row 2: ผู้ขอซื้อ / อีเมล / สถานที่จัดส่ง */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <UserCircle size={11} className="text-slate-500" /> ผู้ขอซื้อ
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={headerData.requestor}
                          onChange={(e) =>
                            setHeaderData({
                              ...headerData,
                              requestor: e.target.value,
                            })
                          }
                        />
                        <UserCircle className="absolute left-3 top-2.5 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <AtSign size={11} className="text-slate-500" /> อีเมลผู้ขอซื้อ
                      </label>
                      <div className="relative">
                        <input
                          type="email"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={headerData.requestorEmail}
                          onChange={(e) =>
                            setHeaderData({
                              ...headerData,
                              requestorEmail: e.target.value,
                            })
                          }
                          placeholder="example@cmg.co.th"
                        />
                        <Mail className="absolute left-3 top-2.5 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <Building2 size={11} className="text-slate-500" /> สถานที่จัดส่ง
                      </label>
                      <div className="relative">
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                          value={headerData.deliveryLocation}
                          onChange={(e) =>
                            setHeaderData({
                              ...headerData,
                              deliveryLocation: e.target.value,
                            })
                          }
                        >
                          <option value="">-- เลือกสถานที่ --</option>
                          {DELIVERY_LOCATIONS.map((l) => (
                            <option key={l} value={l}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <MapPinned className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={14} />
                      </div>
                    </div>

                    {/* Row 3: วันที่ขอซื้อ / ความเร่งด่วน / แนบไฟล์ */}
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <Calendar size={11} className="text-slate-500" /> วันที่ขอซื้อ
                      </label>
                      <div className="relative">
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={headerData.requestDate}
                          onChange={(e) =>
                            setHeaderData({
                              ...headerData,
                              requestDate: e.target.value,
                            })
                          }
                        />
                        <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                      </div>
                    </div>
                    <div className="col-span-2 flex items-end pb-1">
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                          <Zap size={11} className="text-slate-500" /> ความเร่งด่วน
                        </label>
                        <div className="flex gap-2">
                          <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Normal" ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                            <input
                              type="radio"
                              name="urgency"
                              value="Normal"
                              checked={headerData.urgency === "Normal"}
                              onChange={(e) =>
                                setHeaderData({
                                  ...headerData,
                                  urgency: e.target.value,
                                })
                              }
                              className="hidden"
                            />
                            <CircleDot size={13} className={headerData.urgency === "Normal" ? "text-slate-600" : "text-slate-400"} />
                            <span className={`text-xs font-medium ${headerData.urgency === "Normal" ? "text-slate-700" : "text-slate-500"}`}>ปกติ</span>
                          </label>
                          <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Urgent" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                            <input
                              type="radio"
                              name="urgency"
                              value="Urgent"
                              checked={headerData.urgency === "Urgent"}
                              onChange={(e) =>
                                setHeaderData({
                                  ...headerData,
                                  urgency: e.target.value,
                                })
                              }
                              className="hidden"
                            />
                            <Flame size={13} className={headerData.urgency === "Urgent" ? "text-red-500" : "text-slate-400"} />
                            <span className={`text-xs font-semibold ${headerData.urgency === "Urgent" ? "text-red-600" : "text-slate-500"}`}>ด่วน</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <Paperclip size={11} className="text-slate-500" /> แนบไฟล์
                      </label>
                      <div className="flex items-center gap-3 w-full border border-dashed border-slate-200 rounded-lg px-4 py-2 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50 transition-all duration-200 group cursor-pointer">
                        <div className="w-8 h-8 bg-slate-200 group-hover:bg-slate-300 rounded-md flex items-center justify-center transition-colors">
                          <Upload size={14} className="text-slate-500 group-hover:text-slate-600 transition-colors" />
                        </div>
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          id="pr-attachment"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length > 0) {
                              setHeaderData({ ...headerData, attachments: files, attachment: null });
                            }
                          }}
                        />
                        <label
                          htmlFor="pr-attachment"
                          className="flex-1 text-xs text-slate-600 cursor-pointer"
                        >
                          {headerData.attachments && headerData.attachments.length > 0
                            ? `เลือกแล้ว ${headerData.attachments.length} ไฟล์ (${headerData.attachments.map(f => f.name).join(", ")})`
                            : headerData.attachment
                              ? (headerData.attachment as File).name
                              : (headerData.existingAttachments?.length || 0) > 0 || headerData.attachmentUrl
                                ? `มีไฟล์แนบอยู่แล้ว (${headerData.existingAttachments?.length || 1} ไฟล์) - คลิกเพื่อเพิ่ม/เปลี่ยน`
                                : "คลิกเพื่อเลือกไฟล์แนบ (แนบได้หลายไฟล์)"}
                        </label>
                        {headerData.attachmentUrl && !headerData.attachment && (!headerData.attachments || headerData.attachments.length === 0) && (
                          <a href={headerData.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline ml-1" onClick={(e) => e.stopPropagation()}>เปิดไฟล์เดิม</a>
                        )}
                      </div>
                      {(() => {
                        const selBudget = availableBudgets.find(b => b.id === headerData.selectedBudgetId);
                        const selSubItem = selBudget?.subItems?.find((si: any) => si.id === headerData.selectedSubItemId);
                        const budgetAtts: { url: string; name: string }[] = selBudget?.attachments || [];
                        const subItemAtts: { url: string; name: string }[] = selSubItem?.attachments || [];
                        const allAtts = [...budgetAtts, ...subItemAtts];
                        if (allAtts.length === 0) return null;
                        return (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                              <Paperclip size={10} /> ไฟล์แนบจากงบประมาณที่เลือก
                            </p>
                            <div className="flex flex-col gap-1">
                              {allAtts.map((att, idx) => (
                                <a
                                  key={idx}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 text-xs text-blue-600 hover:text-blue-800 hover:underline bg-blue-50 border border-blue-100 rounded px-3 py-1.5"
                                >
                                  <Paperclip size={11} className="shrink-0 text-blue-400" />
                                  <span className="truncate">{att.name || `ไฟล์แนบ ${idx + 1}`}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Header Fields - Section 2: เลือกรายการที่ Approve */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                  <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                    <Settings size={13} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                    เลือกรายการที่ Approve
                  </span>
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-4">
                    <div className="col-span-1 md:col-span-2 lg:col-span-2">
                      <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                        <DollarSign size={11} className="text-slate-500" /> Cost Code
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          className="w-full border border-dashed border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm bg-slate-50 cursor-pointer font-medium text-slate-700 hover:border-slate-400 transition-all duration-200"
                          value={
                            headerData.costCode ? (() => {
                              return headerData.costCode;
                            })() : ""
                          }
                          placeholder="คลิกเพื่อเลือก"
                          readOnly
                          onClick={() => {
                            if (!editingPRId) {
                              setBudgetSearchText("");
                              setIsCostCodeModalOpen(true);
                            }
                          }}
                          disabled={!!editingPRId}
                        />
                        <ListFilter className="absolute right-3 top-2.5 text-slate-500" size={14} />
                      </div>
                      {headerData.costCode && (
                        <>
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mt-3 mb-1.5 uppercase tracking-wider">
                            <ClipboardList size={11} className="text-slate-500" /> รายการ (Main Description)
                          </label>
                          <input
                            type="text"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 font-medium"
                            readOnly
                            disabled={!!editingPRId}
                            value={
                              headerData.costCode ? (() => {
                                const selectedBudget = headerData.selectedBudgetId
                                  ? availableBudgets.find((b) => b.id === headerData.selectedBudgetId)
                                  : availableBudgets.find((b) => b.code === headerData.costCode);
                                return selectedBudget?.description || "";
                              })() : ""
                            }
                            placeholder="(เลือก Budget Approve แล้วจะแสดง)"
                          />
                        </>
                      )}
                      {headerData.costCode && (() => {
                        const selectedBudget = headerData.selectedBudgetId
                          ? availableBudgets.find((b) => b.id === headerData.selectedBudgetId)
                          : availableBudgets.find((b) => b.code === headerData.costCode);
                        if (!selectedBudget) return null;

                        // คำนวณยอดคงเหลือ: ถ้ามี sub-items ให้ใช้ยอดคงเหลือของ sub-item ที่เลือก
                        const hasSubItems = selectedBudget.subItems && selectedBudget.subItems.length > 0;
                        let balance = selectedBudget.remainingBalance;
                        let label = "คงเหลือ";

                        // หา sub-item ที่ตรงกับ selectedSubItemId ก่อน ถ้าไม่มีให้หาจาก lineItems
                        const resolvedSubId = headerData.selectedSubItemId ||
                          (lineItems.length > 0 && lineItems[0].subItemId ? lineItems[0].subItemId : "");

                        if (hasSubItems) {
                          const sub = resolvedSubId
                            ? selectedBudget.subItems.find(s => s.id === resolvedSubId)
                            : selectedBudget.subItems.find(s => s.status === "Approved");
                          if (sub) {
                            const subUsed = prs
                              .filter(p => p.projectId === selectedProjectId && p.costCode === selectedBudget.code && p.status !== 'Rejected' && p.id !== editingPRId)
                              .reduce((sum, p) => {
                                const matchItems = (p.items || []).filter(i => {
                                  // Only match items that have proper sub-item IDs to avoid counting legacy records incorrectly
                                  if (sub.id && (i.subItemId === sub.id || i.budgetSubItemId === sub.id)) {
                                    return true;
                                  }
                                  // For legacy records without subItemId, only match if this is the only sub-item with this exact description
                                  // and the PR was created before sub-item system (no subItemId on any items)
                                  if (!i.subItemId && !i.budgetSubItemId && i.description?.trim() === sub.description?.trim()) {
                                    // Check if this PR has any items with subItemId - if yes, it's not a legacy PR
                                    const hasAnySubItemId = (p.items || []).some(item => item.subItemId || item.budgetSubItemId);
                                    return !hasAnySubItemId;
                                  }
                                  return false;
                                });
                                return sum + matchItems.reduce((s, i) => s + (i.quantity * i.price), 0);
                              }, 0);
                            const currentFormUsed = lineItems
                              .filter(i => i.subItemId === sub.id || i.budgetSubItemId === sub.id)
                              .reduce((s, i) => s + (i.quantity * i.price), 0);
                            balance = sub.amount - subUsed - currentFormUsed;
                            label = `คงเหลือ (${sub.description})`;
                          }
                        }

                        return (
                          <div className={`flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg w-fit ml-auto ${balance < 0 ? "bg-red-50" : "bg-slate-100"}`}>
                            <Wallet size={10} className={balance < 0 ? "text-red-500" : "text-slate-500"} />
                            <span className={`text-[10px] font-semibold ${balance < 0 ? "text-red-600" : "text-slate-600"}`}>
                              {label}:{" "}
                              {formatCurrency(balance)}
                            </span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Line Items Entry */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                  <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                    <ShoppingCart size={13} className="text-white" />
                  </div>
                  <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                    {editingItemId ? "แก้ไขรายการสินค้า" : "เพิ่มรายการสินค้า"}
                  </span>
                  {editingItemId && (
                    <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-medium rounded">กำลังแก้ไข</span>
                  )}
                </div>
                <div className="p-5">
                  <div className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end">
                    <div className="col-span-2 md:col-span-4">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <Package size={10} className="text-slate-500" /> รายละเอียดสินค้า
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all placeholder:text-slate-400"
                        placeholder="ชื่อสินค้า/บริการ"
                        value={newItem.description}
                        onChange={(e) =>
                          setNewItem({ ...newItem, description: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-2 md:col-span-3">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <FileText size={10} className="text-slate-500" /> หมายเหตุ
                      </label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all placeholder:text-slate-400"
                        placeholder="(ไม่บังคับ)"
                        value={newItem.note || ""}
                        onChange={(e) =>
                          setNewItem({ ...newItem, note: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">หน่วย</label>
                      <input
                        type="text"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                        value={newItem.unit}
                        onChange={(e) =>
                          setNewItem({ ...newItem, unit: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">จำนวน</label>
                      <input
                        type="number"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                        value={newItem.quantity}
                        onChange={(e) =>
                          setNewItem({
                            ...newItem,
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <DollarSign size={10} className="text-slate-500" /> ราคา/หน่วย
                      </label>
                      <input
                        type="number"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                        value={newItem.price}
                        onChange={(e) =>
                          setNewItem({
                            ...newItem,
                            price: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                        <Calendar size={10} className="text-slate-500" /> วันที่ใช้
                      </label>
                      <input
                        type="date"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                        value={newItem.requiredDate}
                        onChange={(e) =>
                          setNewItem({ ...newItem, requiredDate: e.target.value })
                        }
                      />
                    </div>
                    <div className="col-span-2 md:col-span-2">
                      <Button
                        onClick={handleAddItem}
                        variant={editingItemId ? "warning" : "primary"}
                        className="w-full justify-center h-[38px] text-xs rounded-lg transition-all"
                      >
                        {editingItemId ? <Save size={14} /> : <Plus size={14} />}{" "}
                        {editingItemId ? "บันทึก" : "เพิ่ม"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto flex-1">
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <FileSpreadsheet size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">รายการสินค้า</span>
                  </div>
                  {lineItems.length > 0 && (
                    <span className="px-2.5 py-0.5 bg-slate-600 text-white text-[10px] font-medium rounded">{lineItems.length} รายการ</span>
                  )}
                </div>
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4 w-10 text-center">#</th>
                      <th className="py-2.5 px-4">รายละเอียด</th>
                      <th className="py-2.5 px-4">หมายเหตุ</th>
                      <th className="py-2.5 px-4 text-center">หน่วย</th>
                      <th className="py-2.5 px-4 text-right">จำนวน</th>
                      <th className="py-2.5 px-4 text-right">ราคา/หน่วย</th>
                      <th className="py-2.5 px-4 text-right">รวม</th>
                      <th className="py-2.5 px-4">วันที่ใช้</th>
                      <th className="py-2.5 px-4 text-center">เครื่องมือ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lineItems.length === 0 && (
                      <tr>
                        <td colSpan="8" className="py-10 text-center">
                          <div className="flex flex-col items-center gap-2 text-slate-300">
                            <ShoppingCart size={32} />
                            <span className="text-sm font-medium">ยังไม่มีรายการสินค้า</span>
                            <span className="text-xs">เพิ่มรายการสินค้าด้านบน</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {lineItems.map((item, index) => (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50 transition-all duration-150 ${editingItemId === item.id ? "bg-slate-100 border-l-4 border-l-slate-400" : ""
                          }`}
                      >
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 rounded-full text-[11px] font-bold text-slate-600">{index + 1}</span>
                        </td>
                        <td className="py-2.5 px-4 font-semibold text-slate-800">{item.description}</td>
                        <td className="py-2.5 px-4 text-slate-500">{item.note || "-"}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-medium">{item.unit}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-medium">{item.quantity}</td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {formatCurrency(item.price)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-bold text-slate-800">
                          {formatCurrency(item.quantity * item.price)}
                        </td>
                        <td className="py-2.5 px-4">
                          <span className="flex items-center gap-1 text-slate-500">
                            <Calendar size={11} className="text-slate-400" />
                            {item.requiredDate}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => handleEditItem(item)}
                              className="text-slate-600 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition-all"
                              title="แก้ไข"
                            >
                              <Edit size={13} />
                            </button>
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-red-500 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-all"
                              title="ลบ"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {lineItems.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-600">
                        <td colSpan="6" className="py-3 px-4 text-right text-xs text-slate-200 font-medium">
                          ยอดรวมทั้งสิ้น (Total Amount):
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="text-sm font-bold text-white tracking-wide">{formatCurrency(calculateTotal())}</span>
                        </td>
                        <td colSpan="2"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {/* Footer — เลื่อนตามเนื้อหา ไม่ freeze */}
              <div className="mt-4 pb-6 flex justify-between items-center px-6 py-3.5 border border-slate-200 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Info size={13} />
                  <span>กรุณากรอกข้อมูลให้ครบถ้วนก่อนบันทึก</span>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="px-5 rounded-lg"
                  >
                    <XCircle size={15} /> ยกเลิก
                  </Button>
                  <Button
                    onClick={handleSavePR}
                    className="px-8 rounded-lg bg-slate-600 hover:bg-slate-700 text-white transition-all"
                  >
                    <Save size={16} /> บันทึก PR
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* V.19: Cost Code Selection Modal */}
      {isCostCodeModalOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010]"
          initial="hidden"
          animate="visible"
          variants={modalOverlayVariants}
          transition={overlayTransition}
        >
          <motion.div
            className="w-full max-w-5xl p-6 max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
            initial="hidden"
            animate="visible"
            variants={modalContentVariants}
            transition={modalTransition}
          >
            <div className="flex justify-between items-center gap-3 mb-4 pb-2 border-b flex-wrap">
              <h3 className="text-lg font-bold text-slate-800">
                เลือกรายการงบประมาณ (Approved Budgets)
              </h3>
              <input
                type="text"
                placeholder="ค้นหา Cost Code, รายการ..."
                value={budgetSearchText}
                onChange={(e) => setBudgetSearchText(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm w-56 focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400"
              />
              <button
                onClick={() => setIsCostCodeModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2">
              {Object.keys(groupedBudgets).length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  ไม่พบรายการงบประมาณที่อนุมัติแล้ว หรือ งบประมาณหมด
                </div>
              ) : Object.keys(groupedBudgetsFiltered).length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  ไม่พบรายการที่ตรงกับคำค้น
                </div>
              ) : (
                Object.keys(groupedBudgetsFiltered)
                  .sort()
                  .map((cat, idx) => (
                    <motion.div
                      key={cat}
                      className="mb-6"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04, duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      <h4 className="text-xs font-bold text-white bg-slate-600 px-3 py-1 rounded-t-md sticky top-0 z-10 shadow-sm flex items-center justify-between">
                        <span>
                          หมวด {cat}: {COST_CATEGORIES[cat]}
                        </span>
                        <span className="bg-slate-500 text-xs px-2 py-0.5 rounded-full">
                          {groupedBudgetsFiltered[cat].length} รายการ
                        </span>
                      </h4>
                      <div className="border border-slate-200 border-t-0 rounded-b-md overflow-hidden">
                        <table className="w-full table-fixed text-left text-xs">
                          <colgroup>
                            <col className="w-[19%]" />
                            <col className="w-[37%]" />
                            <col className="w-[14%]" />
                            <col className="w-[14%]" />
                            <col className="w-[16%]" />
                          </colgroup>
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                            <tr>
                              <th className="py-1.5 px-3">Cost Code</th>
                              <th className="py-1.5 px-3">รายการ</th>
                              <th className="py-1.5 px-3 text-right">Budget</th>
                              <th className="py-1.5 px-3 text-right text-orange-600">
                                Used
                              </th>
                              <th className="py-1.5 px-3 text-right text-green-600">
                                Balance
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {groupedBudgetsFiltered[cat].map((b) => {
                              // เฉพาะ sub-items ที่อนุมัติแล้วและยังมียอดคงเหลือ
                              const approvedSubItems = (b.subItems || []).filter(sub => sub.status === "Approved");
                              if (approvedSubItems.length === 0) return null;

                              // คำนวณ Balance ของ main budget = งบรวม - รวม sub-items ทั้งหมด (ตรงกับ BudgetView)
                              const subItemsTotal = b.subItems ? b.subItems.reduce((sum, s) => sum + s.amount, 0) : 0;
                              const mainBudgetBalance = b.budgetAmount - subItemsTotal;
                              return (
                                <React.Fragment key={b.id}>
                                  {/* Main Budget — แสดงเป็น header แบบ non-selectable */}
                                  <tr className="bg-slate-200/60 border-b border-slate-300 select-none">
                                    <td className="py-1.5 px-3 font-semibold text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <CornerDownRight size={13} className="text-slate-400 flex-shrink-0" />
                                        {b.code}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600 font-medium italic min-w-0 overflow-hidden" title={b.description || ""}>
                                      <span className="cell-text">
                                        {b.description}
                                      </span>
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">
                                      {formatCurrency(b.budgetAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-orange-600">
                                      {formatCurrency(subItemsTotal)}
                                    </td>
                                    <td className={`py-1.5 px-3 text-right font-bold ${mainBudgetBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                      {formatCurrency(mainBudgetBalance)}
                                    </td>
                                  </tr>
                                  {/* Sub-items — เฉพาะที่ Approved แล้ว และยังมียอดคงเหลือ */}
                                  {approvedSubItems.map((sub, sIdx) => {
                                    const subUsed = prs
                                      .filter(p => p.projectId === selectedProjectId && p.costCode === b.code && p.status !== 'Rejected')
                                      .reduce((sum, p) => {
                                        const matchItems = (p.items || []).filter(i => {
                                          // Only match items that have proper sub-item IDs to avoid counting legacy records incorrectly
                                          if (sub.id && (i.subItemId === sub.id || i.budgetSubItemId === sub.id)) {
                                            return true;
                                          }
                                          // For legacy records without subItemId, only match if this is the only sub-item with this exact description
                                          // and the PR was created before sub-item system (no subItemId on any items)
                                          if (!i.subItemId && !i.budgetSubItemId && i.description?.trim() === sub.description?.trim()) {
                                            // Check if this PR has any items with subItemId - if yes, it's not a legacy PR
                                            const hasAnySubItemId = (p.items || []).some(item => item.subItemId || item.budgetSubItemId);
                                            return !hasAnySubItemId;
                                          }
                                          return false;
                                        });
                                        return sum + matchItems.reduce((s, i) => s + (i.quantity * i.price), 0);
                                      }, 0);

                                    const subBalance = sub.amount - subUsed;
                                    if (subUsed >= sub.amount) return null;

                                    return (
                                      <tr
                                        key={`${b.id}-sub-${sIdx}`}
                                        className={`bg-slate-50/50 cursor-pointer hover:bg-blue-50 ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "bg-blue-50/80 ring-1 ring-blue-200 ring-inset" : ""}`}
                                        onClick={() => handleToggleSubItem(sub, b.code, b.id)}
                                      >
                                        <td className="py-1.5 px-3 pl-8 border-l-2 border-blue-100">
                                          <span className={`inline-flex w-4 h-4 rounded-full border-2 flex-shrink-0 items-center justify-center transition-all ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                            {selectedSubItemsForPR.some((i) => i.id === sub.id) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-3 text-slate-700 min-w-0 overflow-hidden" title={sub.description || ""}>
                                          <span className="cell-text">
                                            {sub.description}
                                          </span>
                                        </td>
                                        <td className="py-1.5 px-3 text-right text-slate-600 font-medium">
                                          {formatCurrency(sub.amount)}
                                        </td>
                                        <td className="py-1.5 px-3 text-right text-orange-500">
                                          {formatCurrency(subUsed)}
                                        </td>
                                        <td className={`py-1.5 px-3 text-right font-bold ${subBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                                          {formatCurrency(subBalance)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </motion.div>
                  ))
              )}
            </div>
            <div className="pt-4 mt-2 border-t flex justify-between items-center">
              <span className="text-sm text-slate-500">
                {selectedSubItemsForPR.length > 0
                  ? <span className="text-blue-700 font-semibold">เลือกแล้ว: {selectedSubItemsForPR[0].description}</span>
                  : <span className="text-slate-400">กรุณาเลือก 1 รายการ</span>}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setIsCostCodeModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                {selectedSubItemsForPR.length > 0 && (
                  <Button onClick={handleAddSelectedSubItems}>
                    ยืนยันการเลือก
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}

    </div>
  );
});


export default PRView;

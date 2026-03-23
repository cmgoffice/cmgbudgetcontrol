// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, Info, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList, FileSpreadsheet, Upload, Download,
  BarChart3, Zap, Building2, Wallet, ShoppingCart, FileInput, RefreshCw, UserCheck, History,
  Bell, CircleDot, AtSign, MapPinned, UserCircle, Square, CheckSquare, Flame, Mail
} from "lucide-react";
import { doc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import {
  COST_CATEGORIES, PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, getPurchaseTypeDisplayLabel,
  PO_REVISION_PENDING_PCM, PO_REVISION_PENDING_GM, PR_PENDING_ACTIVE,
} from "../lib/constants";
import { uploadAttachment } from "../lib/uploadAttachment";
import { useProportionalTableLayout, chainTableResizeHandlers } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";

const BudgetView = React.memo(() => {
  const { budgets, projects, prs, pos, invoices, addData, updateData, deleteData,
          showAlert, openConfirm, logAction, userRole, userRoles, userData, columnWidths, handleColumnResize,
          visibleProjects, handlePRAction, handlePOAction, handlePORevisionAllow, handlePORevisionDeny,
          db, appId, canUseFunction, isColumnVisible } = useAppData();
  const { selectedProjectId,
          budgetCategory, setBudgetCategory,
          expandedBudgetRows, setExpandedBudgetRows,
          scrollToPendingAfterRender, setScrollToPendingAfterRender,
          pendingSectionRef } = useUI();
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
      try { localStorage.setItem("subItemUnitOptions", JSON.stringify(opts)); } catch {}
    };

    // เมื่อกดกระดิ่งแล้วเลือกโปรเจกต์ — เลื่อนลงไปที่รายการรออนุมัติ
    useEffect(() => {
      if (budgetCategory === "OVERVIEW" && scrollToPendingAfterRender && pendingSectionRef?.current) {
        pendingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        setScrollToPendingAfterRender(false);
      }
    }, [budgetCategory, scrollToPendingAfterRender]);

    const currentBudgets = budgets.filter(
      (b) => b.projectId === selectedProjectId && b.category === budgetCategory
    );

    // V.20: Explicitly define pending lists with Admin Super-Powers
    const pendingBudgetsForProject = useMemo(() => {
      if (!selectedProjectId) return [];
      // MD or Admin sees pending budgets
      if (userRole !== "MD" && userRole !== "Administrator") return [];

      return budgets.filter(
        (b) =>
          b.projectId === selectedProjectId &&
          (b.status === "Wait MD Approve" || b.status === "Revision Pending")
      );
    }, [budgets, selectedProjectId, userRole]);

    const pendingPRsForProject = useMemo(() => {
      if (!selectedProjectId) return [];
      return prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;
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
    }, [prs, selectedProjectId, userRoles]);

    const pendingSubItemsForProject = useMemo(() => {
      if (!selectedProjectId) return [];
      if (userRole !== "MD" && userRole !== "Administrator") return [];
      const pendingSubs = [];
      budgets.forEach((b) => {
        if (b.projectId === selectedProjectId && b.subItems?.length > 0) {
          b.subItems.forEach((sub) => {
            if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending")
              pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
          });
        }
      });
      return pendingSubs;
    }, [budgets, selectedProjectId, userRole]);

    const pendingPOsForProject = useMemo(() => pos.filter((po) => {
      if (po.projectId !== selectedProjectId) return false;
      if (userRoles.includes("Administrator") && (
        po.status?.startsWith("Pending") ||
        po.status === PO_REVISION_PENDING_PCM ||
        po.status === PO_REVISION_PENDING_GM
      )) return true;
      if (userRoles.includes("PCM") && (po.status === "Pending PCM" || po.status === PO_REVISION_PENDING_PCM)) return true;
      if (userRoles.includes("GM") && (po.status === "Pending GM" || po.status === PO_REVISION_PENDING_GM)) return true;
      return false;
    }), [pos, selectedProjectId, userRoles]);

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
        `[Budget Attachments] ${budgetId} | main | +${files.length} files`
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
        `[Budget Attachments] ${budgetId} / SubItem ${subItemId} | +${files.length} files`
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
          const mainCode   = budget.code        || "";
          const mainDesc   = budget.description  || "";
          const mainBudget = budget.amount       ?? 0;
          const mainStatus = budget.status       || "Draft";

          if (budget.subItems && budget.subItems.length > 0) {
            budget.subItems.forEach((sub: any) => {
              dataRows.push([
                mainCode, mainDesc, mainBudget, mainStatus,
                sub.description || "",
                sub.quantity  ?? 0,
                sub.unit      || "",
                sub.unitPrice ?? 0,
                sub.status    || "Draft",
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
          "001001","(ตัวอย่าง) ค่าจัดเตรียมพื้นที่","200000","Draft",
          "ทำความสะอาดพื้นที่หน้างาน","1","งาน","30000","Draft",
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
            const rawMainCode     = clean(cols[0]);
            const mainDescription = clean(cols[1]);
            // cols[2] = MainBudget (export) — ไม่ใช้ตอน import (ระบบใช้ budget.amount จาก Firestore)
            // cols[3] = MainStatus (export) — ไม่ใช้ตอน import
            const subDescription  = clean(cols[cIdx]);
            let qtyStr            = clean(cols[cIdx + 1]);
            let unit              = clean(cols[cIdx + 2]);
            let unitPriceStr      = clean(cols[cIdx + 3]);
            // cols[cIdx+4] = SubStatus (export) — ไม่ใช้ตอน import

            if (!rawMainCode) return;

            // Normalize Main Cost Code (รองรับทั้ง 6 / 9 หลัก และกรณี Excel ตัด 0 นำหน้า)
            const strippedMain = rawMainCode.replace(/^0+/, "") || "0";
            const normalizedMainCode =
              strippedMain.length <= 6
                ? strippedMain.padStart(6, "0")
                : strippedMain.padStart(9, "0");

            const category = normalizedMainCode.substring(0, 3);
            const ALLOWED_PREFIXES = ["001","002","003","004","005","006","007","008","009"];
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
              const ALLOWED_PREFIXES = ["001","002","003","004","005","006","007","008","009"];
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

      const normalizeDesc = (s: string) => (s || "").trim().toLowerCase();

      // ---- Phase 1: สร้าง budgetMap ทั้งหมด + ตรวจ violation ทั้งหมดก่อน ----
      // ไม่มีการ write Firestore ใด ๆ ในขั้นนี้
      const allViolationMessages: string[] = [];   // บล็อก import ทั้งหมด (ยอดเกินงบหลัก)
      const allSkipMessages:      string[] = [];   // ข้ามรายการนั้น แต่ยังทำรายการอื่นต่อ
      const allBudgetMaps: Array<{ cat: string; isLegacy: boolean; budgetMap?: any; legacyRows?: any[] }> = [];

      for (const cat of selectedImportCategories) {
        const rows = importData[cat] || [];
        if (rows.length === 0) continue;

        const isLegacyTemplate = rows.every((r: any) => r.isLegacy);

        if (isLegacyTemplate) {
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
              const newSubs: any[]       = [];
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
              batchPromises.push(addData("budgets", budgetItem, budgetDocId));
            }
            importCount++;
          });
        }
      }

      await Promise.all(batchPromises);
      await logAction("Import", `Imported ${importCount} budget items`);
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

    const getBudgetStats = (budget) => {
      // Step 1: Find ALL related PRs/POs by Cost Code only.
      // Granular filtering (Main vs Sub-Item) is handled in getNowStatus.
      const budgetCode = budget.code;

      const relatedPRs = prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;
        // Match by PR-level cost code (legacy)
        if (pr.costCode === budgetCode) return true;
        // Match by item-level cost code
        if (pr.items && pr.items.length > 0) {
          return pr.items.some(i => (i.costCode || pr.costCode) === budgetCode);
        }
        return false;
      });

      const relatedPOs = pos.filter((po) => {
        if (po.projectId !== selectedProjectId) return false;
        if (po.items && po.items.length > 0) {
          return po.items.some(i => i.costCode === budgetCode);
        }
        return false;
      });

      const hasSubItems = budget.subItems && budget.subItems.length > 0;
      const budgetDesc = (budget.description || "").trim();

      // Helper: does this item belong to THIS specific budget?
      const itemBelongsToBudget = (item) => {
        if (hasSubItems) {
          // Budget with sub-items: any item with matching code belongs
          return true;
        }
        // Budget without sub-items: must also match description
        const iDesc = (item.description || "").trim();
        return iDesc === budgetDesc;
      };

      // Calculate Totals based on matching logic
      const prTotal = relatedPRs.reduce((sum, pr) => {
        if (pr.status === "Rejected") return sum;

        let prAmount = 0;
        if (pr.items && pr.items.length > 0) {
          prAmount = pr.items.reduce((iSum, i) => {
            const itemCode = i.costCode || pr.costCode;
            if (itemCode !== budgetCode) return iSum;
            if (!itemBelongsToBudget(i)) return iSum;
            return iSum + (Number(i.amount) || (Number(i.quantity) * Number(i.price)));
          }, 0);
        } else {
          prAmount = Number(pr.totalAmount || 0);
        }
        return sum + prAmount;
      }, 0);

      const poTotal = relatedPOs.reduce((sum, po) => {
        if (po.status === "Rejected") return sum;
        let poAmount = 0;
        if (po.items && po.items.length > 0) {
          poAmount = po.items.reduce((iSum, i) => {
            if (i.costCode !== budgetCode) return iSum;
            if (!itemBelongsToBudget(i)) return iSum;
            return iSum + (Number(i.amount) || (Number(i.quantity) * Number(i.price)));
          }, 0);
        } else {
          poAmount = Number(po.totalAmount || 0);
        }
        return sum + poAmount;
      }, 0);

      const relatedInvoices = invoices.filter((inv) =>
        relatedPOs.some((po) => po.poNo === inv.poRef && po.status !== "Rejected")
      );
      const invoiceTotal = relatedInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount),
        0
      );
      return { prTotal, poTotal, invoiceTotal, relatedPRs, relatedPOs };
    };

    const getNowStatus = (budget, stats, filterMode = "ALL", targetSubId = null) => {
      const budgetCode = budget.code;
      const hasSubItems = budget.subItems && budget.subItems.length > 0;

      const resolveSubItemId = (item) => {
        if (item.subItemId) return item.subItemId;
        if (item.prId != null && item.prItemIndex != null) {
          const pr = prs.find(p => p.id === item.prId);
          return pr?.items?.[item.prItemIndex]?.subItemId || null;
        }
        return null;
      };

      const matchesFilter = (item, itemCostCode, parentDoc = null) => {
        if (itemCostCode !== budgetCode) return false;
        const iDesc = (item.description || "").trim();
        const effectiveSubItemId = resolveSubItemId(item);

        if (filterMode === "SUB_ITEM" && targetSubId) {
          const targetSub = hasSubItems ? budget.subItems.find(s => s.id === targetSubId) : null;
          if (!targetSub) return false;
          const targetDesc = (targetSub.description || "").trim();
          if (effectiveSubItemId) return effectiveSubItemId === targetSub.id;
          if (parentDoc?.selectedSubItemId && parentDoc.selectedSubItemId === targetSub.id) return true;
          return iDesc === targetDesc;
        }

        if (filterMode === "MAIN_ONLY") {
          if (hasSubItems) {
            if (effectiveSubItemId) {
              return !budget.subItems.some(sub => sub.id === effectiveSubItemId);
            }
            return !budget.subItems.some(sub => sub.description.trim() === iDesc);
          } else {
            return iDesc === (budget.description || "").trim();
          }
        }

        if (filterMode === "ALL") {
          if (!hasSubItems) {
            return iDesc === (budget.description || "").trim();
          }
        }

        return true;
      };

      let statusesToReturn = [];

      // 1. Check PO Statuses
      if (stats.relatedPOs && stats.relatedPOs.length > 0) {
        const poGroups = stats.relatedPOs.reduce((acc, po) => {
          const s = po.status || "Pending PCM";
          if (!acc[s]) acc[s] = 0;
          let amount = 0;
          if (po.items && Array.isArray(po.items)) {
            amount = po.items
              .filter(i => matchesFilter(i, i.costCode || prs.find(p => p.id === i.prId)?.costCode, po))
              .reduce((sum, i) => sum + Number(i.amount), 0);
          } else if (po.costCode === budgetCode) {
            if (filterMode === "SUB_ITEM") amount = 0;
            else amount = Number(po.amount);
          }
          acc[s] += amount;
          return acc;
        }, {});

        if (poGroups["Rejected"] > 0) statusesToReturn.push({ label: "PO Rejected", amount: poGroups["Rejected"], color: "red" });
        if (poGroups["Pending PCM"] > 0) statusesToReturn.push({ label: "PO Pending PCM", amount: poGroups["Pending PCM"], color: "orange" });
        if (poGroups["Pending GM"] > 0) statusesToReturn.push({ label: "PO Pending GM", amount: poGroups["Pending GM"], color: "blue" });
        if (poGroups["Approved"] > 0) statusesToReturn.push({ label: "PO Approved", amount: poGroups["Approved"], color: "green" });
      }

      // 2. Check PR Statuses
      if (stats.relatedPRs && stats.relatedPRs.length > 0) {
        const prGroups = stats.relatedPRs.reduce((acc, pr) => {
          if (pr.status === "PO Issued") return acc;
          let amount = 0;
          if (pr.items && Array.isArray(pr.items)) {
            amount = pr.items
              .filter(i => matchesFilter(i, i.costCode || pr.costCode, pr))
              .reduce((sum, i) => sum + (Number(i.amount) || (Number(i.quantity) * Number(i.price))), 0);
          } else {
            if (pr.costCode === budgetCode) {
              if (filterMode === "SUB_ITEM") amount = 0;
              else amount = Number(pr.totalAmount || pr.amount);
            }
          }
          if (amount > 0) {
            if (!acc[pr.status]) acc[pr.status] = 0;
            acc[pr.status] += amount;
          }
          return acc;
        }, {});

        if (prGroups["Rejected"] > 0) statusesToReturn.push({ label: "PR Rejected", amount: prGroups["Rejected"], color: "red" });
        if (prGroups["Pending CM"] > 0) statusesToReturn.push({ label: "PR Pending CM", amount: prGroups["Pending CM"], color: "cyan" });
        if (prGroups["Pending PM"] > 0) statusesToReturn.push({ label: "PR Pending PM", amount: prGroups["Pending PM"], color: "blue" });
        if (prGroups["Pending GM"] > 0) statusesToReturn.push({ label: "PR Pending GM", amount: prGroups["Pending GM"], color: "indigo" });
        if (prGroups["Pending MD"] > 0) statusesToReturn.push({ label: "PR Pending MD", amount: prGroups["Pending MD"], color: "purple" });
        if (prGroups["Approved"] > 0) statusesToReturn.push({ label: "PR Approved", amount: prGroups["Approved"], color: "green" });
        if (prGroups["Edit Budget"] > 0) statusesToReturn.push({ label: "PR Edit Budget", amount: prGroups["Edit Budget"], color: "red" });
      }

      return statusesToReturn;
    };

    const getCategorySummary = () => {
      return Object.entries(COST_CATEGORIES).map(([code, name]) => {
        const catBudgets = budgets.filter(
          (b) => b.projectId === selectedProjectId && b.category === code
        );
        const totalBudget = catBudgets.reduce(
          (sum, b) => sum + calculateTotalBudget(b),
          0
        );
        const catPRs = prs.filter(
          (pr) =>
            pr.projectId === selectedProjectId &&
            pr.costCode &&
            pr.costCode.startsWith(code) &&
            pr.status !== "Rejected"
        );
        const totalPR = catPRs.reduce(
          (sum, pr) => sum + Number(pr.totalAmount || pr.amount),
          0
        );

        // Filter POs relevant to this project
        const projectPOs = pos.filter((po) => po.projectId === selectedProjectId);

        // Calculate PO total for this category (checking items if available)
        const totalPO = projectPOs.reduce((sum, po) => {
          if (po.items && Array.isArray(po.items)) {
            const itemSum = po.items
              .filter(i => {
                const c = i.costCode || prs.find(p => p.id === i.prId)?.costCode;
                return c && c.startsWith(code);
              })
              .reduce((s, i) => s + Number(i.amount), 0);
            return sum + itemSum;
          } else if (po.costCode && po.costCode.startsWith(code)) {
            return sum + Number(po.amount);
          }
          return sum;
        }, 0);

        // Get PO Numbers that contain items from this category for Invoice filtering
        const catPO_Nos = projectPOs
          .filter(po => {
            if (po.items && Array.isArray(po.items)) {
              return po.items.some(i => {
                const c = i.costCode || prs.find(p => p.id === i.prId)?.costCode;
                return c && c.startsWith(code);
              });
            }
            return po.costCode && po.costCode.startsWith(code);
          })
          .map(po => po.poNo);

        const catInvoices = invoices.filter(
          (inv) =>
            inv.projectId === selectedProjectId && catPO_Nos.includes(inv.poRef)
        );

        // Note: Invoice logic assumes the whole invoice belongs to the category if the PO does.
        // For mixed POs, this might over-count if we don't have itemized invoices.
        // But preventing the crash is the priority.
        const totalInvoice = catInvoices.reduce(
          (sum, inv) => sum + Number(inv.amount),
          0
        );
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
        const catBalance = catBudgets.reduce((sum, b) => {
          const hasSubItems = b.subItems && b.subItems.length > 0;
          const sumSubItems = hasSubItems ? b.subItems.reduce((acc, sub) => acc + sub.amount, 0) : 0;
          const bTotal = Number(b.amount);

          if (hasSubItems) {
            return sum + (bTotal - sumSubItems);
          } else {
            // For budgets without subitems, deduct PRs that belong to it
            const bPRs = prs.filter(pr => pr.projectId === selectedProjectId && pr.costCode === b.code && pr.status !== "Rejected");
            const bPRTotal = bPRs.reduce((acc, pr) => acc + Number(pr.totalAmount || pr.amount), 0);
            return sum + (bTotal - bPRTotal);
          }
        }, 0);

        return {
          code,
          name,
          budget: totalBudget,
          pr: totalPR,
          po: totalPO,
          invoice: totalInvoice,
          balance: catBalance,
          status: categoryStatus,
        };
      });
    };

    const handleSaveBudget = async (newStatus = null) => {
      if (newStatus === "Wait MD Approve" && !canUseFunction("budget", "submit")) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
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
          await logAction("Update", `[Budget] ${formData.code} - ${formData.description} | โครงการ: ${projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}${newStatus ? ` | Status: ${newStatus}` : ''}`);
        } else {
          const budgetData = {
            ...formData,
            projectId: selectedProjectId,
            category: budgetCategory,
            code: `${budgetCategory}${formData.code}`,
            status: "Draft",
            revisionReason: "",
            subItems: [],
          };
          const budgetDocId = `${selectedProjectId}-${budgetData.code}-${budgetData.description}`;
          await setDoc(
            doc(db, "artifacts", appId, "public", "data", "budgets", budgetDocId),
            budgetData
          );
          await logAction("Create", `[Budget] ${formData.code} - ${formData.description} | โครงการ: ${projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}`);
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
                ? `Deleted Budget ${b.code}${desc ? ` — ${desc}` : ""}`
                : `Deleted Budget ID: ${id}`
            );
          } catch (e) {
            showAlert("Error", e.message, "error");
          }
        },
        "danger"
      );
    };

    const handleClearAllBudgets = () => {
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
        await logAction("Delete", `Cleared all ${currentBudgets.length} budget items in category ${budgetCategory}`);
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
          : `Approved Budget ID: ${budgetId}`
      );
      // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve สำเร็จ เพื่อลด pop-up ตามคำขอ
    };

    const handleSubmitBudget = async (id) => {
      if (!canUseFunction("budget", "submit")) {
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
              : `ส่ง Budget ID ${id} เพื่ออนุมัติ MD`
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
      if (!canUseFunction("budget", "submit")) {
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
                await logAction("Bulk", `Sent ${toSubmit.length} budgets to Wait MD Approve`);
                setSelectedBudgetIds([]);
                setActionDropdownOpen(false);
              } catch (e) {
                showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถส่งได้", "error");
              }
            }
          );
    };

    const handleBulkDeleteBudgets = () => {
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
            await logAction("Bulk", `Deleted ${toDelete.length} budgets`);
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
        await logAction("Bulk", `Approved ${toApprove.length} pending budgets from dashboard`);
        setPendingSelectedBudgetIds([]);
        setPendingActionDropdownOpen(false);
        // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve สำเร็จ เพื่อลด pop-up ตามคำขอ
      } catch (e) {
        showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถ Approve ได้", "error");
      }
    };

    const handleBulkRejectPendingBudgets = () => {
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
            await logAction("Bulk", `Rejected ${toReject.length} pending budgets from dashboard`);
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
      if (!canUseFunction("budget", "requestRevision")) {
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
        `Requested Revision for Budget: ${selectedBudget.code}`
      );
      setIsRevisionModalOpen(false);
      setRevisionReason("");
      setSelectedBudget(null);
    };

    const handleAllowEdit = async (budgetId) => {
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
          : `Allowed Edit for Budget ID: ${budgetId}`
      );
    };

    const handleRejectRevision = async (budgetId) => {
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
          : `Rejected revision request for Budget ID: ${budgetId} — สถานะกลับเป็น Approved`
      );
    };

    const openRejectModal = (budget) => {
      setSelectedBudget(budget);
      setRejectReason("");
      setIsRejectModalOpen(true);
    };

    const handleRejectBudget = async () => {
      if (!selectedBudget || !rejectReason) return;
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", selectedBudget.id),
        { status: "Rejected", rejectReason: rejectReason }
      );
      await logAction("Reject", `Rejected Budget: ${selectedBudget.code} - ${rejectReason}`);
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

    const handleApproveSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Approved", rejectReason: "" } : sub
      );

      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Approve Sub-Item", `Approved Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`);
      // ไม่แสดง Modal แจ้งเตือนเมื่อ Approve รายการย่อยสำเร็จ เพื่อลด pop-up ตามคำขอ
    };

    const handleRequestRevisionSubItem = async (budgetId, subItemId, reason) => {
      if (!canUseFunction("budget", "requestRevision")) {
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
      await logAction("Request Revision Sub-Item", `Requested Revision for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`);
      showAlert("ส่งคำขอแก้ไข", "ส่งเรื่องรอ MD อนุมัติการแก้ไขรายการย่อยแล้ว", "info");
    };

    const handleAllowEditSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Draft", revisionReason: "", rejectReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Allow Edit Sub-Item", `Allowed Edit for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`);
      showAlert("อนุญาตแล้ว", "ปลดล็อครายการย่อยให้แก้ไขได้ (สถานะ Draft)", "success");
    };

    const handleRejectRevisionSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Approved", revisionReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Reject Revision Sub-Item", `Rejected revision for Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code}) — สถานะกลับเป็น Approved`);
      showAlert("ไม่อนุญาตแก้ไข", "สถานะรายการย่อยกลับเป็น Approved ตามเดิม", "info");
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
        if (!canUseFunction("budget", "requestRevision")) {
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
      if (!canUseFunction("budget", "submit")) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
        return;
      }
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      if (budget.status !== "Approved") {
        showAlert("ไม่สามารถส่งคำขออนุมัติได้", "Main item ยังไม่ได้รับการอนุมัติ กรุณาส่งขออนุมัติ Main item ก่อน", "warning");
        return;
      }
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Wait MD Approve", rejectReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Submit Sub-Item", `Submitted Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code}) for approval`);
    };

    const handleRejectSubItem = async (budgetId, subItemId, reason) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Rejected", rejectReason: reason } : sub
      );

      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Reject Sub-Item", `Rejected Sub-Item "${subItemLogDescription(budget, subItemId)}" (Budget ${budget.code})`);
      showAlert("ปฏิเสธแล้ว", "ปฏิเสธรายการย่อย (Sub-Item) เรียบร้อย", "error");
    };

    const toggleRow = (id) => {
      setExpandedBudgetRows((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const openSubItemModal = (item) => {
      setSelectedBudget(item);
      setEditingSubItem(null);
      setPendingSubAttachments([]);
      setSubItemData({ description: "", quantity: 1, unit: "งาน", unitPrice: 0, amount: 0 });
      setUnitInputText("งาน");
      setUnitDropdownOpen(false);
      setIsSubItemModalOpen(true);
    };

    const openEditSubItemModal = (mainItem, subItem) => {
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
      if (!canUseFunction("budget", "submit")) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่ได้รับสิทธิ์ส่งขออนุมัติงบประมาณ", "warning");
        return;
      }
      if (!selectedBudget || !editingSubItem) return;
      if (selectedBudget.status !== "Approved") {
        showAlert("ไม่สามารถส่งคำขออนุมัติได้", "Main item ยังไม่ได้รับการอนุมัติ กรุณาส่งขออนุมัติ Main item ก่อน", "warning");
        return;
      }
      const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
      const updatedSub = {
        ...editingSubItem,
        description: subItemData.description,
        quantity: Number(subItemData.quantity),
        unit: subItemData.unit || "งาน",
        unitPrice: Number(subItemData.unitPrice),
        amount: amountToAdd,
        status: "Wait MD Approve",
        rejectReason: ""
      };
      const updatedSubItems = selectedBudget.subItems.map((sub) =>
        sub.id === editingSubItem.id ? updatedSub : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", selectedBudget.id),
        { subItems: updatedSubItems }
      );
      setPendingSubAttachments([]);
      setIsSubItemModalOpen(false);
      setEditingSubItem(null);
      setExpandedBudgetRows((prev) => ({ ...prev, [selectedBudget.id]: true }));
    };

    const handleSaveSubItem = async () => {
      if (!selectedBudget) return;
      if (!subItemData.description.trim()) return showAlert("ข้อมูลไม่ครบ", "กรุณากรอกชื่อรายการ", "warning");
      const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
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
      openConfirm(
        "ยืนยันการลบ",
        "ต้องการลบรายการย่อยนี้หรือไม่?",
        async () => {
          const mainBudget = budgets.find((b) => b.id === mainId);
          if (!mainBudget) return;
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
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-800">
              B. Project Budget
            </h2>
            <ColumnVisibilityToggle tableId="budget" />
          </div>
        </div>
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-slate-200 no-scrollbar">
          <button
            onClick={() => setBudgetCategory("OVERVIEW")}
            className={`px-4 py-2 whitespace-nowrap text-xs font-medium rounded-t-lg transition-colors flex items-center gap-2 ${budgetCategory === "OVERVIEW"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            <BarChart3 size={14} /> ภาพรวม (Overview)
          </button>
          {Object.entries(COST_CATEGORIES).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBudgetCategory(key)}
              className={`px-4 py-2 whitespace-nowrap text-xs font-medium rounded-t-lg transition-colors ${budgetCategory === key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
            >
              {key}
            </button>
          ))}
        </div>
        {budgetCategory === "OVERVIEW" ? (
          <>
            <Card className="overflow-hidden w-full min-w-0">
              <div className="p-3 bg-slate-50 border-b">
                <h3 className="font-bold text-sm text-slate-800">
                  สรุปภาพรวมงบประมาณโครงการ (Project Budget Summary)
                </h3>
              </div>
              <table className="w-full text-left text-sm text-slate-600 table-fixed">
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
                    <th className="py-3 px-4 text-right text-orange-700">
                      Spent (Inv)
                    </th>
                    <th className="py-3 px-4 text-right border-r font-bold text-green-800">
                      Balance
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600">
                      PR Total
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600 border-r-0">
                      PO Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getCategorySummary().map((cat) => (
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
                      <td className="py-2 px-4 text-right text-orange-600">
                        {formatCurrency(cat.invoice)}
                      </td>
                      <td
                        className={`py-2 px-4 text-right border-r font-bold ${cat.balance < 0 ? "text-red-600" : "text-green-600"
                          }`}
                      >
                        {formatCurrency(cat.balance)}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-500">
                        {formatCurrency(cat.pr)}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-500 border-r-0">
                        {formatCurrency(cat.po)}
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
                        getCategorySummary().reduce((sum, c) => sum + c.budget, 0)
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-orange-300">
                      {formatCurrency(
                        getCategorySummary().reduce(
                          (sum, c) => sum + c.invoice,
                          0
                        )
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatCurrency(
                        getCategorySummary().reduce(
                          (sum, c) => sum + c.balance,
                          0
                        )
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {formatCurrency(
                        getCategorySummary().reduce((sum, c) => sum + c.pr, 0)
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 border-r-0">
                      {formatCurrency(
                        getCategorySummary().reduce((sum, c) => sum + c.po, 0)
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
                              {canUseFunction("budget", "approve") && (
                                <button
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 text-green-700 flex items-center gap-2"
                                  onClick={handleBulkApprovePendingBudgets}
                                >
                                  Approve ({pendingSelectedBudgetIds.length} รายการ)
                                </button>
                              )}
                              {canUseFunction("budget", "approve") && (
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
                          <ResizableTh tableId="dash-budget" colKey="costCode" className="py-2.5 px-4" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="description" className="py-2.5 px-4" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.description}>รายการ</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="amount" className="py-2.5 px-4 text-right" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-budget" colKey="status" className="py-2.5 px-4 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashBudgetLayout.scaled.status}>สถานะ</ResizableTh>
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
                                  {canUseFunction("budget", "approve") && !isRevisionPending && (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleApproveBudget(b.id)}
                                      >
                                        <CheckCircle size={11} /> Approve
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => openRejectModal(b)}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>
                                    </>
                                  )}
                                  {canUseFunction("budget", "approve") && isRevisionPending && (
                                    <>
                                      <Button
                                        variant="warning"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleAllowEdit(b.id)}
                                      >
                                        อนุญาตแก้ไข
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleRejectRevision(b.id)}
                                      >
                                        ไม่อนุญาตแก้ไข
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
                          <ResizableTh tableId="dash-subitem" colKey="costCode" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="description" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.description}>รายการ</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="amount" className="py-1.5 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.amount}>จำนวนเงินรวม</ResizableTh>
                          <ResizableTh tableId="dash-subitem" colKey="status" className="py-1.5 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashSubitemLayout.scaled.status}>สถานะ</ResizableTh>
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
                                        {canUseFunction("budget", "approve") && sub.status === "Revision Pending" ? (
                                          <>
                                            <Button variant="warning" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAllowEditSubItem(b.id, sub.id)}>
                                              อนุญาตแก้ไข
                                            </Button>
                                            <Button variant="secondary" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleRejectRevisionSubItem(b.id, sub.id)}>
                                              ไม่อนุญาตแก้ไข
                                            </Button>
                                          </>
                                        ) : canUseFunction("budget", "approve") ? (
                                          <>
                                            <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>
                                              <CheckCircle size={11} /> Approve
                                            </Button>
                                            <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => openReasonModal("reject", b.id, sub.id)}>
                                              <XCircle size={11} /> Reject
                                            </Button>
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
                    <div ref={dashPrTableRef} className="w-full min-w-0">
                    <table className="w-full text-left text-xs text-slate-600 table-fixed">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <ResizableTh tableId="dash-pr" colKey="prNo" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.prNo}>PR No.</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="date" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.date}>วันที่</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="costCode" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="type" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.type}>ประเภท</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="requestor" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.requestor}>ผู้ขอซื้อ</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="amount" className="py-1.5 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-pr" colKey="status" className="py-1.5 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPrLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="py-1.5 px-3 text-center" style={{ width: dashPrLayout.scaled.actions }}>Actions</th>
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
                              <td className="py-2 px-3 font-medium text-slate-800" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>
                              <td className="py-2 px-3 text-slate-500" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>
                              <td className="py-2 px-3">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
                                  {pr.costCode}
                                </span>
                              </td>
                              <td className="py-2 px-3" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>
                              <td className="py-2 px-3" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>
                              <td className="py-2 px-3 text-right font-semibold text-green-700">
                                {formatCurrency(pr.totalAmount || pr.amount)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge status={pr.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1">
                                  {isActivePr ? (
                                    <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={async () => {
                                        const resume = pr.preCloseStatus || "Approved";
                                        await updateData("prs", pr.id, { status: resume, preCloseStatus: null, activeRequestedAt: null });
                                        logAction("Approved Active PR", `อนุมัติ Active PR ${pr.prNo || pr.id} → ${resume}`);
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
                    <div ref={dashPoTableRef} className="w-full min-w-0">
                    <table className="w-full text-left text-xs text-slate-600 table-fixed">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <ResizableTh tableId="dash-po" colKey="poNo" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.poNo}>PO No.</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="date" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.date}>วันที่</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="costCode" className="py-1.5 px-3" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.costCode}>Cost Code</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="amount" className="py-1.5 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.amount}>จำนวนเงิน</ResizableTh>
                          <ResizableTh tableId="dash-po" colKey="status" className="py-1.5 px-3 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={dashPoLayout.scaled.status}>สถานะ</ResizableTh>
                          <th className="py-1.5 px-3 text-center" style={{ width: dashPoLayout.scaled.actions }}>Actions</th>
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
                              <td className="py-2 px-3 text-center">
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
                                  {canUseFunction("po", "approve") && (isPoRevPcm || isPoRevGm) ? (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionAllow(po.id)}
                                      >
                                        <CheckCircle size={11} /> อนุญาตแก้ไข
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePORevisionDeny(po.id)}
                                      >
                                        <XCircle size={11} /> ไม่อนุญาต
                                      </Button>
                                    </>
                                  ) : canUseFunction("po", "approve") ? (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "approve")}
                                      >
                                        <CheckCircle size={11} /> {approveLabel}
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handlePOAction(po.id, "reject")}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>
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
            <div className="flex justify-between items-center gap-2 mb-2 flex-wrap">
              <div className="flex gap-2 items-center">
                {budgetCategory !== "OVERVIEW" && (
                  <div className="relative z-[10]">
                    <button
                      type="button"
                      className="flex items-center gap-1 px-3 py-1.5 h-8 rounded-md font-medium text-xs shadow-sm bg-slate-600 text-white hover:bg-slate-700"
                      onClick={() => setActionDropdownOpen((v) => !v)}
                    >
                      Action
                      <ChevronDown size={12} className={actionDropdownOpen ? "rotate-180" : ""} />
                    </button>
                      {actionDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-1 z-[20] py-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]"
                      >
                        {canUseFunction("budget", "submit") && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 text-green-700 flex items-center gap-2"
                            onClick={handleBulkSubmitBudgets}
                          >
                            ส่งไปยัง MD Approve ({selectedBudgetIds.length} รายการ)
                          </button>
                        )}
                        {canUseFunction("budget", "delete") && (
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-700 flex items-center gap-2"
                            onClick={handleBulkDeleteBudgets}
                          >
                            ลบหลายรายการที่เลือก ({selectedBudgetIds.length})
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
              {canUseFunction("budget", "delete") && (
                <Button
                  variant="outline"
                  onClick={handleClearAllBudgets}
                  className="text-xs h-8 border-red-400 text-red-600 hover:bg-red-50"
                  disabled={currentBudgets.length === 0}
                >
                  <Trash2 size={14} /> ล้างข้อมูลทั้งหมด
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="text-xs h-8"
              >
                <Download size={14} /> Template
              </Button>
              {canUseFunction("budget", "import") && (
                <label className="flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all text-xs shadow-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer h-8">
                  <FileSpreadsheet size={14} /> Import CSV
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                </label>
              )}
              <div className="w-4"></div>
              {canUseFunction("budget", "add") && (
                <Button
                  onClick={() => {
                    setEditingBudgetId(null);
                    setSelectedBudget(null);
                    setFormData({ code: "", description: "", amount: 0 });
                    setPendingMainAttachments([]);
                    setIsModalOpen(true);
                  }}
                >
                  <Plus size={14} /> ตั้งงบประมาณ (Budget)
                </Button>
              )}
              </div>
            </div>
            <Card className="overflow-hidden w-full min-w-0">
              <div ref={budgetTableContainerRef} className="w-full min-w-0">
              <table className="w-full text-left text-xs text-slate-600 table-fixed">
                <thead className="bg-slate-200 text-slate-900 uppercase font-bold border-b text-sm">
                  <tr>
                    {budgetCategory !== "OVERVIEW" && isColumnVisible("budget", "checkbox") && (
                      <th
                        className="py-3 px-2 border-r text-center align-middle"
                        style={{ width: budgetMainLayout.scaled.checkbox }}
                      >
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={sortedBudgets.length > 0 && selectedBudgetIds.length === sortedBudgets.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBudgetIds(sortedBudgets.map((b) => b.id));
                            else setSelectedBudgetIds([]);
                          }}
                        />
                        <span className="block text-[9px] text-slate-500 mt-0.5">Select all</span>
                      </th>
                    )}
                    {isColumnVisible("budget", "code") && (
                    <th
                      className="py-3 px-4 border-r cursor-pointer hover:bg-slate-300 transition-colors"
                      style={{ width: budgetMainLayout.scaled.code }}
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
                    {isColumnVisible("budget", "description") && <ResizableTh tableId="budget" colKey="description" className="py-3 px-4 border-r" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.description}>รายการ</ResizableTh>}
                    {isColumnVisible("budget", "budget") && <ResizableTh tableId="budget" colKey="budget" className="py-3 px-4 text-right bg-blue-100" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.budget}>Budget</ResizableTh>}
                    {isColumnVisible("budget", "status") && <ResizableTh tableId="budget" colKey="status" className="py-3 px-4 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.status}>สถานะ</ResizableTh>}
                    {isColumnVisible("budget", "attachment") && <ResizableTh tableId="budget" colKey="attachment" className="py-3 px-4 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.attachment}>Attachment</ResizableTh>}
                    {isColumnVisible("budget", "balance") && <ResizableTh tableId="budget" colKey="balance" className="py-3 px-4 text-right text-green-800 font-bold border-r" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.balance}>Balance</ResizableTh>}
                    {isColumnVisible("budget", "prTotal") && <ResizableTh tableId="budget" colKey="prTotal" className="py-3 px-4 text-right text-slate-600" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.prTotal}>PR Total</ResizableTh>}
                    {isColumnVisible("budget", "poTotal") && <ResizableTh tableId="budget" colKey="poTotal" className="py-3 px-4 text-right text-slate-600" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.poTotal}>PO Total</ResizableTh>}
                    {isColumnVisible("budget", "nowStatus") && <ResizableTh tableId="budget" colKey="nowStatus" className="py-3 px-4 text-center" isAdmin={userRole==="Administrator"} onResize={onBudgetViewColumnResize} currentWidth={budgetMainLayout.scaled.nowStatus}>Now Status</ResizableTh>}
                    {isColumnVisible("budget", "actions") && <th className="py-3 px-4 text-right" style={{ width: budgetMainLayout.scaled.actions }}>Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedBudgets.map((b) => {
                    const totalBudget = calculateTotalBudget(b);
                    const hasSubItems = b.subItems && b.subItems.length > 0;
                    const sumSubItems = hasSubItems ? b.subItems.reduce((sum, sub) => sum + sub.amount, 0) : 0;
                    const stats = getBudgetStats(b); // Pass the whole budget object
                    const budgetBalance = hasSubItems ? totalBudget - sumSubItems : totalBudget - stats.prTotal;
                    const isLocked =
                      b.status === "Approved" || b.status === "Wait MD Approve";
                    const canDelete = (userRole === "MD" || b.status === "Draft") && canUseFunction("budget", "delete");
                    const isExpanded = expandedBudgetRows[b.id];
                    const canEdit =
                      !isLocked && b.status !== "Revision Pending" && canUseFunction("budget", "edit");
                    const isRevisionPending = b.status === "Revision Pending";
                    return (
                      <React.Fragment key={b.id}>
                        <tr
                          className={`cursor-pointer transition-colors group ${isExpanded ? "bg-amber-50/80 ring-1 ring-amber-200 ring-inset" : "hover:bg-blue-50 odd:bg-white even:bg-slate-50"}`}
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
                              {b.code}
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
                              </div>
                              {b.status === "Approved" && canUseFunction("budget", "add") && (
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
                          <td className="py-1 px-3 text-right text-slate-400">
                            {formatCurrency(stats.poTotal)}
                          </td>
                          )}
                          {isColumnVisible("budget", "nowStatus") && <td className="py-1 px-3 min-w-0 overflow-hidden"></td>}
                          {isColumnVisible("budget", "actions") && <td className="py-1 px-3 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {canUseFunction("budget", "approve") && (userRole === "MD" || userRole === "Administrator") &&
                                b.status === "Wait MD Approve" && (
                                  <>
                                    <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => handleApproveBudget(b.id)}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="danger"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => openRejectModal(b)}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                              {canUseFunction("budget", "approve") && isRevisionPending && (userRole === "MD" || userRole === "Administrator") && (
                                <>
                                  <Button
                                    variant="warning"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleAllowEdit(b.id); }}
                                  >
                                    อนุญาตแก้ไข
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleRejectRevision(b.id); }}
                                  >
                                    ไม่อนุญาตแก้ไข
                                  </Button>
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
                              {canUseFunction("budget", "requestRevision") && b.status === "Approved" && (
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
                              {canUseFunction("budget", "submit") && b.status === "Draft" && (
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
                              <tr
                                key={sub.id}
                                className="bg-slate-50/50 text-xs group"
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
                                {(() => { const cnt = [isColumnVisible("budget", "balance"), isColumnVisible("budget", "prTotal"), isColumnVisible("budget", "poTotal")].filter(Boolean).length; return cnt > 0 ? <td colSpan={cnt} className="border-b border-slate-100"></td> : null; })()}
                                {isColumnVisible("budget", "nowStatus") && <td className="py-0.5 px-3 text-center min-w-0 border-b border-slate-100">
                                  {(() => {
                                    const subStatuses = getNowStatus(b, stats, "SUB_ITEM", sub.id);
                                    const colorMap = {
                                      green: "bg-green-50 text-green-700 border-green-200",
                                      blue: "bg-blue-50 text-blue-700 border-blue-200",
                                      orange: "bg-orange-50 text-orange-700 border-orange-200",
                                      yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
                                      red: "bg-red-50 text-red-700 border-red-200",
                                      indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
                                      purple: "bg-purple-50 text-purple-700 border-purple-200",
                                      emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                      slate: "bg-slate-50 text-slate-600 border-slate-200",
                                    };
                                    if (subStatuses.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap items-center justify-center gap-0.5">
                                        {subStatuses.map((s, idx) => (
                                          <span key={idx} className={`text-[9px] font-semibold px-1.5 py-0 rounded border ${colorMap[s.color] || colorMap.slate} whitespace-nowrap`}>
                                            {s.label}{s.amount !== null ? ` ${formatCurrency(s.amount)}` : ""}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </td>}
                                {isColumnVisible("budget", "actions") && <td className="py-0.5 px-3 text-right border-b border-slate-100">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {(sub.status === "Rejected" && (userRole === "PM" || userRole === "CM" || userRole === "MD" || userRole === "Administrator")) && (
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
                                        {canUseFunction("budget", "edit") && (
                                          <button
                                            className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                            title="แก้ไข"
                                            onClick={(e) => { e.stopPropagation(); openEditSubItemModal(b, sub); }}
                                          >
                                            <Edit size={14} />
                                          </button>
                                        )}
                                        {canUseFunction("budget", "delete") && (
                                          <button
                                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                            title="ลบ"
                                            onClick={() => handleDeleteSubItem(b.id, sub.id)}
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        )}
                                        {canUseFunction("budget", "submit") && b.status === "Approved" && (
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
                                    {canUseFunction("budget", "requestRevision") && sub.status === "Approved" && (
                                      <button
                                        className="text-orange-500 hover:text-orange-700 p-1 hover:bg-orange-50 rounded"
                                        title="ขอแก้ไข (Revise)"
                                        onClick={(e) => { e.stopPropagation(); openReasonModal("revision", b.id, sub.id); }}
                                      >
                                        <RefreshCw size={14} />
                                      </button>
                                    )}
                                    {canUseFunction("budget", "approve") && (userRole === "MD" || userRole === "Administrator") && sub.status === "Revision Pending" && (
                                      <>
                                        <Button
                                          variant="warning"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleAllowEditSubItem(b.id, sub.id); }}
                                        >
                                          อนุญาตแก้ไข
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleRejectRevisionSubItem(b.id, sub.id); }}
                                        >
                                          ไม่อนุญาตแก้ไข
                                        </Button>
                                      </>
                                    )}
                                    {canUseFunction("budget", "approve") && (userRole === "MD" || userRole === "Administrator") && sub.status === "Wait MD Approve" && (
                                      <>
                                        <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>Approve</Button>
                                        <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={(e) => { e.stopPropagation(); openReasonModal("reject", b.id, sub.id); }}>Reject</Button>
                                      </>
                                    )}
                                  </div>
                                </td>}
                              </tr>
                            ))}
                            {/* เว้นพื้นที่ว่างใต้รายการ Sub เมื่อกาง (แยกตารางย่อยจากตารางหลัก) */}
                            <tr className="bg-transparent" aria-hidden="true">
                              <td colSpan={["checkbox","code","description","budget","status","attachment","balance","prTotal","poTotal","nowStatus","actions"].filter(k => k === "checkbox" ? (budgetCategory !== "OVERVIEW" && isColumnVisible("budget","checkbox")) : isColumnVisible("budget",k)).length || 1} className="py-4 border-0 bg-slate-100/50"></td>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300] animate-in fade-in duration-200" onClick={closeBudgetModal}>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
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
                    {canUseFunction("budget", "submit") && (
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300] animate-in fade-in duration-200" onClick={() => setUnitDropdownOpen(false)}>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
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
                    {canUseFunction("budget", "submit") && (
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
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
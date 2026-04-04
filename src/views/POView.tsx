// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Edit, CheckCircle, XCircle, FileText, ChevronDown, ChevronRight, ChevronUp,
  CircleArrowRight, CircleArrowDown, CornerDownRight, AlertCircle, Save, Play,
  PlusCircle, Briefcase, Calendar, MapPin, DollarSign, FileOutput, Search, ListFilter,
  Truck, Package, Paperclip, Clock, Hash, Tag, ClipboardList, FileSpreadsheet, Upload, Download,
  BarChart3, Zap, Building2, ShoppingCart, RefreshCw
} from "lucide-react";
import { doc, runTransaction, collection, getDocs } from "firebase/firestore";
import { db, appId } from "../lib/firebase";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout, chainTableResizeHandlers } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import MaterialAutoComplete from "../components/MaterialAutoComplete";
import {
  PURCHASE_TYPES, PURCHASE_TYPE_CODES, PURCHASE_TYPE_RENTAL_LABEL, PURCHASE_TYPE_EQUIPMENT, DELIVERY_LOCATIONS,
  getPurchaseTypeDisplayLabel, COST_CATEGORIES,
  getPORevisionFlow, PO_REVISION_PENDING_PCM, PO_REVISION_PENDING_GM,
} from "../lib/constants";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { motion, AnimatePresence } from "framer-motion";
import { generatePOPdfBytes, uploadGeneratedPdf, stampSignatureToField, stampSignatureToPdf, deleteGeneratedPdf, stampTextToFieldRect } from "../lib/pdfForms";
import { uploadAttachment } from "../lib/uploadAttachment";
const POView = React.memo(() => {
  const L = {
    docName: "PO",
    docNo: "PO No.",
    docType: "PO Type",
    pageTitle: "D. Purchase Order (PO)",
    createBtn: "สร้างใบสั่งซื้อ (PO)",
    createTitle: "สร้างใบสั่งซื้อ (Create PO)",
    createDesc: "กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบสั่งซื้อ",
    saveBtn: "ส่งขออนุมัติ",
    draftBtn: "บันทึกดราฟ",
    draftSuccess: "บันทึกดราฟเรียบร้อย — แก้ไขต่อหรือส่งขออนุมัติได้จากตาราง",
    savingStep: "บันทึกข้อมูล PO...",
    saveSuccess: "บันทึก PO เรียบร้อย",
    savePdfOk: "บันทึก PO และสร้าง PDF เรียบร้อย — กดดาวน์โหลดได้จากตาราง PO",
    savePdfWarn: "บันทึก PO เรียบร้อย แต่ PDF ไม่บันทึกลง Storage",
    noType: "กรุณาเลือก PO Type ก่อน",
    noData: "กรุณาระบุ PO No., Vendor, และเลือกรายการสินค้าอย่างน้อย 1 รายการ",
    noDisPr: "กรุณาเลือก Dis PR ให้ทุกรายการก่อนบันทึก PO",
    vendorLabel: "Vendor (ผู้ขาย)",
    alreadyOpened: "เปิด PO ไปแล้ว",
    revisionTitle: "ขอแก้ไข PO",
    revisionTooltip: "ขอแก้ไข PO (รออนุญาต)",
    revisionNoPermit: "คุณไม่ได้รับสิทธิ์ขอแก้ไข PO",
    revisionNoReason: "กรอกเหตุผลที่ต้องการขอแก้ไข PO",
    rejected: "PO ถูกปฏิเสธแล้ว",
    reasonPlaceholder: "กรอกเหตุผลในการสร้าง PO...",
    headerSection: "1. ข้อมูลส่วนหัว (Header)",
    selectItems: "3. เลือกรายการสินค้า (Select Items)",
    revisionReasonLabel: "เหตุผลขอแก้ไข PO:",
    dateLabel: "วันที่เปิด PO",
    duplicateConfirm: (usedBy) => usedBy.length > 0
      ? `รายการนี้เปิด PO ไปแล้ว\n\nPO เลขที่: ${usedBy.map(p => p.poNo).join(", ")}\nวันที่: ${usedBy.map(p => p.createdDate ? new Date(p.createdDate).toLocaleDateString("th-TH") : "-").join(", ")}\n\nต้องการเปิดซ้ำหรือไม่?`
      : "รายการนี้ถูกเปิด PO ไปแล้ว ต้องการเปิดซ้ำหรือไม่?",
    savePrAgain: (prNo, status) => `PR ${prNo} มีสถานะ ${status} — กรุณา Active PR รายการนี้ก่อน แล้วค่อยบันทึก PO อีกครั้ง`,
    amountDrop: "ยอด PO ลดลง",
  };
  const { prs, pos, projects, budgets, vendors, materials, addData, updateData, deleteData, loadVendors, loadMaterials,
          showAlert, openConfirm, logAction, userRole, userRoles, columnWidths, handleColumnResize,
          visibleProjects, handlePOAction, handlePORevisionAllow, handlePORevisionDeny,
          userData, user, canUseFunction, canAccessModule, isColumnVisible } = useAppData();
  const canApprovePO = canUseFunction("po", "approve");
  const canRejectPO = canUseFunction("po", "reject");
  const canAllowPORevision = canUseFunction("po", "allowRevision");
  const canDenyPORevision = canUseFunction("po", "denyRevision");
  const { selectedProjectId,
          isFullScreenModalOpen, setIsFullScreenModalOpen,
          expandedPrRows } = useUI();
    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
    const [savePoProgress, setSavePoProgress] = useState<{ show: boolean; pct: number; step: string }>({ show: false, pct: 0, step: "" });
    const [isPrSelectModalOpen, setIsPrSelectModalOpen] = useState(false);
    const [tempSelectedPrIds, setTempSelectedPrIds] = useState<string[]>([]);
    const [prSelectFilterText, setPrSelectFilterText] = useState("");
    const [poTableSearchText, setPoTableSearchText] = useState("");
    const [poSortConfig, setPoSortConfig] = useState<{ key: string | null; direction: "asc" | "desc" }>({ key: null, direction: "asc" });
    const [expandedPoRows, setExpandedPoRows] = useState({});
    const [editingPoId, setEditingPoId] = useState(null);
    const [viewingPO, setViewingPO] = useState<any>(null);
    const [poApproveFlightFromStatus, setPoApproveFlightFromStatus] = useState({});
    const [isPoRevisionModalOpen, setIsPoRevisionModalOpen] = useState(false);

    // Prevent double-click on "บันทึกดราฟ" / "ส่งขออนุมัติ" (avoid duplicate PO/PR records)
    const poDraftInFlightRef = useRef(false);
    const poSendInFlightRef = useRef(false);
    const [poDraftInFlight, setPoDraftInFlight] = useState(false);
    const [poSendInFlight, setPoSendInFlight] = useState(false);

    useEffect(() => {
      setPoApproveFlightFromStatus((prev) => {
        const next = { ...prev };
        for (const id of Object.keys(prev)) {
          const from = prev[id];
          const p = pos.find((x) => x.id === id);
          if (!p || p.status !== from) delete next[id];
        }
        return next;
      });
    }, [pos]);

    const isPoApproveInFlight = (po) => {
      const from = poApproveFlightFromStatus[po?.id];
      return from != null && po?.status === from;
    };
    const [poRevisionReason, setPoRevisionReason] = useState("");
    const [poRevisionPoId, setPoRevisionPoId] = useState<string | null>(null);

    // ─── PR Return Confirmation (กรณี save PO แก้ไขแล้วยอดลดลง) ─────────────
    const [prReturnConfirmOpen, setPrReturnConfirmOpen] = useState(false);
    const [prReturnPendingSaveFn, setPrReturnPendingSaveFn] = useState<null | (() => Promise<void>)>(null);
    const [prReturnMeta, setPrReturnMeta] = useState<{ diff: number; prIds: string[] } | null>(null);

    const togglePoRow = (id) => {
      setExpandedPoRows((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    };

    // PO Type options
    const PO_TYPES = [
      { code: "CR", label: "CR — เครดิต" },
      { code: "SP", label: "SP — ผู้รับเหมา" },
      { code: "SE", label: "SE — บริการ" },
      { code: "CC", label: "CC — คอนกรีต" },
      { code: "OL", label: "OL — น้ำมัน" },
      { code: "DC", label: "DC — ค่าแรง" },
      { code: "SM", label: "SM — เงินเดือน" },
      { code: "CA", label: "CA — เงินสด/เงินโอน" },
      { code: "RE", label: "RE — เช่า" },
      { code: "WF", label: "WF — รายจ่ายประจำ" },
      { code: "INW", label: "INW — รายจ่ายธนาคาร" },
    ];

    // Contract PR types ที่ต้องให้แสดงในขั้น Select PRs สำหรับ Create PO
    // (จ้างเหมา / ค่าแรง)
    const DLDC_CONTRACT_PURCHASE_TYPES = ["จ้างเหมา > DL", "ค่าแรง > DC"];

    const RECEIVE_TYPES = [
      { value: "Material", label: "Material" },
      { value: "Subcontractor", label: "Subcontractor" },
      { value: "Service", label: "Service" },
      { value: "EQM", label: "EQM" },
      { value: "Pay before receive", label: "Pay before receive" },
      { value: "Receive Auto", label: "Receive Auto" },
      { value: "RE", label: "RE" },
    ];

    // Payment Subcontract specific
    const getDefaultReceiveType = (poType: string) => {
      if (!poType) return "";
      if (poType === "SP") return "Subcontractor";
      if (poType === "SE") return "Service";
      if (poType === "RE") return "RE";
      if (["CA", "CR"].includes(poType)) return "EQM";
      if (["CR", "CA", "OL"].includes(poType)) return "Material";
      if (["CC", "WF", "DC", "SM", "INW"].includes(poType)) return "Receive Auto";
      return "Material";
    };

    // Form Data State
    const [formData, setFormData] = useState({
      poNo: "",
      poType: "",
      receiveType: "",
      vendorId: "",
      requiredDate: "",
      poOpenDate: new Date().toISOString().split("T")[0], // วันที่เปิด PO (default วันนี้)
      vatType: "ex-vat", // "inc-vat" | "ex-vat"
      selectedPrIds: [], // Array of PR IDs
      items: [], // Array of selected items with order details
      reason: "",
      note: "",
      discount: 0,
      location: "", // สถานที่ส่งสินค้า
    });
    const [locationOptions, setLocationOptions] = useState<string[]>([...DELIVERY_LOCATIONS]);
    const [locationAddMode, setLocationAddMode] = useState(false);
    const [locationAddText, setLocationAddText] = useState("");
    const [manualVatOverride, setManualVatOverride] = useState<number | null>(null);
    const [vatEditOpen, setVatEditOpen] = useState(false);
    const [vatEditValue, setVatEditValue] = useState("");
    const [discountEnabled, setDiscountEnabled] = useState(false);
    const [poPendingFiles, setPoPendingFiles] = useState<File[]>([]);
    const [poSavedAttachments, setPoSavedAttachments] = useState<{ url: string; name: string }[]>([]);
    const [userNameByUid, setUserNameByUid] = useState<Record<string, string>>({});
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [freeItemPrNoDropdownId, setFreeItemPrNoDropdownId] = useState<string | null>(null);
    const [disPrPickerOpenKey, setDisPrPickerOpenKey] = useState<string | null>(null); // key: `item:${prId}:${idx}` | `free:${id}`

    const getPoRefPrIds = useCallback((po: any): string[] => {
      if (!po) return [];

      const itemPrIds = Array.isArray(po.items)
        ? po.items.flatMap((item: any) => {
            const directPrIds = item?.prId ? [item.prId] : [];
            const disPrIds = Array.isArray(item?.disPrAllocations)
              ? item.disPrAllocations.map((a: any) => a?.prId).filter(Boolean)
              : [];
            return [...directPrIds, ...disPrIds];
          })
        : [];

      const selectedPrIds = Array.isArray(po.selectedPrIds) ? po.selectedPrIds.filter(Boolean) : [];
      const prRefIds = po.prRefId ? [po.prRefId] : [];

      return [...new Set([...itemPrIds, ...selectedPrIds, ...prRefIds].filter(Boolean))];
    }, []);
    const [disPrPickerRect, setDisPrPickerRect] = useState<DOMRect | null>(null);
    const [vendorSearchText, setVendorSearchText] = useState("");
    const [vendorSearchQuery, setVendorSearchQuery] = useState("");
    const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
    const vendorSearchDebounceRef = useRef(null);
    const poOpenDateInputRef = useRef(null);
    const requiredDateInputRef = useRef(null);
    const vendorDropdownAnchorRef = useRef(null);
    const [vendorDropdownRect, setVendorDropdownRect] = useState(null);

    useEffect(() => {
      let mounted = true;
      const loadUserNames = async () => {
        try {
          const snap = await getDocs(collection(db, "artifacts", appId, "public", "data", "users"));
          if (!mounted) return;
          const map: Record<string, string> = {};
          snap.docs.forEach((d) => {
            const data: any = d.data() || {};
            const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
            const displayName = fullName || data.displayName || data.email || "";
            if (displayName) {
              map[d.id] = displayName;
              if (data.uid) map[data.uid] = displayName;
            }
          });
          setUserNameByUid(map);
        } catch (err) {
          console.warn("[POView] Failed to load users for creator display:", err);
        }
      };
      loadUserNames();
      return () => {
        mounted = false;
      };
    }, []);

    useEffect(() => {
      setVendorSearchQuery(vendorSearchText.trim());
    }, [vendorSearchText]);
    const vendorFilteredList = useMemo(() => {
      const q = (vendorSearchQuery || "").toLowerCase();
      if (!q) return vendors;
      return vendors.filter((v: any) =>
        [v.name, v.code, v.type, v.tel].some(f => String(f || "").toLowerCase().includes(q))
      );
    }, [vendors, vendorSearchQuery]);

    // โหลด vendors + materials เมื่อเข้าหน้า PO (ลดโควต้าเปิดแอป)
    useEffect(() => {
      loadVendors();
      loadMaterials();
    }, [loadVendors, loadMaterials]);

    const poTableRef = useRef(null);
    const selectItemsTableRef = useRef(null);
    const selectPrTableRef = useRef(null);

    const poMainLayout = useProportionalTableLayout({
      tableId: "po",
      defaultWeights: TABLE_LAYOUT_DEFAULTS.po,
      savedWidths: columnWidths.po,
      containerRef: poTableRef,
      enabled: true,
      driftKey: "description",
      handleColumnResize,
    });

    const selectItemsLayout = useProportionalTableLayout({
      tableId: "select-items",
      defaultWeights: TABLE_LAYOUT_DEFAULTS["select-items"],
      savedWidths: columnWidths["select-items"],
      containerRef: selectItemsTableRef,
      enabled: isModalOpen && formData.selectedPrIds.length > 0,
      driftKey: "description",
      handleColumnResize,
    });

    const selectPrLayout = useProportionalTableLayout({
      tableId: "select-pr",
      defaultWeights: TABLE_LAYOUT_DEFAULTS["select-pr"],
      savedWidths: columnWidths["select-pr"],
      containerRef: selectPrTableRef,
      enabled: isPrSelectModalOpen,
      driftKey: "description",
      handleColumnResize,
    });

    const onPOViewColumnResize = useMemo(
      () =>
        chainTableResizeHandlers(
          poMainLayout.handleResize,
          selectItemsLayout.handleResize,
          selectPrLayout.handleResize
        ),
      [poMainLayout.handleResize, selectItemsLayout.handleResize, selectPrLayout.handleResize]
    );

    // Sync vendor search text when editing PO (มี vendorId แล้ว)
    useEffect(() => {
      if (editingPoId && formData.vendorId && vendors.length > 0) {
        const v = vendors.find((x: any) => x.id === formData.vendorId);
        if (v?.name) setVendorSearchText(v.name);
      }
      if (!isModalOpen) { setVendorSearchText(""); setVendorDropdownOpen(false); setVendorDropdownRect(null); }
    }, [editingPoId, formData.vendorId, isModalOpen]);

    // วัดตำแหน่ง Vendor dropdown เพื่อ render ผ่าน Portal (ให้ list ล้ำลงไปด้านล่างได้)
    useEffect(() => {
      if (!vendorDropdownOpen || !vendorDropdownAnchorRef.current) { setVendorDropdownRect(null); return; }
      const update = () => {
        if (vendorDropdownAnchorRef.current) setVendorDropdownRect(vendorDropdownAnchorRef.current.getBoundingClientRect());
      };
      update();
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [vendorDropdownOpen]);

    // Counter-based PO No. reservation with conflict checking: PO{YY}{JXX}-{POT}{XXXX}
    // ตัวอย่าง: PO26J01-CC0001
    const reserveNextPoNo = useCallback(async (poTypeCode?: string, manualPoNo?: string, maxRetries = 5) => {
      if (!selectedProjectId) throw new Error("กรุณาเลือกโครงการก่อนสร้าง PO");
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject || !currentProject.jobNo) throw new Error("ไม่พบข้อมูลโครงการ");
      
      const typeCode = poTypeCode || formData.poType;
      if (!typeCode) throw new Error("กรุณาเลือก PO Type");

      // YY = 2 ตัวท้าย ค.ศ.
      const yy = String(new Date().getFullYear()).slice(-2);

      // JXX = Job No. ไม่มีขีด เช่น J-01 → J01
      const jobRaw = String(currentProject.jobNo).trim();
      const jxx = jobRaw.replace(/-/g, "");

      // prefix คือส่วนที่ใช้นับ running number ของ type นี้
      const prefix = `PO${yy}${jxx}-${typeCode}`;

      // If manual PO number is provided, validate and use it
      if (manualPoNo) {
        // Check if manual PO number already exists
        const existingPo = pos.find(po => po.poNo === manualPoNo && po.status !== "Rejected");
        if (existingPo) {
          throw new Error(`เลข PO ${manualPoNo} มีอยู่แล้วในระบบ กรุณาใช้เลขอื่น`);
        }
        return manualPoNo;
      }

      // Find existing max sequence from ALL POs (including manual ones)
      const existingMaxSeq = pos
        .filter((po) => po.poNo && po.poNo.startsWith(prefix) && po.status !== "Rejected")
        .reduce((max, po) => {
          const m = po.poNo.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+)$`));
          if (!m) return max;
          const n = Number(m[1]);
          return Number.isFinite(n) ? Math.max(max, n) : max;
        }, 0);
      
      console.log(`Found existing max sequence for ${prefix}: ${existingMaxSeq}`);

      const counterId = `${selectedProjectId}__${prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      const counterRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "settings",
        "poRunningNo",
        "poCountersByPrefix",
        counterId
      );

      // Retry mechanism for conflict resolution
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const nextPoNo = await runTransaction(db, async (tx) => {
            const snap = await tx.get(counterRef);
            const counterSeq = snap.exists() ? snap.data()?.lastSeq || 0 : 0;
            
            // Always use the higher of counter or existing max sequence
            const current = Math.max(counterSeq, existingMaxSeq);
            console.log(`Counter sequence: ${counterSeq}, Existing max: ${existingMaxSeq}, Using: ${current}`);
            
            let next = current + 1;
            let candidatePoNo = `${prefix}${String(next).padStart(4, "0")}`;
            
            // Keep incrementing until we find a non-conflicting number
            while (pos.find(po => po.poNo === candidatePoNo && po.status !== "Rejected")) {
              next++;
              candidatePoNo = `${prefix}${String(next).padStart(4, "0")}`;
              console.log(`Conflict found, trying next: ${candidatePoNo}`);
            }
            
            // Update counter with the final sequence number
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
            
            console.log(`Reserved PO number: ${candidatePoNo}`);
            return candidatePoNo;
          });
          
          // Final check after transaction
          const finalConflict = pos.find(po => po.poNo === nextPoNo && po.status !== "Rejected");
          if (!finalConflict) {
            return nextPoNo;
          }
          
          console.warn(`Conflict detected for PO ${nextPoNo}, retrying... (attempt ${attempt + 1})`);
        } catch (error) {
          console.error(`Error in PO number reservation attempt ${attempt + 1}:`, error);
          if (attempt === maxRetries - 1) {
            throw error;
          }
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
        }
      }
      
      throw new Error("ไม่สามารถสร้างเลข PO ได้หลังจากพยายามหลายครั้ง กรุณาลองใหม่อีกครั้ง");
    }, [selectedProjectId, projects, formData.poType, pos]);

    // State to track reserved PO number and cleanup
    const [reservedPoNo, setReservedPoNo] = useState("");
    const [isReservingPoNo, setIsReservingPoNo] = useState(false);
    const [reservedCounterRef, setReservedCounterRef] = useState(null);
    const [reservedSequence, setReservedSequence] = useState(0);

    // Cleanup function to rollback reserved counter if not saved
    const cleanupReservedPoNo = useCallback(async () => {
      if (reservedCounterRef && reservedSequence > 0) {
        try {
          console.log(`Rolling back counter from ${reservedSequence} to ${reservedSequence - 1}`);
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(reservedCounterRef);
            if (snap.exists()) {
              const currentSeq = snap.data()?.lastSeq || 0;
              // Only rollback if the counter hasn't been used by another PO
              if (currentSeq === reservedSequence) {
                tx.set(
                  reservedCounterRef,
                  {
                    ...snap.data(),
                    lastSeq: reservedSequence - 1,
                    updatedAt: new Date().toISOString(),
                  },
                  { merge: true }
                );
              }
            }
          });
        } catch (error) {
          console.error("Error rolling back PO counter:", error);
        }
      }
      setReservedPoNo("");
      setReservedCounterRef(null);
      setReservedSequence(0);
    }, [reservedCounterRef, reservedSequence]);

    // Reserve actual PO number for display (not just preview)
    const reservePoNoForDisplay = useCallback(async (poTypeCode?: string) => {
      if (!selectedProjectId || editingPoId) return "";
      
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject || !currentProject.jobNo) return "";
      const typeCode = poTypeCode || formData.poType;
      if (!typeCode) return "";

      setIsReservingPoNo(true);
      try {
        // Clean up any previous reservation first
        await cleanupReservedPoNo();
        
        const newPoNo = await reserveNextPoNo(typeCode);
        setReservedPoNo(newPoNo);
        
        // Store counter reference for potential rollback
        const prefix = `PO${String(new Date().getFullYear()).slice(-2)}${String(currentProject.jobNo).trim().replace(/-/g, "")}-${typeCode}`;
        const counterId = `${selectedProjectId}__${prefix.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        const counterRef = doc(db, "artifacts", appId, "public", "data", "settings", "poRunningNo", "poCountersByPrefix", counterId);
        setReservedCounterRef(counterRef);
        
        // Extract sequence number from PO number
        const seqMatch = newPoNo.match(/(\d+)$/);
        if (seqMatch) {
          setReservedSequence(Number(seqMatch[1]));
        }
        
        return newPoNo;
      } catch (error) {
        console.error("Error reserving PO number:", error);
        return "";
      } finally {
        setIsReservingPoNo(false);
      }
    }, [selectedProjectId, projects, formData.poType, reserveNextPoNo, editingPoId, cleanupReservedPoNo]);

    // Cleanup on component unmount or when starting new PO
    useEffect(() => {
      return () => {
        // Cleanup when component unmounts
        if (reservedPoNo && !editingPoId) {
          cleanupReservedPoNo();
        }
      };
    }, []);

    // Cleanup when switching projects or resetting form
    useEffect(() => {
      if (!editingPoId && reservedPoNo) {
        cleanupReservedPoNo();
      }
    }, [selectedProjectId]);

    // Preview-only PO No. generation for UI display (fallback)
    const generatePoNo = (poTypeCode?: string) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject || !currentProject.jobNo) return "";
      const typeCode = poTypeCode || formData.poType;
      if (!typeCode) return "";

      // YY = 2 ตัวท้าย ค.ศ.
      const yy = String(new Date().getFullYear()).slice(-2);

      // JXX = Job No. ไม่มีขีด เช่น J-01 → J01
      const jobRaw = String(currentProject.jobNo).trim();
      const jxx = jobRaw.replace(/-/g, "");

      // prefix คือส่วนที่ใช้นับ running number ของ type นี้
      const prefix = `PO${yy}${jxx}-${typeCode}`;
      
      return `${prefix}XXXX`; // Preview only - actual number assigned on save
    };

    // Vendor Modal Form State is handled in separate VendorView, 
    // but here we might need a quick add. For now, let's use the main Vendor list.
    // If user wants to add vendor, we can switch view or open a mini-modal.
    // Let's implement a mini vendor modal here for convenience as requested.
    const [newVendor, setNewVendor] = useState({ name: "", code: "", type: "", tel: "", address: "", creditTerm: "" });

    // Helper: ยอดที่ถูก PO ใช้ไปแล้ว (ไม่นับ PO ที่ Rejected และไม่นับ PO ที่กำลังแก้ถ้ามี)
    const getUsedQuantity = (prId, itemIndex, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
      let used = 0;
      relevantPOs.forEach(po => {
        if (po.items) {
          po.items.forEach(item => {
            if (item.prId === prId && item.prItemIndex === itemIndex) {
              used += Number(item.quantity) || 0;
            }
          });
        }
      });
      return used;
    };

    // ยอดเงินจาก PO ที่อ้างอิง PR นี้ (ไม่นับ PO ที่ Rejected และไม่นับ PO ที่กำลังแก้)
    // รองรับ lockedPrAllocations — ถ้ากรณี "ไม่คืนยอด PR" จะมี field นี้เก็บยอดเดิมไว้ล็อก
    const getUsedAmountByPR = (prId, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
      let total = 0;
      relevantPOs.forEach(po => {
        // ถ้ามี lockedPrAllocations — ใช้ยอดที่ล็อกไว้แทน (กรณีเลือก "ไม่คืนยอด PR")
        if (po.lockedPrAllocations && po.lockedPrAllocations[prId] != null) {
          total += Number(po.lockedPrAllocations[prId]) || 0;
          return;
        }
        if (po.items) {
          po.items.forEach(item => {
            if (Array.isArray(item.disPrAllocations) && item.disPrAllocations.length > 0) {
              item.disPrAllocations.forEach((a: any) => {
                if (a?.prId === prId) total += Number(a.amount) || 0;
              });
              return;
            }
            if (item.prId === prId) total += Number(item.amount) || 0;
          });
        }
      });
      return total;
    };

    // รายการ PO ที่ใช้ PR item นี้ (สำหรับแสดงใน Popup "เปิด PO ไปแล้ว")
    const getUsedByPOs = (prId, itemIndex, excludePoId) => {
      const relevantPOs = pos.filter(po => po.status !== "Rejected" && po.id !== excludePoId);
      const list = [];
      relevantPOs.forEach(po => {
        if (po.items) {
          const has = po.items.some(item => item.prId === prId && item.prItemIndex === itemIndex);
          if (has) list.push({ poNo: po.poNo || po.id, createdDate: po.createdDate || "" });
        }
      });
      return list;
    };

    // PR ที่ PO ที่กำลัง edit อ้างอิงไว้แล้ว (ใช้สำหรับ revision edit)
    const editingPoLinkedPrIds = useMemo(() => {
      if (!editingPoId) return new Set<string>();
      const po = pos.find((p) => p.id === editingPoId);
      if (!po) return new Set<string>();
      const ids = (po.items || [])
        .flatMap((i: any) => Array.isArray(i.disPrAllocations)
          ? i.disPrAllocations.map((a: any) => a.prId)
          : i.prId ? [i.prId] : [])
        .filter(Boolean);
      return new Set<string>(ids);
    }, [editingPoId, pos]);

    // รายการ PR ที่ให้เลือกได้ใน "เลือกใบขอซื้อ"
    // - ปกติ: Approved/PO Issued และยอดยังเหลือ
    // - กรณีแก้ไข PO (revision): รวม PR ที่ผูกกับ PO เดิมไว้ด้วย แม้สถานะ Closed/อื่น
    const approvedPRs = useMemo(() => {
      const editingPo = editingPoId ? pos.find((p) => p.id === editingPoId) : null;
      const isRevisionEdit = editingPo?.status === "Draft" && editingPo?.originalPoAmount != null;
      const isRejectedEdit = editingPo?.status === "Rejected";

      return prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;

        // กรณีแก้ไข PO จากการขอแก้ไข (revision) หรือแก้ไข PO ที่ถูก Reject
        // — แสดง PR ที่ผูกไว้เดิมเสมอ แม้ PR จะถูก Closed PR Auto ไปแล้ว
        if ((isRevisionEdit || isRejectedEdit) && editingPoLinkedPrIds.has(pr.id)) return true;

        // กรณีปกติ
        if (pr.status === "Closed PR" || pr.status === "Closed PR Auto") return false;
        const isDLDCContractPR = DLDC_CONTRACT_PURCHASE_TYPES.includes(pr.purchaseType);
        // สำหรับ PR จ้าง/เหมา DL/DC ให้แสดงเพิ่มแม้ยังอยู่ในบางสถานะที่ระบบใช้ทำ PO
        // เพื่อไม่ให้ตกหล่นจากกฎสถานะ Approved/PO Issued
        const allowedStatuses = isDLDCContractPR
          ? ["Approved", "PO Issued", "Pending PM"]
          : ["Approved", "PO Issued"];
        if (!allowedStatuses.includes(pr.status)) return false;

        const prTotal = Number(pr.totalAmount) || 0;
        const usedAmount = getUsedAmountByPR(pr.id, editingPoId);
        if (prTotal > 0 && usedAmount >= prTotal - 0.01) return false;

        return true;
      });
    }, [prs, selectedProjectId, pos, editingPoId, editingPoLinkedPrIds]);

    // Handle toggling a PR selection
    const handlePrToggle = (prId) => {
      const currentIds = formData.selectedPrIds;
      const lockedCostCode = currentIds.length > 0 ? (prs.find((p) => p.id === currentIds[0])?.costCode ?? null) : null;
      const pr = prs.find((p) => p.id === prId);
      if (!pr) return;
      if (currentIds.includes(prId)) {
        // Deselect: Remove PR and its items
        setFormData(prev => ({
          ...prev,
          selectedPrIds: currentIds.filter(id => id !== prId),
          items: prev.items.filter(item => item.prId !== prId)
        }));
      } else {
        // Enforce "CostCode lock": after first selection, only allow same costCode
        if (lockedCostCode && pr.costCode !== lockedCostCode) {
          showAlert("เลือกไม่ได้", "เมื่อเลือก PR ตัวแรกแล้ว ระบบจะแสดง/เลือกได้เฉพาะ Cost Code เดียวกันเท่านั้น", "warning");
          return;
        }
        // Select: Add PR
        setFormData(prev => ({
          ...prev,
          selectedPrIds: [...currentIds, prId]
        }));
      }
    };

    // Select PRs modal: toggle temp selection with CostCode lock
    const toggleTempPrSelection = (prId) => {
      setTempSelectedPrIds((prev) => {
        const pr = prs.find((p) => p.id === prId);
        if (!pr) return prev;

        if (prev.includes(prId)) {
          return prev.filter((id) => id !== prId);
        }

        const lockedCostCode = prev.length > 0 ? (prs.find((p) => p.id === prev[0])?.costCode ?? null) : null;
        if (lockedCostCode && pr.costCode !== lockedCostCode) {
          showAlert("เลือกไม่ได้", "เมื่อเลือก PR ตัวแรกแล้ว ระบบจะแสดง/เลือกได้เฉพาะ Cost Code เดียวกันเท่านั้น", "warning");
          return prev;
        }

        return [...prev, prId];
      });
    };

    // รายการจาก PR ที่เลือก — แสดงทุกรายการ (รวมที่เปิด PO ไปแล้ว) เพื่อให้กดเพิ่มได้แบบอิสระ
    const availableItems = useMemo(() => {
      const items = [];
      formData.selectedPrIds.forEach(prId => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (pr && pr.items) {
          pr.items.forEach((item, idx) => {
            const used = getUsedQuantity(pr.id, idx, editingPoId);
            const originalQty = Number(item.quantity) || 0;
            const remaining = Math.max(0, originalQty - used);
            const orderQtyDefault = remaining > 0 ? remaining : originalQty;
            const price = Number(item.price) || 0;
            items.push({
              prId: pr.id,
              prNo: pr.prNo,
              prDescription: budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-",
              prItemIndex: idx,
              materialNo: item.materialNo || "",
              description: item.description,
              unit: item.unit,
              originalQty,
              usedQty: used,
              remainingQty: remaining,
              alreadyOpenedInPO: used > 0,
              costCode: pr.costCode,
              orderQty: orderQtyDefault,
              price,
              amount: orderQtyDefault * price,
              subItemId: item.subItemId || null,
              budgetId: item.budgetId || pr.budgetId || null,
              budgetSubItemId: item.budgetSubItemId || item.subItemId || null,
              disPrPlan: [pr.prNo],
            });
          });
        }
      });
      return items;
    }, [formData.selectedPrIds, approvedPRs, pos, budgets, editingPoId]);


    // ยอดคงเหลือของแต่ละ PR (ยอด PR - ยอดที่ PO ใช้ไปแล้ว)
    const getPrRemainingAmount = (prId) => {
      const pr = approvedPRs.find(p => p.id === prId) || prs.find(p => p.id === prId);
      if (!pr) return 0;
      const total = Number(pr.totalAmount) || 0;
      const used = getUsedAmountByPR(prId, editingPoId);
      return Math.max(0, total - used);
    };

    // ยอดรวม PR ที่เลือก = ผลรวมยอดคงเหลือของ PR ที่เลือก (สำหรับ validation Grand Total)
    const selectedPrsTotalAmount = useMemo(() => {
      return formData.selectedPrIds.reduce((sum, prId) => sum + getPrRemainingAmount(prId), 0);
    }, [formData.selectedPrIds, approvedPRs, prs, pos, editingPoId]);

    // PR No. options สำหรับ dropdown รายการเพิ่ม (manual) — จาก PR ที่เลือกในตารางนี้
    const prNoOptionsForFreeItems = useMemo(() => {
      const list = formData.selectedPrIds
        .map((id: string) => prs.find((p: any) => p.id === id)?.prNo)
        .filter(Boolean);
      return [...new Set(list)] as string[];
    }, [formData.selectedPrIds, prs]);

    // PR options สำหรับคอลัมน์ Dis PR — จาก PR ที่เลือกในขั้นตอน 2 (ยึดลำดับที่ผู้ใช้เลือก)
    const disPrOptions = useMemo(() => {
      const ordered = (formData.selectedPrIds || [])
        .map((id: string) => {
          const pr = prs.find((p: any) => p.id === id);
          return pr ? { prId: pr.id, prNo: pr.prNo } : null;
        })
        .filter(Boolean) as Array<{ prId: string; prNo: string }>;
      // unique by prId, keep order
      const seen = new Set<string>();
      return ordered.filter(o => {
        if (!o?.prId || seen.has(o.prId)) return false;
        seen.add(o.prId);
        return true;
      });
    }, [formData.selectedPrIds, prs]);

    // PR list filtered by content (PR No., Cost Code, รายการงบ) สำหรับ Modal เลือกใบขอซื้อ
    const approvedPRsFiltered = useMemo(() => {
      const q = (prSelectFilterText || "").trim().toLowerCase();
      const lockedCostCode = tempSelectedPrIds.length > 0 ? (prs.find((p) => p.id === tempSelectedPrIds[0])?.costCode ?? null) : null;
      const base = lockedCostCode ? approvedPRs.filter((pr) => pr.costCode === lockedCostCode) : approvedPRs;
      if (!q) return base;
      return base.filter((pr) => {
        const budgetDesc = budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "";
        const prItemsDesc = (pr.items || []).map((i: any) => i.description).filter(Boolean).join(" ");
        const haystack = [pr.prNo, pr.costCode, budgetDesc, prItemsDesc].join(" ").toLowerCase();
        return haystack.includes(q);
      });
    }, [approvedPRs, prSelectFilterText, budgets, tempSelectedPrIds, prs]);

    const addItemToForm = (itemData) => {
      setFormData(prev => ({
        ...prev,
        items: [...prev.items, {
          prId: itemData.prId,
          prItemIndex: itemData.prItemIndex,
          materialNo: itemData.materialNo || "",
          description: itemData.description || "",
          unit: itemData.unit || "",
          quantity: itemData.orderQty ?? itemData.remainingQty ?? 1,
          price: itemData.price ?? 0,
          amount: (itemData.orderQty ?? itemData.remainingQty ?? 1) * (itemData.price ?? 0),
          remainingQty: itemData.remainingQty,
          costCode: itemData.costCode,
          subItemId: itemData.subItemId || null,
          budgetId: itemData.budgetId || null,
          budgetSubItemId: itemData.budgetSubItemId || null,
          disPrPlan: itemData.prNo ? [itemData.prNo] : [],
          disPrAllocations: []
        }]
      }));
    };

    // Handle Item Checkbox (Include in PO) — ถ้ารายการ "เปิด PO ไปแล้ว" จะเด้ง Popup ยืนยันก่อน
    const handleItemToggle = (itemData) => {
      const exists = formData.items.find(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) {
        setFormData(prev => ({
          ...prev,
          items: prev.items.filter(i => !(i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex))
        }));
      } else {
        if (itemData.alreadyOpenedInPO) {
          const usedBy = getUsedByPOs(itemData.prId, itemData.prItemIndex, editingPoId);
          const msg = L.duplicateConfirm(usedBy);
          openConfirm("ยืนยันเปิดรายการซ้ำ", msg, () => addItemToForm(itemData), "warning");
        } else {
          addItemToForm(itemData);
        }
      }
    };

    const handleAddItemClick = (itemData) => {
      const exists = formData.items.some(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) return;
      if (itemData.alreadyOpenedInPO) {
        const usedBy = getUsedByPOs(itemData.prId, itemData.prItemIndex, editingPoId);
        const msg = L.duplicateConfirm(usedBy);
        openConfirm("ยืนยันเปิดรายการซ้ำ", msg, () => addItemToForm(itemData), "warning");
      } else {
        addItemToForm(itemData);
      }
    };

    // เพิ่มรายการว่าง (กรอกอิสระ) — ไม่จำกัดจำนวน, auto-fill PR No. จาก PR ที่เลือก
    const addFreeItem = () => {
      setFormData(prev => {
        const firstPrId = prev.selectedPrIds[0];
        const firstPr = approvedPRs.find(p => p.id === firstPrId);
        const linkedPrNo = firstPr?.prNo || "";
        return {
          ...prev,
          items: [...prev.items, {
            id: `free-${Date.now()}`,
            prId: null,
            prItemIndex: -1,
            subItemId: null,
            materialNo: "",
            description: "",
            unit: "",
            quantity: 1,
            price: 0,
            amount: 0,
            linkedPrNo,
            disPrPlan: linkedPrNo ? [linkedPrNo] : [],
            disPrAllocations: []
          }]
        };
      });
    };

    const getDisPrKeyForItem = (prId: string, prItemIndex: number) => `item:${prId}:${prItemIndex}`;
    const getDisPrKeyForFree = (freeId: string) => `free:${freeId}`;
    const isDisPrPickerOpenForItem = (prId: string, prItemIndex: number) => disPrPickerOpenKey === getDisPrKeyForItem(prId, prItemIndex);
    const isDisPrPickerOpenForFree = (freeId: string) => disPrPickerOpenKey === getDisPrKeyForFree(freeId);

    const toggleDisPrPick = (key: string, rect?: DOMRect | null) => {
      setDisPrPickerOpenKey((cur) => {
        const next = cur === key ? null : key;
        if (!next) setDisPrPickerRect(null);
        else setDisPrPickerRect(rect || null);
        return next;
      });
    };

    // keep popup positioned on scroll/resize while open
    useEffect(() => {
      if (!disPrPickerOpenKey) { setDisPrPickerRect(null); return; }
      const update = () => {
        // can't re-measure without anchor ref; keep current rect for stability
        // (rect is captured at click time; good enough for typical usage)
      };
      window.addEventListener("scroll", update, true);
      window.addEventListener("resize", update);
      return () => { window.removeEventListener("scroll", update, true); window.removeEventListener("resize", update); };
    }, [disPrPickerOpenKey]);

    const toggleDisPrInPlan = (itemRef: { type: "item"; prId: string; prItemIndex: number } | { type: "free"; id: string }, prNo: string) => {
      if (!prNo) return;
      if (itemRef.type === "item") {
        setFormData(prev => ({
          ...prev,
          items: prev.items.map((it: any) => {
            if (it.prId === itemRef.prId && it.prItemIndex === itemRef.prItemIndex) {
              const cur = Array.isArray(it.disPrPlan) ? it.disPrPlan : [];
              const exists = cur.includes(prNo);
              const next = exists ? cur.filter((x: string) => x !== prNo) : [...cur, prNo]; // preserve user order
              return { ...it, disPrPlan: next };
            }
            return it;
          })
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          items: prev.items.map((it: any) => {
            if (it.id === itemRef.id) {
              const cur = Array.isArray(it.disPrPlan) ? it.disPrPlan : [];
              const exists = cur.includes(prNo);
              const next = exists ? cur.filter((x: string) => x !== prNo) : [...cur, prNo];
              return { ...it, disPrPlan: next };
            }
            return it;
          })
        }));
      }
    };

    const handleFreeItemChange = (freeId, field, value) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.id !== freeId) return item;
          const updates = { ...item, [field]: value };
          if (field === "quantity" || field === "price") {
            updates.amount = (Number(updates.quantity) || 0) * (Number(updates.price) || 0);
          }
          return updates;
        })
      }));
    };
    const removeFreeItem = (freeId) => {
      setFormData(prev => ({ ...prev, items: prev.items.filter(i => i.id !== freeId) }));
    };

    const setFreeItemMaterial = (freeId, mat) => {
      const qty = 1;
      const price = Number(mat?.price) || 0;
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.id !== freeId) return item;
          return { ...item, materialNo: mat?.materialNo || "", description: mat?.name || "", unit: mat?.unit || "", price, quantity: qty, amount: qty * price };
        })
      }));
    };

    // Handle Item Detail Change
    const handleItemChange = (prId, prItemIndex, field, value) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.prId === prId && item.prItemIndex === prItemIndex) {
            const updates = { ...item, [field]: value };
            // Recalculate amount if qty or price changes
            if (field === 'quantity' || field === 'price') {
              updates.amount = Number(updates.quantity) * Number(updates.price);
            }
            return updates;
          }
          return item;
        })
      }));
    };

    // Fill all material fields at once from Material master
    const handleItemSelectMaterial = (prId, prItemIndex, mat) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.prId === prId && item.prItemIndex === prItemIndex) {
            const newPrice = mat.price ?? item.price;
            const qty = Number(item.quantity) || 1;
            return {
              ...item,
              materialNo: mat.materialNo || item.materialNo,
              description: mat.name || item.description,
              price: newPrice,
              amount: qty * Number(newPrice),
            };
          }
          return item;
        })
      }));
    };

    const creatorFirstName = userData?.firstName || "";
    const creatorLastName = userData?.lastName || "";
    const creatorDisplayName = useMemo(() => {
      const full = `${creatorFirstName} ${creatorLastName}`.trim();
      return full || user?.email || "";
    }, [creatorFirstName, creatorLastName, user?.email]);

    const uploadPoPendingFiles = async (poNoForPath: string) => {
      if (!poPendingFiles.length) return [] as { url: string; name: string }[];
      const uploaded: { url: string; name: string }[] = [];
      for (const file of poPendingFiles) {
        const r = await uploadAttachment(file, {
          type: "po",
          projectId: selectedProjectId || "",
          prNo: poNoForPath.replace(/[^a-zA-Z0-9\-_]/g, "_"),
        });
        uploaded.push({ url: r.url, name: r.name });
      }
      return uploaded;
    };

    const calculateTotals = () => {
      const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
      const discount = Number(formData.discount) || 0;
      const afterDiscount = Math.max(0, subtotal - discount);
      let vat = 0;
      let total = 0;
      if (manualVatOverride != null && !isNaN(manualVatOverride)) {
        vat = manualVatOverride;
        total = afterDiscount + vat;
      } else if (formData.vatType === "inc-vat") {
        total = afterDiscount;
      } else {
        vat = afterDiscount * 0.07;
        total = afterDiscount + vat;
      }
      return { subtotal, discount, vat, total };
    };

    const handleSavePODraft = async () => {
      if (poDraftInFlightRef.current || poSendInFlightRef.current) return;
      if (!formData.poType) {
        return showAlert("ข้อมูลไม่ครบ", L.noType, "warning");
      }

      poDraftInFlightRef.current = true;
      setPoDraftInFlight(true);
      try {

      let resolvedPoNo = formData.poNo?.trim() || "";
      const isNewPO = !editingPoId;
      if (isNewPO) {
        try {
          if (canUseFunction("po", "manualPoOverride") && formData.poNo.trim() && formData.poNo !== generatePoNo()) {
            resolvedPoNo = await reserveNextPoNo(formData.poType, formData.poNo.trim());
          } else {
            if (reservedPoNo && reservedPoNo.includes(formData.poType)) {
              resolvedPoNo = reservedPoNo;
            } else {
              resolvedPoNo = await reserveNextPoNo(formData.poType);
            }
            setFormData((prev) => ({ ...prev, poNo: resolvedPoNo }));
          }
          const conflict = pos.find((p) => p.poNo === resolvedPoNo && p.status !== "Rejected" && p.id !== editingPoId);
          if (conflict) {
            throw new Error(`เลข PO ${resolvedPoNo} ถูกใช้ไปแล้วโดย PO อื่น กรุณาลองใหม่อีกครั้ง`);
          }
        } catch (e) {
          return showAlert("สร้างเลข PO ไม่สำเร็จ", e?.message || "ไม่สามารถจองเลข PO ใหม่ได้", "error");
        }
      } else {
        const editing = pos.find((p) => p.id === editingPoId);
        resolvedPoNo = (editing?.poNo || formData.poNo || "").trim();
        if (!resolvedPoNo) {
          return showAlert("ข้อมูลไม่ครบ", "ไม่พบเลข PO สำหรับดราฟนี้", "warning");
        }
      }

      const totals = calculateTotals();
      const itemsDraft = (formData.items || []).map((it: any) => ({
        ...it,
        disPrAllocations: Array.isArray(it.disPrAllocations) && it.disPrAllocations.length ? it.disPrAllocations : [],
      }));

      let newUrls: { url: string; name: string }[] = [];
      try {
        newUrls = await uploadPoPendingFiles(resolvedPoNo);
      } catch (e) {
        return showAlert("อัปโหลดไฟล์ไม่สำเร็จ", e?.message || String(e), "error");
      }
      const attachments = [...poSavedAttachments, ...newUrls];

      const editingPo = editingPoId ? pos.find((p) => p.id === editingPoId) : null;
      const preserveRevision = editingPo?.status === "Draft" && editingPo?.originalPoAmount != null;

      const draftPayload: Record<string, any> = {
        poNo: resolvedPoNo,
        poType: formData.poType,
        ...(formData.receiveType ? { receiveType: formData.receiveType } : {}),
        projectId: selectedProjectId,
        vendorId: formData.vendorId || "",
        requiredDate: formData.requiredDate || "",
        vatType: formData.vatType || "ex-vat",
        items: itemsDraft,
        amount: totals.total,
        grandTotal: totals.total,
        discount: formData.discount || 0,
        reason: formData.reason || "",
        ...(manualVatOverride != null && !isNaN(manualVatOverride) ? { manualVat: manualVatOverride } : {}),
        status: "Draft",
        createdDate: editingPo?.createdDate || new Date().toISOString(),
        poDate: formData.poOpenDate ? new Date(formData.poOpenDate + "T00:00:00").toISOString() : new Date().toISOString(),
        location: formData.location || "",
        rejectReason: "",
        attachments,
        selectedPrIds: formData.selectedPrIds || [],
        createdByUid: editingPo?.createdByUid || user?.uid || null,
        createdByFirstName: editingPo?.createdByFirstName || creatorFirstName || null,
        createdByLastName: editingPo?.createdByLastName || creatorLastName || null,
        creatorSignatureDataUrl: editingPo?.creatorSignatureDataUrl || userData?.signatureDataUrl || userData?.signatureUrl || null,
        ...(creatorDisplayName
          ? { createdByName: editingPo?.createdByName || creatorDisplayName }
          : {}),
      };

      if (preserveRevision) {
        draftPayload.originalPoAmount = editingPo.originalPoAmount;
        if (editingPo.lockedPrAllocations) draftPayload.lockedPrAllocations = editingPo.lockedPrAllocations;
      } else {
        draftPayload.originalPoAmount = null;
        draftPayload.lockedPrAllocations = null;
      }

      if (editingPo?.pdfUrl) {
        draftPayload.pdfUrl = editingPo.pdfUrl;
        draftPayload.pdfPath = editingPo.pdfPath;
      }

      let ok = false;
      if (editingPoId) {
        ok = await updateData("pos", editingPoId, draftPayload);
      } else {
        ok = await addData("pos", draftPayload);
      }

      if (ok) {
        setPoPendingFiles([]);
        setPoSavedAttachments(attachments);
        showAlert("สำเร็จ", L.draftSuccess, "success");
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setEditingPoId(null);
        setReservedPoNo("");
        setReservedCounterRef(null);
        setReservedSequence(0);
        setFormData({
          poNo: "",
          poType: "",
          receiveType: "",
          vendorId: "",
          requiredDate: "",
          poOpenDate: new Date().toISOString().split("T")[0],
          vatType: "ex-vat",
          selectedPrIds: [],
          items: [],
          reason: "",
          note: "",
          discount: 0,
          location: "",
        });
        setManualVatOverride(null);
        setVatEditOpen(false);
        setVatEditValue("");
        setDiscountEnabled(false);
      }
      } finally {
        poDraftInFlightRef.current = false;
        setPoDraftInFlight(false);
      }
    };

    const handleSavePO = async () => {
      if (poDraftInFlightRef.current || poSendInFlightRef.current) return;
      if (!formData.poType) {
        return showAlert("ข้อมูลไม่ครบ", L.noType, "warning");
      }

      poSendInFlightRef.current = true;
      setPoSendInFlight(true);
      try {

      // Reserve PO number for new POs using counter-based system with conflict checking
      let resolvedPoNo = formData.poNo;
      const isNewPO = !editingPoId;
      if (isNewPO) {
        try {
          if (canUseFunction("po", "manualPoOverride") && formData.poNo.trim() && formData.poNo !== generatePoNo()) {
            // User has permission and provided manual number - validate it
            resolvedPoNo = await reserveNextPoNo(formData.poType, formData.poNo.trim());
          } else {
            // Use reserved number or get new one with conflict checking
            if (reservedPoNo && reservedPoNo.includes(formData.poType)) {
              // Use the already reserved number
              resolvedPoNo = reservedPoNo;
            } else {
              // Reserve new number with retry mechanism
              resolvedPoNo = await reserveNextPoNo(formData.poType);
            }
            setFormData(prev => ({ ...prev, poNo: resolvedPoNo }));
          }
          
          // Final conflict check before proceeding
          const finalConflictCheck = pos.find(po => po.poNo === resolvedPoNo && po.status !== "Rejected" && po.id !== editingPoId);
          if (finalConflictCheck) {
            throw new Error(`เลข PO ${resolvedPoNo} ถูกใช้ไปแล้วโดย PO อื่น กรุณาลองใหม่อีกครั้ง`);
          }
        } catch (e) {
          return showAlert("สร้างเลข PO ไม่สำเร็จ", e?.message || "ไม่สามารถจองเลข PO ใหม่ได้", "error");
        }
      }

      if (!isNewPO && (!resolvedPoNo || !String(resolvedPoNo).trim())) {
        const ep = pos.find((p) => p.id === editingPoId);
        if (ep?.poNo) resolvedPoNo = ep.poNo;
      }

      if (!resolvedPoNo || !formData.vendorId || formData.items.length === 0) {
        return showAlert("ข้อมูลไม่ครบ", L.noData, "warning");
      }

      const totals = calculateTotals();

      // ใช้ยอด Sub Total (หลังหักส่วนลด) เทียบกับ PR (ไม่นำ VAT มาคิด) — ตรวจสอบ Sub Total ต้องไม่เกินยอดรวมของ PR ที่เลือก
      const subtotalAfterDiscount = Math.max(0, totals.subtotal - (Number(formData.discount) || 0));
      if (subtotalAfterDiscount > selectedPrsTotalAmount) {
        return showAlert(
          "ยอดเกิน PR",
          `มูลค่า / Sub Total (${formatCurrency(subtotalAfterDiscount)}) ต้องไม่เกินยอดคงเหลือของ PR ที่เลือก (${formatCurrency(selectedPrsTotalAmount)})`,
          "warning"
        );
      }

      // Dis PR: บังคับเลือกทุกบรรทัด
      const missingDis = (formData.items || []).find((it: any) => {
        const plan = Array.isArray(it.disPrPlan) ? it.disPrPlan : [];
        return plan.length === 0;
      });
      if (missingDis) {
        return showAlert("ข้อมูลไม่ครบ", L.noDisPr, "warning");
      }

      // Allocation: ตัดยอด PR ตามลำดับที่ผู้ใช้เลือกใน Dis PR
      // - ใช้ยอดหลังส่วนลด (กระจาย discount ตามสัดส่วนของแต่ละบรรทัด)
      const subtotal = Number(totals.subtotal) || 0;
      const ratio = subtotal > 0 ? (subtotalAfterDiscount / subtotal) : 1;
      const prNoToId = new Map<string, string>();
      disPrOptions.forEach(o => { if (o?.prNo && o?.prId) prNoToId.set(o.prNo, o.prId); });
      const remainingByPrId = new Map<string, number>();
      (formData.selectedPrIds || []).forEach((prId: string) => {
        remainingByPrId.set(prId, Number(getPrRemainingAmount(prId)) || 0);
      });

      // effective amounts per item (after discount)
      const itemsForAlloc = (formData.items || []).map((it: any) => ({
        ref: it,
        effAmount: Math.max(0, (Number(it.amount) || 0) * ratio),
      }));
      // adjust last for rounding drift to make sum = subtotalAfterDiscount
      const effSum = itemsForAlloc.reduce((s: number, x: any) => s + x.effAmount, 0);
      if (itemsForAlloc.length > 0) {
        const drift = subtotalAfterDiscount - effSum;
        itemsForAlloc[itemsForAlloc.length - 1].effAmount = Math.max(0, itemsForAlloc[itemsForAlloc.length - 1].effAmount + drift);
      }

      const itemsWithAllocations = (formData.items || []).map((it: any) => ({ ...it, disPrAllocations: [] as any[] }));
      for (let idx = 0; idx < itemsForAlloc.length; idx++) {
        const it = itemsForAlloc[idx].ref;
        let need = Number(itemsForAlloc[idx].effAmount) || 0;
        const plan: string[] = Array.isArray(it.disPrPlan) ? it.disPrPlan : [];
        const allocs: any[] = [];
        for (const prNo of plan) {
          const prId = prNoToId.get(prNo);
          if (!prId) continue; // ถ้า PR ไม่อยู่ในรายการที่เลือก ให้ข้าม (จะไป fail ด้านล่างถ้ายัง need > 0)
          const rem = Number(remainingByPrId.get(prId) || 0);
          if (rem <= 0) continue;
          const take = Math.min(need, rem);
          if (take > 0) {
            allocs.push({ prId, prNo, amount: take });
            remainingByPrId.set(prId, rem - take);
            need -= take;
          }
          if (need <= 0) break;
        }
        if (need > 0.0001) {
          const itemLabel = it.description || it.materialNo || "(ไม่ระบุรายการ)";
          return showAlert(
            "ยอด PR ไม่เพียงพอ",
            `รายการ "${itemLabel}" ต้องการตัดยอด ${formatCurrency(itemsForAlloc[idx].effAmount)} แต่ PR ที่เลือกใน Dis PR มียอดคงเหลือไม่พอ (ขาด ${formatCurrency(need)}).\n\nกรุณาเพิ่ม PR ในข้อ 2 หรือเลือก Dis PR เพิ่ม`,
            "warning"
          );
        }
        // write allocations back to itemsWithAllocations
        itemsWithAllocations[idx].disPrAllocations = allocs;
      }

      let attachmentList = [...poSavedAttachments];
      try {
        const uploaded = await uploadPoPendingFiles(resolvedPoNo);
        attachmentList = [...attachmentList, ...uploaded];
      } catch (e) {
        return showAlert("อัปโหลดไฟล์ไม่สำเร็จ", e?.message || String(e), "error");
      }

      // แสดง Progress Modal
      const setProgress = (pct: number, step: string) => setSavePoProgress({ show: true, pct, step });
      setProgress(5, "เตรียมข้อมูล...");

      // สร้าง PDF และ upload ก่อน save
      let pdfUrl: string | undefined;
      let pdfError: string | null = null;
      try {
        const vendor = vendors.find((v: any) => v.id === formData.vendorId) || null;
        const project = projects.find((p: any) => p.id === selectedProjectId) || null;
        const draftPayload = {
          poNo: resolvedPoNo, poType: formData.poType,
          receiveType: formData.receiveType,
          projectId: selectedProjectId, vendorId: formData.vendorId,
          requiredDate: formData.requiredDate, vatType: formData.vatType,
          items: itemsWithAllocations, amount: totals.total,
          discount: formData.discount || 0,
          reason: formData.reason || "",
          location: formData.location || "",
          poDate: formData.poOpenDate
            ? new Date(formData.poOpenDate + "T00:00:00").toISOString()
            : new Date().toISOString(),
          ...(manualVatOverride != null && !isNaN(manualVatOverride) ? { manualVat: manualVatOverride } : {}),
        };
        const safePONo = resolvedPoNo.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const safeProjId = selectedProjectId || "unknown";
        // Prefer dataURL to avoid CORS on Storage URL
        const creatorSignatureUrl = userData?.signatureDataUrl || userData?.signatureUrl || null;

        const generateAndUpload = async () => {
          setProgress(20, "กำลังสร้าง PDF...");
          let bytes = await generatePOPdfBytes(draftPayload, { vendor, project });

          setProgress(50, "ประทับลายเซ็นผู้สร้าง...");
          if (creatorSignatureUrl) {
            try {
              bytes = await stampSignatureToField(bytes, creatorSignatureUrl, "Signature1");
            } catch (sigErr) {
              console.warn("[PO Save] Stamp Signature1 failed:", sigErr);
            }
          }

          setProgress(70, "อัปโหลด PDF ขึ้น Cloud...");
          const pdfPath = `generated/pos/${safeProjId}/${safePONo}.pdf`;
          // ลบไฟล์เดิมก่อนอัปโหลดใหม่ เพื่ออัปเดตข้อมูล PDF (กรณี Reject → แก้ไข → บันทึกใหม่)
          await deleteGeneratedPdf(pdfPath);
          return await uploadGeneratedPdf(bytes, pdfPath);
        };

        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("PDF timeout")), 15000)
        );
        pdfUrl = await Promise.race([generateAndUpload(), timeout]);
      } catch (e) {
        console.warn("[PO Save] PDF generation/upload failed:", e);
        const msg = e?.message || String(e);
        pdfError = /permission|unauthorized|403|rules/i.test(msg)
          ? "ไม่มีสิทธิ์เขียน Storage — กรุณาตั้งค่า Storage Rules ใน Firebase Console"
          : msg;
      }

      setProgress(85, L.savingStep);

      const existingPoForCreator = editingPoId ? pos.find((p) => p.id === editingPoId) : null;
      const basePayload = {
        poNo: resolvedPoNo,
        poType: formData.poType,
        ...(formData.receiveType ? { receiveType: formData.receiveType } : {}),
        projectId: selectedProjectId,
        vendorId: formData.vendorId,
        requiredDate: formData.requiredDate,
        vatType: formData.vatType,
        items: itemsWithAllocations,
        amount: totals.total,
        grandTotal: totals.total,
        discount: formData.discount || 0,
        reason: formData.reason || "",
        ...(manualVatOverride != null && !isNaN(manualVatOverride) ? { manualVat: manualVatOverride } : {}),
        ...(pdfUrl ? { pdfUrl, pdfPath: `generated/pos/${(selectedProjectId || "unknown")}/${resolvedPoNo.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf` } : {}),
        attachments: attachmentList,
        createdByUid: existingPoForCreator?.createdByUid ?? user?.uid ?? null,
        createdByFirstName: existingPoForCreator?.createdByFirstName ?? creatorFirstName ?? null,
        createdByLastName: existingPoForCreator?.createdByLastName ?? creatorLastName ?? null,
        ...(creatorDisplayName || existingPoForCreator?.createdByName
          ? {
              createdByName: existingPoForCreator?.createdByName || creatorDisplayName,
            }
          : {}),
        creatorSignatureDataUrl: userData?.signatureDataUrl || userData?.signatureUrl || null,
        status: "Pending PCM",
        createdDate: existingPoForCreator?.createdDate || new Date().toISOString(),
        poDate: formData.poOpenDate ? new Date(formData.poOpenDate + "T00:00:00").toISOString() : new Date().toISOString(),
        location: formData.location || "",
        rejectReason: "",
        selectedPrIds: formData.selectedPrIds || [],
      };

      let success = false;

      // ─── doPostSave ต้องนิยามก่อนใช้ใน callback ────────────────────────────
      const doPostSave = (resolvedPdfUrl: string | undefined, resolvedPdfError: string | null) => {
        setSavePoProgress({ show: false, pct: 0, step: "" });
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setEditingPoId(null);
        // Clear reserved PO state after successful save
        setReservedPoNo("");
        setReservedCounterRef(null);
        setReservedSequence(0);
        setFormData({
          poNo: "", poType: "", receiveType: "", vendorId: "", requiredDate: "", poOpenDate: new Date().toISOString().split("T")[0], vatType: "ex-vat", selectedPrIds: [], items: [], reason: "", note: "", discount: 0, location: "",
        });
        setManualVatOverride(null);
        setVatEditOpen(false);
        setVatEditValue("");
        setDiscountEnabled(false);
        setPoPendingFiles([]);
        setPoSavedAttachments([]);
        if (resolvedPdfUrl) {
          showAlert("สำเร็จ", L.savePdfOk, "success");
        } else if (resolvedPdfError) {
          showAlert(L.savePdfWarn, resolvedPdfError, "warning");
        } else {
          showAlert("สำเร็จ", L.saveSuccess, "success");
        }
      };

      if (editingPoId) {
        // ─── ตรวจสอบว่าเป็นการแก้ไข PO จากการขอแก้ไข (Draft) หรือไม่ ────────
        const editingPo = pos.find((p) => p.id === editingPoId);
        const isRevisionEdit = editingPo?.status === "Draft" && editingPo?.originalPoAmount != null;
        // เปรียบเทียบที่ยอด pre-VAT (subtotal หลังหักส่วนลด) เพราะ PR allocation ไม่รวม VAT
        const newSubtotal = Math.max(0, totals.subtotal - (Number(formData.discount) || 0));
        const originalAmount = isRevisionEdit ? Number(editingPo.originalPoAmount) : null;

        if (isRevisionEdit && originalAmount != null && newSubtotal < originalAmount - 0.01) {
          // ยอดใหม่ต่ำกว่าเดิม → ถามคืนยอด PR (ใช้ยอด pre-VAT)
          const diff = originalAmount - newSubtotal;

          // หา PR IDs ที่ PO นี้อ้างอิง
          const affectedPrIds = [...new Set(
            (editingPo.items || [])
              .flatMap((i: any) => Array.isArray(i.disPrAllocations) ? i.disPrAllocations.map((a: any) => a.prId) : (i.prId ? [i.prId] : []))
              .filter(Boolean)
          )] as string[];

          // หยุด Progress ชั่วคราว — แสดงคำถามภายใน Progress Modal
          setSavePoProgress({ show: true, pct: 80, step: "กรุณาเลือกการจัดการยอด PR..." });
          setPrReturnMeta({ diff, prIds: affectedPrIds });
          setPrReturnPendingSaveFn(() => async (returnToPR: boolean) => {
            const setP = (pct: number, step: string) => setSavePoProgress({ show: true, pct, step });
            setP(85, L.savingStep);
            let extraFields: Record<string, any> = { originalPoAmount: null };
            if (!returnToPR) {
              // ล็อกยอดเดิมไว้ — PR ยังถูกตัดยอดเดิม
              const lockMap: Record<string, number> = {};
              if (editingPo.lockedPrAllocations) {
                Object.assign(lockMap, editingPo.lockedPrAllocations);
              } else {
                affectedPrIds.forEach((prId) => {
                  const oldAlloc = (editingPo.items || []).reduce((s: number, it: any) => {
                    if (Array.isArray(it.disPrAllocations)) {
                      it.disPrAllocations.forEach((a: any) => { if (a?.prId === prId) s += Number(a.amount) || 0; });
                    } else if (it.prId === prId) { s += Number(it.amount) || 0; }
                    return s;
                  }, 0);
                  lockMap[prId] = oldAlloc;
                });
              }
              extraFields.lockedPrAllocations = lockMap;
            } else {
              // คืนยอด PR → ตรวจสอบก่อนว่า PR ที่จะคืนไม่ได้อยู่ใน Closed/Pending Close
              for (const prId of affectedPrIds) {
                const pr = prs.find((p) => p.id === prId);
                if (!pr) continue;
                if (pr.status === "Closed PR" || pr.status === "Closed PR Auto" || pr.status === "Pending Close") {
                  showAlert(
                    "PR ถูกปิดอยู่",
                    L.savePrAgain(pr.prNo || pr.id, pr.status),
                    "warning"
                  );
                  setSavePoProgress({ show: false, pct: 0, step: "" });
                  return;
                }
              }
              extraFields.lockedPrAllocations = null;
            }
            const finalPayload = { ...basePayload, ...extraFields };
            const ok = await updateData("pos", editingPoId, finalPayload);
            if (ok) { setP(100, "เสร็จสิ้น!"); await new Promise(r => setTimeout(r, 600)); doPostSave(pdfUrl, pdfError); }
            else setSavePoProgress({ show: false, pct: 0, step: "" });
          });
          setPrReturnConfirmOpen(true);
          return;
        }

        // ปกติ (ยอดไม่ลด หรือไม่ใช่ revision edit) — ล้าง lock เดิมถ้ามี
        const normalPayload = { ...basePayload, originalPoAmount: null, lockedPrAllocations: null };
        success = await updateData("pos", editingPoId, normalPayload);
      } else {
        success = await addData("pos", basePayload);
        if (success) {
          setProgress(93, "อัปเดตสถานะใบขอซื้อ...");
          const uniquePrIds = [...new Set(
            (itemsWithAllocations || [])
              .flatMap((i: any) => Array.isArray(i.disPrAllocations) ? i.disPrAllocations.map((a: any) => a.prId) : [])
              .filter(Boolean)
          )];
          // คำนวณยอด Dis PR ที่ใช้ไปแล้วจาก PO ปัจจุบัน (ก่อน Firestore state update)
          const newPoAllocByPr: Record<string, number> = {};
          (itemsWithAllocations || []).forEach((i: any) => {
            if (Array.isArray(i.disPrAllocations)) {
              i.disPrAllocations.forEach((a: any) => {
                if (a?.prId) newPoAllocByPr[a.prId] = (newPoAllocByPr[a.prId] || 0) + (Number(a.amount) || 0);
              });
            }
          });
          for (const prId of uniquePrIds) {
            const pr = prs.find((p: any) => p.id === prId);
            if (!pr) continue;
            const prTotal = Number(pr.totalAmount) || 0;
            // ยอดที่ถูก Dis PR แล้ว = ยอดจาก PO เดิม + ยอดจาก PO ที่เพิ่งบันทึก
            const existingUsed = getUsedAmountByPR(prId, null);
            const totalUsed = existingUsed + (newPoAllocByPr[prId] || 0);
            if (prTotal > 0 && totalUsed >= prTotal - 0.01) {
              // ยอด Dis PR ครบ → ปิด PR อัตโนมัติ
              await updateData("prs", prId, { status: "Closed PR Auto", preCloseStatus: pr.status });
            } else {
              await updateData("prs", prId, { status: "PO Issued" });
            }
          }
        }
      }

      if (success) {
        setProgress(100, "เสร็จสิ้น!");
        await new Promise(r => setTimeout(r, 600));
        doPostSave(pdfUrl, pdfError);
      } else {
        setSavePoProgress({ show: false, pct: 0, step: "" });
      }
      } finally {
        poSendInFlightRef.current = false;
        setPoSendInFlight(false);
      }
    };

    // Quick Add Vendor
    const handleQuickAddVendor = async () => {
      if (!newVendor.name) return;
      const payload = { ...newVendor, code: newVendor.code || "-", type: newVendor.type || "General" };
      const success = await addData("vendors", payload);
      if (success) {
        setIsVendorModalOpen(false);
        setNewVendor({ name: "", code: "", type: "", tel: "", address: "", creditTerm: "" });
        // Ideally select the new vendor automatically, but refetch might delay. 
        // Simplified: User selects from list.
        showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
      }
    }

    const handleSubmitPoRevisionRequest = async () => {
      if (!poRevisionPoId) return;
      if (!canUseFunction("po", "requestRevision")) {
        showAlert("ไม่มีสิทธิ์", L.revisionNoPermit, "warning");
        return;
      }
      const reason = poRevisionReason.trim();
      if (!reason) {
        showAlert("กรุณาระบุเหตุผล", L.revisionNoReason, "warning");
        return;
      }
      const po = pos.find((p) => p.id === poRevisionPoId);
      if (!po) return;
      const flow = getPORevisionFlow(po.status);
      if (!flow) {
        showAlert("ไม่สามารถขอแก้ไข", `สถานะ ${L.docName} นี้ไม่อยู่ในขั้นที่ขอแก้ไขได้`, "warning");
        return;
      }
      const ok = await updateData("pos", po.id, {
        status: flow.pendingStatus,
        poEditRevisionResumeStatus: po.status,
        poEditRevisionReason: reason,
      });
      if (ok) {
        await logAction(`Request ${L.docName} Revision`, `ขอแก้ไข ${L.docName} ${po.poNo || po.id} → ${flow.pendingStatus}: ${reason}`, selectedProjectId);
        showAlert("ส่งคำขอแล้ว", "รอผู้อนุมัติขั้นที่เกี่ยวข้องพิจารณา", "success");
        setIsPoRevisionModalOpen(false);
        setPoRevisionReason("");
        setPoRevisionPoId(null);
        if (viewingPO && viewingPO.id === po.id) {
          setViewingPO((prev: any) => (prev ? { ...prev, status: flow.pendingStatus, poEditRevisionResumeStatus: po.status, poEditRevisionReason: reason } : null));
        }
      }
    };

    const handleAction = async (poId, action, reason = "") => {
      const po = pos.find(p => p.id === poId);
      if (!po) return;
      if (action === "approve" && !canApprovePO) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์อนุมัติ PO", "warning");
        return;
      }
      if (action === "reject" && !canRejectPO) {
        showAlert("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์ปฏิเสธ PO", "warning");
        return;
      }
      if (po.status === PO_REVISION_PENDING_PCM || po.status === PO_REVISION_PENDING_GM) return;

      let newStatus = po.status;
      if (action === "reject") {
        // Stamp reason into PDF if available
        let updatedPdfUrl: string | undefined;
        if (po.pdfUrl && reason) {
          try {
            const safePONo = (po.poNo || po.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
            const safeProjId = po.projectId || "unknown";
            const existingPdfRes = await fetch(`${po.pdfUrl}${po.pdfUrl.includes("?") ? "&" : "?"}t=${Date.now()}`);
            if (existingPdfRes.ok) {
              let bytes = new Uint8Array(await existingPdfRes.arrayBuffer());
              bytes = await stampTextToFieldRect(bytes, reason, "reason");
              const pdfPath = `generated/pos/${safeProjId}/${safePONo}.pdf`;
              await deleteGeneratedPdf(pdfPath);
              updatedPdfUrl = await uploadGeneratedPdf(bytes, pdfPath);
            }
          } catch (e) {
            console.warn("[PO Reject] Stamp reason failed:", e);
          }
        }
        await updateData("pos", poId, { status: "Rejected", rejectReason: reason, ...(updatedPdfUrl ? { pdfUrl: updatedPdfUrl } : {}) });
        showAlert("ปฏิเสธ", L.rejected, "error");
        return;
      }

      // Approve Flow
      const isPCMApprove = po.status === "Pending PCM" && (userRoles.includes("PCM") || userRoles.includes("Administrator"));
      const isGMApprove  = po.status === "Pending GM"  && (userRoles.includes("GM")  || userRoles.includes("Administrator"));
      const receiveTypeNormalized = String(po.receiveType || "").trim().toLowerCase();
      const isReceiveAutoType = receiveTypeNormalized === "receive auto";
      const isPayBeforeReceiveType = receiveTypeNormalized.includes("pay before");
      if (isPCMApprove) {
        newStatus = "Pending GM";
      } else if (isGMApprove) {
        // Auto-receive PO: after final approval, skip "Approved" and go directly to "Received"
        // Pay before receive: after final approval, wait invoice before returning to Approved for Receive flow
        if (isReceiveAutoType) newStatus = "Received";
        else if (isPayBeforeReceiveType) newStatus = "Wait Invoice";
        else newStatus = "Approved";
      }

      if (newStatus !== po.status) {
        setPoApproveFlightFromStatus((s) => ({ ...s, [poId]: po.status }));
        let updatedPdfUrl: string | undefined;
        let firestoreExtra: Record<string, any> = {};

        const approverSig = userData?.signatureDataUrl || userData?.signatureUrl;
        const nowDate = new Date().toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
        const nowIso = new Date().toISOString();

        try {
          const safePONo = (po.poNo || po.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
          const safeProjId = po.projectId || "unknown";
          const vendor = vendors.find((v: any) => v.id === po.vendorId) || null;
          const project = projects.find((p: any) => p.id === po.projectId) || null;

          // Build po data with approve dates filled in for regeneration
          const pcmdate = isPCMApprove ? nowDate : (po.pcmApprovedAt ? new Date(po.pcmApprovedAt).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
          const gmdate  = isGMApprove  ? nowDate : "";

          const poDataForPdf = {
            ...po,
            pcmdate,
            gmdate,
            reason: po.reason || "",
          };

          // Regenerate PDF ใหม่ทั้งหมดจากข้อมูลล่าสุด (แทนการ stamp ทับไฟล์เก่า)
          let bytes = await generatePOPdfBytes(poDataForPdf, { vendor, project });

          // Stamp Signature1 = ผู้สร้าง PO
          const creatorSig = po.creatorSignatureDataUrl;
          if (creatorSig) {
            try { bytes = await stampSignatureToField(bytes, creatorSig, "Signature1"); }
            catch (e) { console.warn("[PO Approve] Stamp Signature1 failed:", e); }
          }

          // Stamp Signature2 = PCM (ถ้า GM กำลัง approve ให้ใช้ pcmSignatureDataUrl ที่เก็บไว้)
          const pcmSig = isPCMApprove ? approverSig : po.pcmSignatureDataUrl;
          if (pcmSig) {
            try { bytes = await stampSignatureToField(bytes, pcmSig, "Signature2"); }
            catch (e) { console.warn("[PO Approve] Stamp Signature2 failed:", e); }
          }

          // Stamp Signature3 = GM
          if (isGMApprove && approverSig) {
            try { bytes = await stampSignatureToField(bytes, approverSig, "Signature3"); }
            catch (e) { console.warn("[PO Approve] Stamp Signature3 failed:", e); }
          }

          // pcmdate / gmdate ถูก embed โดยตรงผ่าน form field ใน generatePOPdfBytes แล้ว
          // ไม่ต้อง stampTextToFieldRect ซ้ำ (ถ้า stamp ซ้ำจะทำให้ข้อความทับกัน)

          const pdfPath = `generated/pos/${safeProjId}/${safePONo}.pdf`;
          await deleteGeneratedPdf(pdfPath);
          updatedPdfUrl = await uploadGeneratedPdf(bytes, pdfPath);

          // เก็บ signature ของ PCM ไว้ใช้ตอน GM regenerate ในรอบถัดไป
          if (isPCMApprove && approverSig) {
            firestoreExtra.pcmSignatureDataUrl = approverSig;
          }
        } catch (stampErr) {
          console.warn(`[PO Approve] PDF regeneration/stamp failed:`, stampErr);
        }

        const ok = await updateData("pos", poId, {
          status: newStatus,
          ...(newStatus === "Received" ? { statusNow: "Received" } : {}),
          ...(newStatus === "Wait Invoice" ? { statusNow: "Wait Invoice" } : {}),
          rejectReason: "",
          ...(isPCMApprove ? { pcmApprovedAt: nowIso } : {}),
          ...(isGMApprove  ? { gmApprovedAt:  nowIso } : {}),
          ...(updatedPdfUrl ? { pdfUrl: updatedPdfUrl, pdfUpdatedAt: nowIso } : {}),
          ...firestoreExtra,
        });

        if (!ok) {
          setPoApproveFlightFromStatus((s) => {
            const n = { ...s };
            delete n[poId];
            return n;
          });
        } else if (viewingPO && viewingPO.id === poId) {
          setViewingPO((prev) => ({
            ...prev,
            status: newStatus,
            rejectReason: "",
            ...(updatedPdfUrl ? { pdfUrl: updatedPdfUrl, pdfUpdatedAt: nowIso } : {}),
          }));
        }
      }
    };

    // For Reject Modal
    const [rejectPoId, setRejectPoId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    const getPoCreatorDisplayName = useCallback((po) => {
      const nameFromFirstLast = [po.createdByFirstName, po.createdByLastName].filter(Boolean).join(" ");
      const nameFromUidMap = po.createdByUid ? userNameByUid[po.createdByUid] : "";
      return po.createdByName || nameFromFirstLast || nameFromUidMap || (po.createdByUid ? `${String(po.createdByUid).slice(0, 8)}…` : "—");
    }, [userNameByUid]);

    const getPoSortValue = useCallback((entry, key) => {
      const { po, prNos, descSummary, vendorName, creatorName } = entry;
      switch (key) {
        case "poNo": return String(po.poNo || po.id || "");
        case "poType": return String(po.poType || "");
        case "prNos": return String(prNos || "");
        case "description": return String(descSummary || "");
        case "vendor": return String(vendorName || "");
        case "creator": return String(creatorName || "");
        case "items": return Number(po.items?.length || 0);
        case "amount": return Number(po.amount || po.grandTotal || po.totalAmount || 0);
        case "status": return String(po.status || "");
        default: return "";
      }
    }, []);

    const requestPoSort = useCallback((key) => {
      setPoSortConfig((prev) => ({
        key,
        direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
      }));
    }, []);

    const getPoSortIndicator = useCallback((key) => {
      if (poSortConfig.key !== key) return "↕";
      return poSortConfig.direction === "asc" ? "▲" : "▼";
    }, [poSortConfig]);

    const displayedPOsPending = useMemo(() => {
      const q = (poTableSearchText || "").trim().toLowerCase();
      const pendingActionStatuses = ["Pending PCM", "Pending GM", PO_REVISION_PENDING_PCM, PO_REVISION_PENDING_GM, "Rejected", "Draft", "Pending Close PO"];

      const base = pos
        .filter((po) => po.projectId === selectedProjectId && pendingActionStatuses.includes(po.status))
        .map((po) => {
          const vendor = vendors.find((v) => v.id === po.vendorId);
          const prIds = getPoRefPrIds(po);
          const prNos = prIds.map(id => prs.find(p => p.id === id)?.prNo || "-").join(", ");
          const firstDesc = po.items && po.items.length > 0 ? po.items[0].description : "-";
          const descSummary = po.items && po.items.length > 1 ? `${firstDesc} (+${po.items.length - 1})` : firstDesc;
          const vendorName = vendor?.name || "-";
          const creatorName = getPoCreatorDisplayName(po);
          return { po, vendorName, prNos, descSummary, creatorName };
        });

      const filtered = !q
        ? base
        : base.filter(({ po, vendorName, prNos, descSummary, creatorName }) => {
            const blob = [
              po.poNo,
              po.poType,
              po.status,
              po.projectId,
              po.requiredDate,
              po.poDate,
              po.receiveType,
              po.location,
              po.reason,
              po.note,
              prNos,
              descSummary,
              vendorName,
              creatorName,
              po.items?.length,
              po.amount,
            ].filter(Boolean).join(" ").toLowerCase();
            return blob.includes(q);
          });

      if (!poSortConfig.key) return filtered;

      const { key, direction } = poSortConfig;
      return [...filtered].sort((a, b) => {
        const av = getPoSortValue(a, key);
        const bv = getPoSortValue(b, key);
        if (typeof av === "number" || typeof bv === "number") {
          const na = Number(av) || 0;
          const nb = Number(bv) || 0;
          return direction === "asc" ? na - nb : nb - na;
        }
        return direction === "asc"
          ? String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" })
          : String(bv).localeCompare(String(av), undefined, { numeric: true, sensitivity: "base" });
      });
    }, [pos, selectedProjectId, vendors, prs, getPoRefPrIds, getPoCreatorDisplayName, poTableSearchText, poSortConfig, getPoSortValue]);

    const displayedPOsNormal = useMemo(() => {
      const q = (poTableSearchText || "").trim().toLowerCase();
      const pendingActionStatuses = ["Pending PCM", "Pending GM", PO_REVISION_PENDING_PCM, PO_REVISION_PENDING_GM, "Rejected", "Draft", "Pending Close PO"];

      const base = pos
        .filter((po) => po.projectId === selectedProjectId && po.status !== "Closed PO" && po.status !== "Received" && !pendingActionStatuses.includes(po.status))
        .map((po) => {
          const vendor = vendors.find((v) => v.id === po.vendorId);
          const prIds = getPoRefPrIds(po);
          const prNos = prIds.map(id => prs.find(p => p.id === id)?.prNo || "-").join(", ");
          const firstDesc = po.items && po.items.length > 0 ? po.items[0].description : "-";
          const descSummary = po.items && po.items.length > 1 ? `${firstDesc} (+${po.items.length - 1})` : firstDesc;
          const vendorName = vendor?.name || "-";
          const creatorName = getPoCreatorDisplayName(po);
          return { po, vendorName, prNos, descSummary, creatorName };
        });

      const filtered = !q
        ? base
        : base.filter(({ po, vendorName, prNos, descSummary, creatorName }) => {
            const blob = [
              po.poNo,
              po.poType,
              po.status,
              po.projectId,
              po.requiredDate,
              po.poDate,
              po.receiveType,
              po.location,
              po.reason,
              po.note,
              prNos,
              descSummary,
              vendorName,
              creatorName,
              po.items?.length,
              po.amount,
            ].filter(Boolean).join(" ").toLowerCase();
            return blob.includes(q);
          });

      if (!poSortConfig.key) return filtered;

      const { key, direction } = poSortConfig;
      return [...filtered].sort((a, b) => {
        const av = getPoSortValue(a, key);
        const bv = getPoSortValue(b, key);
        if (typeof av === "number" || typeof bv === "number") {
          const na = Number(av) || 0;
          const nb = Number(bv) || 0;
          return direction === "asc" ? na - nb : nb - na;
        }
        return direction === "asc"
          ? String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" })
          : String(bv).localeCompare(String(av), undefined, { numeric: true, sensitivity: "base" });
      });
    }, [pos, selectedProjectId, vendors, prs, getPoRefPrIds, getPoCreatorDisplayName, poTableSearchText, poSortConfig, getPoSortValue]);

    const renderPoHeaderCells = () => (
      <>
        {isColumnVisible("po", "poNo") && <ResizableTh tableId="po" colKey="poNo" className="py-2 px-3 cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.poNo} onClick={() => requestPoSort("poNo")}>{L.docNo} <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("poNo")}</span></ResizableTh>}
        {isColumnVisible("po", "poType") && <ResizableTh tableId="po" colKey="poType" className="py-2 px-3 text-center cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.poType} onClick={() => requestPoSort("poType")}>Type <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("poType")}</span></ResizableTh>}
        {isColumnVisible("po", "prNos") && <ResizableTh tableId="po" colKey="prNos" className="py-2 px-3 cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.prNos} onClick={() => requestPoSort("prNos")}>Ref PR No. <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("prNos")}</span></ResizableTh>}
        {isColumnVisible("po", "description") && <ResizableTh tableId="po" colKey="description" className="py-2 px-3 cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.description} onClick={() => requestPoSort("description")}>Description PR <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("description")}</span></ResizableTh>}
        {isColumnVisible("po", "vendor") && <ResizableTh tableId="po" colKey="vendor" className="py-2 px-3 cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.vendor} onClick={() => requestPoSort("vendor")}>Vendor <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("vendor")}</span></ResizableTh>}
        {isColumnVisible("po", "creator") && <ResizableTh tableId="po" colKey="creator" className="py-2 px-3 cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.creator} onClick={() => requestPoSort("creator")}>ผู้เปิด/สร้าง PO <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("creator")}</span></ResizableTh>}
        {isColumnVisible("po", "items") && <ResizableTh tableId="po" colKey="items" className="py-2 px-3 text-center cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.items} onClick={() => requestPoSort("items")}>Item <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("items")}</span></ResizableTh>}
        {isColumnVisible("po", "amount") && <ResizableTh tableId="po" colKey="amount" className="py-2 px-3 text-right cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.amount} onClick={() => requestPoSort("amount")}>Amount <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("amount")}</span></ResizableTh>}
        {isColumnVisible("po", "status") && <ResizableTh tableId="po" colKey="status" className="py-2 px-3 text-center cursor-pointer select-none" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={poMainLayout.scaled.status} onClick={() => requestPoSort("status")}>Status <span className="text-[10px] ml-1 opacity-70">{getPoSortIndicator("status")}</span></ResizableTh>}
        {isColumnVisible("po", "actions") && <th className="py-2 px-3 text-right" style={{ width: poMainLayout.scaled.actions }}>Action</th>}
      </>
    );

    return (
      <div className="space-y-4">

        {/* ── Progress Modal: render ที่ document.body ผ่าน Portal เพื่อไม่ให้ถูกทับโดย modal อื่น ── */}
        {savePoProgress.show && createPortal(
          <div style={{ position: "fixed", inset: 0, zIndex: 999999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}>
            <div className="bg-white rounded-2xl shadow-2xl px-8 py-7 w-80 flex flex-col items-center gap-4">
              {/* วงกลม progress ring */}
              <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="absolute inset-0 w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#e2e8f0" strokeWidth="6" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    stroke={savePoProgress.pct < 100 ? "#dc2626" : "#16a34a"}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 28}`}
                    strokeDashoffset={`${2 * Math.PI * 28 * (1 - savePoProgress.pct / 100)}`}
                    style={{ transition: "stroke-dashoffset 0.4s ease, stroke 0.3s" }}
                  />
                </svg>
                <span className={`text-base font-bold ${savePoProgress.pct < 100 ? "text-red-600" : "text-green-600"}`}>
                  {savePoProgress.pct}%
                </span>
              </div>

              {/* Step description */}
              <p className="text-sm font-semibold text-slate-700 text-center">{savePoProgress.step}</p>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${savePoProgress.pct < 100 ? "bg-red-500" : "bg-green-500"}`}
                  style={{ width: `${savePoProgress.pct}%` }}
                />
              </div>

              {/* ── คำถามคืนยอด PR (แทรกภายใน Modal เดียวกัน) ── */}
              {prReturnConfirmOpen && prReturnMeta ? (
                <div className="w-full border-t border-slate-100 pt-3 flex flex-col gap-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {L.amountDrop} <span className="font-bold text-red-600">{formatCurrency(prReturnMeta.diff)}</span> จากยอดเดิม
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    <span className="font-semibold text-green-700">คืนยอด</span> — ยอดคงเหลือ PR เพิ่มขึ้นตามส่วนต่าง<br />
                    <span className="font-semibold text-slate-600">ไม่คืน</span> — PR ยังถูกตัดยอดตามยอดเดิม
                  </p>
                  <div className="flex gap-2 justify-end mt-1">
                    <button
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      onClick={async () => {
                        setPrReturnConfirmOpen(false);
                        if (prReturnPendingSaveFn) await prReturnPendingSaveFn(false);
                        setPrReturnPendingSaveFn(null);
                        setPrReturnMeta(null);
                      }}
                    >
                      ไม่คืนยอด PR
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 hover:bg-green-700 text-white transition-colors"
                      onClick={async () => {
                        setPrReturnConfirmOpen(false);
                        if (prReturnPendingSaveFn) await prReturnPendingSaveFn(true);
                        setPrReturnPendingSaveFn(null);
                        setPrReturnMeta(null);
                      }}
                    >
                      คืนยอด PR
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400">กรุณารอสักครู่...</p>
              )}
            </div>
          </div>,
          document.body
        )}

        {/* ── Dis PR Picker: render ผ่าน Portal เพื่อไม่โดน scroll container ตัด ── */}
        {disPrPickerOpenKey && disPrPickerRect && createPortal(
          <>
            {/* backdrop */}
            <div
              style={{ position: "fixed", inset: 0, zIndex: 9998 }}
              onClick={() => { setDisPrPickerOpenKey(null); setDisPrPickerRect(null); }}
              aria-hidden
            />
            <div
              className="fixed w-72 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
              style={{
                top: disPrPickerRect.bottom + 6,
                left: Math.max(8, Math.min(disPrPickerRect.left, window.innerWidth - 8 - 288)),
                zIndex: 9999,
              }}
            >
              {(() => {
                // parse key: item:prId:idx | free:freeId
                const key = disPrPickerOpenKey || "";
                const parts = key.split(":");
                const kind = parts[0];
                const itemRef =
                  kind === "item"
                    ? { type: "item" as const, prId: parts[1], prItemIndex: Number(parts[2]) }
                    : { type: "free" as const, id: parts.slice(1).join(":") };
                const plan: string[] = (() => {
                  if (itemRef.type === "item") {
                    const it = (formData.items || []).find((x: any) => x.prId === itemRef.prId && x.prItemIndex === itemRef.prItemIndex);
                    return Array.isArray(it?.disPrPlan) ? it.disPrPlan : [];
                  }
                  const it = (formData.items || []).find((x: any) => x.id === itemRef.id);
                  return Array.isArray(it?.disPrPlan) ? it.disPrPlan : [];
                })();

                return (
                  <>
                    <div className="px-3 py-2 text-[10px] font-bold text-slate-500 bg-slate-50 border-b border-slate-100 uppercase tracking-wider">
                      เลือก Dis PR (เรียงลำดับ)
                    </div>
                    <div className="py-1">
                      {disPrOptions.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-slate-400">ยังไม่ได้เลือก PR (ข้อ 2)</div>
                      ) : (
                        disPrOptions.map((opt: any) => {
                          const checked = plan.includes(opt.prNo);
                          return (
                            <button
                              key={opt.prId}
                              type="button"
                              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 ${checked ? "text-slate-900" : "text-slate-700"}`}
                              onClick={() => toggleDisPrInPlan(itemRef as any, opt.prNo)}
                            >
                              <span className={`w-4 h-4 rounded border flex items-center justify-center ${checked ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300"}`}>
                                {checked ? "✓" : ""}
                              </span>
                              <span className="font-semibold">{opt.prNo}</span>
                              {checked && (
                                <span className="ml-auto text-[10px] text-slate-400">ลำดับ {plan.indexOf(opt.prNo) + 1}</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <div className="px-3 py-2 bg-white border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">{plan.length > 0 ? `เลือกแล้ว ${plan.length}` : ""}</span>
                      <button
                        type="button"
                        className="text-[10px] font-bold text-blue-700"
                        onClick={() => { setDisPrPickerOpenKey(null); setDisPrPickerRect(null); }}
                      >
                        ปิด
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </>,
          document.body
        )}

        {/* Access Control Check */}
        {!canAccessModule("po") && !canAccessModule("po-table") ? (
          <div className="flex items-center justify-center min-h-[50vh] bg-white rounded-lg border border-slate-200">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <ShoppingCart size={32} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">ไม่มีสิทธิ์เข้าถึง</h3>
              <p className="text-slate-600 text-sm mb-4">คุณไม่มีสิทธิ์เข้าถึงระบบ Purchase Order (PO)</p>
              <p className="text-xs text-slate-500">กรุณาติดต่อ Administrator เพื่อขอสิทธิ์การใช้งาน</p>
            </div>
          </div>
        ) : (
        <>
        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center shadow-sm">
              <ShoppingCart size={19} className="text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-amber-800 leading-none">{L.pageTitle}</h2>
              <p className="text-[10px] text-amber-400 mt-1">จัดการใบสั่งซื้อและติดตามสถานะ</p>
            </div>
            <div className="ml-2">
              <ColumnVisibilityToggle tableId="po" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหา PO ได้ทุกคอลัมน์ (PO, Vendor, Ref PR...)"
                value={poTableSearchText}
                onChange={(e) => setPoTableSearchText(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300 w-72"
              />
            </div>
            {canUseFunction("po", "create") && (
              <Button
                className="bg-amber-500 hover:bg-amber-600 text-white shadow-md shadow-amber-100 border-none rounded-xl px-4 py-2 text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
                onClick={() => {
                  setEditingPoId(null);
                  setPoPendingFiles([]);
                  setPoSavedAttachments([]);
                  setFormData({
                    poNo: "",
                    poType: "",
                    receiveType: "",
                    vendorId: "",
                    requiredDate: "",
                    poOpenDate: new Date().toISOString().split("T")[0],
                    vatType: "ex-vat",
                    selectedPrIds: [],
                    items: [],
                    reason: "",
                    note: "",
                    discount: 0,
                    location: "",
                  });
                  setManualVatOverride(null);
                  setVatEditOpen(false);
                  setDiscountEnabled(false);
                  setIsModalOpen(true);
                  setIsFullScreenModalOpen(true);
                }}
              >
                <Plus size={16} /> {L.createBtn}
              </Button>
            )}
          </div>
        </div>

        {/* ── ตารางบนสุด: รายการรอ Action (รอ Approve / รอแก้ไข) ── */}
        {displayedPOsPending.length > 0 && (
          <Card className="overflow-hidden w-full min-w-0 border-t-4 border-t-amber-500">
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-700" />
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                PO — รอดำเนินการ (รอ Approve / รอแก้ไข)
              </h3>
            </div>
            <div ref={poTableRef} className="w-full min-w-0">
              <table className="w-full text-left text-xs text-slate-600 table-fixed">
                <thead className="bg-amber-100/60 text-slate-900 uppercase font-semibold">
                  <tr>
                    {renderPoHeaderCells()}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedPOsPending
                    .map(({ po, vendorName, prNos, descSummary, creatorName }) => {
                      return (
                        <React.Fragment key={po.id}>
                          <tr
                            className="hover:bg-amber-50 cursor-pointer transition-colors border-b odd:bg-white even:bg-amber-50/25"
                            onClick={() => setViewingPO(po)}
                          >
                            {isColumnVisible("po", "poNo") && <td className="py-2 px-3 font-medium text-blue-700" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>}
                            {isColumnVisible("po", "poType") && <td className="py-2 px-3 text-center">
                              {po.poType && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                                  {po.poType}
                                </span>
                              )}
                            </td>}
                            {isColumnVisible("po", "prNos") && <td className="py-2 px-3 text-xs" title={prNos}><span className="cell-text">{prNos}</span></td>}
                            {isColumnVisible("po", "description") && <td className="py-2 px-3 text-xs text-slate-600" title={descSummary}><span className="cell-text">{descSummary}</span></td>}
                            {isColumnVisible("po", "vendor") && <td className="py-2 px-3" title={vendorName || "-"}><span className="cell-text">{vendorName || "-"}</span></td>}
                            {isColumnVisible("po", "creator") && (() => {
                              return (
                                <td className="py-2 px-3 text-xs" title={creatorName}>
                                  <span className="cell-text">{creatorName}</span>
                                </td>
                              );
                            })()}
                            {isColumnVisible("po", "items") && <td className="py-2 px-3 text-center">{po.items ? po.items.length : 1}</td>}
                            {isColumnVisible("po", "amount") && <td className="py-2 px-3 text-right font-semibold">{formatCurrency(po.amount)}</td>}
                            {isColumnVisible("po", "status") && <td className="py-2 px-3 text-center">
                              <div className="flex flex-col items-center">
                                <Badge status={po.status} />
                                {po.poEditRevisionReason && (po.status === PO_REVISION_PENDING_PCM || po.status === PO_REVISION_PENDING_GM) && (
                                  <span className="text-[9px] text-amber-700 mt-0.5 max-w-[100px] truncate" title={po.poEditRevisionReason}>
                                    เหตุผลขอแก้: {po.poEditRevisionReason}
                                  </span>
                                )}
                                {po.rejectReason && (
                                  <span className="text-[10px] text-red-500 mt-1 max-w-[100px] truncate" title={po.rejectReason}>
                                    {po.rejectReason}
                                  </span>
                                )}
                              </div>
                            </td>}
                            {isColumnVisible("po", "actions") && <td
                              className="py-2 px-3 text-right flex justify-end gap-1 flex-wrap"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {/* ขอแก้ไข PO — ตามสถานะส่งไป PCM หรือ GM */}
                              {canUseFunction("po", "requestRevision") &&
                                getPORevisionFlow(po.status) &&
                                po.status !== PO_REVISION_PENDING_PCM &&
                                po.status !== PO_REVISION_PENDING_GM && (
                                <button
                                  type="button"
                                  className="inline-flex items-center justify-center p-1 rounded text-orange-600 hover:text-orange-800 hover:bg-orange-50 transition-colors"
                                  title={L.revisionTooltip}
                                  onClick={() => {
                                    setPoRevisionPoId(po.id);
                                    setPoRevisionReason("");
                                    setIsPoRevisionModalOpen(true);
                                  }}
                                >
                                  <RefreshCw size={15} />
                                </button>
                              )}
                              {/* อนุญาต / ไม่อนุญาต แก้ไข PO */}
                              {po.status === PO_REVISION_PENDING_PCM && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                                <>
                                  {canAllowPORevision && <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionAllow(po.id)}>อนุญาตแก้ไข</Button>}
                                  {canDenyPORevision && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionDeny(po.id)}>ไม่อนุญาต</Button>}
                                </>
                              )}
                              {po.status === PO_REVISION_PENDING_GM && (userRoles.includes("GM") || userRoles.includes("Administrator")) && (
                                <>
                                  {canAllowPORevision && <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionAllow(po.id)}>อนุญาตแก้ไข</Button>}
                                  {canDenyPORevision && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionDeny(po.id)}>ไม่อนุญาต</Button>}
                                </>
                              )}
                              {/* Approval Buttons */}
                              {canApprovePO && po.status === "Pending PCM" && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(po) && (
                                <>
                                  <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>PCM Approve</Button>
                                  {canRejectPO && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>}
                                </>
                              )}
                              {canApprovePO && po.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(po) && (
                                <>
                                  <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>GM Approve</Button>
                                  {canRejectPO && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>}
                                </>
                              )}
                              {canUseFunction("po", "edit") && (po.status === "Rejected" || po.status === "Draft") && (userRoles.includes("Procurement") || userRoles.includes("Administrator")) && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="px-2 py-0.5 text-[10px]"
                                  onClick={() => {
                                    // เตรียมฟอร์มสำหรับแก้ไข PO ที่ถูก Reject
                                    const prIdsFromItems = getPoRefPrIds(po);
                                    const poOpenDateVal = po.poDate ? (po.poDate.split("T")[0] || new Date().toISOString().split("T")[0]) : new Date().toISOString().split("T")[0];
                                    setPoPendingFiles([]);
                                    setPoSavedAttachments(
                                      Array.isArray(po.attachments)
                                        ? po.attachments.filter((a: any) => a?.url).map((a: any) => ({ url: a.url, name: a.name || "ไฟล์" }))
                                        : []
                                    );
                                    setFormData({
                                      poNo: po.poNo || "",
                                      poType: po.poType || "",
                                      receiveType: po.receiveType || "",
                                      vendorId: po.vendorId || "",
                                      requiredDate: po.requiredDate || "",
                                      poOpenDate: poOpenDateVal,
                                      vatType: po.vatType || "ex-vat",
                                      selectedPrIds: Array.isArray(po.selectedPrIds) && po.selectedPrIds.length > 0 ? po.selectedPrIds : prIdsFromItems,
                                      items: (po.items || []).map((it, idx) => ((it.prId == null || it.prId === "") && !it.id) ? { ...it, id: `free-${idx}-${Date.now()}` } : it),
                                      reason: po.reason || "",
                                      note: po.note || "",
                                      discount: po.discount ?? 0,
                                      location: po.location || "",
                                    });
                                    if (po.location && !DELIVERY_LOCATIONS.includes(po.location)) {
                                      setLocationOptions(prev => prev.includes(po.location) ? prev : [...prev, po.location]);
                                    }
                                    setManualVatOverride(po.manualVat != null ? Number(po.manualVat) : null);
                                    setVatEditOpen(false);
                                    setVatEditValue("");
                                    setDiscountEnabled((po.discount ?? 0) > 0);
                                    setEditingPoId(po.id);
                                    setIsModalOpen(true);
                                    setIsFullScreenModalOpen(true);
                                  }}
                                >
                                  Edit
                                </Button>
                              )}

                              {/* Step 3: PDF view button — always shows latest stamped PDF */}
                              {po.pdfUrl && (
                                <a
                                  href={po.pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center justify-center p-1 rounded text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors"
                                  title="ดู PDF"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <FileOutput size={15} />
                                </a>
                              )}

                              {canUseFunction("po", "delete") && (
                                <button
                                  className="text-red-500 hover:text-red-700 p-1"
                                  onClick={() => {
                                    openConfirm("ยืนยันการลบ", `คุณต้องการลบ ${L.docName} นี้ใช่หรือไม่?`, async () => {
                                      const prIds = getPoRefPrIds(po);
                                      if (po.pdfUrl) {
                                        const safePONo = (po.poNo || po.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
                                        const safeProjId = po.projectId || "unknown";
                                        await deleteGeneratedPdf(`generated/pos/${safeProjId}/${safePONo}.pdf`);
                                      }
                                      const deleted = await deleteData("pos", po.id);
                                      if (deleted && prIds.length > 0) {
                                        for (const prId of prIds) {
                                          const stillUsedByOtherPO = pos.some((p: any) => p.id !== po.id && p.items?.some((i: any) => i.prId === prId));
                                          if (!stillUsedByOtherPO) {
                                            await updateData("prs", prId, { status: "Approved" });
                                          }
                                        }
                                      }
                                    }, "danger");
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {/* ยืนยัน Close PO — เฉพาะสถานะ Pending Close PO */}
                              {canUseFunction("po", "closePO") && po.status === "Pending Close PO" && (
                                <Button
                                  variant="success"
                                  size="sm"
                                  className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                  onClick={() => {
                                    openConfirm(
                                      "ยืนยันการปิด PO",
                                      `คุณต้องการปิด ${L.docName} ${po.poNo} ใช่หรือไม่?`,
                                      async () => {
                                        await updateData("pos", po.id, { status: "Closed PO" });
                                      },
                                      "success"
                                    );
                                  }}
                                >
                                  ยืนยัน Close
                                </Button>
                              )}
                            </td>}
                          </tr>
                        </React.Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── ตารางกลาง: รายการปกติ (ไม่รอ Action) ── */}
        <Card className="overflow-hidden w-full min-w-0">
          <div ref={poTableRef} className="w-full min-w-0">
          <table className="w-full text-left text-xs text-slate-600 table-fixed">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                {renderPoHeaderCells()}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedPOsNormal
                .map(({ po, vendorName, prNos, descSummary, creatorName }) => {
                  return (
                    <React.Fragment key={po.id}>
                      <tr
                        className="hover:bg-blue-50 cursor-pointer transition-colors border-b odd:bg-white even:bg-slate-50"
                        onClick={() => setViewingPO(po)}
                      >
                        {isColumnVisible("po", "poNo") && <td className="py-2 px-3 font-medium text-blue-700" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>}
                        {isColumnVisible("po", "poType") && <td className="py-2 px-3 text-center">
                          {po.poType && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {po.poType}
                            </span>
                          )}
                        </td>}
                        {isColumnVisible("po", "prNos") && <td className="py-2 px-3 text-xs" title={prNos}><span className="cell-text">{prNos}</span></td>}
                        {isColumnVisible("po", "description") && <td className="py-2 px-3 text-xs text-slate-600" title={descSummary}><span className="cell-text">{descSummary}</span></td>}
                        {isColumnVisible("po", "vendor") && <td className="py-2 px-3" title={vendorName || "-"}><span className="cell-text">{vendorName || "-"}</span></td>}
                        {isColumnVisible("po", "creator") && (() => {
                          return (
                            <td className="py-2 px-3 text-xs" title={creatorName}>
                              <span className="cell-text">{creatorName}</span>
                            </td>
                          );
                        })()}
                        {isColumnVisible("po", "items") && <td className="py-2 px-3 text-center">{po.items ? po.items.length : 1}</td>}
                        {isColumnVisible("po", "amount") && <td className="py-2 px-3 text-right font-semibold">{formatCurrency(po.amount)}</td>}
                        {isColumnVisible("po", "status") && <td className="py-2 px-3 text-center">
                          <div className="flex flex-col items-center">
                            <Badge status={po.status} />
                            {po.poEditRevisionReason && (po.status === PO_REVISION_PENDING_PCM || po.status === PO_REVISION_PENDING_GM) && (
                              <span className="text-[9px] text-amber-700 mt-0.5 max-w-[100px] truncate" title={po.poEditRevisionReason}>
                                เหตุผลขอแก้: {po.poEditRevisionReason}
                              </span>
                            )}
                            {po.rejectReason && (
                              <span className="text-[10px] text-red-500 mt-1 max-w-[100px] truncate" title={po.rejectReason}>
                                {po.rejectReason}
                              </span>
                            )}
                          </div>
                        </td>}
                        {isColumnVisible("po", "actions") && <td
                          className="py-2 px-3 text-right flex justify-end gap-1 flex-wrap"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* ขอแก้ไข PO — ตามสถานะส่งไป PCM หรือ GM */}
                          {canUseFunction("po", "requestRevision") &&
                            getPORevisionFlow(po.status) &&
                            po.status !== PO_REVISION_PENDING_PCM &&
                            po.status !== PO_REVISION_PENDING_GM && (
                            <button
                              type="button"
                              className="inline-flex items-center justify-center p-1 rounded text-orange-600 hover:text-orange-800 hover:bg-orange-50 transition-colors"
                              title={L.revisionTooltip}
                              onClick={() => {
                                setPoRevisionPoId(po.id);
                                setPoRevisionReason("");
                                setIsPoRevisionModalOpen(true);
                              }}
                            >
                              <RefreshCw size={15} />
                            </button>
                          )}
                          {/* อนุญาต / ไม่อนุญาต แก้ไข PO */}
                          {po.status === PO_REVISION_PENDING_PCM && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                            <>
                              {canAllowPORevision && <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionAllow(po.id)}>อนุญาตแก้ไข</Button>}
                              {canDenyPORevision && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionDeny(po.id)}>ไม่อนุญาต</Button>}
                            </>
                          )}
                          {po.status === PO_REVISION_PENDING_GM && (userRoles.includes("GM") || userRoles.includes("Administrator")) && (
                            <>
                              {canAllowPORevision && <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionAllow(po.id)}>อนุญาตแก้ไข</Button>}
                              {canDenyPORevision && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handlePORevisionDeny(po.id)}>ไม่อนุญาต</Button>}
                            </>
                          )}
                          {/* Approval Buttons */}
                          {canApprovePO && po.status === "Pending PCM" && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(po) && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>PCM Approve</Button>
                              {canRejectPO && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>}
                            </>
                          )}
                          {canApprovePO && po.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(po) && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>GM Approve</Button>
                              {canRejectPO && <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>}
                            </>
                          )}
                          {canUseFunction("po", "edit") && (po.status === "Rejected" || po.status === "Draft") && (userRoles.includes("Procurement") || userRoles.includes("Administrator")) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="px-2 py-0.5 text-[10px]"
                              onClick={() => {
                                // เตรียมฟอร์มสำหรับแก้ไข PO ที่ถูก Reject
                                const prIdsFromItems = getPoRefPrIds(po);
                                const poOpenDateVal = po.poDate ? (po.poDate.split("T")[0] || new Date().toISOString().split("T")[0]) : new Date().toISOString().split("T")[0];
                                setPoPendingFiles([]);
                                setPoSavedAttachments(
                                  Array.isArray(po.attachments)
                                    ? po.attachments.filter((a: any) => a?.url).map((a: any) => ({ url: a.url, name: a.name || "ไฟล์" }))
                                    : []
                                );
                                setFormData({
                                  poNo: po.poNo || "",
                                  poType: po.poType || "",
                                  receiveType: po.receiveType || "",
                                  vendorId: po.vendorId || "",
                                  requiredDate: po.requiredDate || "",
                                  poOpenDate: poOpenDateVal,
                                  vatType: po.vatType || "ex-vat",
                                  selectedPrIds: Array.isArray(po.selectedPrIds) && po.selectedPrIds.length > 0 ? po.selectedPrIds : prIdsFromItems,
                                  items: (po.items || []).map((it, idx) => ((it.prId == null || it.prId === "") && !it.id) ? { ...it, id: `free-${idx}-${Date.now()}` } : it),
                                  reason: po.reason || "",
                                  note: po.note || "",
                                  discount: po.discount ?? 0,
                                  location: po.location || "",
                                });
                                if (po.location && !DELIVERY_LOCATIONS.includes(po.location)) {
                                  setLocationOptions(prev => prev.includes(po.location) ? prev : [...prev, po.location]);
                                }
                                setManualVatOverride(po.manualVat != null ? Number(po.manualVat) : null);
                                setVatEditOpen(false);
                                setVatEditValue("");
                                setDiscountEnabled((po.discount ?? 0) > 0);
                                setEditingPoId(po.id);
                                setIsModalOpen(true);
                                setIsFullScreenModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}

                          {/* Step 3: PDF view button — always shows latest stamped PDF */}
                          {po.pdfUrl && (
                            <a
                              href={po.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center p-1 rounded text-red-600 hover:text-red-800 hover:bg-red-50 transition-colors"
                              title="ดู PDF"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FileOutput size={15} />
                            </a>
                          )}

                          {canUseFunction("po", "delete") && (
                            <button
                              className="text-red-500 hover:text-red-700 p-1"
                              onClick={() => {
                                openConfirm("ยืนยันการลบ", `คุณต้องการลบ ${L.docName} นี้ใช่หรือไม่?`, async () => {
                                  const prIds = getPoRefPrIds(po);
                                  if (po.pdfUrl) {
                                    const safePONo = (po.poNo || po.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
                                    const safeProjId = po.projectId || "unknown";
                                    await deleteGeneratedPdf(`generated/pos/${safeProjId}/${safePONo}.pdf`);
                                  }
                                  const deleted = await deleteData("pos", po.id);
                                  if (deleted && prIds.length > 0) {
                                    for (const prId of prIds) {
                                      const stillUsedByOtherPO = pos.some((p: any) => p.id !== po.id && p.items?.some((i: any) => i.prId === prId));
                                      if (!stillUsedByOtherPO) {
                                        await updateData("prs", prId, { status: "Approved" });
                                      }
                                    }
                                  }
                                }, "danger");
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                          {/* ยืนยัน Close PO — เฉพาะสถานะ Pending Close PO */}
                          {canUseFunction("po", "closePO") && po.status === "Pending Close PO" && (
                            <Button
                              variant="success"
                              size="sm"
                              className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                              onClick={() => {
                                openConfirm(
                                  "ยืนยันการปิด PO",
                                  `คุณต้องการปิด ${L.docName} ${po.poNo} ใช่หรือไม่?`,
                                  async () => {
                                    await updateData("pos", po.id, { status: "Closed PO" });
                                  },
                                  "success"
                                );
                              }}
                            >
                              ยืนยัน Close
                            </Button>
                          )}
                        </td>}
                      </tr>
                    </React.Fragment>
                  );
                })}
            </tbody>
            {/* Footer with totals */}
            <tfoot className="border-t-2 border-slate-300">
              <tr className="bg-slate-50">
                <td colSpan={(() => {
                  let cols = 0;
                  if (isColumnVisible("po", "poNo")) cols++;
                  if (isColumnVisible("po", "poType")) cols++;
                  if (isColumnVisible("po", "prNos")) cols++;
                  if (isColumnVisible("po", "description")) cols++;
                  if (isColumnVisible("po", "vendor")) cols++;
                  if (isColumnVisible("po", "creator")) cols++;
                  if (isColumnVisible("po", "items")) cols++;
                  return Math.max(1, cols);
                })()} className="px-3 py-2 text-right text-xs font-semibold text-slate-600">
                  ยอดรวมทั้งหมด (Ex VAT):
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold text-slate-800">
                  {formatCurrency(
                    [...displayedPOsPending, ...displayedPOsNormal]
                      .reduce((total, { po }) => {
                        // Calculate amount ex VAT for each PO
                        let subtotal = 0;
                        if (po.items && po.items.length > 0) {
                          subtotal = po.items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
                        }
                        const discount = Number(po.discount || 0);
                        const amountExVat = Math.max(0, subtotal - discount);
                        return total + amountExVat;
                      }, 0)
                  )}
                </td>
                {isColumnVisible("po", "status") && <td></td>}
                {isColumnVisible("po", "actions") && <td></td>}
              </tr>
              <tr className="bg-slate-100">
                <td colSpan={(() => {
                  let cols = 0;
                  if (isColumnVisible("po", "poNo")) cols++;
                  if (isColumnVisible("po", "poType")) cols++;
                  if (isColumnVisible("po", "prNos")) cols++;
                  if (isColumnVisible("po", "description")) cols++;
                  if (isColumnVisible("po", "vendor")) cols++;
                  if (isColumnVisible("po", "creator")) cols++;
                  if (isColumnVisible("po", "items")) cols++;
                  return Math.max(1, cols);
                })()} className="px-3 py-2 text-right text-xs font-semibold text-slate-700">
                  ยอดรวมทั้งหมด:
                </td>
                <td className="px-3 py-2 text-right text-sm font-bold text-slate-900">
                  {formatCurrency(
                    [...displayedPOsPending, ...displayedPOsNormal]
                      .reduce((total, { po }) => {
                        return total + Number(po.grandTotal || po.amount || po.totalAmount || 0);
                      }, 0)
                  )}
                </td>
                {isColumnVisible("po", "status") && <td></td>}
                {isColumnVisible("po", "actions") && <td></td>}
              </tr>
            </tfoot>
          </table>
          </div>
        </Card>

        {/* PO View Modal — ดูข้อมูล + Approve/Reject */}
        {viewingPO && (() => {
          const poVendor = vendors.find((v: any) => v.id === viewingPO.vendorId);
          const poPrIds = getPoRefPrIds(viewingPO);
          const poPrNos = poPrIds.map((id: string) => prs.find((p: any) => p.id === id)?.prNo || "-").join(", ");
          const subtotal = (viewingPO.items || []).reduce((s: number, i: any) => s + Number(i.quantity) * Number(i.price), 0);
          return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] p-4">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-red-700 to-red-900 rounded-t-2xl flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                      <ShoppingCart size={18} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">ใบสั่งซื้อ (PO)</h3>
                      <p className="text-red-200 text-xs mt-0.5">{viewingPO.poNo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={viewingPO.status} />
                    <button onClick={() => setViewingPO(null)} className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all ml-2">
                      <XCircle size={20} />
                    </button>
                  </div>
                </div>

                {/* Reject reason banner */}
                {viewingPO.rejectReason && (
                  <div className="px-6 py-2.5 bg-red-50 border-b border-red-200 shrink-0 flex items-center gap-2">
                    <AlertCircle size={14} className="text-red-500 shrink-0" />
                    <p className="text-red-700 text-xs"><span className="font-semibold">เหตุผลปฏิเสธ:</span> {viewingPO.rejectReason}</p>
                  </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                  {/* PDF Thumbnail (ถ้ามี) — ใช้ key บังคับ remount เมื่อ status เปลี่ยน เพื่อโชว์ฉบับลายเซ็นล่าสุด */}
                  {viewingPO.pdfUrl && (() => {
                    const pdfUrlWithCacheBuster = `${viewingPO.pdfUrl}${viewingPO.pdfUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
                    const iframeKey = `po-pdf-${viewingPO.id}-${viewingPO.status}`;
                    return (
                      <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">เอกสาร PDF</span>
                        </div>
                        <a
                          href={pdfUrlWithCacheBuster}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group relative block w-48 h-64 border border-slate-200 rounded-xl overflow-hidden bg-slate-50 hover:border-blue-400 hover:shadow-md transition-all"
                          title="คลิกเพื่อเปิด PDF ในแท็บใหม่"
                        >
                          <iframe
                            key={iframeKey}
                            src={`${pdfUrlWithCacheBuster}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                            className="w-full h-full pointer-events-none opacity-80 group-hover:opacity-100 transition-opacity"
                            title="PO PDF Thumbnail"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                            <div className="bg-white/90 backdrop-blur-sm text-blue-600 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0">
                              <FileOutput size={14} /> เปิดดู PDF
                            </div>
                          </div>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Info grid */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    {[
                      { label: L.docNo, value: viewingPO.poNo },
                      { label: L.docType, value: viewingPO.poType || "-" },
                      { label: "Vendor", value: poVendor?.name || "-" },
                      { label: L.dateLabel, value: viewingPO.poDate ? viewingPO.poDate.split("T")[0] : "-" },
                      { label: "สถานที่ส่งสินค้า", value: viewingPO.location || "-" },
                      { label: "กำหนดส่งของ", value: viewingPO.requiredDate || "-" },
                      { label: "ประเภทรับของ", value: viewingPO.receiveType || "-" },
                      { label: "VAT", value: viewingPO.vatType || "-" },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">{label}</p>
                        <p className="font-semibold text-slate-700 truncate" title={value}>{value}</p>
                      </div>
                    ))}
                    
                    {/* Special handling for Ref PR No. - clickable PR numbers */}
                    <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-0.5">Ref PR No.</p>
                      <div className="flex flex-wrap gap-1">
                        {poPrIds.length > 0 ? poPrIds.map((prId: string) => {
                          const pr = prs.find((p: any) => p.id === prId);
                          if (!pr) return <span key={prId} className="text-slate-700">-</span>;
                          
                          return (
                            <button
                              key={prId}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (pr.pdfUrl) {
                                  window.open(pr.pdfUrl, '_blank', 'noopener,noreferrer');
                                } else {
                                  showAlert?.("ไม่พบไฟล์ PDF", `PR ${pr.prNo} ยังไม่มีไฟล์ PDF`, "warning");
                                }
                              }}
                              className={`text-xs font-semibold px-2 py-0.5 rounded transition-colors ${
                                pr.pdfUrl 
                                  ? "text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 border border-blue-200" 
                                  : "text-slate-500 bg-slate-100 cursor-not-allowed"
                              }`}
                              title={pr.pdfUrl ? `คลิกเพื่อเปิด PDF ของ ${pr.prNo}` : `${pr.prNo} - ยังไม่มีไฟล์ PDF`}
                            >
                              {pr.prNo}
                            </button>
                          );
                        }) : (
                          <span className="font-semibold text-slate-700">-</span>
                        )}
                      </div>
                    </div>

                    {/* ไฟล์แนบ - Display all attachments (Budget + PR) */}
                    {(() => {
                      const allAttachments: { source: string; prNo: string; name: string; url: string; type: string }[] = [];

                      (viewingPO.attachments || []).forEach((att: any) => {
                        if (!att?.url) return;
                        allAttachments.push({
                          source: "po-doc",
                          prNo: viewingPO.poNo || "PO",
                          name: att.name || "แนบจาก PO",
                          url: att.url,
                          type: "po",
                        });
                      });

                      // Collect attachments from all PRs referenced by this PO
                      poPrIds.forEach((prId: string) => {
                        const pr = prs.find((p: any) => p.id === prId);
                        if (!pr) return;

                        // Get budget attachments through PR
                        const budgetItem = pr.budgetId
                          ? budgets.find(b => b.id === pr.budgetId && b.projectId === pr.projectId)
                          : pr.costCode
                            ? budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)
                            : null;

                        // Add budget attachments
                        if (budgetItem?.attachments) {
                          budgetItem.attachments.forEach((att: any) => {
                            if (att.url) {
                              allAttachments.push({
                                source: 'budget',
                                prNo: pr.prNo,
                                name: att.name || 'ไฟล์แนบจากงบประมาณ',
                                url: att.url,
                                type: 'budget'
                              });
                            }
                          });
                        }

                        // Add sub-item attachments if applicable
                        if (budgetItem?.subItems && pr.items?.length > 0) {
                          const firstItem = pr.items[0];
                          if (firstItem.subItemId || firstItem.budgetSubItemId) {
                            const subItemId = firstItem.subItemId || firstItem.budgetSubItemId;
                            const subItem = budgetItem.subItems.find(s => s.id === subItemId);
                            if (subItem?.attachments) {
                              subItem.attachments.forEach((att: any) => {
                                if (att.url) {
                                  allAttachments.push({
                                    source: 'budget-subitem',
                                    prNo: pr.prNo,
                                    name: att.name || 'ไฟล์แนบจากรายการย่อย',
                                    url: att.url,
                                    type: 'budget'
                                  });
                                }
                              });
                            }
                          }
                        }

                        // Add PR attachments
                        if (pr.attachmentUrl) {
                          allAttachments.push({
                            source: 'pr',
                            prNo: pr.prNo,
                            name: pr.attachmentName || 'ไฟล์แนบจาก PR',
                            url: pr.attachmentUrl,
                            type: 'pr'
                          });
                        }
                      });

                      if (allAttachments.length === 0) return null;

                      return (
                        <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 col-span-2 md:col-span-3">
                          <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1.5 flex items-center gap-1">
                            <Paperclip size={11} /> ไฟล์แนบทั้งหมด ({allAttachments.length} ไฟล์)
                          </p>
                          <div className="space-y-1">
                            {allAttachments.map((att, idx) => (
                              <div key={`${att.type}-${idx}`} className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-slate-400">•</span>
                                <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{
                                  backgroundColor: att.type === 'po' ? '#e9d5ff' : att.type === 'budget' ? '#dbeafe' : '#dcfce7',
                                  color: att.type === 'po' ? '#5b21b6' : att.type === 'budget' ? '#1e40af' : '#166534'
                                }}>
                                  {att.prNo}
                                </span>
                                <span className="text-[9px] px-1 py-0.5 rounded font-medium" style={{
                                  backgroundColor: att.type === 'po' ? '#faf5ff' : att.type === 'budget' ? '#eff6ff' : '#f0fdf4',
                                  color: att.type === 'po' ? '#6b21a8' : att.type === 'budget' ? '#3730a3' : '#15803d'
                                }}>
                                  {att.type === 'po' ? 'แนบ PO' : att.type === 'budget' ? (att.source === 'budget-subitem' ? 'งบ-รายการย่อย' : 'งบประมาณ') : 'PR'}
                                </span>
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`hover:underline truncate ${
                                    att.type === 'po' ? 'text-violet-600 hover:text-violet-800' : att.type === 'budget' ? 'text-blue-600 hover:text-blue-800' : 'text-green-600 hover:text-green-800'
                                  }`}
                                  title={att.name}
                                >
                                  {att.name}
                                </a>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Line Items */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="bg-red-700 px-4 py-2 flex items-center justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wide">รายการสั่งซื้อ</span>
                      <span className="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full">{viewingPO.items?.length || 0} รายการ</span>
                    </div>
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 w-8 text-center">#</th>
                          <th className="px-3 py-2">รายการสินค้า</th>
                          <th className="px-3 py-2 text-right">จำนวน</th>
                          <th className="px-3 py-2 text-right">ราคา/หน่วย</th>
                          <th className="px-3 py-2 text-right">รวม</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(viewingPO.items || []).map((it: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-3 py-1.5 text-center text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-1.5 font-medium text-slate-700">{it.description}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{it.quantity} {it.unit}</td>
                            <td className="px-3 py-1.5 text-right text-slate-500">{formatCurrency(it.price)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-700">{formatCurrency(Number(it.quantity) * Number(it.price))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-800">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right text-xs font-bold text-white">Sub Total:</td>
                          <td className="px-3 py-2 text-right text-sm font-bold text-white">{formatCurrency(subtotal)}</td>
                        </tr>
                        <tr>
                          <td colSpan={4} className="px-3 py-1.5 text-right text-xs text-slate-300">Grand Total (inc. VAT):</td>
                          <td className="px-3 py-1.5 text-right text-xs font-semibold text-slate-200">{formatCurrency(viewingPO.amount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>


                  {viewingPO.note && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                      <span className="font-bold">หมายเหตุ:</span> {viewingPO.note}
                    </div>
                  )}

                  {viewingPO.poEditRevisionReason && (viewingPO.status === PO_REVISION_PENDING_PCM || viewingPO.status === PO_REVISION_PENDING_GM) && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-xs text-orange-900">
                      <span className="font-bold">{L.revisionReasonLabel}</span> {viewingPO.poEditRevisionReason}
                    </div>
                  )}
                </div>

                {/* Footer — ปุ่ม Approve/Reject ตาม Role */}
                <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between gap-2 shrink-0">
                  <button onClick={() => setViewingPO(null)} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all flex items-center gap-2">
                    <XCircle size={15} /> ปิด
                  </button>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {viewingPO.status === PO_REVISION_PENDING_PCM && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                      <>
                        {canDenyPORevision && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { handlePORevisionDeny(viewingPO.id); setViewingPO(null); }}>ไม่อนุญาต</Button>}
                        {canAllowPORevision && <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handlePORevisionAllow(viewingPO.id); setViewingPO(null); }}>อนุญาตแก้ไข</Button>}
                      </>
                    )}
                    {viewingPO.status === PO_REVISION_PENDING_GM && (userRoles.includes("GM") || userRoles.includes("Administrator")) && (
                      <>
                        {canDenyPORevision && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { handlePORevisionDeny(viewingPO.id); setViewingPO(null); }}>ไม่อนุญาต</Button>}
                        {canAllowPORevision && <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handlePORevisionAllow(viewingPO.id); setViewingPO(null); }}>อนุญาตแก้ไข</Button>}
                      </>
                    )}
                    {canApprovePO && viewingPO.status === "Pending PCM" && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(viewingPO) && (
                      <>
                        {canRejectPO && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setRejectPoId(viewingPO.id); setRejectReason(""); setViewingPO(null); }}>Reject</Button>}
                        <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPO.id, "approve"); setViewingPO(null); }}>PCM Approve</Button>
                      </>
                    )}
                    {canApprovePO && viewingPO.status === "Pending GM" && (userRoles.includes("GM") || userRoles.includes("Administrator")) && !isPoApproveInFlight(viewingPO) && (
                      <>
                        {canRejectPO && <Button variant="danger" className="px-4 py-2 text-sm" onClick={() => { setRejectPoId(viewingPO.id); setRejectReason(""); setViewingPO(null); }}>Reject</Button>}
                        <Button variant="success" className="px-4 py-2 text-sm" onClick={() => { handleAction(viewingPO.id, "approve"); setViewingPO(null); }}>GM Approve</Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {isPoRevisionModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010] p-4">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
                <RefreshCw size={20} className="text-orange-600" /> {L.revisionTitle}
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                ระบบจะส่งคำขอไปยังผู้อนุมัติตามสถานะปัจจุบัน (Pending PCM → PCM, Pending GM / Approved / Closed {L.docName} → GM)
              </p>
              <InputGroup label="เหตุผลที่ขอแก้ไข">
                <textarea
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm min-h-[100px]"
                  value={poRevisionReason}
                  onChange={(e) => setPoRevisionReason(e.target.value)}
                  placeholder="ระบุเหตุผล..."
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => { setIsPoRevisionModalOpen(false); setPoRevisionPoId(null); setPoRevisionReason(""); }}>
                  ยกเลิก
                </Button>
                <Button variant="warning" onClick={handleSubmitPoRevisionRequest}>
                  ส่งคำขอ
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* ─── Modal: ยืนยันคืนยอด PR เมื่อยอด PO แก้ไขลดลง ─── */}

        {/* Create PO Modal — ทับ Header, เต็มความสูง, Footer เลื่อนตามเนื้อหา */}
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[10010] p-4"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-[90vw] max-w-[90vw] max-h-[92vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              {/* Sticky Header - โทนแดง ขาว ดำ */}
              <div className="relative px-6 py-4 border-b border-black/10 bg-gradient-to-r from-red-600 via-red-700 to-red-900 shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvc3ZnPg==')] opacity-50"></div>
                <div className="relative flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg shadow-black/20 border border-white/30">
                      <ShoppingCart size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        {L.createTitle}
                      </h3>
                      <p className="text-white/80 text-xs mt-0.5">
                        {L.createDesc}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      // Cleanup reserved PO number if not saved
                      if (!editingPoId && reservedPoNo) {
                        await cleanupReservedPoNo();
                      }
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all duration-200 border border-transparent hover:border-white/30"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-gradient-to-b from-slate-50/50 to-white">
                {/* 1. ข้อมูลส่วนหัว (Header) - Layout กระชับ + โซน Vendor Details ขวามือ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-visible">
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-50 to-red-100/80 border-b border-red-200">
                    <div className="w-6 h-6 bg-red-600 rounded-lg flex items-center justify-center">
                      <FileText size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-red-900 tracking-wide uppercase">{L.headerSection}</span>
                  </div>
                  <div className="p-2 flex flex-col sm:flex-row gap-2 sm:gap-3">
                    {/* ซ้าย: ฟอร์ม + Select PRs */}
                    <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="grid grid-cols-2 sm:grid-cols-[11rem_11rem_1fr] gap-x-2 gap-y-2">
                      {/* PO Type / Payment Type */}
                      <div className="min-w-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                          <Tag size={11} className="text-red-500 shrink-0" /> {L.docType}
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 cursor-pointer text-slate-900"
                          value={formData.poType}
                          disabled={!!editingPoId}
                          onChange={async (e) => {
                            const newType = e.target.value;
                            const defaultReceive = getDefaultReceiveType(newType);
                            
                            if (newType && !editingPoId) {
                              // Reserve actual PO number for new PO
                              try {
                                const actualPoNo = await reservePoNoForDisplay(newType);
                                setFormData({ ...formData, poType: newType, poNo: actualPoNo, receiveType: defaultReceive });
                              } catch (error) {
                                console.error("Error reserving PO number:", error);
                                // Fallback to placeholder if reservation fails
                                const fallbackPoNo = generatePoNo(newType);
                                setFormData({ ...formData, poType: newType, poNo: fallbackPoNo, receiveType: defaultReceive });
                              }
                            } else {
                              // For editing or empty type, use placeholder
                              const newPoNo = newType ? generatePoNo(newType) : "";
                              setFormData({ ...formData, poType: newType, poNo: newPoNo, receiveType: defaultReceive });
                            }
                          }}
                        >
                          <option value="">-- เลือก --</option>
                          {PO_TYPES.map((t) => (
                            <option key={t.code} value={t.code}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* PO No. / Payment No. */}
                      <div className="min-w-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                          <Hash size={11} className="text-red-500 shrink-0" /> {L.docNo}
                          {!editingPoId && canUseFunction("po", "manualPoOverride") && (
                            <span className="ml-2 px-2 py-0.5 text-[10px] rounded bg-green-100 text-green-700 border border-green-300">
                              Manual Edit Enabled
                            </span>
                          )}
                        </label>
                        <input
                            type="text"
                            readOnly={!canUseFunction("po", "manualPoOverride") || !!editingPoId}
                            className={`w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-mono font-semibold ${
                              canUseFunction("po", "manualPoOverride") && !editingPoId
                                ? 'bg-white text-slate-900 cursor-text focus:border-green-500 focus:ring-2 focus:ring-green-100'
                                : 'bg-slate-100 text-slate-700 cursor-default'
                            }`}
                            placeholder={
                              isReservingPoNo
                                ? "กำลังจองเลข PO..."
                                : canUseFunction("po", "manualPoOverride") && !editingPoId
                                ? "แก้ไขเลข PO ได้ (เช่น PO26J01-CC0049)"
                                : formData.poType ? "(จองเลขแล้ว)" : "เลือก Type ก่อน"
                            }
                            value={isReservingPoNo ? "กำลังจองเลข PO..." : formData.poNo}
                            onChange={(e) => {
                              if (canUseFunction("po", "manualPoOverride") && !editingPoId) {
                                setFormData({ ...formData, poNo: e.target.value });
                              }
                            }}
                          />
                        {canUseFunction("po", "manualPoOverride") && !editingPoId && (
                          <div className="mt-1 text-[10px] text-green-600">
                            💡 คุณสามารถแก้ไขเลข PO ได้ตามสิทธิ์ที่ Admin กำหนด
                          </div>
                        )}
                      </div>
                      {/* วันที่เปิด + สถานที่ส่งสินค้า */}
                      <div className="min-w-0 flex gap-2">
                        {/* วันที่เปิด — ย่อครึ่งหนึ่ง */}
                        <div className="flex-1 min-w-0">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                            <Calendar size={11} className="text-amber-500 shrink-0" /> วันที่เปิด
                          </label>
                          <div className="relative cursor-pointer" onClick={() => { if (typeof poOpenDateInputRef.current?.showPicker === "function") poOpenDateInputRef.current.showPicker(); else poOpenDateInputRef.current?.click(); }}>
                            <input
                              ref={poOpenDateInputRef}
                              type="date"
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 pl-9 text-sm cursor-pointer"
                              value={formData.poOpenDate}
                              onChange={e => setFormData({ ...formData, poOpenDate: e.target.value })}
                            />
                            <Calendar className="absolute left-3 top-2 text-amber-400 pointer-events-none" size={14} />
                          </div>
                        </div>
                        {/* สถานที่ส่งสินค้า */}
                        <div className="flex-1 min-w-0">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                            <MapPin size={11} className="text-blue-500 shrink-0" /> สถานที่ส่งสินค้า
                          </label>
                          {locationAddMode ? (
                            <div className="flex gap-1">
                              <input
                                autoFocus
                                type="text"
                                className="flex-1 min-w-0 border border-blue-300 rounded-lg px-2 py-1.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-slate-900"
                                placeholder="ระบุสถานที่..."
                                value={locationAddText}
                                onChange={e => setLocationAddText(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && locationAddText.trim()) {
                                    const newLoc = locationAddText.trim();
                                    if (!locationOptions.includes(newLoc)) setLocationOptions(prev => [...prev, newLoc]);
                                    setFormData(f => ({ ...f, location: newLoc }));
                                    setLocationAddMode(false);
                                    setLocationAddText("");
                                  } else if (e.key === "Escape") {
                                    setLocationAddMode(false);
                                    setLocationAddText("");
                                  }
                                }}
                              />
                              <button
                                type="button"
                                className="px-2 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 shrink-0"
                                onClick={() => {
                                  const newLoc = locationAddText.trim();
                                  if (newLoc) {
                                    if (!locationOptions.includes(newLoc)) setLocationOptions(prev => [...prev, newLoc]);
                                    setFormData(f => ({ ...f, location: newLoc }));
                                  }
                                  setLocationAddMode(false);
                                  setLocationAddText("");
                                }}
                              >+</button>
                              <button
                                type="button"
                                className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50 shrink-0"
                                onClick={() => { setLocationAddMode(false); setLocationAddText(""); }}
                              >✕</button>
                            </div>
                          ) : (
                            <select
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-blue-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer text-slate-900"
                              value={formData.location}
                              onChange={e => {
                                if (e.target.value === "__add__") {
                                  setLocationAddMode(true);
                                } else {
                                  setFormData(f => ({ ...f, location: e.target.value }));
                                }
                              }}
                            >
                              <option value="">-- เลือก --</option>
                              {locationOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                              <option value="__add__">+ เพิ่มรายการ...</option>
                            </select>
                          )}
                        </div>
                      </div>
                      {/* กำหนดส่ง / รอบวางบิล */}
                      <div className="min-w-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <Calendar size={11} className="text-emerald-500 shrink-0" /> กำหนดส่ง
                        </label>
                        <div className="relative cursor-pointer" onClick={() => { if (typeof requiredDateInputRef.current?.showPicker === "function") requiredDateInputRef.current.showPicker(); else requiredDateInputRef.current?.click(); }}>
                            <input
                              ref={requiredDateInputRef}
                              type="date"
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 pl-9 text-sm cursor-pointer"
                              value={formData.requiredDate}
                              onChange={e => setFormData({ ...formData, requiredDate: e.target.value })}
                            />
                            <Calendar className="absolute left-3 top-2 text-emerald-400 pointer-events-none" size={14} />
                          </div>
                      </div>
                      {/* Receive Type / เอกสารแนบ */}
                      <div className="min-w-0">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                            <Package size={11} className="text-red-500 shrink-0" /> Receive Type
                        </label>
                        <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 cursor-pointer text-slate-900"
                            value={formData.receiveType}
                            onChange={e => setFormData({ ...formData, receiveType: e.target.value })}
                          >
                            <option value="">-- เลือก --</option>
                            {RECEIVE_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                          </select>
                      </div>
                      {/* Vendor / ผู้รับเหมา */}
                      <div className="col-span-2 sm:col-span-1">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1 uppercase tracking-wider">
                          <Building2 size={11} className="text-red-500 shrink-0" /> {L.vendorLabel}
                        </label>
                        <div className="flex gap-2">
                          <div ref={vendorDropdownAnchorRef} className="flex-1 min-w-0 relative">
                            <input
                              type="text"
                              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 pl-9 pr-8 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 text-slate-900 placeholder:text-slate-400"
                              placeholder="ค้นหา Vendor..."
                              value={vendorSearchText}
                              onChange={e => { setVendorSearchText(e.target.value); setVendorDropdownOpen(true); }}
                              onFocus={() => setVendorDropdownOpen(true)}
                              onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 180)}
                            />
                            <Building2 className="absolute left-3 top-2 text-red-400 pointer-events-none" size={14} />
                            {formData.vendorId && (
                              <button type="button" className="absolute right-2 top-2 p-1 text-slate-400 hover:text-red-500" onClick={() => { setFormData(prev => ({ ...prev, vendorId: "" })); setVendorSearchText(""); }} title="ล้างการเลือก">
                                <XCircle size={12} />
                              </button>
                            )}
                            {vendorDropdownOpen && vendorDropdownRect && createPortal(
                              <div className="fixed max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1" style={{ top: vendorDropdownRect.bottom + 4, left: vendorDropdownRect.left, width: vendorDropdownRect.width, zIndex: 9999 }}>
                                {vendorFilteredList.length === 0 ? (
                                  <div className="px-3 py-4 text-xs text-slate-500 text-center">ไม่พบ Vendor</div>
                                ) : (
                                  vendorFilteredList.slice(0, 50).map((v: any) => (
                                    <button key={v.id} type="button" className={`w-full text-left px-3 py-2 text-sm hover:bg-red-50 flex items-center justify-between ${formData.vendorId === v.id ? "bg-red-50 text-red-800" : "text-slate-700"}`} onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, vendorId: v.id })); setVendorSearchText(v.name || ""); setVendorDropdownOpen(false); }}>
                                      <span className="font-medium truncate">{v.name}</span>
                                      {v.code && <span className="text-xs text-slate-500 shrink-0 ml-1">{v.code}</span>}
                                    </button>
                                  ))
                                )}
                              </div>,
                              document.body
                            )}
                          </div>
                          <Button variant="secondary" onClick={() => setIsVendorModalOpen(true)} className="px-3 rounded-lg shrink-0" title="เพิ่ม Vendor">
                            <Plus size={16} />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Select PRs — ในคอลัมน์ซ้าย ใต้ฟอร์ม */}
                    <div className="flex-1 border border-slate-200 rounded-xl overflow-hidden bg-white">
                      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 bg-slate-800 rounded-md flex items-center justify-center">
                            <ClipboardList size={11} className="text-white" />
                          </div>
                          <span className="text-[11px] font-bold text-slate-800 tracking-wide uppercase">
                            2. เลือกใบขอซื้อ (Select PRs)
                          </span>
                        </div>
                        <button
                          type="button"
                          className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-all shadow-sm"
                          onClick={() => {
                            const firstId = formData.selectedPrIds[0];
                            const lockedCostCode = firstId ? (prs.find((p) => p.id === firstId)?.costCode ?? null) : null;
                            const normalized = lockedCostCode
                              ? formData.selectedPrIds.filter((id) => (prs.find((p) => p.id === id)?.costCode ?? null) === lockedCostCode)
                              : [...formData.selectedPrIds];
                            setTempSelectedPrIds(normalized);
                            setPrSelectFilterText("");
                            setIsPrSelectModalOpen(true);
                          }}
                        >
                          <ListFilter size={11} /> เลือก PR
                        </button>
                      </div>
                      <div className="p-3">
                        {formData.selectedPrIds.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-4 text-slate-400">
                            <ClipboardList size={24} className="mb-1 opacity-40" />
                            <p className="text-xs text-slate-500">ยังไม่ได้เลือกใบขอซื้อ</p>
                            <p className="text-[10px] mt-0.5 text-slate-400">กดปุ่ม "เลือก PR" เพื่อเลือกใบขอซื้อที่อนุมัติแล้ว</p>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {formData.selectedPrIds.map(prId => {
                              const pr = approvedPRs.find(p => p.id === prId);
                              if (!pr) return null;
                              return (
                                <div key={prId} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 border border-red-200 rounded-lg text-xs">
                                  <Hash size={9} className="text-red-500 shrink-0" />
                                  <span className="font-semibold text-slate-800">{pr.prNo}</span>
                                  <button type="button" className="ml-0.5 text-red-400 hover:text-red-600" onClick={() => handlePrToggle(prId)}>
                                    <XCircle size={11} />
                                  </button>
                                </div>
                              );
                            })}
                            <button
                              type="button"
                              className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-all"
                            onClick={() => {
                              const firstId = formData.selectedPrIds[0];
                              const lockedCostCode = firstId ? (prs.find((p) => p.id === firstId)?.costCode ?? null) : null;
                              const normalized = lockedCostCode
                                ? formData.selectedPrIds.filter((id) => (prs.find((p) => p.id === id)?.costCode ?? null) === lockedCostCode)
                                : [...formData.selectedPrIds];
                              setTempSelectedPrIds(normalized);
                              setIsPrSelectModalOpen(true);
                            }}
                            >
                              <Plus size={10} /> เพิ่ม/แก้ไข
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    </div>{/* end left column */}

                    {/* ขวา: Vendor Details — ขยายความกว้าง + ยืดเต็มความสูง */}
                    <div className="w-full sm:w-[42rem] shrink-0 border border-slate-200 rounded-xl bg-slate-50/80 overflow-hidden self-stretch flex flex-col">
                      <div className="px-4 py-2.5 bg-slate-200/80 border-b border-slate-200 flex items-center gap-2">
                        <Building2 size={16} className="text-slate-600" />
                        <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">Vendor Details</span>
                      </div>
                      <div className="p-3 text-sm">
                        {formData.vendorId && (() => {
                          const v = vendors.find((x: any) => x.id === formData.vendorId);
                          if (!v) return <p className="text-slate-400">กำลังโหลด...</p>;
                          return (
                            <div className="space-y-1.5 text-slate-700">
                              <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">ชื่อ:</span><span className="font-medium min-w-0 break-words">{v.name || "-"}</span></div>
                              {v.code && <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">รหัส:</span><span className="min-w-0 break-words">{v.code}</span></div>}
                              {v.address && <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">ที่อยู่:</span><span className="min-w-0 whitespace-pre-wrap break-words">{v.address}</span></div>}
                              {v.tel && <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">โทร:</span><span className="min-w-0 break-words">{v.tel}</span></div>}
                              {(v.creditTerm != null && v.creditTerm !== "") && <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">เครดิตเทอม:</span><span className="min-w-0">{v.creditTerm}</span></div>}
                              {v.type && <div className="flex gap-2"><span className="font-semibold text-slate-500 shrink-0 w-[4.5rem]">ประเภท:</span><span className="min-w-0">{v.type}</span></div>}
                            </div>
                          );
                        })()}
                        {!formData.vendorId && (
                          <p className="text-slate-400 italic">เลือก Vendor ทางซ้ายเพื่อดูข้อมูล</p>
                        )}
                      </div>
                      
                      {/* PR Attachments Section */}
                      {formData.selectedPrIds.length > 0 && (
                        <div className="border-t border-slate-200 bg-white">
                          <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center gap-2">
                            <Paperclip size={16} className="text-slate-600" />
                            <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">เอกสารแนบจาก PR</span>
                          </div>
                          <div className="p-3 text-sm max-h-40 overflow-y-auto">
                            {(() => {
                              // Get all attachments from selected PRs
                              const prAttachments = formData.selectedPrIds.map((prId: string) => {
                                const pr = prs.find((p: any) => p.id === prId);
                                if (!pr) return null;
                                
                                const attachments = [];
                                
                                // Add main attachment if exists
                                if (pr.attachmentUrl && pr.attachmentName) {
                                  attachments.push({
                                    prNo: pr.prNo,
                                    prId: pr.id,
                                    name: pr.attachmentName,
                                    url: pr.attachmentUrl,
                                    type: 'main'
                                  });
                                }
                                
                                // Add additional attachments if they exist
                                if (pr.attachments && Array.isArray(pr.attachments)) {
                                  pr.attachments.forEach((att: any, idx: number) => {
                                    if (att.url && att.name) {
                                      attachments.push({
                                        prNo: pr.prNo,
                                        prId: pr.id,
                                        name: att.name,
                                        url: att.url,
                                        type: 'additional',
                                        index: idx
                                      });
                                    }
                                  });
                                }
                                
                                return attachments;
                              }).filter(Boolean).flat();
                              
                              if (prAttachments.length === 0) {
                                return (
                                  <div className="text-center py-4">
                                    <Paperclip size={24} className="mx-auto mb-2 text-slate-300" />
                                    <p className="text-slate-400 text-xs">ไม่มีเอกสารแนบใน PR ที่เลือก</p>
                                  </div>
                                );
                              }
                              
                              return (
                                <div className="space-y-2">
                                  {prAttachments.map((attachment: any, idx: number) => (
                                    <div key={`${attachment.prId}-${attachment.type}-${attachment.index || 0}`} 
                                         className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                      <div className="flex-shrink-0">
                                        <Paperclip size={14} className="text-slate-500" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-semibold text-slate-700">{attachment.prNo}</span>
                                          <span className="text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full">
                                            {attachment.type === 'main' ? 'หลัก' : 'เพิ่มเติม'}
                                          </span>
                                        </div>
                                        <p className="text-xs text-slate-600 truncate" title={attachment.name}>
                                          {attachment.name}
                                        </p>
                                      </div>
                                      <div className="flex-shrink-0">
                                        <a
                                          href={attachment.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition-colors"
                                          title="เปิดไฟล์"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <FileOutput size={14} />
                                        </a>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3. เลือกรายการสินค้า (Select Items) - โทนแดงขาวดำ */}
                {formData.selectedPrIds.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                          <Package size={13} className="text-white" />
                        </div>
                        <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">
                          {L.selectItems}
                        </span>
                      </div>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-all shadow-sm"
                          onClick={addFreeItem}
                        >
                          <Plus size={13} /> เพิ่มรายการ
                        </button>
                    </div>

                    <div className="p-4 overflow-hidden w-full min-w-0">
                      <div ref={selectItemsTableRef} className="w-full min-w-0">
                      <table className="w-full text-left text-xs rounded-xl border border-slate-200 table-fixed">
                        <thead className="bg-slate-100 font-semibold text-slate-800 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 text-center" style={{ width: selectItemsLayout.scaled.pick }}>เลือก</th>
                            <ResizableTh tableId="select-items" colKey="prNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.prNo}>PR No.</ResizableTh>
                            <th className="p-2.5" style={{ width: selectItemsLayout.scaled.status }}>สถานะ</th>
                            <ResizableTh tableId="select-items" colKey="materialNo" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.materialNo}>Material No.</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="description" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.description}>รายการ</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="unit" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.unit}>หน่วย</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="orderQty" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.orderQty}>สั่งซื้อ (QTY)</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="price" className="p-2.5" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.price}>ราคา/หน่วย</ResizableTh>
                            <ResizableTh tableId="select-items" colKey="total" className="p-2.5 text-right" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectItemsLayout.scaled.total}>รวม</ResizableTh>
                            <th className="p-2.5" style={{ width: selectItemsLayout.scaled.disPr }}>Dis PR</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {availableItems.map((item) => {
                            const isSelected = formData.items.some(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex);
                            const selectedData = formData.items.find(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex) || item;
                            const inputCls = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white";

                            return (
                              <tr key={`${item.prId}-${item.prItemIndex}`} className={isSelected ? "bg-white hover:bg-slate-50/30" : "bg-slate-50/60 opacity-60"}>
                                <td className="p-2.5 text-center">
                                  <input type="checkbox" checked={isSelected} onChange={() => handleItemToggle(item)} className="rounded border-slate-300 cursor-pointer" />
                                </td>
                                <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">
                                  {item.prNo}
                                </td>
                                <td className="p-2.5">
                                  {item.alreadyOpenedInPO ? (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">{L.alreadyOpened}</span>
                                  ) : (
                                    <span className="text-slate-400 text-[10px]">—</span>
                                  )}
                                </td>
                                {/* Material No. — editable + autocomplete */}
                                <td className="p-2.5">
                                  <MaterialAutoComplete
                                    value={selectedData.materialNo ?? ""}
                                    className={inputCls}
                                    disabled={!isSelected}
                                    placeholder="ระบุ Material No."
                                    materials={materials}
                                    onChange={(val) => handleItemChange(item.prId, item.prItemIndex, "materialNo", val)}
                                    onSelectMaterial={(mat) => handleItemSelectMaterial(item.prId, item.prItemIndex, mat)}
                                  />
                                </td>
                                {/* รายการ (description) — editable + autocomplete */}
                                <td className="p-2.5">
                                  <MaterialAutoComplete
                                    value={selectedData.description ?? ""}
                                    className={inputCls}
                                    disabled={!isSelected}
                                    placeholder="รายการสินค้า"
                                    materials={materials}
                                    onChange={(val) => handleItemChange(item.prId, item.prItemIndex, "description", val)}
                                    onSelectMaterial={(mat) => handleItemSelectMaterial(item.prId, item.prItemIndex, mat)}
                                  />
                                </td>
                                {/* หน่วย (ของ Material) */}
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    className={`${inputCls} w-20`}
                                    disabled={!isSelected}
                                    value={selectedData.unit ?? item.unit ?? ""}
                                    placeholder="หน่วย"
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "unit", e.target.value)}
                                  />
                                </td>
                                {/* สั่งซื้อ (QTY) — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.quantity}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "quantity", e.target.value)}
                                  />
                                </td>
                                {/* ราคา/หน่วย — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.price}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "price", e.target.value)}
                                  />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(Number(selectedData.quantity) * Number(selectedData.price))}
                                </td>
                                <td className="p-2.5">
                                  {(() => {
                                    const plan: string[] = Array.isArray(selectedData.disPrPlan) ? selectedData.disPrPlan : [];
                                    const key = getDisPrKeyForItem(item.prId, item.prItemIndex);
                                    const open = isDisPrPickerOpenForItem(item.prId, item.prItemIndex);
                                    const borderCls = isSelected && plan.length === 0 ? "border-red-300 ring-1 ring-red-100" : "border-slate-200";
                                    return (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          disabled={!isSelected}
                                          onClick={(e) => toggleDisPrPick(key, (e.currentTarget as any)?.getBoundingClientRect?.() || null)}
                                          className={`w-full min-w-[120px] text-left rounded-lg px-2 py-1.5 text-xs bg-white ${borderCls} border disabled:bg-slate-50 disabled:text-slate-400`}
                                          title="เลือก PR ที่จะตัดยอด (เรียงตามลำดับที่เลือก)"
                                        >
                                          {plan.length === 0 ? (
                                            <span className="text-slate-400">เลือก Dis PR...</span>
                                          ) : (
                                            <span className="flex flex-wrap gap-1">
                                              {plan.map((p) => (
                                                <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-semibold">
                                                  {p}
                                                </span>
                                              ))}
                                            </span>
                                          )}
                                        </button>
                                        {/* popup rendered via Portal (document.body) */}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                          {/* รายการว่าง (เพิ่มจากปุ่ม + เพิ่มรายการ) — กรอกอิสระ ไม่จำกัด */}
                          {formData.items.filter(i => i.id && String(i.id).startsWith("free-")).map((freeItem) => {
                            const inputCls = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white";
                            const prNoValue = freeItem.linkedPrNo ?? "";
                            const isPrNoOpen = freeItemPrNoDropdownId === freeItem.id;
                            const prNoFiltered = prNoValue
                              ? prNoOptionsForFreeItems.filter((no: string) => no.toLowerCase().includes(prNoValue.toLowerCase()))
                              : prNoOptionsForFreeItems;
                            return (
                              <tr key={freeItem.id} className="bg-white hover:bg-slate-50/30 border-t border-slate-200">
                                <td className="p-2.5 text-center">
                                  <button type="button" className="text-red-400 hover:text-red-600 p-1" onClick={() => removeFreeItem(freeItem.id)} title="ลบรายการ">
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                                <td className="p-2.5 relative">
                                  <input
                                    type="text"
                                    className={`${inputCls} min-w-[100px]`}
                                    placeholder="เลือกหรือพิมพ์ PR No."
                                    value={prNoValue}
                                    onChange={(e) => handleFreeItemChange(freeItem.id, "linkedPrNo", e.target.value)}
                                    onFocus={() => setFreeItemPrNoDropdownId(freeItem.id)}
                                    onBlur={() => setTimeout(() => setFreeItemPrNoDropdownId(null), 180)}
                                  />
                                  {isPrNoOpen && (prNoFiltered.length > 0 || prNoValue) && (
                                    <div className="absolute left-0 right-0 top-full mt-0.5 z-50 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                                      {prNoFiltered.length > 0 && prNoFiltered.map((prNo: string) => (
                                        <button
                                          key={prNo}
                                          type="button"
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 border-b border-slate-100 last:border-0"
                                          onMouseDown={(e) => { e.preventDefault(); handleFreeItemChange(freeItem.id, "linkedPrNo", prNo); setFreeItemPrNoDropdownId(null); }}
                                        >
                                          {prNo}
                                        </button>
                                      ))}
                                      {prNoValue.trim() && !prNoOptionsForFreeItems.includes(prNoValue.trim()) && (
                                        <div className="px-3 py-2 text-[10px] text-slate-500 border-t border-slate-100">
                                          ใช้ค่าที่พิมพ์: &quot;{prNoValue}&quot;
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="p-2.5"><span className="text-amber-600 text-[10px]">รายการเพิ่ม</span></td>
                                <td className="p-2.5">
                                  <MaterialAutoComplete value={freeItem.materialNo || ""} className={inputCls} placeholder="Material No." materials={materials} onChange={(val) => handleFreeItemChange(freeItem.id, "materialNo", val)} onSelectMaterial={(mat) => setFreeItemMaterial(freeItem.id, mat)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="text" className={inputCls} placeholder="รายการ" value={freeItem.description || ""} onChange={e => handleFreeItemChange(freeItem.id, "description", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="text" className={`${inputCls} w-16`} placeholder="หน่วย" value={freeItem.unit || ""} onChange={e => handleFreeItemChange(freeItem.id, "unit", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="number" className={`${inputCls} text-right`} value={freeItem.quantity} onChange={e => handleFreeItemChange(freeItem.id, "quantity", e.target.value)} />
                                </td>
                                <td className="p-2.5">
                                  <input type="number" className={`${inputCls} text-right`} value={freeItem.price} onChange={e => handleFreeItemChange(freeItem.id, "price", e.target.value)} />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(Number(freeItem.quantity) * Number(freeItem.price))}
                                </td>
                                <td className="p-2.5">
                                  {(() => {
                                    const plan: string[] = Array.isArray(freeItem.disPrPlan) ? freeItem.disPrPlan : [];
                                    const key = getDisPrKeyForFree(freeItem.id);
                                    const open = isDisPrPickerOpenForFree(freeItem.id);
                                    const borderCls = plan.length === 0 ? "border-red-300 ring-1 ring-red-100" : "border-slate-200";
                                    return (
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={(e) => toggleDisPrPick(key, (e.currentTarget as any)?.getBoundingClientRect?.() || null)}
                                          className={`w-full min-w-[120px] text-left rounded-lg px-2 py-1.5 text-xs bg-white ${borderCls} border`}
                                          title="เลือก PR ที่จะตัดยอด (เรียงตามลำดับที่เลือก)"
                                        >
                                          {plan.length === 0 ? (
                                            <span className="text-slate-400">เลือก Dis PR...</span>
                                          ) : (
                                            <span className="flex flex-wrap gap-1">
                                              {plan.map((p) => (
                                                <span key={p} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-semibold">
                                                  {p}
                                                </span>
                                              ))}
                                            </span>
                                          )}
                                        </button>
                                        {/* popup rendered via Portal (document.body) */}
                                      </div>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 mb-4 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                    <Upload size={14} className="text-slate-500 shrink-0" />
                    <span className="text-[11px] font-bold text-slate-700">แนบเอกสาร (หลายไฟล์) — อัปโหลด Firebase Storage</span>
                  </div>
                  <div className="p-4 space-y-2">
                    <input
                      type="file"
                      multiple
                      className="block w-full text-xs text-slate-600 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:font-medium file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        if (files.length) setPoPendingFiles((prev) => [...prev, ...files]);
                        e.target.value = "";
                      }}
                    />
                    {(poSavedAttachments.length > 0 || poPendingFiles.length > 0) && (
                      <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
                        {poSavedAttachments.map((a, i) => (
                          <li key={`saved-${i}-${a.url}`} className="flex items-center justify-between gap-2 text-slate-600 border border-slate-100 rounded-lg px-2 py-1">
                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate min-w-0">{a.name}</a>
                            <button type="button" className="text-red-500 shrink-0 text-[10px] font-medium" onClick={() => setPoSavedAttachments((prev) => prev.filter((_, j) => j !== i))}>ลบ</button>
                          </li>
                        ))}
                        {poPendingFiles.map((f, i) => (
                          <li key={`pend-${i}-${f.name}`} className="flex items-center justify-between gap-2 text-amber-800 bg-amber-50/80 border border-amber-100 rounded-lg px-2 py-1">
                            <span className="truncate min-w-0">{f.name} <span className="text-amber-600">(รออัปโหลด)</span></span>
                            <button type="button" className="text-red-500 shrink-0 text-[10px] font-medium" onClick={() => setPoPendingFiles((prev) => prev.filter((_, j) => j !== i))}>ลบ</button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Footer / ยอดรวม PO + เหตุผล */}
                <div className="mt-4 mb-6 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Left: reason input */}
                  <div className="lg:col-span-8 border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="text-[11px] font-bold text-slate-700">เหตุผล / Reason</div>
                      <div className="text-[10px] text-slate-400">ระบบจะนำไปใส่ใน PDF ช่อง <span className="font-semibold">reason</span></div>
                    </div>
                    <div className="p-4">
                      <textarea
                        className="w-full min-h-[90px] border border-slate-200 rounded-xl px-3 py-2 text-sm focus:border-red-400 focus:ring-1 focus:ring-red-100 outline-none resize-none"
                        placeholder={L.reasonPlaceholder}
                        value={(formData as any).reason || ""}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      />
                      <div className="mt-2 text-[10px] text-slate-400 italic">แนะนำ: ระบุวัตถุประสงค์/ขอบเขตงาน/อ้างอิงที่เกี่ยวข้อง</div>
                    </div>
                  </div>

                  {/* Right: VAT + totals panel */}
                  <div className="lg:col-span-4 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">ภาษี</span>
                      <label className="flex items-center gap-1 cursor-pointer text-[11px] px-2 py-0.5 rounded border border-slate-200 hover:border-red-300 hover:bg-red-50/50 transition-colors">
                        <input type="radio" name="vat" value="ex-vat" checked={formData.vatType === "ex-vat"} onChange={() => setFormData({ ...formData, vatType: "ex-vat" })} className="text-red-600 w-3 h-3" />
                        <span className={formData.vatType === "ex-vat" ? "font-semibold text-red-700" : "text-slate-600"}>Ex-Vat</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-[11px] px-2 py-0.5 rounded border border-slate-200 hover:border-red-300 hover:bg-red-50/50 transition-colors">
                        <input type="radio" name="vat" value="inc-vat" checked={formData.vatType === "inc-vat"} onChange={() => setFormData({ ...formData, vatType: "inc-vat" })} className="text-red-600 w-3 h-3" />
                        <span className={formData.vatType === "inc-vat" ? "font-semibold text-red-700" : "text-slate-600"}>ไม่มี Vat</span>
                      </label>
                      <div className="w-px h-3 bg-slate-300 mx-1" />
                      <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={discountEnabled} onChange={e => { const checked = e.target.checked; setDiscountEnabled(checked); if (!checked) setFormData({ ...formData, discount: 0 }); }} className="rounded text-red-600 w-3 h-3" />
                        <span>ส่วนลด</span>
                      </label>
                      {discountEnabled && (
                        <input type="text" className="w-20 border border-slate-200 rounded px-1.5 py-0.5 text-[11px] text-right focus:border-red-400 focus:ring-1 focus:ring-red-100 outline-none" placeholder="0.00" value={formData.discount ? String(formData.discount) : ""} onChange={e => { const v = e.target.value.replace(/,/g, ""); const n = parseFloat(v); setFormData({ ...formData, discount: isNaN(n) ? 0 : Math.max(0, n) }); }} />
                      )}
                      {selectedPrsTotalAmount > 0 && (
                        <div className="ml-auto flex flex-col items-end leading-tight">
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">คงเหลือ PR</span>
                          <span className="text-xl font-bold text-blue-600 tabular-nums">{formatCurrency(selectedPrsTotalAmount)}</span>
                        </div>
                      )}
                    </div>

                    <div className="px-4 py-3">
                      <div className="text-[11px]">
                        <div className="flex justify-between py-0.5"><span className="text-slate-500">รวมราคา / Amount</span><span className="font-medium text-slate-700 tabular-nums">{formatCurrency(calculateTotals().subtotal)}</span></div>
                        <div className="flex justify-between py-0.5"><span className="text-slate-500">ส่วนลด / Discount</span><span className="text-slate-600 tabular-nums">-{formatCurrency(formData.discount || 0)}</span></div>
                        <div className="flex justify-between py-0.5 border-t border-slate-100"><span className="text-slate-500">มูลค่า / Sub Total</span><span className="font-medium text-slate-700 tabular-nums">{formatCurrency(Math.max(0, calculateTotals().subtotal - (formData.discount || 0)))}</span></div>
                        <div className="flex justify-between items-center py-0.5">
                          <span className="text-slate-500">VAT 7%</span>
                          <span className="flex items-center gap-0.5 tabular-nums">
                            {!vatEditOpen
                              ? <><span className="text-slate-700">{formatCurrency(calculateTotals().vat)}</span><button type="button" className="p-0.5 rounded hover:bg-slate-100 text-slate-400 ml-0.5" onClick={() => { setVatEditValue(String(manualVatOverride ?? calculateTotals().vat)); setVatEditOpen(true); }}><Edit size={9} /></button></>
                              : <span className="flex items-center gap-0.5"><input type="text" className="w-14 border rounded px-1 py-0.5 text-[10px] text-right" value={vatEditValue} onChange={e => setVatEditValue(e.target.value)} /><button type="button" className="text-[10px] text-emerald-600 font-medium" onClick={() => { const n = parseFloat(vatEditValue); if (!isNaN(n)) { setManualVatOverride(n); setVatEditOpen(false); } }}>Save</button><button type="button" className="text-[10px] text-slate-400" onClick={() => { setVatEditOpen(false); setVatEditValue(""); }}>✕</button></span>
                            }
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 mt-0.5 border-t-2 border-slate-800">
                          <span className="font-bold text-slate-800">ยอดสุทธิ / Net Total</span>
                          <span className="font-bold tabular-nums text-slate-900">
                            {formatCurrency(calculateTotals().total)}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={poDraftInFlight || poSendInFlight}
                          className="px-4 rounded-lg flex items-center gap-1.5 text-xs font-semibold shrink-0"
                          onClick={handleSavePODraft}
                        >
                          <FileText size={13} /> {L.draftBtn}
                        </Button>
                        <Button
                          size="sm"
                          disabled={poDraftInFlight || poSendInFlight}
                          className="px-5 rounded-lg flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shrink-0"
                          onClick={handleSavePO}
                        >
                          <Save size={13} /> {poSendInFlight ? "กำลังส่ง..." : L.saveBtn}
                        </Button>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-400 italic">บันทึกดราฟได้ก่อน — ส่งขออนุมัติเมื่อกรอกครบ (Vendor, รายการ, Dis PR)</div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* PR Selection Modal */}
        {isPrSelectModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 shrink-0">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-bold text-white">เลือกใบขอซื้อ (Select PRs)</h3>
                    <p className="text-white/70 text-xs mt-0.5">สามารถเลือกได้หลายรายการ</p>
                  </div>
                  <input
                    type="text"
                    placeholder="ค้นหา PR No., Cost Code, รายการงบ..."
                    value={prSelectFilterText}
                    onChange={(e) => setPrSelectFilterText(e.target.value)}
                    className="ml-2 px-3 py-1.5 rounded-lg border border-white/20 bg-white/10 text-white placeholder-white/50 text-sm w-56 max-w-[200px] focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400"
                  />
                </div>
                <button
                  onClick={() => setIsPrSelectModalOpen(false)}
                  className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all shrink-0"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Content — Table View */}
              <div ref={selectPrTableRef} className="flex-1 overflow-y-auto w-full min-w-0">
                {approvedPRs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <ClipboardList size={40} className="mb-3 opacity-40" />
                    <p className="font-medium text-slate-500">ไม่มีใบขอซื้อที่อนุมัติแล้ว</p>
                    <p className="text-xs mt-1">เมื่อมีใบขอซื้อที่ได้รับการอนุมัติ จะแสดงในส่วนนี้</p>
                  </div>
                ) : approvedPRsFiltered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                    <p className="font-medium">ไม่พบรายการที่ตรงกับคำค้น</p>
                    <p className="text-xs mt-1">ลองเปลี่ยนคำค้นหรือล้างฟิลเตอร์</p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left table-fixed">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-center" style={{ width: selectPrLayout.scaled.checkbox }}>
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 cursor-pointer"
                            checked={tempSelectedPrIds.length === approvedPRsFiltered.length && approvedPRsFiltered.length > 0}
                            onChange={(e) => {
                              if (!e.target.checked) {
                                setTempSelectedPrIds([]);
                                return;
                              }
                              const first = approvedPRsFiltered[0];
                              const lockedCostCode = tempSelectedPrIds.length > 0 ? (prs.find((p) => p.id === tempSelectedPrIds[0])?.costCode ?? null) : (first?.costCode ?? null);
                              const next = lockedCostCode
                                ? approvedPRsFiltered.filter((pr) => pr.costCode === lockedCostCode).map((p) => p.id)
                                : approvedPRsFiltered.map((p) => p.id);
                              setTempSelectedPrIds(next);
                            }}
                            title="เลือกทั้งหมด"
                          />
                        </th>
                        <ResizableTh tableId="select-pr" colKey="prNo" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.prNo}>PR No.</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="costCode" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.costCode}>Cost Code</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="description" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.description}>รายการงบ</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="requestor" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.requestor}>ผู้ขอซื้อ</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="date" className="px-4 py-3" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.date}>วันที่</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="items" className="px-4 py-3 text-center" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.items}>สินค้า</ResizableTh>
                        <ResizableTh tableId="select-pr" colKey="amount" className="px-4 py-3 text-right" isAdmin={userRole==="Administrator"} onResize={onPOViewColumnResize} currentWidth={selectPrLayout.scaled.amount}>ยอดรวม</ResizableTh>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvedPRsFiltered.map(pr => {
                        const isSelected = tempSelectedPrIds.includes(pr.id);
                        const prDesc = pr.items && pr.items.length > 0
                          ? pr.items.map((it) => it.description).filter(Boolean).join(", ")
                          : "-";
                        const totalAmt = pr.items?.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0) || 0;
                        const remainingAmt = getPrRemainingAmount(pr.id);
                        return (
                          <tr
                            key={pr.id}
                            className={`cursor-pointer select-none transition-colors ${isSelected ? "bg-slate-700/10 hover:bg-slate-700/15" : "hover:bg-slate-50"}`}
                            onClick={() => {
                              toggleTempPrSelection(pr.id);
                            }}
                          >
                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 cursor-pointer"
                                checked={isSelected}
                                onChange={() => toggleTempPrSelection(pr.id)}
                              />
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800">{pr.prNo}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{pr.costCode}</span>
                            </td>
                            <td className="px-4 py-3 max-w-[220px]">
                              <span className="block truncate text-slate-600" title={prDesc}>{prDesc}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestor}</td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestDate}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold">{pr.items?.length || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">
                              <span>{formatCurrency(remainingAmt)}</span>
                              {remainingAmt < totalAmt && (
                                <span className="block text-xs text-slate-400 font-normal">จาก {formatCurrency(totalAmt)}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-600">
                  {tempSelectedPrIds.length > 0
                    ? <span className="font-semibold text-slate-800">เลือกแล้ว {tempSelectedPrIds.length} ใบ</span>
                    : <span className="text-slate-400">ยังไม่ได้เลือก</span>}
                </span>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setIsPrSelectModalOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 rounded-xl"
                    onClick={() => {
                      // Remove items from PRs that are no longer selected
                      const removedPrIds = formData.selectedPrIds.filter(id => !tempSelectedPrIds.includes(id));
                      setFormData(prev => ({
                        ...prev,
                        selectedPrIds: tempSelectedPrIds,
                        items: prev.items.filter(item => !removedPrIds.includes(item.prId)),
                      }));
                      setIsPrSelectModalOpen(false);
                    }}
                  >
                    ยืนยันการเลือก ({tempSelectedPrIds.length} ใบ)
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* เพิ่มรายการ Modal */}
        {isAddItemModalOpen && formData.selectedPrIds.length > 0 && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10010] p-4" onClick={() => setIsAddItemModalOpen(false)}>
            <motion.div
              className="w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <Package size={20} className="text-white" />
                  <h3 className="text-base font-bold text-white">เพิ่มรายการสินค้า</h3>
                </div>
                <button type="button" className="text-white/70 hover:text-white p-2 rounded-xl" onClick={() => setIsAddItemModalOpen(false)}>
                  <XCircle size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">PR No.</th>
                      <th className="p-2.5">สถานะ</th>
                      <th className="p-2.5">รายการ</th>
                      <th className="p-2.5 text-right">เหลือ (QTY)</th>
                      <th className="p-2.5 text-right">ราคา/หน่วย</th>
                      <th className="p-2.5 w-24 text-center">เพิ่ม</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {availableItems.map((item) => {
                      const alreadyInPo = formData.items.some(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex);
                      return (
                        <tr key={`${item.prId}-${item.prItemIndex}`} className="hover:bg-slate-50">
                          <td className="p-2.5 font-medium text-slate-800">{item.prNo}</td>
                          <td className="p-2.5">
                            {item.alreadyOpenedInPO ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800">{L.alreadyOpened}</span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-slate-600 max-w-[200px] truncate" title={item.description}>{item.description || "-"}</td>
                          <td className="p-2.5 text-right">{item.remainingQty} {item.unit}</td>
                          <td className="p-2.5 text-right">{formatCurrency(item.price)}</td>
                          <td className="p-2.5 text-center">
                            {alreadyInPo ? (
                              <span className="text-slate-400 text-[10px]">เพิ่มแล้ว</span>
                            ) : (
                              <Button variant="secondary" size="sm" className="px-2 py-1 text-[10px]" onClick={() => handleAddItemClick(item)}>
                                เพิ่ม
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {availableItems.length === 0 && (
                  <div className="py-12 text-center text-slate-400 text-sm">ไม่มีรายการจาก PR ที่เลือก</div>
                )}
              </div>
              <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                <Button variant="secondary" onClick={() => setIsAddItemModalOpen(false)}>ปิด</Button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Quick Add Vendor Modal */}
        {isVendorModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010]">
            <Card className="w-full max-w-lg p-6">
              <h3 className="font-bold mb-4 flex items-center gap-2">
                <Building2 size={18} /> เพิ่ม Vendor ด่วน
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="รหัส">
                  <input type="text" className="w-full border rounded-lg p-2 text-sm" value={newVendor.code} onChange={e => setNewVendor({ ...newVendor, code: e.target.value })} placeholder="V001" />
                </InputGroup>
                <InputGroup label="โทร">
                  <input type="text" className="w-full border rounded-lg p-2 text-sm" value={newVendor.tel} onChange={e => setNewVendor({ ...newVendor, tel: e.target.value })} placeholder="02-xxx-xxxx" />
                </InputGroup>
                <div className="col-span-2">
                  <InputGroup label="ชื่อ *">
                    <input type="text" className="w-full border rounded-lg p-2 text-sm" value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} placeholder="ชื่อร้านค้า/บริษัท" />
                  </InputGroup>
                </div>
                <div className="col-span-2">
                  <InputGroup label="ที่อยู่">
                    <input type="text" className="w-full border rounded-lg p-2 text-sm" value={newVendor.address} onChange={e => setNewVendor({ ...newVendor, address: e.target.value })} placeholder="ที่อยู่" />
                  </InputGroup>
                </div>
                <InputGroup label="เครดิตเทอม">
                  <input type="text" className="w-full border rounded-lg p-2 text-sm" value={newVendor.creditTerm} onChange={e => setNewVendor({ ...newVendor, creditTerm: e.target.value })} placeholder="30, 60..." />
                </InputGroup>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => { setIsVendorModalOpen(false); setNewVendor({ name: "", code: "", type: "", tel: "", address: "", creditTerm: "" }); }}>ยกเลิก</Button>
                <Button onClick={handleQuickAddVendor}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Reject Modal */}
        {rejectPoId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10010]">
            <Card className="w-full max-w-sm p-6">
              <h3 className="font-bold text-red-600 mb-4">ระบุเหตุผลการปฏิเสธ</h3>
              <textarea className="w-full border p-2 rounded h-24 text-sm" placeholder="เหตุผล..." value={rejectReason} onChange={e => setRejectReason(e.target.value)}></textarea>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setRejectPoId(null)}>ยกเลิก</Button>
                <Button variant="danger" onClick={() => { handleAction(rejectPoId, "reject", rejectReason); setRejectPoId(null); }}>ยืนยัน</Button>
              </div>
            </Card>
          </div>
        )}
        </>
        )}
      </div>
    );
});


// ─── BudgetView (module-level, extracted from AppShell) ─────────────────────────


export default POView;

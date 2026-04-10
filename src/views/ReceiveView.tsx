// @ts-nocheck
import React, { useState, useMemo, useCallback, useContext, useEffect } from "react";
import {
  ChevronDown, ChevronRight, Package, Eye, FileText,
  Plus, X, Check, Clock, ExternalLink, Truck, ImageIcon, List, Search, Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { AuthContext } from "../auth/AuthContext";
import { Card, Button, Badge, formatCurrency } from "../components/ui";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { uploadAttachment } from "../lib/uploadAttachment";
import { generateRPPdfBytes, uploadGeneratedPdf, deleteGeneratedPdf, generatePOPdfBytes } from "../lib/pdfForms";
import { PDFDocument } from "pdf-lib";
import { combineImagesToPdf, createPdfThumbnail, generateCombinedPdfFilename } from "../lib/imageToPdf";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";

const PO_TYPE_LABELS = {
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

const ReceiveView = React.memo(() => {
  const {
    pos, vendors, receives, projects, prs,
    addData, updateData, deleteData, showAlert, openConfirm, canUseFunction,
    isColumnVisible,
    visibleProjects, loadVendors,
  } = useAppData();
  const { selectedProjectId } = useUI();
  const { user, userData, logAction } = useContext(AuthContext);
  const canViewReceiveHistory = canUseFunction("receive", "viewHistory");

  // ไม่โหลด vendors ตอน mount — โหลดเมื่อ user เปิด PO detail จริงๆ (ลด Firebase reads)

  const [activeTab, setActiveTab] = useState<"po" | "history">("po");
  const [viewingPO, setViewingPO] = useState(null);
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveForm, setReceiveForm] = useState([]);
  const [receiveNote, setReceiveNote] = useState("");
  const [receiveDate, setReceiveDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [receiveVendorName, setReceiveVendorName] = useState("");
  const [receiveDocumentNo, setReceiveDocumentNo] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingStep, setSavingStep] = useState("");
  const [expandedTypes, setExpandedTypes] = useState({});
  const [photoPreview, setPhotoPreview] = useState(null);
  const [viewingRcv, setViewingRcv] = useState(null);
  const [uploadingPhotos, setUploadingPhotos] = useState({});

  // Search states
  const [poPOSearch, setPoPOSearch] = useState("");
  const [poVendorSearch, setPoVendorSearch] = useState("");
  const [histPOSearch, setHistPOSearch] = useState("");
  const [histVendorSearch, setHistVendorSearch] = useState("");

  useEffect(() => {
    if (!canViewReceiveHistory && activeTab === "history") {
      setActiveTab("po");
    }
  }, [activeTab, canViewReceiveHistory]);

  const currentProject = projects.find((p) => p.id === selectedProjectId);

  // Approved POs for selected project
  const approvedPOs = useMemo(() => {
    if (!selectedProjectId) return [];
    return pos.filter(
      (po) => po.projectId === selectedProjectId && po.status === "Approved" && po.poType !== "SP" && po.poType !== "DC"
    );
  }, [pos, selectedProjectId]);

  // Receives for this project
  const projectReceives = useMemo(
    () => receives.filter((r) => r.projectId === selectedProjectId),
    [receives, selectedProjectId]
  );

  // Receive summary per PO: { [poId]: { [itemIndex]: totalReceivedQty } }
  const receiveSummary = useMemo(() => {
    const map = {};
    projectReceives.forEach((rcv) => {
      if (!map[rcv.poId]) map[rcv.poId] = {};
      (rcv.items || []).forEach((item) => {
        const idx = item.poItemIndex;
        map[rcv.poId][idx] = (map[rcv.poId][idx] || 0) + Number(item.receivedQty || 0);
      });
    });
    return map;
  }, [projectReceives]);

  const getReceiveProgress = useCallback(
    (po) => {
      const summary = receiveSummary[po.id] || {};
      const items = po.items || [];
      let totalOrdered = 0;
      let totalReceived = 0;
      items.forEach((item, idx) => {
        totalOrdered += Number(item.quantity || 0);
        totalReceived += Number(summary[idx] || 0);
      });
      return { totalOrdered, totalReceived, done: totalOrdered > 0 && totalReceived >= totalOrdered };
    },
    [receiveSummary]
  );

  const getVendorName = useCallback(
    (vendorId) => {
      const v = vendors.find((vd) => vd.id === vendorId);
      return v ? v.name : "-";
    },
    [vendors]
  );

  // Filtered approved POs for "po" tab (search by PO No. and Vendor)
  const filteredApprovedPOs = useMemo(() => {
    return approvedPOs.filter((po) => {
      const poNoMatch = !poPOSearch || (po.poNo || "").toLowerCase().includes(poPOSearch.toLowerCase());
      const vendorMatch = !poVendorSearch || getVendorName(po.vendorId).toLowerCase().includes(poVendorSearch.toLowerCase());
      return poNoMatch && vendorMatch;
    });
  }, [approvedPOs, poPOSearch, poVendorSearch, getVendorName]);

  // Group POs by poType (use filtered list for display)
  const groupedPOs = useMemo(() => {
    const groups = {};
    filteredApprovedPOs.forEach((po) => {
      const type = po.poType || "OTHER";
      if (!groups[type]) groups[type] = [];
      groups[type].push(po);
    });
    return groups;
  }, [filteredApprovedPOs]);

  const toggleType = (type) => {
    setExpandedTypes((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const getPrNoFromPo = useCallback((po) => {
    if (!po) return "";
    if (po.prNo) return String(po.prNo);
    // items อาจมี prNo ตรงๆ (PO ใหม่)
    const fromItemsPrNo = [...new Set((po.items || []).map((i) => i.prNo).filter(Boolean))];
    if (fromItemsPrNo.length > 0) return fromItemsPrNo.join(", ");
    // items มี prId → lookup จาก prs collection
    const fromItemsPrId = [...new Set((po.items || []).map((i) => i.prId).filter(Boolean))];
    if (fromItemsPrId.length > 0) {
      const nos = fromItemsPrId.map((id) => prs.find((pr) => pr.id === id)?.prNo).filter(Boolean);
      if (nos.length > 0) return nos.join(", ");
    }
    // fallback: selectedPrIds (กรณีเก็บไว้)
    const linkedPrIds = Array.isArray(po.selectedPrIds) ? po.selectedPrIds : [];
    if (linkedPrIds.length === 0) return "";
    const linkedPrNos = linkedPrIds
      .map((prId) => prs.find((pr) => pr.id === prId)?.prNo)
      .filter(Boolean);
    return linkedPrNos.join(", ");
  }, [prs]);

  // Generate RP number
  const generateReceiveNo = useCallback(() => {
    if (!currentProject?.jobNo) return `RP-${Date.now()}`;
    const yy = String(new Date().getFullYear()).slice(-2);
    const jobCode = currentProject.jobNo;
    const existing = receives.filter(
      (r) =>
        r.projectId === selectedProjectId &&
        (
          r.rpNo?.startsWith(`RP${yy}${jobCode}`) ||
          r.receiveNo?.startsWith(`RP${yy}${jobCode}`) ||
          r.receiveNo?.startsWith(`RCV${yy}${jobCode}`)
        )
    );
    const seq = String(existing.length + 1).padStart(4, "0");
    return `RP${yy}${jobCode}-${seq}`;
  }, [currentProject, receives, selectedProjectId]);

  // Open PO Detail Modal — trigger loadVendors lazily ตรงนี้แทนการโหลดตอน mount
  const openPODetail = (po) => {
    setViewingPO(po);
    setReceiveMode(false);
    setReceiveNote("");
    setReceiveVendorName(getVendorName(po?.vendorId));
    setReceiveDocumentNo("");
    setReceiveDate(new Date().toISOString().split("T")[0]);
    loadVendors();
  };

  // sync receiveVendorName เมื่อ vendors โหลดเสร็จหลังจากเปิด PO detail
  useEffect(() => {
    if (viewingPO && vendors.length > 0) {
      setReceiveVendorName((prev) => {
        if (prev && prev !== "-") return prev;
        return getVendorName(viewingPO.vendorId);
      });
    }
  }, [vendors, viewingPO, getVendorName]);

  // Switch to receive form mode
  const startReceiveMode = () => {
    const po = viewingPO;
    if (!po) return;
    const summary = receiveSummary[po.id] || {};
    const form = (po.items || []).map((item, idx) => {
      const ordered = Number(item.quantity || 0);
      const alreadyReceived = Number(summary[idx] || 0);
      const remaining = Math.max(0, ordered - alreadyReceived);
      const unitPrice = Number(item.price) || 0;
      const lineAmount =
        Number(item.amount) || (Number.isFinite(ordered * unitPrice) ? ordered * unitPrice : 0);
      const lineNo = item.lineNo ?? item.rowNo ?? idx + 1;
      return {
        poItemIndex: idx,
        lineNo,
        materialNo: item.materialNo || "",
        description: item.description || "",
        unit: item.unit || "",
        unitPrice,
        lineAmount,
        orderedQty: ordered,
        alreadyReceived,
        remaining,
        receivedQty: 0,
        photos: [],
        photoFiles: [],
      };
    });
    setReceiveForm(form);
    setReceiveMode(true);
  };

  const updateReceiveItem = (idx, field, value) => {
    setReceiveForm((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    );
  };

  const handlePhotoAdd = async (itemIdx, files) => {
    if (!files || files.length === 0) {
      console.warn("[Photo Upload] No files provided to handlePhotoAdd");
      return;
    }

    // Set uploading state
    setUploadingPhotos(prev => ({ ...prev, [itemIdx]: true }));

    try {
      const validFiles = [];
      const validPreviews = [];
      const maxFileSize = 10 * 1024 * 1024; // 10MB limit
      const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

      for (let index = 0; index < files.length; index++) {
        const file = files[index];
        
        // Validate file type
        if (!supportedTypes.includes(file.type.toLowerCase())) {
          console.warn(`[Photo Upload] Unsupported file type: ${file.type} for file: ${file.name}`);
          showAlert("ไฟล์ไม่รองรับ", `ไฟล์ "${file.name}" ไม่ใช่รูปภาพที่รองรับ\nรองรับเฉพาะ: JPG, PNG, GIF, WebP`, "warning");
          continue;
        }

        // Validate file size
        if (file.size > maxFileSize) {
          console.warn(`[Photo Upload] File too large: ${file.size} bytes for file: ${file.name}`);
          showAlert("ไฟล์ใหญ่เกินไป", `ไฟล์ "${file.name}" มีขนาดใหญ่เกิน 10MB\nขนาดปัจจุบัน: ${(file.size / 1024 / 1024).toFixed(2)}MB`, "warning");
          continue;
        }

        try {
          const objectUrl = URL.createObjectURL(file);
          validFiles.push(file);
          validPreviews.push({ 
            url: objectUrl, 
            name: file.name, 
            isLocal: true,
            size: file.size,
            type: file.type
          });
          console.log(`[Photo Upload] Added file ${index + 1}/${files.length}: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);
        } catch (error) {
          console.error(`[Photo Upload] Error creating object URL for file: ${file.name}`, error);
          showAlert("เกิดข้อผิดพลาด", `ไม่สามารถโหลดไฟล์ "${file.name}" ได้`, "error");
        }
      }

      if (validFiles.length === 0) {
        console.warn("[Photo Upload] No valid files to add");
        return;
      }

      setReceiveForm((prev) =>
        prev.map((item, i) => {
          if (i !== itemIdx) return item;
          const newPhotoFiles = [...item.photoFiles, ...validFiles];
          const newPhotos = [...item.photos, ...validPreviews];
          
          console.log(`[Photo Upload] Updated item ${itemIdx}: total ${newPhotoFiles.length} files`);
          return { 
            ...item, 
            photoFiles: newPhotoFiles, 
            photos: newPhotos 
          };
        })
      );

      if (validFiles.length > 0) {
        showAlert("สำเร็จ", `เพิ่มรูปภาพ ${validFiles.length} ไฟล์แล้ว`, "success");
      }

    } catch (error) {
      console.error("[Photo Upload] Error in handlePhotoAdd:", error);
      showAlert("เกิดข้อผิดพลาด", "ไม่สามารถเพิ่มรูปภาพได้ กรุณาลองใหม่", "error");
    } finally {
      // Clear uploading state
      setUploadingPhotos(prev => ({ ...prev, [itemIdx]: false }));
    }
  };

  const removePhoto = (itemIdx, photoIdx) => {
    setReceiveForm((prev) =>
      prev.map((item, i) => {
        if (i !== itemIdx) return item;
        const photos = [...item.photos];
        const photoFiles = [...item.photoFiles];
        if (photos[photoIdx]?.isLocal) URL.revokeObjectURL(photos[photoIdx].url);
        photos.splice(photoIdx, 1);
        photoFiles.splice(photoIdx, 1);
        return { ...item, photos, photoFiles };
      })
    );
  };

  /** ปุ่มเดียว — ไม่ใส่ capture ให้ OS ให้เลือกถ่าย / แกลเลอรี / อัปโหลดไฟล์ */
  const openItemPhotoPicker = (itemIdx) => {
    try {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.multiple = true;
      input.style.display = "none";
      
      // Add to DOM temporarily to ensure it works on all browsers
      document.body.appendChild(input);
      
      input.onchange = (e) => {
        try {
          const files = e.target.files;
          if (files && files.length > 0) {
            console.log(`[Photo Upload] Selected ${files.length} files for item ${itemIdx}`);
            handlePhotoAdd(itemIdx, files);
          } else {
            console.warn("[Photo Upload] No files selected");
          }
        } catch (error) {
          console.error("[Photo Upload] Error handling file selection:", error);
          showAlert("เกิดข้อผิดพลาด", "ไม่สามารถเลือกไฟล์ได้ กรุณาลองใหม่", "error");
        } finally {
          // Clean up
          document.body.removeChild(input);
        }
      };
      
      input.onerror = (error) => {
        console.error("[Photo Upload] Input error:", error);
        showAlert("เกิดข้อผิดพลาด", "ไม่สามารถเปิดตัวเลือกไฟล์ได้", "error");
        document.body.removeChild(input);
      };
      
      // Trigger file picker
      input.click();
      
    } catch (error) {
      console.error("[Photo Upload] Error creating file input:", error);
      showAlert("เกิดข้อผิดพลาด", "ไม่สามารถเปิดตัวเลือกไฟล์ได้ กรุณาลองใหม่", "error");
    }
  };

  // Save receive transaction
  const handleSaveReceive = async () => {
    const po = viewingPO;
    if (!po) return;

    const itemsToSave = receiveForm.filter((item) => item.receivedQty > 0);
    if (itemsToSave.length === 0) {
      return showAlert("ไม่มีรายการ", "กรุณาระบุจำนวนรับอย่างน้อย 1 รายการ", "warning");
    }

    for (const item of itemsToSave) {
      if (item.receivedQty > item.remaining) {
        return showAlert(
          "จำนวนเกิน",
          `"${item.description}" รับได้สูงสุด ${item.remaining} ${item.unit}`,
          "error"
        );
      }
    }

    setSaving(true);
    setSavingStep("กำลังอัปโหลดรูปภาพ...");
    try {
      const receiveNo = generateReceiveNo();
      const now = new Date();
      const receivedByName = `${userData?.firstName || ""} ${userData?.lastName || ""}`.trim();
      const resolvedPrNo = getPrNoFromPo(po);
      const resolvedProjectCode = po.projectItemCode
        || (resolvedPrNo ? resolvedPrNo.split(",")[0].trim().substring(0, 3) : "");
      // ดึงชื่อผู้จำหน่ายจาก vendors list โดยตรง (เป็นค่าจริง ไม่ใช่ "-")
      const vendorObj = vendors.find((v) => v.id === po.vendorId);
      const resolvedVendorName =
        (receiveVendorName && receiveVendorName !== "-")
          ? receiveVendorName
          : (vendorObj?.name || po.vendorName || "");

      // Upload photos and combine into PDF
      const savedItems = [];
      const allPhotoFiles = []; // Collect all photo files for PDF combination
      
      for (const item of itemsToSave) {
        const uploadedPhotos = [];
        for (const file of item.photoFiles) {
          const result = await uploadAttachment(file, {
            type: "receive",
            projectId: selectedProjectId,
            subPath: receiveNo,
          });
          uploadedPhotos.push({ url: result.url, name: result.name });
          allPhotoFiles.push(file); // Add to collection for PDF combination
        }
        savedItems.push({
          poItemIndex: item.poItemIndex,
          materialNo: item.materialNo,
          description: item.description,
          unit: item.unit,
          orderedQty: item.orderedQty,
          price: item.unitPrice,
          amount: Number(item.receivedQty) * Number(item.unitPrice || 0),
          receivedQty: Number(item.receivedQty),
          photos: uploadedPhotos,
        });
      }

      // ── Generate RP PDF and Combine with Photos ──────────────────────────
      setSavingStep("กำลังสร้าง PDF ใบตรวจรับสินค้า...");
      let pdfUrl: string | null = null;
      let pdfPath: string | null = null;
      let totalPhotos = allPhotoFiles.length;
      
      try {
        const rpData = {
          rpNo: receiveNo,
          receiveNo,
          receivedDate: receiveDate,
          projectItemCode: resolvedProjectCode,
          vendorName: resolvedVendorName,
          prNo: resolvedPrNo,
          poNo: po.poNo,
          documentNo: receiveDocumentNo || "",
          receivedByName,
          location: po.location || currentProject?.location || currentProject?.name || "",
          items: savedItems,
          createdAt: now.toISOString(),
        };

        const signatureUrl = userData?.signatureUrl || null;
        let rpPdfBytes = await generateRPPdfBytes(rpData, { signatureUrl });

        // Merge PO PDF into the RP PDF
        try {
          setSavingStep("กำลังรวมหน้าใบสั่งซื้อ (PO)...");
          const poPdfBytes = await generatePOPdfBytes(po, { vendor: vendorObj, project: currentProject });
          const mergedPdf = await PDFDocument.load(rpPdfBytes);
          const poDoc = await PDFDocument.load(poPdfBytes);
          const copiedPages = await mergedPdf.copyPages(poDoc, poDoc.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
          rpPdfBytes = await mergedPdf.save();
        } catch (poMergeErr) {
          console.warn("[ReceiveView] Failed to merge PO to RP PDF:", poMergeErr);
        }

        // If there are photos, append them to the RP PDF
        if (allPhotoFiles.length > 0) {
          setSavingStep("กำลังรวมรูปภาพเข้ากับ PDF ใบตรวจรับสินค้า...");
          rpPdfBytes = await combineImagesToPdf(allPhotoFiles, {
            title: `ใบตรวจรับสินค้า ${receiveNo} พร้อมรูปภาพ`,
            maintainAspectRatio: true,
            existingPdfBytes: rpPdfBytes,
          });
        }

        const safeRpNo = receiveNo.replace(/[^a-zA-Z0-9\-_]/g, "_");
        const safeProjId = selectedProjectId || "unknown";
        pdfPath = `generated/receives/${safeProjId}/${safeRpNo}.pdf`;

        setSavingStep("กำลังอัปโหลด PDF...");
        pdfUrl = await uploadGeneratedPdf(rpPdfBytes, pdfPath);
        
      } catch (pdfErr) {
        console.warn("[ReceiveView] PDF generation failed (non-fatal):", pdfErr);
        pdfUrl = null;
        pdfPath = null;
      }
      // ─────────────────────────────────────────────────────────────────────

      setSavingStep("กำลังบันทึกข้อมูล...");
      const receiveData = {
        receiveNo,
        rpNo: receiveNo,
        poId: po.id,
        poNo: po.poNo,
        prNo: resolvedPrNo,
        projectItemCode: resolvedProjectCode,
        vendorName: resolvedVendorName,
        documentNo: receiveDocumentNo || "",
        projectId: selectedProjectId,
        items: savedItems,
        receivedDate: receiveDate,
        receivedByUid: user?.uid || null,
        receivedByName,
        note: receiveNote,
        createdAt: now.toISOString(),
        ...(pdfUrl ? { pdfUrl, pdfPath } : {}),
        ...(totalPhotos > 0 ? { totalPhotos } : {}),
      };

      const success = await addData("receives", receiveData, null, { skipLog: true });
      if (!success) {
        setSaving(false);
        setSavingStep("");
        return;
      }

      await logAction?.(
        "Create Receive",
        `สร้าง Receive ${receiveNo} สำหรับ PO ${po.poNo || po.id}${resolvedPrNo ? ` / PR ${resolvedPrNo}` : ""}`,
        selectedProjectId
      );

      // Check if all items are now fully received
      const summary = { ...(receiveSummary[po.id] || {}) };
      savedItems.forEach((item) => {
        summary[item.poItemIndex] = (summary[item.poItemIndex] || 0) + item.receivedQty;
      });

      const allItems = po.items || [];
      const allFullyReceived = allItems.every(
        (item, idx) => Number(summary[idx] || 0) >= Number(item.quantity || 0)
      );

      if (allFullyReceived) {
        const isPayBeforeReceive = po.receiveType === "Pay before receive";
        await updateData(
          "pos",
          po.id,
          isPayBeforeReceive
            ? { status: "Closed PO", statusNow: "Closed PO" }
            : { status: "Received", statusNow: "Received" },
          { skipLog: true }
        );
        showAlert(
          "รับของครบ",
          isPayBeforeReceive
            ? `PO ${po.poNo} รับของครบทุกรายการ — สถานะเปลี่ยนเป็น Closed PO`
            : `PO ${po.poNo} รับของครบทุกรายการ — สถานะเปลี่ยนเป็น Received`,
          "success"
        );
      } else {
        await updateData("pos", po.id, { statusNow: "Partial Receive" }, { skipLog: true });
        showAlert("สำเร็จ", `บันทึกรับของ ${receiveNo} เรียบร้อย`, "success");
      }

      setViewingPO(null);
      setReceiveMode(false);
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาด: " + e.message, "error");
    } finally {
      setSavingStep("");
      setSaving(false);
    }
  };

  // History for the currently viewed PO
  const poReceiveHistory = useMemo(() => {
    if (!viewingPO) return [];
    return projectReceives
      .filter((r) => r.poId === viewingPO.id)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [viewingPO, projectReceives]);

  const previewReceiveNo = useMemo(() => {
    if (!receiveMode) return "";
    return generateReceiveNo();
  }, [receiveMode, generateReceiveNo]);

  const currentPrNo = useMemo(() => getPrNoFromPo(viewingPO), [viewingPO, getPrNoFromPo]);
  const projectItemCode = useMemo(() => {
    if (viewingPO?.projectItemCode) return viewingPO.projectItemCode;
    if (currentPrNo) {
      const first = String(currentPrNo).split(",")[0].trim();
      return first.substring(0, 3);
    }
    return "";
  }, [viewingPO, currentPrNo]);

  const poDescription = (po) => {
    const items = po.items || [];
    if (items.length === 0) return "-";
    const first = items[0]?.description || "-";
    return items.length > 1 ? `${first} (+${items.length - 1} รายการ)` : first;
  };

  // Sorted receive history for the tab (newest first)
  const sortedReceiveHistory = useMemo(() =>
    [...projectReceives].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || "")),
    [projectReceives]
  );

  // Filtered receive history by search
  const filteredReceiveHistory = useMemo(() => {
    return sortedReceiveHistory.filter((rcv) => {
      const poNoMatch = !histPOSearch || (rcv.poNo || "").toLowerCase().includes(histPOSearch.toLowerCase());
      const vendorMatch = !histVendorSearch || (rcv.vendorName || "").toLowerCase().includes(histVendorSearch.toLowerCase());
      return poNoMatch && vendorMatch;
    });
  }, [sortedReceiveHistory, histPOSearch, histVendorSearch]);

  // Delete receive record
  const handleDeleteReceive = useCallback((rcv) => {
    openConfirm(
      "ยืนยันการลบ",
      `คุณต้องการลบ ${rcv.rpNo || rcv.receiveNo || "รายการนี้"} ใช่หรือไม่?`,
      async () => {
        // Delete combined RP PDF (includes photos if any)
        if (rcv.pdfPath) {
          await deleteGeneratedPdf(rcv.pdfPath);
        }
        await deleteData("receives", rcv.id);
        showAlert("สำเร็จ", `ลบ ${rcv.rpNo || rcv.receiveNo || "รายการ"} เรียบร้อยแล้ว`, "success");
      },
      "danger"
    );
  }, [openConfirm, deleteData, showAlert]);

  return (
    <div className="space-y-4">
      {/* ── Page Header + Tabs ── */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white/40 p-2 rounded-2xl border border-slate-100/50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center shadow-sm">
              <Truck size={19} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-emerald-800 leading-none">E. Receive (รับของ)</h2>
              <p className="text-[10px] text-emerald-400 mt-1">บันทึกการรับสินค้าจาก PO และติดตามประวัติ</p>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-1 bg-emerald-50/50 rounded-xl border border-emerald-100/50 p-1 w-fit">
            <button
              type="button"
              onClick={() => setActiveTab("po")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "po"
                  ? "bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200"
                  : "text-emerald-400 hover:text-emerald-600 hover:bg-white/50"
              }`}
            >
              <Package size={13} />
              รับของ
            </button>
            {canViewReceiveHistory && (
              <button
                type="button"
                onClick={() => setActiveTab("history")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "history"
                    ? "bg-white text-emerald-600 shadow-sm ring-1 ring-emerald-200"
                    : "text-emerald-400 hover:text-emerald-600 hover:bg-white/50"
                }`}
              >
                <List size={13} />
                รายการ Receive
                {sortedReceiveHistory.length > 0 && (
                  <span className={`text-[9px] font-bold rounded-full px-1 py-0.5 min-w-[16px] text-center ${
                    activeTab === "history" ? "bg-emerald-100 text-emerald-600" : "bg-emerald-50 text-emerald-400"
                  }`}>
                    {sortedReceiveHistory.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Tab: รายการ Receive ── */}
      {canViewReceiveHistory && activeTab === "history" && (
        <Card className="overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50/60">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={histPOSearch}
                onChange={(e) => setHistPOSearch(e.target.value)}
                placeholder="ค้นหา PO No."
                className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-36"
              />
            </div>
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={histVendorSearch}
                onChange={(e) => setHistVendorSearch(e.target.value)}
                placeholder="ค้นหา Vendor"
                className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-36"
              />
            </div>
            {(histPOSearch || histVendorSearch) && (
              <button
                type="button"
                onClick={() => { setHistPOSearch(""); setHistVendorSearch(""); }}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1"
              >
                <X size={13} />
              </button>
            )}
            <div className="ml-auto">
              <ColumnVisibilityToggle tableId="receive-history" />
            </div>
          </div>

          {sortedReceiveHistory.length === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <List size={36} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">ยังไม่มีประวัติการรับของในโครงการนี้</p>
            </div>
          ) : filteredReceiveHistory.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <Search size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">ไม่พบรายการที่ตรงกับการค้นหา</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold border-b border-slate-100">
                <tr>
                  {isColumnVisible("receive-history", "rpNo") && <th className="py-1 px-3">RP No.</th>}
                  {isColumnVisible("receive-history", "date") && <th className="py-1 px-3">วันที่ทำรับ</th>}
                  {isColumnVisible("receive-history", "poNo") && <th className="py-1 px-3">PO No.</th>}
                  {isColumnVisible("receive-history", "type") && <th className="py-1 px-3">Type</th>}
                  {isColumnVisible("receive-history", "vendor") && <th className="py-1 px-3">Vendor</th>}
                  {isColumnVisible("receive-history", "items") && <th className="py-1 px-3 text-center">รายการสินค้า</th>}
                  {isColumnVisible("receive-history", "receivedBy") && <th className="py-1 px-3">ผู้รับของ</th>}
                  {isColumnVisible("receive-history", "note") && <th className="py-1 px-3">หมายเหตุ</th>}
                  <th className="py-1 px-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceiveHistory.map((rcv) => {
                  const po = pos.find((p) => p.id === rcv.poId);
                  const vendor = vendors.find((v) => v.id === po?.vendorId);
                  const itemCount = (rcv.items || []).length;
                  return (
                    <tr
                      key={rcv.id}
                      className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                      onClick={() => setViewingRcv({ rcv, po, vendor })}
                    >
                      {isColumnVisible("receive-history", "rpNo") && (
                        <td className="py-1 px-3 font-medium text-blue-700 whitespace-nowrap">
                          {rcv.rpNo || rcv.receiveNo || "-"}
                        </td>
                      )}
                      {isColumnVisible("receive-history", "date") && (
                        <td className="py-1 px-3 whitespace-nowrap">
                          {rcv.receivedDate
                            ? new Date(rcv.receivedDate).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" })
                            : "-"}
                        </td>
                      )}
                      {isColumnVisible("receive-history", "poNo") && (
                        <td className="py-1 px-3 font-medium whitespace-nowrap">{rcv.poNo || "-"}</td>
                      )}
                      {isColumnVisible("receive-history", "type") && (
                        <td className="py-1 px-3">
                          {po?.poType ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {po.poType}
                            </span>
                          ) : "-"}
                        </td>
                      )}
                      {isColumnVisible("receive-history", "vendor") && (
                        <td className="py-1 px-3 max-w-[180px] truncate" title={rcv.vendorName || vendor?.name || "-"}>
                          {rcv.vendorName || vendor?.name || "-"}
                        </td>
                      )}
                      {isColumnVisible("receive-history", "items") && (
                        <td className="py-1 px-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold text-[10px] border border-blue-100">
                              <Package size={9} /> {itemCount} รายการ
                            </span>
                            {rcv.totalPhotos > 0 && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-teal-50 text-teal-700 font-semibold text-[9px] border border-teal-100">
                                <ImageIcon size={8} /> {rcv.totalPhotos} รูป
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnVisible("receive-history", "receivedBy") && (
                        <td className="py-1 px-3 whitespace-nowrap">{rcv.receivedByName || "-"}</td>
                      )}
                      {isColumnVisible("receive-history", "note") && (
                        <td className="py-1 px-3 text-slate-400 max-w-[160px] truncate" title={rcv.note || ""}>
                          {rcv.note || "-"}
                        </td>
                      )}
                      <td className="py-1 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[10px] font-medium transition-colors"
                            onClick={() => setViewingRcv({ rcv, po, vendor })}
                          >
                            <Eye size={11} /> ดู
                          </button>
                          {canUseFunction("receive", "delete") && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-red-200 bg-white hover:bg-red-50 text-red-500 text-[10px] font-medium transition-colors"
                              onClick={() => handleDeleteReceive(rcv)}
                            >
                              <Trash2 size={11} /> ลบ
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* ── Tab: รับของ ── */}
      {activeTab === "po" && (approvedPOs.length === 0 ? (
        <Card className="p-8 text-center text-slate-400">
          <Package size={40} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium">ไม่มี PO ที่ Approved ในโครงการนี้</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Search toolbar */}
          <Card className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={poPOSearch}
                  onChange={(e) => setPoPOSearch(e.target.value)}
                  placeholder="ค้นหา PO No."
                  className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-36"
                />
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={poVendorSearch}
                  onChange={(e) => setPoVendorSearch(e.target.value)}
                  placeholder="ค้นหา Vendor"
                  className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 w-36"
                />
              </div>
              {(poPOSearch || poVendorSearch) && (
                <button
                  type="button"
                  onClick={() => { setPoPOSearch(""); setPoVendorSearch(""); }}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors px-1"
                >
                  <X size={13} />
                </button>
              )}
              <div className="ml-auto">
                <ColumnVisibilityToggle tableId="receive-po" />
              </div>
            </div>
          </Card>

          {Object.keys(groupedPOs).length === 0 ? (
            <Card className="p-8 text-center text-slate-400">
              <Search size={28} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">ไม่พบ PO ที่ตรงกับการค้นหา</p>
            </Card>
          ) : (
            Object.entries(groupedPOs).map(([type, poList]) => {
              const isExpanded = expandedTypes[type] !== false;
              return (
                <Card key={type} className="overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleType(type)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700">
                        {type}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">
                        {PO_TYPE_LABELS[type] || type}
                      </span>
                      <span className="text-xs text-slate-400">({poList.length} PO)</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <table className="w-full text-left text-xs text-slate-600">
                      <thead className="bg-slate-50/60 text-slate-500 uppercase font-semibold">
                        <tr>
                          {isColumnVisible("receive-po", "poNo") && <th className="py-1 px-3">PO No.</th>}
                          {isColumnVisible("receive-po", "vendor") && <th className="py-1 px-3">Vendor</th>}
                          {isColumnVisible("receive-po", "description") && <th className="py-1 px-3">รายละเอียด</th>}
                          {isColumnVisible("receive-po", "amount") && <th className="py-1 px-3 text-right">ยอดรวม</th>}
                          {isColumnVisible("receive-po", "progress") && <th className="py-1 px-3 text-center">สถานะรับของ</th>}
                          <th className="py-1 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poList.map((po) => {
                          const progress = getReceiveProgress(po);
                          const pct = progress.totalOrdered > 0
                            ? Math.min(100, Math.round((progress.totalReceived / progress.totalOrdered) * 100))
                            : 0;
                          return (
                            <tr
                              key={po.id}
                              className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                              onClick={() => openPODetail(po)}
                            >
                              {isColumnVisible("receive-po", "poNo") && (
                                <td className="py-1 px-3 font-medium text-blue-700">{po.poNo}</td>
                              )}
                              {isColumnVisible("receive-po", "vendor") && (
                                <td className="py-1 px-3">{getVendorName(po.vendorId)}</td>
                              )}
                              {isColumnVisible("receive-po", "description") && (
                                <td className="py-1 px-3 max-w-[250px] truncate" title={poDescription(po)}>
                                  {poDescription(po)}
                                </td>
                              )}
                              {isColumnVisible("receive-po", "amount") && (
                                <td className="py-1 px-3 text-right font-semibold">{formatCurrency(po.amount)}</td>
                              )}
                              {isColumnVisible("receive-po", "progress") && (
                                <td className="py-1 px-3">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <div className="w-full max-w-[90px] bg-slate-200 rounded-full h-1">
                                      <div
                                        className={`h-1 rounded-full transition-all ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-blue-500" : "bg-slate-300"}`}
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className={`text-[10px] font-semibold ${pct >= 100 ? "text-green-600" : "text-slate-500"}`}>
                                      {pct}% ({progress.totalReceived}/{progress.totalOrdered})
                                    </span>
                                  </div>
                                </td>
                              )}
                              <td className="py-1 px-3 text-center">
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-[10px] font-medium transition-colors"
                                  onClick={(e) => { e.stopPropagation(); openPODetail(po); }}
                                >
                                  <Eye size={11} /> ดู
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </Card>
              );
            })
          )}
        </div>
      ))}

      {/* ── PO Detail / Receive Modal ── */}
      <AnimatePresence>
        {viewingPO && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-[10010] p-4 overflow-y-auto"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => { if (!saving) { setViewingPO(null); setReceiveMode(false); } }}
          >
            <motion.div
              className={`bg-white rounded-2xl shadow-2xl w-full my-8 ${receiveMode ? "max-w-6xl" : "max-w-4xl"}`}
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    {receiveMode ? <Truck size={20} className="text-blue-600" /> : <FileText size={20} className="text-blue-600" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">
                      {receiveMode ? "ทำรับของ" : "รายละเอียด Recieve"}
                    </h3>
                    <p className="text-xs text-slate-400">{viewingPO.poNo}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { if (!saving) { setViewingPO(null); setReceiveMode(false); } }}
                  className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {!receiveMode ? (
                  /* ── PO Detail View ── */
                  <div className="space-y-5">
                    {/* PO Info Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "PO No.", value: viewingPO.poNo },
                        { label: "Type", value: PO_TYPE_LABELS[viewingPO.poType] || viewingPO.poType || "-" },
                        { label: "Vendor", value: getVendorName(viewingPO.vendorId) },
                        { label: "ยอดรวม", value: formatCurrency(viewingPO.amount) },
                        { label: "วันที่ PO", value: viewingPO.poDate ? new Date(viewingPO.poDate).toLocaleDateString("th-TH") : "-" },
                        { label: "วันกำหนดส่ง", value: viewingPO.requiredDate || "-" },
                        { label: "สถานะ", value: viewingPO.status },
                        { label: "Receive Type", value: viewingPO.receiveType || "-" },
                      ].map((f) => (
                        <div key={f.label} className="bg-slate-50 rounded-lg p-3">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">{f.label}</p>
                          <p className="text-sm font-medium text-slate-800 truncate" title={String(f.value)}>{f.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* PO Items Table */}
                    <div>
                      <h4 className="text-sm font-bold text-slate-700 mb-2">รายการสินค้า ({(viewingPO.items || []).length} รายการ)</h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-slate-600">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                            <tr>
                              <th className="py-2 px-3 text-left">#</th>
                              <th className="py-2 px-3 text-left">รหัสวัสดุ</th>
                              <th className="py-2 px-3 text-left">รายละเอียด</th>
                              <th className="py-2 px-3 text-center">หน่วย</th>
                              <th className="py-2 px-3 text-right">สั่งซื้อ</th>
                              <th className="py-2 px-3 text-right">รับแล้ว</th>
                              <th className="py-2 px-3 text-right">คงเหลือ</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(viewingPO.items || []).map((item, idx) => {
                              const received = receiveSummary[viewingPO.id]?.[idx] || 0;
                              const remaining = Math.max(0, Number(item.quantity || 0) - received);
                              return (
                                <tr key={idx} className={remaining === 0 ? "bg-green-50/50" : ""}>
                                  <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                                  <td className="py-2 px-3 font-mono text-[10px]">{item.materialNo || "-"}</td>
                                  <td className="py-2 px-3">{item.description || "-"}</td>
                                  <td className="py-2 px-3 text-center">{item.unit || "-"}</td>
                                  <td className="py-2 px-3 text-right font-semibold">{item.quantity || 0}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-blue-600">{received}</td>
                                  <td className={`py-2 px-3 text-right font-semibold ${remaining === 0 ? "text-green-600" : "text-orange-600"}`}>
                                    {remaining}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* PDF Thumbnail */}
                    {viewingPO.pdfUrl && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2">เอกสาร PDF</h4>
                        <div className="inline-block rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-indigo-100 p-3 shadow-sm">
                          {/* iframe thumbnail — pointer-events-none ป้องกัน scroll/interact */}
                          <div
                            className="relative w-[220px] rounded-xl overflow-hidden border border-indigo-100 shadow-md bg-white cursor-pointer group"
                            onClick={() => window.open(viewingPO.pdfUrl, "_blank")}
                            title="คลิกเพื่อเปิด PDF"
                          >
                            <iframe
                              src={`${viewingPO.pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                              title="PO PDF preview"
                              className="w-full border-0 pointer-events-none select-none"
                              style={{ height: 290, transform: "scale(1)", transformOrigin: "top left" }}
                              scrolling="no"
                            />
                            {/* overlay เมื่อ hover */}
                            <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/10 transition-colors flex items-center justify-center">
                              <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-indigo-700 text-[10px] font-semibold px-3 py-1.5 rounded-full shadow flex items-center gap-1">
                                <ExternalLink size={11} /> เปิดดู PDF
                              </span>
                            </div>
                          </div>
                          {/* ชื่อไฟล์ + ปุ่ม */}
                          <div className="mt-2 w-[220px] flex items-center justify-between">
                            <p className="text-[10px] text-indigo-500 font-medium truncate max-w-[150px]">
                              {viewingPO.poNo}.pdf
                            </p>
                            <a
                              href={viewingPO.pdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-600 text-[10px] font-semibold transition-colors"
                            >
                              <ExternalLink size={10} /> เปิด
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Receive History */}
                    {poReceiveHistory.length > 0 && (
                      <div>
                        <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                          <Clock size={14} /> ประวัติรับของ ({poReceiveHistory.length} ครั้ง)
                        </h4>
                        <div className="space-y-2">
                          {poReceiveHistory.map((rcv) => (
                            <div key={rcv.id} className="border rounded-lg p-3 bg-slate-50/50">
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-bold text-blue-700">{rcv.receiveNo}</span>
                                <span className="text-[10px] text-slate-400">
                                  {rcv.receivedDate} | {rcv.receivedByName || "-"}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {(rcv.items || []).map((item, i) => (
                                  <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border rounded text-[10px]">
                                    {item.description}: <strong className="text-blue-600">{item.receivedQty}</strong> {item.unit}
                                    {item.photos?.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => setPhotoPreview(item.photos)}
                                        className="text-slate-400 hover:text-blue-500"
                                      >
                                        <ImageIcon size={10} />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                              {rcv.note && <p className="text-[10px] text-slate-500 mt-1">หมายเหตุ: {rcv.note}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Receive Form ── */
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">RP No.</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-600"
                          value={previewReceiveNo}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">สินค้าของโครงการ</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-600"
                          value={projectItemCode || "-"}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">ผู้จำหน่าย</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={receiveVendorName}
                          onChange={(e) => setReceiveVendorName(e.target.value)}
                          placeholder="ระบุผู้จำหน่าย"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">เลขที่เอกสาร</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={receiveDocumentNo}
                          onChange={(e) => setReceiveDocumentNo(e.target.value)}
                          placeholder="ระบุเลขที่เอกสาร"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">PR No.</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-600"
                          value={currentPrNo || "-"}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">PO No.</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-100 text-slate-600"
                          value={viewingPO?.poNo || "-"}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">วันที่รับของ</label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          value={receiveDate}
                          onChange={(e) => setReceiveDate(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">หมายเหตุ</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                          placeholder="ระบุหมายเหตุ (ถ้ามี)"
                          value={receiveNote}
                          onChange={(e) => setReceiveNote(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border rounded-lg overflow-x-auto">
                      <table className="w-full min-w-[880px] text-xs text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 font-semibold">
                          <tr>
                            <th className="py-2 px-2 text-center whitespace-nowrap">#</th>
                            <th className="py-2 px-2 text-left min-w-[140px]">รายละเอียด</th>
                            <th className="py-2 px-2 text-center whitespace-nowrap">หน่วย</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">ราคาต่อหน่วย</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">สั่ง</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">จำนวนเงิน</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">รับแล้ว</th>
                            <th className="py-2 px-2 text-right whitespace-nowrap">คงเหลือ</th>
                            <th className="py-2 px-2 text-center whitespace-nowrap w-[88px]">จำนวนรับ</th>
                            <th className="py-2 px-2 text-center min-w-[100px]">รูปถ่าย</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {receiveForm.map((item, idx) => (
                            <tr key={idx} className={item.remaining === 0 ? "bg-green-50/50 opacity-60" : ""}>
                              <td className="py-2 px-2 text-center text-slate-500 font-medium">{item.lineNo}</td>
                              <td className="py-2 px-2">
                                <p className="font-medium">{item.description || "-"}</p>
                                {item.materialNo && (
                                  <p className="text-[10px] text-slate-400 font-mono">{item.materialNo}</p>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">{item.unit || "-"}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(item.unitPrice)}</td>
                              <td className="py-2 px-2 text-right tabular-nums">{item.orderedQty}</td>
                              <td className="py-2 px-2 text-right tabular-nums font-medium">{formatCurrency(item.lineAmount)}</td>
                              <td className="py-2 px-2 text-right text-blue-600 font-semibold tabular-nums">{item.alreadyReceived}</td>
                              <td className="py-2 px-2 text-right text-orange-600 font-semibold tabular-nums">{item.remaining}</td>
                              <td className="py-2 px-2">
                                {item.remaining > 0 ? (
                                  <input
                                    type="number"
                                    min={0}
                                    max={item.remaining}
                                    step="any"
                                    className="w-full min-w-[72px] border border-slate-200 rounded px-2 py-1 text-sm text-center focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
                                    value={item.receivedQty || ""}
                                    onChange={(e) => {
                                      const val = Math.min(Number(e.target.value) || 0, item.remaining);
                                      updateReceiveItem(idx, "receivedQty", val);
                                    }}
                                  />
                                ) : (
                                  <span className="flex items-center justify-center text-green-500">
                                    <Check size={14} /> ครบ
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {item.remaining > 0 && (
                                  <div className="flex flex-col items-center gap-1">
                                    <div className="relative">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        onChange={(e) => {
                                          if (e.target.files && e.target.files.length > 0) {
                                            handlePhotoAdd(idx, e.target.files);
                                            e.target.value = ""; // Reset input
                                          }
                                        }}
                                        title="ถ่ายภาพ แกลเลอรี หรืออัปโหลดไฟล์"
                                        disabled={uploadingPhotos[idx]}
                                      />
                                      <button
                                        type="button"
                                        className={`inline-flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors relative z-0 ${
                                          uploadingPhotos[idx]
                                            ? "bg-blue-100 text-blue-600 cursor-wait"
                                            : "bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700"
                                        }`}
                                        title={uploadingPhotos[idx] ? "กำลังประมวลผลรูปภาพ..." : "ถ่ายภาพ แกลเลอรี หรืออัปโหลดไฟล์"}
                                        disabled={uploadingPhotos[idx]}
                                      >
                                        {uploadingPhotos[idx] ? (
                                          <Clock size={16} className="animate-spin" />
                                        ) : (
                                          <ImageIcon size={16} />
                                        )}
                                        <span className="text-[9px] font-medium leading-tight whitespace-nowrap">
                                          {uploadingPhotos[idx] ? "กำลังโหลด..." : "อัปโหลด / ถ่าย"}
                                        </span>
                                      </button>
                                    </div>
                                    {item.photos.length > 0 && (
                                      <div className="flex flex-wrap gap-1 justify-center max-w-[140px]">
                                        {item.photos.map((photo, pi) => (
                                          <div key={pi} className="relative group">
                                            <img
                                              src={photo.url}
                                              alt={photo.name}
                                              className="w-8 h-8 rounded object-cover border cursor-pointer"
                                              onClick={() => setPhotoPreview([photo])}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => removePhoto(idx, pi)}
                                              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                              <X size={8} />
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                {!receiveMode ? (
                  <>
                    <Button variant="secondary" onClick={() => { setViewingPO(null); setReceiveMode(false); }}>
                      ปิด
                    </Button>
                    {canUseFunction("receive", "receive") && (() => {
                      const progress = getReceiveProgress(viewingPO);
                      return !progress.done;
                    })() && (
                      <Button onClick={startReceiveMode}>
                        <Truck size={14} /> ทำรับของ
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button variant="secondary" onClick={() => setReceiveMode(false)} disabled={saving}>
                      ย้อนกลับ
                    </Button>
                    <Button onClick={handleSaveReceive} disabled={saving}>
                      {saving ? (
                        <>
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
                            <path d="M12 2a10 10 0 0 1 10 10" />
                          </svg>
                          {savingStep || "กำลังบันทึก..."}
                        </>
                      ) : (
                        <>
                          <Check size={14} /> บันทึกรับของ
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Receive Detail Modal ── */}
      <AnimatePresence>
        {viewingRcv && (() => {
          const { rcv, po, vendor } = viewingRcv;
          const rcvItems = rcv.items || [];
          const poType = po?.poType;
          return (
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-start justify-center z-[10015] p-4 overflow-y-auto"
              initial="hidden" animate="visible" exit="exit"
              variants={modalOverlayVariants} transition={overlayTransition}
              onClick={() => setViewingRcv(null)}
            >
              <motion.div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8"
                variants={modalContentVariants} transition={modalTransition}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                      <Truck size={20} className="text-teal-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-800">รายละเอียดการรับของ</h3>
                      <p className="text-xs text-slate-400">{rcv.rpNo || rcv.receiveNo || "-"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewingRcv(null)}
                    className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[75vh] overflow-y-auto custom-scrollbar space-y-6">

                  {/* PDF Thumbnail — อยู่บนสุด */}
                  {rcv.pdfUrl && (
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      <div className="inline-block rounded-2xl bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 border border-teal-100 p-3 shadow-sm shrink-0">
                        <div
                          className="relative w-[210px] rounded-xl overflow-hidden border border-teal-100 shadow-md bg-white cursor-pointer group"
                          onClick={() => window.open(rcv.pdfUrl, "_blank")}
                          title="คลิกเพื่อเปิด PDF ใบตรวจรับสินค้า"
                        >
                          <iframe
                            src={`${rcv.pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                            title="RP PDF preview"
                            className="w-full border-0 pointer-events-none select-none"
                            style={{ height: 296, transformOrigin: "top left" }}
                            scrolling="no"
                          />
                          <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/10 transition-colors flex items-center justify-center">
                            <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 text-teal-700 text-[10px] font-semibold px-3 py-1.5 rounded-full shadow flex items-center gap-1">
                              <ExternalLink size={11} /> เปิดดู PDF
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 w-[210px] flex items-center justify-between">
                          <div className="flex flex-col">
                            <p className="text-[10px] text-teal-600 font-medium truncate max-w-[140px]">
                              ใบตรวจรับสินค้า{rcv.totalPhotos > 0 ? ` + ${rcv.totalPhotos} รูป` : ""}.pdf
                            </p>
                            {rcv.totalPhotos > 0 && (
                              <p className="text-[8px] text-teal-400 mt-0.5">
                                รวมรูปภาพในไฟล์เดียวกัน
                              </p>
                            )}
                          </div>
                          <a
                            href={rcv.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-600 text-[10px] font-semibold transition-colors"
                          >
                            <ExternalLink size={10} /> เปิด
                          </a>
                        </div>
                      </div>

                      {/* Info summary ด้านข้าง thumbnail (บน sm ขึ้นไป) */}
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 self-start">
                        {[
                          { label: "RP No.", value: rcv.rpNo || rcv.receiveNo || "-" },
                          { label: "วันที่รับสินค้า", value: rcv.receivedDate ? new Date(rcv.receivedDate).toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric" }) : "-" },
                          { label: "PO No.", value: rcv.poNo || "-" },
                          { label: "PR No.", value: rcv.prNo || "-" },
                          { label: "ผู้จำหน่าย", value: rcv.vendorName || vendor?.name || "-" },
                          { label: "เลขที่เอกสาร", value: rcv.documentNo || "-" },
                          { label: "สินค้าของโครงการ", value: rcv.projectItemCode || "-" },
                          { label: "ผู้รับของ", value: rcv.receivedByName || "-" },
                        ].map((f) => (
                          <div key={f.label} className="bg-slate-50 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">{f.label}</p>
                            <p className="text-sm font-medium text-slate-800 truncate" title={String(f.value)}>{f.value}</p>
                          </div>
                        ))}
                        {rcv.note && (
                          <div className="bg-amber-50 rounded-xl px-3 py-2 col-span-1 sm:col-span-2">
                            <p className="text-[10px] text-amber-500 uppercase font-semibold">หมายเหตุ</p>
                            <p className="text-sm text-slate-700">{rcv.note}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Info Grid — แสดงเมื่อไม่มี PDF */}
                  {!rcv.pdfUrl && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { label: "RP No.", value: rcv.rpNo || rcv.receiveNo || "-" },
                        { label: "วันที่รับสินค้า", value: rcv.receivedDate ? new Date(rcv.receivedDate).toLocaleDateString("th-TH", { day: "2-digit", month: "long", year: "numeric" }) : "-" },
                        { label: "PO No.", value: rcv.poNo || "-" },
                        { label: "PR No.", value: rcv.prNo || "-" },
                        { label: "สินค้าของโครงการ", value: rcv.projectItemCode || "-" },
                        { label: "ผู้จำหน่าย", value: rcv.vendorName || vendor?.name || "-" },
                        { label: "เลขที่เอกสาร", value: rcv.documentNo || "-" },
                        { label: "Type", value: poType ? `${poType} — ${PO_TYPE_LABELS[poType]?.replace(/^\w+\s—\s/, "") || poType}` : "-" },
                        { label: "ผู้รับของ", value: rcv.receivedByName || "-" },
                      ].map((f) => (
                        <div key={f.label} className="bg-slate-50 rounded-xl p-3">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold mb-0.5">{f.label}</p>
                          <p className="text-sm font-medium text-slate-800 truncate" title={String(f.value)}>{f.value}</p>
                        </div>
                      ))}
                      {rcv.note && (
                        <div className="bg-amber-50 rounded-xl p-3 col-span-2 md:col-span-3">
                          <p className="text-[10px] text-amber-500 uppercase font-semibold mb-0.5">หมายเหตุ</p>
                          <p className="text-sm text-slate-700">{rcv.note}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Items Table */}
                  <div>
                    <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                      <Package size={14} /> รายการสินค้าที่รับ ({rcvItems.length} รายการ)
                    </h4>
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-slate-600">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                          <tr>
                            <th className="py-2 px-3 text-left">#</th>
                            <th className="py-2 px-3 text-left">รหัสสินค้า</th>
                            <th className="py-2 px-3 text-left">รายละเอียด</th>
                            <th className="py-2 px-3 text-center">หน่วย</th>
                            <th className="py-2 px-3 text-right">จำนวนรับ</th>
                            <th className="py-2 px-3 text-center">รูปถ่าย</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rcvItems.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-2 px-3 text-slate-400">{idx + 1}</td>
                              <td className="py-2 px-3 font-mono text-[10px] text-slate-500">{item.materialNo || "-"}</td>
                              <td className="py-2 px-3 font-medium">{item.description || "-"}</td>
                              <td className="py-2 px-3 text-center">{item.unit || "-"}</td>
                              <td className="py-2 px-3 text-right font-bold text-blue-600">{item.receivedQty ?? item.quantity ?? "-"}</td>
                              <td className="py-2 px-3 text-center">
                                {item.photos?.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setPhotoPreview(item.photos)}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 hover:bg-blue-100 text-slate-500 hover:text-blue-600 text-[10px] font-semibold transition-colors"
                                  >
                                    <ImageIcon size={10} /> {item.photos.length} รูป
                                  </button>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-6 py-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
                  {rcv.pdfUrl && (
                    <a
                      href={rcv.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors mr-3"
                    >
                      <ExternalLink size={14} /> เปิด PDF เต็มหน้า{rcv.totalPhotos > 0 ? ` (รวม ${rcv.totalPhotos} รูป)` : ""}
                    </a>
                  )}
                  <Button variant="secondary" onClick={() => setViewingRcv(null)}>
                    ปิด
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Photo Preview Modal ── */}
      <AnimatePresence>
        {photoPreview && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[10020] p-4"
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={modalOverlayVariants}
            transition={overlayTransition}
            onClick={() => setPhotoPreview(null)}
          >
            <motion.div
              className="bg-white rounded-xl p-4 max-w-2xl max-h-[80vh] overflow-auto"
              variants={modalContentVariants}
              transition={modalTransition}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-800">รูปถ่ายสินค้า</h4>
                <button type="button" onClick={() => setPhotoPreview(null)} className="p-1 rounded hover:bg-slate-100">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {photoPreview.map((photo, i) => (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    <img src={photo.url} alt={photo.name} className="w-full h-auto max-h-[400px] object-contain" />
                    <p className="text-[10px] text-slate-400 p-1 truncate">{photo.name}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default ReceiveView;

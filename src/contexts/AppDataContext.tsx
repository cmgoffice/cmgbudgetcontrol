// @ts-nocheck
/**
 * AppDataContext — Firebase collections + CRUD + column widths + pending counts.
 * ทุก View ดึงข้อมูลจากที่นี่แทนการ access closure ของ AuthenticatedApp.
 */
import React, {
  createContext, useContext, useState, useEffect,
  useMemo, useCallback, useRef,
} from "react";
import {
  collection, query, onSnapshot, doc, setDoc,
  addDoc, updateDoc, deleteDoc, getDocs,
} from "firebase/firestore";
import { db, appId } from "../lib/firebase";
import { MODULE_ACCESS } from "../lib/constants";

// ─── Context Shape ────────────────────────────────────────────────────────────
const AppDataContext = createContext(null);
export const useAppData = () => useContext(AppDataContext);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AppDataProvider = ({
  children,
  userRole,
  userRoles = [],
  userData,
  user,
  showAlert,
  openConfirm,
  logAction,
}) => {
  const roles = Array.isArray(userRoles) && userRoles.length ? userRoles : (userRole ? [userRole] : ["Staff"]);
  // ── Firebase collections ──────────────────────────────────────────────────
  const [projects,  setProjects]  = useState([]);
  const [budgets,   setBudgets]   = useState([]);
  const [vendors,   setVendors]   = useState([]);
  const [materials, setMaterials] = useState([]);
  const [prs,       setPrs]       = useState([]);
  const [pos,       setPos]       = useState([]);
  const [invoices,  setInvoices]  = useState([]);

  // ── Column widths (admin-controlled, synced to Firestore) ─────────────────
  const [columnWidths, setColumnWidths] = useState({});
  const colSaveTimer = useRef(null);

  // ── Lazy-loaded collections (โหลดเมื่อเข้าหน้าที่ใช้ ลดโควต้าเปิดแอป) ─────
  const [vendorsLoading, setVendorsLoading] = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const vendorsLoadedRef = useRef(false);
  const materialsLoadedRef = useRef(false);

  const loadVendors = useCallback(async () => {
    if (vendorsLoadedRef.current) return;
    vendorsLoadedRef.current = true;
    setVendorsLoading(true);
    try {
      const snap = await getDocs(collection(db, "artifacts", appId, "public", "data", "vendors"));
      setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading vendors:", err);
      vendorsLoadedRef.current = false;
    } finally {
      setVendorsLoading(false);
    }
  }, []);

  const loadMaterials = useCallback(async () => {
    if (materialsLoadedRef.current) return;
    materialsLoadedRef.current = true;
    setMaterialsLoading(true);
    try {
      const snap = await getDocs(collection(db, "artifacts", appId, "public", "data", "materials"));
      setMaterials(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading materials:", err);
      materialsLoadedRef.current = false;
    } finally {
      setMaterialsLoading(false);
    }
  }, []);

  // ── Firebase sync (realtime ผ่าน onSnapshot — แก้ไขที่ใดก็ตามจะอัปเดตทุกที่โดยไม่ต้องรีเฟรช) ─
  useEffect(() => {
    const syncCollection = (collectionName, setter) => {
      const ref = collection(db, "artifacts", appId, "public", "data", collectionName);
      return onSnapshot(
        query(ref),
        (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (err)  => console.error(`Error syncing ${collectionName}:`, err)
      );
    };

    const colWidthsRef = doc(db, "artifacts", appId, "public", "data", "settings", "columnWidths");
    const unsubColWidths = onSnapshot(colWidthsRef, (snap) => {
      if (snap.exists()) setColumnWidths(snap.data());
    });

    // ไม่ sync vendors, materials ที่นี่ — ใช้ loadVendors() / loadMaterials() เมื่อเข้าหน้า Vendor / Material / PO
    const unsubs = [
      syncCollection("projects",  setProjects),
      syncCollection("budgets",   setBudgets),
      syncCollection("prs",       setPrs),
      syncCollection("pos",       setPos),
      syncCollection("invoices",  setInvoices),
    ];

    return () => {
      unsubs.forEach((u) => u());
      unsubColWidths();
      if (colSaveTimer.current) clearTimeout(colSaveTimer.current);
    };
  }, []);

  // ── Column resize ──────────────────────────────────────────────────────────
  const handleColumnResize = useCallback((tableId, colKey, width) => {
    if (!roles.includes("Administrator")) return;
    setColumnWidths((prev) => {
      const next = { ...prev, [tableId]: { ...(prev[tableId] || {}), [colKey]: width } };
      if (colSaveTimer.current) clearTimeout(colSaveTimer.current);
      colSaveTimer.current = setTimeout(async () => {
        try {
          await setDoc(doc(db, "artifacts", appId, "public", "data", "settings", "columnWidths"), next);
        } catch (_) { /* silent */ }
      }, 700);
      return next;
    });
  }, [roles]);

  // ── ป้องกันการบันทึกซ้ำ (double submit) ───────────────────────────────────
  const pendingUpdatesRef = useRef(new Set());

  // ── CRUD helpers (อัปเดต cache vendors/materials หลัง write เพื่อไม่ต้องโหลดใหม่) ─
  const addData = useCallback(async (collectionName, data, customId = null) => {
    try {
      if (customId) {
        await setDoc(doc(db, "artifacts", appId, "public", "data", collectionName, customId), data);
        if (collectionName === "vendors") setVendors((prev) => [...prev, { id: customId, ...data }]);
        if (collectionName === "materials") setMaterials((prev) => [...prev, { id: customId, ...data }]);
      } else {
        const colRef = collection(db, "artifacts", appId, "public", "data", collectionName);
        const docRef = await addDoc(colRef, data);
        if (collectionName === "vendors") setVendors((prev) => [...prev, { id: docRef.id, ...data }]);
        if (collectionName === "materials") setMaterials((prev) => [...prev, { id: docRef.id, ...data }]);
      }
      await logAction("Create", `Added new ${collectionName.slice(0, -1)}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  const updateData = useCallback(async (collectionName, id, data) => {
    const key = `${collectionName}:${id}`;
    if (pendingUpdatesRef.current.has(key)) {
      showAlert("กรุณารอสักครู่", "กำลังบันทึกข้อมูลอยู่ ไม่สามารถบันทึกซ้ำได้", "warning");
      return false;
    }
    pendingUpdatesRef.current.add(key);
    const payload = { ...data, updatedAt: new Date().toISOString() };
    try {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id), payload);
      if (collectionName === "vendors") setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...payload } : v)));
      if (collectionName === "materials") setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...payload } : m)));
      await logAction("Update", `Updated ${collectionName.slice(0, -1)} ID: ${id}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + e.message, "error");
      return false;
    } finally {
      pendingUpdatesRef.current.delete(key);
    }
  }, [logAction, showAlert]);

  const deleteData = useCallback(async (collectionName, id) => {
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id));
      if (collectionName === "vendors") setVendors((prev) => prev.filter((v) => v.id !== id));
      if (collectionName === "materials") setMaterials((prev) => prev.filter((m) => m.id !== id));
      await logAction("Delete", `Deleted ${collectionName.slice(0, -1)} ID: ${id}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  const canAccessModule = useCallback((menuId) => {
    const allowed = MODULE_ACCESS[menuId];
    if (!allowed) return true;
    if (roles.includes("Administrator")) return true;
    return roles.some((r) => allowed.includes(r));
  }, [roles]);

  // ── Visible projects (role-filtered) ──────────────────────────────────────
  const visibleProjects = useMemo(() => {
    if (roles.includes("Administrator")) return projects;
    const ids = userData?.assignedProjectIds || [];
    return projects.filter((p) => ids.includes(p.id));
  }, [projects, userData, roles]);

  // ── Pending approval counts — GLOBAL (for Bell badge) ─────────────────────
  const pendingBudgetsGlobal = useMemo(() => {
    if (!roles.includes("MD") && !roles.includes("Administrator")) return [];
    return budgets.filter(
      (b) => b.status === "Wait MD Approve" || b.status === "Revision Pending"
    );
  }, [budgets, roles]);

  const pendingSubItemsGlobal = useMemo(() => {
    if (!roles.includes("MD") && !roles.includes("Administrator")) return [];
    const pendingSubs = [];
    budgets.forEach((b) => {
      (b.subItems || []).forEach((sub) => {
        if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") {
          pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
        }
      });
    });
    return pendingSubs;
  }, [budgets, roles]);

  const pendingPRsGlobal = useMemo(() => prs.filter((pr) => {
    if (roles.includes("Administrator") && pr.status?.startsWith("Pending")) return true;
    if (roles.includes("CM")  && pr.status === "Pending CM")  return true;
    if (roles.includes("PM")  && pr.status === "Pending PM")  return true;
    if (roles.includes("GM")  && pr.status === "Pending GM")  return true;
    if (roles.includes("MD")  && pr.status === "Pending MD")  return true;
    return false;
  }), [prs, roles]);

  const pendingPOsGlobal = useMemo(() => pos.filter((po) => {
    if (roles.includes("Administrator") && po.status?.startsWith("Pending")) return true;
    if (roles.includes("PCM") && po.status === "Pending PCM") return true;
    if (roles.includes("GM")  && po.status === "Pending GM")  return true;
    return false;
  }), [pos, roles]);

  const totalPendingCount = useMemo(() =>
    pendingBudgetsGlobal.length + pendingSubItemsGlobal.length +
    pendingPRsGlobal.length    + pendingPOsGlobal.length,
  [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal]);

  const pendingByProject = useMemo(() => {
    const map = {};
    const inc = (pid, key) => {
      if (!map[pid]) map[pid] = { budgets: 0, prs: 0, pos: 0, subItems: 0 };
      map[pid][key]++;
    };
    pendingBudgetsGlobal.forEach((b) => inc(b.projectId, "budgets"));
    pendingSubItemsGlobal.forEach((s) => {
      const b = budgets.find((x) => x.id === s.budgetId);
      if (b) inc(b.projectId, "subItems");
    });
    pendingPRsGlobal.forEach((pr) => inc(pr.projectId, "prs"));
    pendingPOsGlobal.forEach((po) => inc(po.projectId, "pos"));
    return Object.entries(map).map(([projectId, counts]) => {
      const proj = projects.find((p) => p.id === projectId);
      return {
        projectId,
        projectName: proj ? `${proj.jobNo} - ${proj.name}` : projectId,
        ...counts,
        total: counts.budgets + counts.prs + counts.pos + counts.subItems,
      };
    });
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, projects, budgets]);

  // ── PR / PO approval handlers ──────────────────────────────────────────────
  const handlePRAction = useCallback(async (id, action) => {
    const pr = prs.find((p) => p.id === id);
    if (!pr) return;
    let newStatus = pr.status;
    if (action === "approve") {
      if (pr.status === "Pending CM" && (roles.includes("CM") || roles.includes("Administrator"))) newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (roles.includes("PM") || roles.includes("Administrator"))) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== pr.status) {
      const payload = { status: newStatus };
      if (action === "approve") payload.rejectReason = "";
      await updateData("prs", id, payload);
    }
  }, [prs, roles, updateData]);

  const handlePOAction = useCallback(async (id, action) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    let newStatus = po.status;
    if (action === "approve") {
      if (po.status === "Pending PCM" && (roles.includes("PCM") || roles.includes("Administrator"))) newStatus = "Pending GM";
      else if (po.status === "Pending GM" && (roles.includes("GM") || roles.includes("Administrator"))) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== po.status) {
      const payload = { status: newStatus };
      if (action === "approve") payload.rejectReason = "";
      await updateData("pos", id, payload);
    }
  }, [pos, roles, updateData]);

  // ── Context value ──────────────────────────────────────────────────────────
  const value = useMemo(() => ({
    // collections
    projects, budgets, vendors, materials, prs, pos, invoices,
    // derived
    visibleProjects,
    // pending (global, for bell)
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal,
    totalPendingCount, pendingByProject,
    // CRUD
    addData, updateData, deleteData,
    // lazy load (ลดโควต้า — โหลดเมื่อเข้าหน้าที่ใช้)
    loadVendors, loadMaterials,
    vendorsLoading, materialsLoading,
    // column widths
    columnWidths, handleColumnResize,
    // approval actions
    handlePRAction, handlePOAction,
    // passthrough from AuthContext
    showAlert, openConfirm, logAction,
    userRole, userRoles: roles, userData, user,
    canAccessModule,
    // raw Firebase (for views that need direct Firestore access)
    db, appId,
  }), [
    projects, budgets, vendors, materials, prs, pos, invoices,
    visibleProjects,
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal,
    totalPendingCount, pendingByProject,
    addData, updateData, deleteData,
    loadVendors, loadMaterials,
    vendorsLoading, materialsLoading,
    columnWidths, handleColumnResize,
    handlePRAction, handlePOAction,
    showAlert, openConfirm, logAction,
    userRole, roles, userData, user,
    canAccessModule,
  ]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

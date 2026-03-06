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
  addDoc, updateDoc, deleteDoc,
} from "firebase/firestore";
import { db, appId } from "../lib/firebase";

// ─── Context Shape ────────────────────────────────────────────────────────────
const AppDataContext = createContext(null);
export const useAppData = () => useContext(AppDataContext);

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AppDataProvider = ({
  children,
  userRole,
  userData,
  user,
  showAlert,
  openConfirm,
  logAction,
}) => {
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

  // ── Firebase sync ──────────────────────────────────────────────────────────
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

    const unsubs = [
      syncCollection("projects",  setProjects),
      syncCollection("budgets",   setBudgets),
      syncCollection("vendors",   setVendors),
      syncCollection("materials", setMaterials),
      syncCollection("prs",       setPrs),
      syncCollection("pos",       setPos),
      syncCollection("invoices",  setInvoices),
    ];

    return () => { unsubs.forEach((u) => u()); unsubColWidths(); };
  }, []);

  // ── Column resize ──────────────────────────────────────────────────────────
  const handleColumnResize = useCallback((tableId, colKey, width) => {
    if (userRole !== "Administrator") return;
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
  }, [userRole]);

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  const addData = useCallback(async (collectionName, data, customId = null) => {
    try {
      if (customId) {
        await setDoc(doc(db, "artifacts", appId, "public", "data", collectionName, customId), data);
      } else {
        await addDoc(collection(db, "artifacts", appId, "public", "data", collectionName), data);
      }
      await logAction("Create", `Added new ${collectionName.slice(0, -1)}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  const updateData = useCallback(async (collectionName, id, data) => {
    try {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id), data);
      await logAction("Update", `Updated ${collectionName.slice(0, -1)} ID: ${id}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  const deleteData = useCallback(async (collectionName, id) => {
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id));
      await logAction("Delete", `Deleted ${collectionName.slice(0, -1)} ID: ${id}`);
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  // ── Visible projects (role-filtered) ──────────────────────────────────────
  const visibleProjects = useMemo(() => {
    if (userRole === "Administrator") return projects;
    const ids = userData?.assignedProjectIds || [];
    return projects.filter((p) => ids.includes(p.id));
  }, [projects, userData, userRole]);

  // ── Pending approval counts — GLOBAL (for Bell badge) ─────────────────────
  const pendingBudgetsGlobal = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    return budgets.filter(
      (b) => b.status === "Wait MD Approve" || b.status === "Revision Pending"
    );
  }, [budgets, userRole]);

  const pendingSubItemsGlobal = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    const pendingSubs = [];
    budgets.forEach((b) => {
      (b.subItems || []).forEach((sub) => {
        if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") {
          pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
        }
      });
    });
    return pendingSubs;
  }, [budgets, userRole]);

  const pendingPRsGlobal = useMemo(() => prs.filter((pr) => {
    if (userRole === "Administrator" && pr.status?.startsWith("Pending")) return true;
    if (userRole === "CM"  && pr.status === "Pending CM")  return true;
    if (userRole === "PM"  && pr.status === "Pending PM")  return true;
    if (userRole === "GM"  && pr.status === "Pending GM")  return true;
    if (userRole === "MD"  && pr.status === "Pending MD")  return true;
    return false;
  }), [prs, userRole]);

  const pendingPOsGlobal = useMemo(() => pos.filter((po) => {
    if (userRole === "Administrator" && po.status?.startsWith("Pending")) return true;
    if (userRole === "PCM" && po.status === "Pending PCM") return true;
    if (userRole === "GM"  && po.status === "Pending GM")  return true;
    return false;
  }), [pos, userRole]);

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
      if (pr.status === "Pending CM" && (userRole === "CM" || userRole === "Administrator")) newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (userRole === "PM" || userRole === "Administrator")) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== pr.status) {
      const payload = { status: newStatus };
      if (action === "approve") payload.rejectReason = "";
      await updateData("prs", id, payload);
    }
  }, [prs, userRole, updateData]);

  const handlePOAction = useCallback(async (id, action) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    let newStatus = po.status;
    if (action === "approve") {
      if (po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator")) newStatus = "Pending GM";
      else if (po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator")) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== po.status) {
      const payload = { status: newStatus };
      if (action === "approve") payload.rejectReason = "";
      await updateData("pos", id, payload);
    }
  }, [pos, userRole, updateData]);

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
    // column widths
    columnWidths, handleColumnResize,
    // approval actions
    handlePRAction, handlePOAction,
    // passthrough from AuthContext
    showAlert, openConfirm, logAction,
    userRole, userData, user,
    // raw Firebase (for views that need direct Firestore access)
    db, appId,
  }), [
    projects, budgets, vendors, materials, prs, pos, invoices,
    visibleProjects,
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal,
    totalPendingCount, pendingByProject,
    addData, updateData, deleteData,
    columnWidths, handleColumnResize,
    handlePRAction, handlePOAction,
    showAlert, openConfirm, logAction,
    userRole, userData, user,
  ]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

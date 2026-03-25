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
  addDoc, updateDoc, deleteDoc, getDocs, deleteField,
} from "firebase/firestore";
import { db, appId } from "../lib/firebase";
import {
  MODULE_ACCESS,
  mergeFunctionPermissionsWithDefaults,
  PO_REVISION_PENDING_PCM,
  PO_REVISION_PENDING_GM,
  PR_PENDING_ACTIVE,
} from "../lib/constants";

// Firestore document paths for dynamic permissions
const ROLE_PERMISSIONS_DOC = ["artifacts", appId, "public", "data", "settings", "rolePermissions"];
const FUNC_PERMISSIONS_DOC = ["artifacts", appId, "public", "data", "settings", "functionPermissions"];

function truncateLogDetail(s, max = 100) {
  if (s == null || s === "") return "";
  const t = String(s).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** รายละเอียด log หลังอัปเดต — ใช้เลขที่ PO/PR, ชื่อ vendor, paymentNo แทนแค่ Firestore ID */
function buildUpdateLogDetails(collectionName, id, data, lists) {
  const { projects, budgets, prs, pos, payments, invoices, vendors, materials } = lists;
  const merge = (existing) =>
    existing && typeof existing === "object" ? { ...existing, ...data } : { ...data };

  if (collectionName === "pos") {
    const po = pos.find((p) => p.id === id);
    const m = merge(po);
    const label = m.poNo || id;
    const vendor = m.vendorName ? truncateLogDetail(m.vendorName, 80) : "";
    return vendor ? `Updated PO ${label} — ${vendor}` : `Updated PO ${label}`;
  }
  if (collectionName === "prs") {
    const pr = prs.find((p) => p.id === id);
    const m = merge(pr);
    const label = m.prNo || id;
    let extra = "";
    if (data.status != null && pr && data.status !== pr.status) extra = ` → ${data.status}`;
    else if (data.status != null && !pr) extra = ` → ${data.status}`;
    return `Updated PR ${label}${extra}`;
  }
  if (collectionName === "payments") {
    const pay = payments.find((p) => p.id === id);
    const m = merge(pay);
    const no = m.paymentNo || id;
    let extra = "";
    if (data.status != null && pay && data.status !== pay.status) extra = ` → ${data.status}`;
    return `Updated Payment ${no}${extra}`;
  }
  if (collectionName === "budgets") {
    const b = budgets.find((x) => x.id === id);
    if (b) {
      const desc = truncateLogDetail(b.description, 80);
      return desc ? `Updated Budget ${b.code} — ${desc}` : `Updated Budget ${b.code}`;
    }
    return `Updated Budget ID: ${id}`;
  }
  if (collectionName === "projects") {
    const p = projects.find((x) => x.id === id);
    const m = merge(p);
    const job = m.jobNo || id;
    const name = m.name ? truncateLogDetail(m.name, 80) : "";
    return name ? `Updated Project ${job} — ${name}` : `Updated Project ${job}`;
  }
  if (collectionName === "invoices") {
    const inv = invoices.find((x) => x.id === id);
    const m = merge(inv);
    const no = m.invNo || id;
    let extra = "";
    if (data.status != null && inv && data.status !== inv.status) extra = ` → ${data.status}`;
    return `Updated Invoice ${no}${extra}`;
  }
  if (collectionName === "vendors") {
    const v = vendors.find((x) => x.id === id);
    const m = merge(v);
    const name = m.name || m.vendorName || m.code || id;
    return `Updated Vendor ${truncateLogDetail(name, 100)}`;
  }
  if (collectionName === "materials") {
    const mat = materials.find((x) => x.id === id);
    const m = merge(mat);
    const name = m.name || m.code || m.materialName || id;
    return `Updated Material ${truncateLogDetail(name, 100)}`;
  }
  const singular = collectionName.endsWith("s") ? collectionName.slice(0, -1) : collectionName;
  return `Updated ${singular} ID: ${id}`;
}

function buildCreateLogDetails(collectionName, data, newId) {
  if (collectionName === "vendors") {
    const name = data.name || data.code || newId;
    return `Added vendor ${truncateLogDetail(name, 100)}`;
  }
  if (collectionName === "materials") {
    const name = data.name || data.code || newId;
    return `Added material ${truncateLogDetail(name, 100)}`;
  }
  if (collectionName === "prs") {
    return `Added PR ${data.prNo || newId}`;
  }
  if (collectionName === "pos") {
    return `Added PO ${data.poNo || newId}`;
  }
  if (collectionName === "budgets") {
    if (data.code) {
      const desc = data.description ? truncateLogDetail(data.description, 60) : "";
      return desc ? `Added Budget ${data.code} — ${desc}` : `Added Budget ${data.code}`;
    }
    return `Added budget ID: ${newId}`;
  }
  if (collectionName === "payments") {
    return `Added Payment ${data.paymentNo || newId}`;
  }
  if (collectionName === "invoices") {
    const po = data.poRef ? ` (PO ${data.poRef})` : "";
    return `Added Invoice ${data.invNo || newId}${po}`;
  }
  const singular = collectionName.endsWith("s") ? collectionName.slice(0, -1) : collectionName;
  return `Added new ${singular}`;
}

function buildDeleteLogDetails(collectionName, id, lists) {
  const { projects, budgets, prs, pos, payments, invoices, vendors, materials } = lists;
  if (collectionName === "pos") {
    const po = pos.find((p) => p.id === id);
    if (po) {
      const vendor = po.vendorName ? truncateLogDetail(po.vendorName, 80) : "";
      return vendor
        ? `Deleted PO ${po.poNo || id} — ${vendor}`
        : `Deleted PO ${po.poNo || id}`;
    }
    return `Deleted PO ID: ${id}`;
  }
  if (collectionName === "prs") {
    const pr = prs.find((p) => p.id === id);
    return pr ? `Deleted PR ${pr.prNo || id}` : `Deleted PR ID: ${id}`;
  }
  if (collectionName === "payments") {
    const pay = payments.find((p) => p.id === id);
    return pay ? `Deleted Payment ${pay.paymentNo || id}` : `Deleted Payment ID: ${id}`;
  }
  if (collectionName === "budgets") {
    const b = budgets.find((x) => x.id === id);
    return b ? `Deleted Budget ${b.code}` : `Deleted Budget ID: ${id}`;
  }
  if (collectionName === "projects") {
    const p = projects.find((x) => x.id === id);
    return p ? `Deleted Project ${p.jobNo}` : `Deleted Project ID: ${id}`;
  }
  if (collectionName === "invoices") {
    const inv = invoices.find((x) => x.id === id);
    return inv ? `Deleted Invoice ${inv.invNo || id}` : `Deleted Invoice ID: ${id}`;
  }
  if (collectionName === "vendors") {
    const v = vendors.find((x) => x.id === id);
    return v ? `Deleted Vendor ${truncateLogDetail(v.name || v.code || id, 100)}` : `Deleted Vendor ID: ${id}`;
  }
  if (collectionName === "materials") {
    const m = materials.find((x) => x.id === id);
    return m ? `Deleted Material ${truncateLogDetail(m.name || m.code || id, 100)}` : `Deleted Material ID: ${id}`;
  }
  const singular = collectionName.endsWith("s") ? collectionName.slice(0, -1) : collectionName;
  return `Deleted ${singular} ID: ${id}`;
}

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
  const [payments,  setPayments]  = useState([]);
  const [receives,  setReceives]  = useState([]);

  // ── Role permissions (admin-controlled, synced to Firestore) ─────────────
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(MODULE_ACCESS);
  // functionPermissions: { moduleKey: { functionKey: [allowedRoles] } }
  const [functionPermissions, setFunctionPermissions] = useState<Record<string, Record<string, string[]>>>(() =>
    mergeFunctionPermissionsWithDefaults({})
  );
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false);

  // ── Column widths (admin-controlled, synced to Firestore) ─────────────────
  const [columnWidths, setColumnWidths] = useState({});
  const colSaveTimer = useRef(null);

  // ── Column visibility (per-user, synced to Firestore) ─────────────────────
  const [columnVisibility, setColumnVisibility] = useState<Record<string, Record<string, boolean>>>({});
  const colVisSaveTimer = useRef(null);

  // ── Lazy / one-shot loaded collections (getDocs แทน onSnapshot — ลด Firebase read quota) ──
  const [vendorsLoading,   setVendorsLoading]   = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [projectsLoading,  setProjectsLoading]  = useState(false);
  const vendorsLoadedRef   = useRef(false);
  const materialsLoadedRef = useRef(false);
  const projectsLoadedRef  = useRef(false);

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

  const loadProjects = useCallback(async () => {
    if (projectsLoadedRef.current) return;
    projectsLoadedRef.current = true;
    setProjectsLoading(true);
    try {
      const snap = await getDocs(collection(db, "artifacts", appId, "public", "data", "projects"));
      setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error("Error loading projects:", err);
      projectsLoadedRef.current = false;
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  /** บังคับ re-fetch projects (เรียกหลัง add/edit/delete project โดย view อื่นที่ write ตรง Firestore) */
  const refreshProjects = useCallback(async () => {
    projectsLoadedRef.current = false;
    await loadProjects();
  }, [loadProjects]);

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

    const rolePermRef = doc(db, ...ROLE_PERMISSIONS_DOC);
    const unsubRolePerms = onSnapshot(rolePermRef, (snap) => {
      if (snap.exists()) {
        setRolePermissions(snap.data());
      } else {
        setRolePermissions({});
      }
      setRolePermissionsReady(true);
    });

    const funcPermRef = doc(db, ...FUNC_PERMISSIONS_DOC);
    const unsubFuncPerms = onSnapshot(funcPermRef, (snap) => {
      const raw = snap.exists() ? (snap.data() as Record<string, Record<string, string[]>>) : {};
      setFunctionPermissions(mergeFunctionPermissionsWithDefaults(raw));
    });

    // projects โหลดครั้งเดียว (getDocs) — ลด onSnapshot listener และ Firebase read quota
    loadProjects();

    // vendors, materials ไม่ sync ที่นี่ — ใช้ loadVendors() / loadMaterials() เมื่อเข้าหน้าที่ใช้
    const unsubs = [
      syncCollection("budgets",   setBudgets),
      syncCollection("prs",       setPrs),
      syncCollection("pos",       setPos),
      syncCollection("invoices",  setInvoices),
      syncCollection("payments",  setPayments),
      syncCollection("receives",  setReceives),
    ];

    // Per-user column visibility
    let unsubColVis = () => {};
    if (user?.uid) {
      const colVisRef = doc(db, "artifacts", appId, "public", "data", "userSettings", user.uid);
      unsubColVis = onSnapshot(colVisRef, (snap) => {
        if (snap.exists() && snap.data()?.columnVisibility) {
          setColumnVisibility(snap.data().columnVisibility);
        }
      });
    }

    return () => {
      unsubs.forEach((u) => u());
      unsubColWidths();
      unsubRolePerms();
      unsubFuncPerms();
      unsubColVis();
      if (colSaveTimer.current) clearTimeout(colSaveTimer.current);
      if (colVisSaveTimer.current) clearTimeout(colVisSaveTimer.current);
    };
  }, [user?.uid, loadProjects]);

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

  // ── Column visibility (per-user) ────────────────────────────────────────
  const saveColumnVisibility = useCallback((tableId, colKey, visible) => {
    if (!user?.uid) return;
    setColumnVisibility((prev) => {
      const next = { ...prev, [tableId]: { ...(prev[tableId] || {}), [colKey]: visible } };
      if (colVisSaveTimer.current) clearTimeout(colVisSaveTimer.current);
      colVisSaveTimer.current = setTimeout(async () => {
        try {
          await setDoc(
            doc(db, "artifacts", appId, "public", "data", "userSettings", user.uid),
            { columnVisibility: next },
            { merge: true }
          );
        } catch (_) { /* silent */ }
      }, 700);
      return next;
    });
  }, [user?.uid]);

  const isColumnVisible = useCallback((tableId, colKey) => {
    const userPref = columnVisibility[tableId]?.[colKey];
    if (userPref !== undefined) return userPref;
    return true;
  }, [columnVisibility]);

  // ── ป้องกันการบันทึกซ้ำ (double submit) ───────────────────────────────────
  const pendingUpdatesRef = useRef(new Set());

  // ── CRUD helpers (อัปเดต cache vendors/materials หลัง write เพื่อไม่ต้องโหลดใหม่) ─
  const addData = useCallback(async (collectionName, data, customId = null, options = {}) => {
    const { skipLog = false } = options || {};
    try {
      let newId = customId;
      if (customId) {
        await setDoc(doc(db, "artifacts", appId, "public", "data", collectionName, customId), data);
        if (collectionName === "vendors")   setVendors((prev)   => [...prev, { id: customId, ...data }]);
        if (collectionName === "materials") setMaterials((prev) => [...prev, { id: customId, ...data }]);
        if (collectionName === "projects")  setProjects((prev)  => [...prev, { id: customId, ...data }]);
      } else {
        const colRef = collection(db, "artifacts", appId, "public", "data", collectionName);
        const docRef = await addDoc(colRef, data);
        newId = docRef.id;
        if (collectionName === "vendors")   setVendors((prev)   => [...prev, { id: docRef.id, ...data }]);
        if (collectionName === "materials") setMaterials((prev) => [...prev, { id: docRef.id, ...data }]);
        if (collectionName === "projects")  setProjects((prev)  => [...prev, { id: docRef.id, ...data }]);
      }
      if (!skipLog) {
        await logAction("Create", buildCreateLogDetails(collectionName, data, newId));
      }
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert]);

  const updateData = useCallback(async (collectionName, id, data, options = {}) => {
    const { skipLog = false } = options || {};
    const key = `${collectionName}:${id}`;
    if (pendingUpdatesRef.current.has(key)) {
      showAlert("กรุณารอสักครู่", "กำลังบันทึกข้อมูลอยู่ ไม่สามารถบันทึกซ้ำได้", "warning");
      return false;
    }
    pendingUpdatesRef.current.add(key);
    const payload = { ...data, updatedAt: new Date().toISOString() };
    const listBundle = {
      projects, budgets, prs, pos, payments, invoices, vendors, materials,
    };
    try {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id), payload);
      if (collectionName === "vendors")   setVendors((prev)   => prev.map((v) => (v.id === id ? { ...v, ...payload } : v)));
      if (collectionName === "materials") setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...payload } : m)));
      if (collectionName === "projects")  setProjects((prev)  => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
      if (!skipLog) {
        const details = buildUpdateLogDetails(collectionName, id, payload, listBundle);
        await logAction("Update", details);
      }
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + e.message, "error");
      return false;
    } finally {
      pendingUpdatesRef.current.delete(key);
    }
  }, [logAction, showAlert, projects, budgets, prs, pos, payments, invoices, vendors, materials]);

  const deleteData = useCallback(async (collectionName, id, options = {}) => {
    const { skipLog = false } = options || {};
    const listBundle = {
      projects, budgets, prs, pos, payments, invoices, vendors, materials,
    };
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id));
      if (collectionName === "vendors")   setVendors((prev)   => prev.filter((v) => v.id !== id));
      if (collectionName === "materials") setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (collectionName === "projects")  setProjects((prev)  => prev.filter((p) => p.id !== id));
      if (!skipLog) {
        await logAction("Delete", buildDeleteLogDetails(collectionName, id, listBundle));
      }
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert, projects, budgets, prs, pos, payments, invoices, vendors, materials]);

  const canAccessModule = useCallback((menuId) => {
    const allowed = rolePermissions[menuId];
    if (roles.includes("Administrator")) return true;
    if (!allowed || allowed.length === 0) return false;
    return roles.some((r) => allowed.includes(r));
  }, [roles, rolePermissions]);

  const saveRolePermissions = useCallback(async (newPermissions: Record<string, string[]>) => {
    try {
      await setDoc(doc(db, ...ROLE_PERMISSIONS_DOC), newPermissions);
      return true;
    } catch (e) {
      console.error("Error saving role permissions:", e);
      return false;
    }
  }, []);

  // canUseFunction: เห็นปุ่ม/icon action เฉพาะเมื่อ Role อยู่ในรายชื่อสิทธิ์ฟังก์ชันนั้น (หลัง merge แล้ว)
  // Administrator เห็นทุกอย่าง
  const canUseFunction = useCallback((moduleKey: string, functionKey: string): boolean => {
    if (roles.includes("Administrator")) return true;
    const modFuncs = functionPermissions[moduleKey];
    if (modFuncs == null || typeof modFuncs !== "object") return false;
    const allowedRoles = modFuncs[functionKey];
    if (!Array.isArray(allowedRoles)) return false;
    return roles.some((r) => allowedRoles.includes(r));
  }, [roles, functionPermissions]);

  const saveFunctionPermissions = useCallback(async (newFuncPerms: Record<string, Record<string, string[]>>) => {
    try {
      await setDoc(doc(db, ...FUNC_PERMISSIONS_DOC), newFuncPerms);
      return true;
    } catch (e) {
      console.error("Error saving function permissions:", e);
      return false;
    }
  }, []);

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
    if (roles.includes("Administrator") && (
      pr.status?.startsWith("Pending") || pr.status === PR_PENDING_ACTIVE
    )) return true;
    if (roles.includes("CM")  && pr.status === "Pending CM")  return true;
    if (roles.includes("PM")  && pr.status === "Pending PM")  return true;
    if (roles.includes("GM")  && pr.status === "Pending GM")  return true;
    if (roles.includes("MD")  && pr.status === "Pending MD")  return true;
    // แจ้งเตือนผู้เปิด PR, CM, PM, Procurement, PCM เมื่อมีสถานะ Edit Budget
    if (pr.status === "Edit Budget" && (
      roles.includes("CM") || roles.includes("PM") ||
      roles.includes("Procurement") || roles.includes("PCM") ||
      roles.includes("Administrator")
    )) return true;
    // PCM รับแจ้งเตือนเมื่อมีคำขอ Active PR
    if (pr.status === PR_PENDING_ACTIVE && (roles.includes("PCM") || roles.includes("Administrator"))) return true;
    return false;
  }), [prs, roles]);

  const pendingPOsGlobal = useMemo(() => pos.filter((po) => {
    if (roles.includes("Administrator") && (
      po.status?.startsWith("Pending") ||
      po.status === PO_REVISION_PENDING_PCM ||
      po.status === PO_REVISION_PENDING_GM
    )) return true;
    if (roles.includes("PCM") && (po.status === "Pending PCM" || po.status === PO_REVISION_PENDING_PCM)) return true;
    if (roles.includes("GM") && (po.status === "Pending GM" || po.status === PO_REVISION_PENDING_GM)) return true;
    return false;
  }), [pos, roles]);

  const pendingPaymentsGlobal = useMemo(() => payments.filter((p: any) => {
    const s = p.status || "";
    if (roles.includes("Administrator")) return s.startsWith("Pending") || s === "Wait Pay" || s.startsWith("งวดงาน Pending");
    if (roles.includes("CM")  && (s === "Pending CM"  || s === "งวดงาน Pending CM"))  return true;
    if (roles.includes("PM")  && (s === "Pending PM"  || s === "งวดงาน Pending PM"))  return true;
    if (roles.includes("PCM") && (s === "Pending PM"  || s === "งวดงาน Pending PM"))  return true;
    if ((roles.includes("MD") || roles.includes("GM")) && s === "Pending MD") return true;
    if (roles.includes("Procurement") && (s === "Pending Procurement" || s === "Wait Pay")) return true;
    return false;
  }), [payments, roles]);

  const totalPendingCount = useMemo(() => {
    const visibleProjectIds = visibleProjects.map(p => p.id);
    const visibleBudgets = pendingBudgetsGlobal.filter(b => visibleProjectIds.includes(b.projectId));
    const visibleSubItems = pendingSubItemsGlobal.filter(s => {
      const b = budgets.find(x => x.id === s.budgetId);
      return b && visibleProjectIds.includes(b.projectId);
    });
    const visiblePRs = pendingPRsGlobal.filter(pr => visibleProjectIds.includes(pr.projectId));
    const visiblePOs = pendingPOsGlobal.filter(po => visibleProjectIds.includes(po.projectId));
    const visiblePayments = pendingPaymentsGlobal.filter(p => visibleProjectIds.includes(p.projectId));
    return visibleBudgets.length + visibleSubItems.length + visiblePRs.length + visiblePOs.length + visiblePayments.length;
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal, visibleProjects, budgets]);

  const pendingCountByMenu = useMemo(() => ({
    budget:               pendingBudgetsGlobal.length + pendingSubItemsGlobal.length,
    pr:                   pendingPRsGlobal.length,
    "pr-table":           pendingPRsGlobal.length,
    po:                   pendingPOsGlobal.length,
    "po-table":           pendingPOsGlobal.length,
    "payment-subcontract": pendingPaymentsGlobal.length,
  }), [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal]);

  const pendingByProject = useMemo(() => {
    const map = {};
    const visibleProjectIds = visibleProjects.map(p => p.id);
    const inc = (pid, key) => {
      if (!pid || !visibleProjectIds.includes(pid)) return;
      if (!map[pid]) map[pid] = { budgets: 0, prs: 0, pos: 0, subItems: 0, payments: 0 };
      map[pid][key]++;
    };
    pendingBudgetsGlobal.forEach((b) => inc(b.projectId, "budgets"));
    pendingSubItemsGlobal.forEach((s) => {
      const b = budgets.find((x) => x.id === s.budgetId);
      if (b) inc(b.projectId, "subItems");
    });
    pendingPRsGlobal.forEach((pr) => inc(pr.projectId, "prs"));
    pendingPOsGlobal.forEach((po) => inc(po.projectId, "pos"));
    pendingPaymentsGlobal.forEach((p: any) => inc(p.projectId, "payments"));
    return Object.entries(map).map(([projectId, counts]) => {
      const proj = projects.find((p) => p.id === projectId);
      return {
        projectId,
        projectName: proj ? `${proj.jobNo} - ${proj.name}` : projectId,
        ...counts,
        total: counts.budgets + counts.prs + counts.pos + counts.subItems + counts.payments,
      };
    });
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal, projects, budgets, visibleProjects]);

  // ── PR / PO approval handlers ──────────────────────────────────────────────
  const handlePRAction = useCallback(async (id, action) => {
    const pr = prs.find((p) => p.id === id);
    if (!pr) return;
    let newStatus = pr.status;
    if (action === "approve") {
      if (pr.status === "Pending CM" && (roles.includes("CM") || roles.includes("Administrator"))) newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (roles.includes("PM") || roles.includes("Administrator"))) newStatus = "Approved";
      else if (pr.status === "Pending GM" && (roles.includes("GM") || roles.includes("Administrator"))) newStatus = "Pending MD";
      else if (pr.status === "Pending MD" && (roles.includes("MD") || roles.includes("Administrator"))) newStatus = "Approved";
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
    if (po.status === PO_REVISION_PENDING_PCM || po.status === PO_REVISION_PENDING_GM) return;
    let newStatus = po.status;
    if (action === "approve") {
      if (po.status === "Pending PCM" && (roles.includes("PCM") || roles.includes("Administrator"))) newStatus = "Pending GM";
      else if (po.status === "Pending GM" && (roles.includes("GM") || roles.includes("Administrator"))) {
        newStatus = po.receiveType === "Receive Auto" ? "Received" : "Approved";
      }
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== po.status) {
      const payload: any = { status: newStatus };
      if (newStatus === "Received") payload.statusNow = "Received";
      if (action === "approve") payload.rejectReason = "";
      await updateData("pos", id, payload);
    }
  }, [pos, roles, updateData]);

  /** อนุญาตแก้ไข PO หลังขอแก้ — ลบ PDF + สถานะเป็น Draft */
  const handlePORevisionAllow = useCallback(async (id) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    const isPcm = po.status === PO_REVISION_PENDING_PCM;
    const isGm = po.status === PO_REVISION_PENDING_GM;
    if (!isPcm && !isGm) return;
    const allowed =
      roles.includes("Administrator") ||
      (isPcm && roles.includes("PCM")) ||
      (isGm && roles.includes("GM"));
    if (!allowed) {
      showAlert?.("ไม่มีสิทธิ์", "คุณไม่ใช่ผู้อนุญาตในขั้นนี้", "warning");
      return;
    }
    try {
      // ลบ PDF เดิมออก
      if (po.pdfPath) {
        try {
          const { deleteGeneratedPdf } = await import("../lib/pdfForms");
          await deleteGeneratedPdf(po.pdfPath);
        } catch (_) {}
      }
      // เก็บยอด pre-VAT (subtotal หลังหักส่วนลด) เพราะ PR allocation ไม่รวม VAT
      const poItemsSubtotal = (po.items || []).reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const poOriginalSubtotal = Math.max(0, poItemsSubtotal - (Number(po.discount) || 0));
      await updateDoc(doc(db, "artifacts", appId, "public", "data", "pos", id), {
        status: "Draft",
        originalPoAmount: poOriginalSubtotal,
        pdfUrl: deleteField(),
        pdfPath: deleteField(),
        poEditRevisionResumeStatus: deleteField(),
        poEditRevisionReason: deleteField(),
        updatedAt: new Date().toISOString(),
      });
      await logAction("PO Revision Allowed", `อนุญาตแก้ไข PO ${po.poNo || id} → Draft (ยอด pre-VAT เดิม ${poOriginalSubtotal})`);
      showAlert?.("อนุญาตแก้ไข", "สามารถแก้ไข PO ได้แล้ว (สถานะ Draft)", "success");
    } catch (e) {
      showAlert?.("Error", String(e?.message || e), "error");
    }
  }, [pos, roles, showAlert, logAction]);

  /** ไม่อนุญาตแก้ไข PO — คืนสถานะเดิม */
  const handlePORevisionDeny = useCallback(async (id) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    const isPcm = po.status === PO_REVISION_PENDING_PCM;
    const isGm = po.status === PO_REVISION_PENDING_GM;
    if (!isPcm && !isGm) return;
    const allowed =
      roles.includes("Administrator") ||
      (isPcm && roles.includes("PCM")) ||
      (isGm && roles.includes("GM"));
    if (!allowed) {
      showAlert?.("ไม่มีสิทธิ์", "คุณไม่ใช่ผู้อนุญาตในขั้นนี้", "warning");
      return;
    }
    const resume = po.poEditRevisionResumeStatus || (isPcm ? "Pending PCM" : "Pending GM");
    try {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", "pos", id), {
        status: resume,
        poEditRevisionResumeStatus: deleteField(),
        poEditRevisionReason: deleteField(),
        updatedAt: new Date().toISOString(),
      });
      await logAction("PO Revision Denied", `ไม่อนุญาตแก้ไข PO ${po.poNo || id} — คืนสถานะ ${resume}`);
      showAlert?.("ไม่อนุญาต", "คืนสถานะ PO ตามเดิมแล้ว", "info");
    } catch (e) {
      showAlert?.("Error", String(e?.message || e), "error");
    }
  }, [pos, roles, showAlert, logAction]);

  // ── Context value ──────────────────────────────────────────────────────────
  const value = useMemo(() => ({
    // collections
    projects, budgets, vendors, materials, prs, pos, invoices, payments, receives,
    // derived
    visibleProjects,
    // pending (global, for bell + sidebar badges)
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal,
    totalPendingCount, pendingByProject, pendingCountByMenu,
    // CRUD
    addData, updateData, deleteData,
    // lazy / one-shot load (ลดโควต้า — โหลดเมื่อเข้าหน้าที่ใช้)
    loadVendors, loadMaterials,
    vendorsLoading, materialsLoading,
    loadProjects, refreshProjects, projectsLoading,
    // column widths
    columnWidths, handleColumnResize,
    // column visibility (per-user)
    columnVisibility, saveColumnVisibility, isColumnVisible,
    // approval actions
    handlePRAction, handlePOAction,
    handlePORevisionAllow, handlePORevisionDeny,
    // passthrough from AuthContext
    showAlert, openConfirm, logAction,
    userRole, userRoles: roles, userData, user,
    canAccessModule,
    rolePermissions, rolePermissionsReady, saveRolePermissions,
    functionPermissions, canUseFunction, saveFunctionPermissions,
    // raw Firebase (for views that need direct Firestore access)
    db, appId,
  }), [
    projects, budgets, vendors, materials, prs, pos, invoices, payments, receives,
    visibleProjects,
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal,
    totalPendingCount, pendingByProject, pendingCountByMenu,
    addData, updateData, deleteData,
    loadVendors, loadMaterials,
    vendorsLoading, materialsLoading,
    loadProjects, refreshProjects, projectsLoading,
    columnWidths, handleColumnResize,
    columnVisibility, saveColumnVisibility, isColumnVisible,
    handlePRAction, handlePOAction, handlePORevisionAllow, handlePORevisionDeny,
    showAlert, openConfirm, logAction,
    userRole, roles, userData, user,
    canAccessModule, rolePermissions, rolePermissionsReady, saveRolePermissions,
    functionPermissions, canUseFunction, saveFunctionPermissions,
  ]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

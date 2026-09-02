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
  where, documentId,
} from "firebase/firestore";
import { db, appId } from "../lib/firebase";
import { useUI } from "./UIContext";
import {
  MODULE_ACCESS,
  USER_ROLES,
  mergeFunctionPermissionsWithDefaults,
  PO_REVISION_PENDING_PCM,
  PO_REVISION_PENDING_GM,
  PR_PENDING_ACTIVE,
} from "../lib/constants";
import {
  buildAutoReceiveData,
  findAutoReceiveForPO,
  isReceiveAutoType,
} from "../lib/receiveAuto";
import { TABLE_COLUMN_DEFS } from "../lib/tableColumnDefs";
import {
  buildConfiguredInvoiceData,
  buildConfiguredReceiveData,
  getPoFinalApprovalStatus,
  hasConfiguredPayBeforeReceive,
  hasConfiguredReceiveAfterPayment,
} from "../lib/poDocumentFlow";
import {
  buildCreateLogDetails as buildCrudCreateLogDetails,
  buildDeleteLogDetails as buildCrudDeleteLogDetails,
  buildUpdateLogDetails as buildCrudUpdateLogDetails,
} from "../lib/systemLogDetails";
import { buildPoApprovalIdentityFields } from "../lib/poSignatureStamps";

// Firestore document paths for dynamic permissions
const ROLE_PERMISSIONS_DOC = ["artifacts", appId, "public", "data", "settings", "rolePermissions"];
const FUNC_PERMISSIONS_DOC = ["artifacts", appId, "public", "data", "settings", "functionPermissions"];
const USER_ROLES_DOC = ["artifacts", appId, "public", "data", "settings", "userRoles"];

function normalizeRoleNames(nextRoles) {
  const base = Array.isArray(nextRoles) ? nextRoles : [];
  const cleaned = base
    .map((role) => String(role || "").trim())
    .filter(Boolean);
  return [...new Set([...USER_ROLES, ...cleaned])];
}

function mergeRolePermissionsWithDefaults(rawPermissions) {
  const raw = rawPermissions && typeof rawPermissions === "object" ? rawPermissions : {};
  const merged = {};

  Object.keys(MODULE_ACCESS).forEach((moduleKey) => {
    if (Object.prototype.hasOwnProperty.call(raw, moduleKey)) {
      const value = raw[moduleKey];
      merged[moduleKey] = Array.isArray(value) ? [...value] : [];
    } else {
      merged[moduleKey] = [...(MODULE_ACCESS[moduleKey] || [])];
    }
  });

  Object.keys(raw).forEach((moduleKey) => {
    if (Object.prototype.hasOwnProperty.call(merged, moduleKey)) return;
    const value = raw[moduleKey];
    merged[moduleKey] = Array.isArray(value) ? [...value] : [];
  });

  return merged;
}

function buildUpdateLogDetails(collectionName, id, data, lists) {
  const sourceMap = {
    projects: lists.projects,
    budgets: lists.budgets,
    prs: lists.prs,
    pos: lists.pos,
    payments: lists.payments,
    invoices: lists.invoices,
    vendors: lists.vendors,
    materials: lists.materials,
    receives: lists.receives,
  };
  const existing = Array.isArray(sourceMap[collectionName])
    ? sourceMap[collectionName].find((item) => item.id === id)
    : null;
  return buildCrudUpdateLogDetails(collectionName, existing, data, id);
}

function buildCreateLogDetails(collectionName, data, newId) {
  return buildCrudCreateLogDetails(collectionName, data, newId);
}

function buildDeleteLogDetails(collectionName, id, lists) {
  const sourceMap = {
    projects: lists.projects,
    budgets: lists.budgets,
    prs: lists.prs,
    pos: lists.pos,
    payments: lists.payments,
    invoices: lists.invoices,
    vendors: lists.vendors,
    materials: lists.materials,
    receives: lists.receives,
  };
  const existing = Array.isArray(sourceMap[collectionName])
    ? sourceMap[collectionName].find((item) => item.id === id)
    : null;
  return buildCrudDeleteLogDetails(collectionName, existing, id);
}

function deriveLogProjectId(collectionName, id, data, lists) {
  if (data?.projectId) return data.projectId;
  if (collectionName === "projects") return id || data?.id || null;
  const sourceMap = {
    budgets: lists.budgets,
    prs: lists.prs,
    pos: lists.pos,
    payments: lists.payments,
    invoices: lists.invoices,
    receives: lists.receives,
  };
  const source = sourceMap[collectionName];
  if (!Array.isArray(source)) return null;
  return source.find((item) => item.id === id)?.projectId || null;
}

const FIRESTORE_IN_QUERY_LIMIT = 30;

// Collections are loaded only while the active menu actually needs them.
// Menus that are designed as company/assigned-project reports keep their
// assigned-project scope; operational menus use the single selected project.
const MENU_COLLECTION_DEPENDENCIES = {
  projects: ["budgets"],
  budget: ["budgets", "prs", "pos", "payments", "invoices", "receives"],
  pr: ["budgets", "prs", "pos"],
  po: ["budgets", "prs", "pos", "payments", "invoices", "receives", "pays"],
  "payment-subcontract": ["prs", "pos", "payments", "invoices"],
  receive: ["prs", "pos", "invoices", "receives"],
  invoice: ["prs", "pos", "payments", "invoices", "receives"],
  billing: ["prs", "pos", "invoices", "receives", "billings", "pays"],
  pay: ["prs", "pos", "invoices", "receives", "billings", "pays"],
  "budget-summary": ["budgets", "prs", "pos", "payments", "invoices"],
  "project-spending": ["budgets", "prs", "pos", "payments", "invoices"],
};

const ASSIGNED_PROJECT_SCOPE_MENUS = new Set([
  "projects",
  "billing",
  "pay",
  "budget-summary",
  "project-spending",
]);

function chunkValues(values, size = FIRESTORE_IN_QUERY_LIMIT) {
  const unique = [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < unique.length; index += size) {
    chunks.push(unique.slice(index, index + size));
  }
  return chunks;
}

function useScopedCollectionListener({
  enabled,
  collectionName,
  setter,
  onReady = null,
  scopeMode,
  selectedProjectId,
  buildQueries,
  subscribe,
}) {
  useEffect(() => {
    if (!enabled) {
      setter([]);
      onReady?.();
      return undefined;
    }

    return subscribe(
      buildQueries(collectionName, scopeMode, selectedProjectId),
      setter,
      collectionName,
      onReady
    );
  }, [
    enabled,
    collectionName,
    setter,
    onReady,
    scopeMode,
    selectedProjectId,
    buildQueries,
    subscribe,
  ]);
}

function usePendingStatusListener({
  enabled,
  collectionName,
  statuses,
  setter,
  buildQueries,
  subscribe,
}) {
  useEffect(() => {
    if (!enabled || statuses.length === 0) {
      setter([]);
      return undefined;
    }

    return subscribe(
      buildQueries(collectionName, statuses),
      setter,
      `${collectionName}:pending`
    );
  }, [enabled, collectionName, statuses, setter, buildQueries, subscribe]);
}

function mergeRowsById(...groups) {
  const merged = new Map();
  groups.flat().forEach((row) => {
    if (row?.id) merged.set(row.id, row);
  });
  return Array.from(merged.values());
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
  const { activeMenu, selectedProjectId } = useUI();
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
  const [paymentsReady, setPaymentsReady] = useState(false);
  const [billings,  setBillings]  = useState([]);
  const [pays,      setPays]      = useState([]);
  const [receives,  setReceives]  = useState([]);
  const [pendingBudgetDocs, setPendingBudgetDocs] = useState([]);
  const [pendingPrDocs, setPendingPrDocs] = useState([]);
  const [pendingPoDocs, setPendingPoDocs] = useState([]);
  const [pendingPaymentDocs, setPendingPaymentDocs] = useState([]);
  const [vendorEvaluations, setVendorEvaluations] = useState([]);
  const [availableRoles, setAvailableRoles] = useState<string[]>(() => normalizeRoleNames(USER_ROLES));

  // ── Role permissions (admin-controlled, synced to Firestore) ─────────────
  const [rolePermissions, setRolePermissions] = useState<Record<string, string[]>>(() => mergeRolePermissionsWithDefaults(MODULE_ACCESS));
  // functionPermissions: { moduleKey: { functionKey: [allowedRoles] } }
  const [functionPermissions, setFunctionPermissions] = useState<Record<string, Record<string, string[]>>>(() =>
    mergeFunctionPermissionsWithDefaults({})
  );
  const [rolePermissionsReady, setRolePermissionsReady] = useState(false);

  const assignedProjectIds = useMemo(
    () => [...new Set((userData?.assignedProjectIds || []).map(String).filter(Boolean))],
    [userData?.assignedProjectIds]
  );
  const canReadAllProjects = roles.includes("Administrator");

  const hasModuleAccessForCurrentRoles = useCallback((menuId) => {
    const allowed = rolePermissions[menuId];
    if (roles.includes("Administrator")) return true;
    if (!allowed || allowed.length === 0) return false;
    return roles.some((r) => allowed.includes(r));
  }, [roles, rolePermissions]);

  const buildProjectScopedQueries = useCallback((collectionName, scopeMode, requestedProjectId) => {
    const ref = collection(db, "artifacts", appId, "public", "data", collectionName);
    if (scopeMode === "assigned") {
      if (canReadAllProjects) return [query(ref)];
      return chunkValues(assignedProjectIds).map((ids) => query(ref, where("projectId", "in", ids)));
    }

    const projectId = String(requestedProjectId || "").trim();
    if (!projectId) return [];
    if (!canReadAllProjects && !assignedProjectIds.includes(projectId)) return [];
    return [query(ref, where("projectId", "==", projectId))];
  }, [canReadAllProjects, assignedProjectIds]);

  const buildAssignedProjectQueries = useCallback(() => {
    const ref = collection(db, "artifacts", appId, "public", "data", "projects");
    if (canReadAllProjects) return [query(ref)];
    return chunkValues(assignedProjectIds).map((ids) => query(ref, where(documentId(), "in", ids)));
  }, [canReadAllProjects, assignedProjectIds]);

  const subscribeMergedQueries = useCallback((queries, setter, collectionName, onReady = null) => {
    if (!queries.length) {
      setter([]);
      onReady?.();
      return () => {};
    }

    const rowsByQuery = queries.map(() => []);
    const firstSnapshots = new Set();
    const publish = () => {
      const merged = new Map();
      rowsByQuery.flat().forEach((row) => merged.set(row.id, row));
      setter(Array.from(merged.values()));
    };

    const unsubs = queries.map((scopedQuery, queryIndex) => onSnapshot(
      scopedQuery,
      (snap) => {
        rowsByQuery[queryIndex] = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        firstSnapshots.add(queryIndex);
        publish();
        if (firstSnapshots.size === queries.length) onReady?.();
      },
      (err) => console.error(`Error syncing ${collectionName}:`, err)
    ));

    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, []);

  const buildPendingStatusQueries = useCallback((collectionName, statuses) => {
    const ref = collection(db, "artifacts", appId, "public", "data", collectionName);
    if (!statuses.length) return [];
    if (canReadAllProjects) return [query(ref, where("status", "in", statuses))];
    return assignedProjectIds.map((projectId) => query(
      ref,
      where("projectId", "==", projectId),
      where("status", "in", statuses)
    ));
  }, [canReadAllProjects, assignedProjectIds]);

  // ── Column widths (admin-controlled, synced to Firestore) ─────────────────
  const [columnWidths, setColumnWidths] = useState({});
  const colSaveTimer = useRef(null);

  // ── Column visibility (per-user, synced to Firestore) ─────────────────────
  const [columnVisibility, setColumnVisibility] = useState<Record<string, Record<string, boolean>>>({});
  const colVisSaveTimer = useRef(null);

  // ── Lazy / one-shot loaded collections (getDocs แทน onSnapshot — ลด Firebase read quota) ──
  const [vendorsLoading,   setVendorsLoading]   = useState(false);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [vendorEvaluationsLoading, setVendorEvaluationsLoading] = useState(false);
  const vendorsLoadedRef   = useRef(false);
  const materialsLoadedRef = useRef(false);
  const vendorEvaluationsLoadedRef = useRef(false);

  const loadVendors = useCallback(async () => {
    if (!rolePermissionsReady) return;
    const canLookupVendor = ["vendor", "po", "invoice", "receive"].some(
      (moduleKey) => hasModuleAccessForCurrentRoles(moduleKey)
    );
    if (!canLookupVendor) {
      vendorsLoadedRef.current = false;
      setVendors([]);
      return;
    }
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
  }, [rolePermissionsReady, hasModuleAccessForCurrentRoles]);

  const loadVendorEvaluations = useCallback(async () => {
    if (!rolePermissionsReady) return;
    if (vendorEvaluationsLoadedRef.current) return;
    vendorEvaluationsLoadedRef.current = true;
    setVendorEvaluationsLoading(true);
    try {
      const snap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'vendorEvaluations'));
      setVendorEvaluations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading vendorEvaluations:', err);
      vendorEvaluationsLoadedRef.current = false;
    } finally {
      setVendorEvaluationsLoading(false);
    }
  }, [rolePermissionsReady]);

  const loadMaterials = useCallback(async () => {
    if (!rolePermissionsReady) return;
    if (!hasModuleAccessForCurrentRoles("material") && !hasModuleAccessForCurrentRoles("po")) {
      materialsLoadedRef.current = false;
      setMaterials([]);
      return;
    }
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
  }, [rolePermissionsReady, hasModuleAccessForCurrentRoles]);

  // Settings + assigned projects are the only listeners opened for every signed-in user.
  // Business collections are attached separately after permissions are ready and are
  // always scoped to assigned projects for non-admin users.
  useEffect(() => {
    const colWidthsRef = doc(db, "artifacts", appId, "public", "data", "settings", "columnWidths");
    const unsubColWidths = onSnapshot(colWidthsRef, (snap) => {
      if (snap.exists()) setColumnWidths(snap.data());
    });

    const rolePermRef = doc(db, ...ROLE_PERMISSIONS_DOC);
    const unsubRolePerms = onSnapshot(rolePermRef, (snap) => {
      if (snap.exists()) {
        setRolePermissions(mergeRolePermissionsWithDefaults(snap.data()));
      } else {
        setRolePermissions(mergeRolePermissionsWithDefaults(MODULE_ACCESS));
      }
      setRolePermissionsReady(true);
    });

    const userRolesRef = doc(db, ...USER_ROLES_DOC);
    const unsubUserRoles = onSnapshot(userRolesRef, (snap) => {
      const nextRoles = snap.exists() ? snap.data()?.roles : USER_ROLES;
      setAvailableRoles(normalizeRoleNames(nextRoles));
    });

    const funcPermRef = doc(db, ...FUNC_PERMISSIONS_DOC);
    const unsubFuncPerms = onSnapshot(funcPermRef, (snap) => {
      const raw = snap.exists() ? (snap.data() as Record<string, Record<string, string[]>>) : {};
      setFunctionPermissions(mergeFunctionPermissionsWithDefaults(raw));
    });

    const unsubProjects = subscribeMergedQueries(
      buildAssignedProjectQueries(),
      setProjects,
      "projects"
    );

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
      unsubProjects();
      unsubColWidths();
      unsubRolePerms();
      unsubUserRoles();
      unsubFuncPerms();
      unsubColVis();
      if (colSaveTimer.current) clearTimeout(colSaveTimer.current);
      if (colVisSaveTimer.current) clearTimeout(colVisSaveTimer.current);
    };
  }, [user?.uid, buildAssignedProjectQueries, subscribeMergedQueries]);

  const canReadAnyModule = useCallback((moduleKeys) => (
    rolePermissionsReady && moduleKeys.some((moduleKey) => hasModuleAccessForCurrentRoles(moduleKey))
  ), [rolePermissionsReady, hasModuleAccessForCurrentRoles]);

  const roleKey = [...new Set(roles)].sort().join("|");
  const pendingStatuses = useMemo(() => {
    const currentRoles = new Set(roleKey.split("|").filter(Boolean));
    const isAdministrator = currentRoles.has("Administrator");
    const budgets = isAdministrator || currentRoles.has("MD")
      ? ["Wait MD Approve", "Revision Pending"]
      : [];
    const prs = [];
    const pos = [];
    const payments = [];

    if (isAdministrator || currentRoles.has("CM")) prs.push("Pending CM");
    if (isAdministrator || currentRoles.has("PM")) prs.push("Pending PM");
    if (isAdministrator || currentRoles.has("GM")) prs.push("Pending GM");
    if (isAdministrator || currentRoles.has("MD")) prs.push("Pending MD");
    if (isAdministrator || currentRoles.has("PCM")) prs.push(PR_PENDING_ACTIVE);
    if (isAdministrator || ["CM", "PM", "Procurement", "PCM"].some((role) => currentRoles.has(role))) {
      prs.push("Edit Budget");
    }
    if (isAdministrator) prs.push("Pending Close");

    if (isAdministrator || currentRoles.has("PCM")) pos.push("Pending PCM", PO_REVISION_PENDING_PCM);
    if (isAdministrator || currentRoles.has("GM")) pos.push("Pending GM", PO_REVISION_PENDING_GM);
    if (isAdministrator) pos.push("Pending Close PO");

    if (isAdministrator || currentRoles.has("CM")) payments.push("Pending CM", "งวดงาน Pending CM");
    if (isAdministrator || currentRoles.has("PM") || currentRoles.has("PCM")) {
      payments.push("Pending PM", "งวดงาน Pending PM");
    }
    if (isAdministrator || currentRoles.has("MD") || currentRoles.has("GM")) payments.push("Pending MD");
    if (isAdministrator || currentRoles.has("Procurement")) payments.push("Pending Procurement", "Wait Pay");

    return {
      budgets: [...new Set(budgets)],
      prs: [...new Set(prs)],
      pos: [...new Set(pos)],
      payments: [...new Set(payments)],
    };
  }, [roleKey]);

  const canSyncPendingBudgets = pendingStatuses.budgets.length > 0 && canReadAnyModule([
    "projects", "budget", "budget-summary", "project-spending",
  ]);
  const canSyncPendingPrs = pendingStatuses.prs.length > 0 && canReadAnyModule([
    "budget", "pr", "po", "receive", "invoice", "billing", "pay",
    "budget-summary", "project-spending",
  ]);
  const canSyncPendingPos = pendingStatuses.pos.length > 0 && canReadAnyModule([
    "budget", "pr", "po", "payment-subcontract", "receive", "invoice",
    "billing", "pay", "budget-summary", "project-spending",
  ]);
  const canSyncPendingPayments = pendingStatuses.payments.length > 0 && canReadAnyModule([
    "budget", "payment-subcontract", "invoice", "budget-summary", "project-spending",
  ]);

  // The bell uses small status-filtered listeners across assigned projects.
  // It no longer depends on loading every historical document at login.
  usePendingStatusListener({
    enabled: canSyncPendingBudgets,
    collectionName: "budgets",
    statuses: pendingStatuses.budgets,
    setter: setPendingBudgetDocs,
    buildQueries: buildPendingStatusQueries,
    subscribe: subscribeMergedQueries,
  });
  usePendingStatusListener({
    enabled: canSyncPendingPrs,
    collectionName: "prs",
    statuses: pendingStatuses.prs,
    setter: setPendingPrDocs,
    buildQueries: buildPendingStatusQueries,
    subscribe: subscribeMergedQueries,
  });
  usePendingStatusListener({
    enabled: canSyncPendingPos,
    collectionName: "pos",
    statuses: pendingStatuses.pos,
    setter: setPendingPoDocs,
    buildQueries: buildPendingStatusQueries,
    subscribe: subscribeMergedQueries,
  });
  usePendingStatusListener({
    enabled: canSyncPendingPayments,
    collectionName: "payments",
    statuses: pendingStatuses.payments,
    setter: setPendingPaymentDocs,
    buildQueries: buildPendingStatusQueries,
    subscribe: subscribeMergedQueries,
  });

  const activeCollections = useMemo(
    () => new Set(MENU_COLLECTION_DEPENDENCIES[activeMenu] || []),
    [activeMenu]
  );
  const dataScopeMode = ASSIGNED_PROJECT_SCOPE_MENUS.has(activeMenu) ? "assigned" : "selected";
  // Assigned-scope screens do not need to restart when the header's selected
  // project changes. Operational screens use this exact project as query key.
  const scopedProjectId = dataScopeMode === "selected" ? selectedProjectId : null;
  const needsCollection = useCallback(
    (collectionName) => activeCollections.has(collectionName),
    [activeCollections]
  );

  const canSyncBudgets = needsCollection("budgets") && canReadAnyModule([
    "projects", "budget", "pr", "po", "budget-summary", "project-spending",
  ]);
  const canSyncPrs = needsCollection("prs") && canReadAnyModule([
    "budget", "pr", "po", "payment-subcontract", "receive", "invoice", "billing", "pay",
    "budget-summary", "project-spending",
  ]);
  const canSyncPos = needsCollection("pos") && canReadAnyModule([
    "budget", "pr", "po", "payment-subcontract", "receive", "invoice",
    "billing", "pay", "budget-summary", "project-spending",
  ]);
  const canSyncPayments = needsCollection("payments") && canReadAnyModule([
    "budget", "payment-subcontract", "invoice", "budget-summary", "project-spending",
  ]);
  const canSyncInvoice = needsCollection("invoices") && canReadAnyModule([
    "budget", "po", "payment-subcontract", "receive", "invoice", "billing", "pay",
    "budget-summary", "project-spending",
  ]);
  const canSyncReceive = needsCollection("receives") &&
    canReadAnyModule(["budget", "po", "receive", "invoice", "billing", "pay"]);
  const canSyncBilling = needsCollection("billings") && canReadAnyModule(["billing", "pay"]);
  const canSyncPay = needsCollection("pays") && canReadAnyModule(["po", "billing", "pay"]);
  const markPaymentsReady = useCallback(() => setPaymentsReady(true), []);

  useEffect(() => {
    setPaymentsReady(!canSyncPayments);
  }, [canSyncPayments, dataScopeMode, scopedProjectId]);

  // Each collection owns its listener lifecycle. A menu change now restarts
  // only the collections whose enabled state or project query actually changed.
  useScopedCollectionListener({
    enabled: canSyncBudgets,
    collectionName: "budgets",
    setter: setBudgets,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncPrs,
    collectionName: "prs",
    setter: setPrs,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncPos,
    collectionName: "pos",
    setter: setPos,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncPayments,
    collectionName: "payments",
    setter: setPayments,
    onReady: markPaymentsReady,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncInvoice,
    collectionName: "invoices",
    setter: setInvoices,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncReceive,
    collectionName: "receives",
    setter: setReceives,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncBilling,
    collectionName: "billings",
    setter: setBillings,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });
  useScopedCollectionListener({
    enabled: canSyncPay,
    collectionName: "pays",
    setter: setPays,
    scopeMode: dataScopeMode,
    selectedProjectId: scopedProjectId,
    buildQueries: buildProjectScopedQueries,
    subscribe: subscribeMergedQueries,
  });

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
    const columnDef = TABLE_COLUMN_DEFS[tableId]?.find((column) => column.key === colKey);
    return columnDef?.defaultVisible ?? true;
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
        const listBundle = {
          projects, budgets, prs, pos, payments, invoices, vendors, materials, receives,
        };
        await logAction(
          "Create",
          buildCreateLogDetails(collectionName, data, newId),
          deriveLogProjectId(collectionName, newId, data, listBundle)
        );
      }
      return newId || true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert, projects, budgets, prs, pos, payments, invoices, vendors, materials, receives]);

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
      projects, budgets, prs, pos, payments, invoices, vendors, materials, receives,
    };
    try {
      await updateDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id), payload);
      if (collectionName === "vendors")   setVendors((prev)   => prev.map((v) => (v.id === id ? { ...v, ...payload } : v)));
      if (collectionName === "materials") setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...payload } : m)));
      if (collectionName === "projects")  setProjects((prev)  => prev.map((p) => (p.id === id ? { ...p, ...payload } : p)));
      if (!skipLog) {
        const details = buildUpdateLogDetails(collectionName, id, payload, listBundle);
        if (details) {
          await logAction("Update", details, deriveLogProjectId(collectionName, id, payload, listBundle));
        }
      }
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + e.message, "error");
      return false;
    } finally {
      pendingUpdatesRef.current.delete(key);
    }
  }, [logAction, showAlert, projects, budgets, prs, pos, payments, invoices, vendors, materials, receives]);

  const deleteData = useCallback(async (collectionName, id, options = {}) => {
    const { skipLog = false } = options || {};
    const listBundle = {
      projects, budgets, prs, pos, payments, invoices, vendors, materials, receives,
    };
    try {
      await deleteDoc(doc(db, "artifacts", appId, "public", "data", collectionName, id));
      if (collectionName === "vendors")   setVendors((prev)   => prev.filter((v) => v.id !== id));
      if (collectionName === "materials") setMaterials((prev) => prev.filter((m) => m.id !== id));
      if (collectionName === "projects")  setProjects((prev)  => prev.filter((p) => p.id !== id));
      if (!skipLog) {
        await logAction(
          "Delete",
          buildDeleteLogDetails(collectionName, id, listBundle),
          deriveLogProjectId(collectionName, id, null, listBundle)
        );
      }
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.message, "error");
      return false;
    }
  }, [logAction, showAlert, projects, budgets, prs, pos, payments, invoices, vendors, materials, receives]);

  const canAccessModule = useCallback((menuId) => (
    hasModuleAccessForCurrentRoles(menuId)
  ), [hasModuleAccessForCurrentRoles]);

  const saveRolePermissions = useCallback(async (newPermissions: Record<string, string[]>) => {
    try {
      await setDoc(doc(db, ...ROLE_PERMISSIONS_DOC), mergeRolePermissionsWithDefaults(newPermissions));
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

  // ── Get allowed PR Types per role (stored in functionPermissions.pr.viewPRTypeByRole) ──
  const getAllowedPRTypes = useCallback((): string[] | null => {
    if (roles.includes("Administrator")) {
      console.log("[getAllowedPRTypes] User is Administrator → see all (null)");
      return null; // null = see all
    }
    const viewPRTypeByRole = functionPermissions?.pr?.viewPRTypeByRole || {};
    console.log("[getAllowedPRTypes] viewPRTypeByRole from Firestore:", JSON.stringify(viewPRTypeByRole));
    console.log("[getAllowedPRTypes] User roles:", roles);
    // Collect all PR types that any of the user's roles can see
    const allowedTypes = new Set<string>();
    roles.forEach((role) => {
      const typesForRole = viewPRTypeByRole[role] || [];
      console.log(`[getAllowedPRTypes] Role "${role}" has types:`, typesForRole);
      typesForRole.forEach((t) => allowedTypes.add(t));
    });
    // If no types are configured for any role, default to showing all
    if (allowedTypes.size === 0) {
      console.log("[getAllowedPRTypes] No types configured → see all (null)");
      return null;
    }
    const result = Array.from(allowedTypes);
    console.log("[getAllowedPRTypes] Returning allowed types:", result);
    return result;
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

  const saveAvailableRoles = useCallback(async (nextRoles: string[]) => {
    try {
      const normalized = normalizeRoleNames(nextRoles);
      await setDoc(doc(db, ...USER_ROLES_DOC), { roles: normalized });
      return true;
    } catch (e) {
      console.error("Error saving user roles:", e);
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
  const notificationBudgetSource = useMemo(
    () => mergeRowsById(pendingBudgetDocs, budgets),
    [pendingBudgetDocs, budgets]
  );
  const notificationPrSource = useMemo(
    () => mergeRowsById(pendingPrDocs, prs),
    [pendingPrDocs, prs]
  );
  const notificationPoSource = useMemo(
    () => mergeRowsById(pendingPoDocs, pos),
    [pendingPoDocs, pos]
  );
  const notificationPaymentSource = useMemo(
    () => mergeRowsById(pendingPaymentDocs, payments),
    [pendingPaymentDocs, payments]
  );

  const pendingBudgetsGlobal = useMemo(() => {
    if (!roles.includes("MD") && !roles.includes("Administrator")) return [];
    return notificationBudgetSource.filter(
      (b) => b.status === "Wait MD Approve" || b.status === "Revision Pending"
    );
  }, [notificationBudgetSource, roles]);

  const pendingSubItemsGlobal = useMemo(() => {
    if (!roles.includes("MD") && !roles.includes("Administrator")) return [];
    const pendingSubs = [];
    notificationBudgetSource.forEach((b) => {
      (b.subItems || []).forEach((sub) => {
        if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") {
          pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
        }
      });
    });
    return pendingSubs;
  }, [notificationBudgetSource, roles]);

  const pendingPRsGlobal = useMemo(() => notificationPrSource.filter((pr) => {
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
  }), [notificationPrSource, roles]);

  const pendingPOsGlobal = useMemo(() => notificationPoSource.filter((po) => {
    // A PO whose displayed workflow status is already paid/settled must not
    // remain in the close-PO task list, even if an old Pending Close PO value
    // is still stored in the legacy `status` field.
    const displayedStatus = String(po.statusNow || "");
    if (po.status === "Pending Close PO" && ["paid", "Paid", "Deposit", "Invcredit", "Inpay"].includes(displayedStatus)) {
      return false;
    }
    if (roles.includes("Administrator") && (
      po.status?.startsWith("Pending") ||
      po.status === PO_REVISION_PENDING_PCM ||
      po.status === PO_REVISION_PENDING_GM
    )) return true;
    if (roles.includes("PCM") && (po.status === "Pending PCM" || po.status === PO_REVISION_PENDING_PCM)) return true;
    if (roles.includes("GM") && (po.status === "Pending GM" || po.status === PO_REVISION_PENDING_GM)) return true;
    return false;
  }), [notificationPoSource, roles]);

  const pendingPaymentsGlobal = useMemo(() => notificationPaymentSource.filter((p: any) => {
    const s = p.status || "";
    if (roles.includes("Administrator")) return s.startsWith("Pending") || s === "Wait Pay" || s.startsWith("งวดงาน Pending");
    if (roles.includes("CM")  && (s === "Pending CM"  || s === "งวดงาน Pending CM"))  return true;
    if (roles.includes("PM")  && (s === "Pending PM"  || s === "งวดงาน Pending PM"))  return true;
    if (roles.includes("PCM") && (s === "Pending PM"  || s === "งวดงาน Pending PM"))  return true;
    if ((roles.includes("MD") || roles.includes("GM")) && s === "Pending MD") return true;
    if (roles.includes("Procurement") && (s === "Pending Procurement" || s === "Wait Pay")) return true;
    return false;
  }), [notificationPaymentSource, roles]);

  // ── Pending Budget return requests — used to highlight project badges ──────
  // Keep this separate from approval tasks so the existing bell/sidebar counts
  // continue to represent only actions that are currently awaiting approval.
  const pendingBudgetReturnByProject = useMemo(() => {
    const counts = {};
    const visibleProjectIds = new Set(visibleProjects.map((project) => project.id));

    notificationBudgetSource.forEach((budget) => {
      if (!budget?.projectId || !visibleProjectIds.has(budget.projectId)) return;
      const pendingCount = Array.isArray(budget.budgetReturnNotifications)
        ? budget.budgetReturnNotifications.filter((notification) => (
          (notification?.status || "pending") !== "accepted"
        )).length
        : 0;
      if (pendingCount > 0) counts[budget.projectId] = (counts[budget.projectId] || 0) + pendingCount;
    });

    return Object.entries(counts).map(([projectId, count]) => ({ projectId, count }));
  }, [notificationBudgetSource, visibleProjects]);

  const totalPendingCount = useMemo(() => {
    const visibleProjectIds = visibleProjects.map(p => p.id);
    const visibleBudgets = pendingBudgetsGlobal.filter(b => visibleProjectIds.includes(b.projectId));
    const visibleSubItems = pendingSubItemsGlobal.filter(s => {
      const b = notificationBudgetSource.find(x => x.id === s.budgetId);
      return b && visibleProjectIds.includes(b.projectId);
    });
    const visiblePRs = pendingPRsGlobal.filter(pr => visibleProjectIds.includes(pr.projectId));
    const visiblePOs = pendingPOsGlobal.filter(po => visibleProjectIds.includes(po.projectId));
    const visiblePayments = pendingPaymentsGlobal.filter(p => visibleProjectIds.includes(p.projectId));
    return visibleBudgets.length + visibleSubItems.length + visiblePRs.length + visiblePOs.length + visiblePayments.length;
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal, visibleProjects, notificationBudgetSource]);

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
      const b = notificationBudgetSource.find((x) => x.id === s.budgetId);
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
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal, projects, notificationBudgetSource, visibleProjects]);

  // ── PR / PO approval handlers ──────────────────────────────────────────────
  const handlePRAction = useCallback(async (id, action) => {
    const pr = prs.find((p) => p.id === id);
    if (!pr) return;
    let newStatus = pr.status;
    if (action === "approve") {
      const isContractPR = ["จ้างเหมา > DL"].includes(pr.purchaseType || "");
      if (pr.status === "Pending CM" && (roles.includes("CM") || roles.includes("Administrator"))) newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (roles.includes("PM") || roles.includes("Administrator"))) {
        newStatus = isContractPR ? "Pending MD" : "Approved";
      }
      else if (pr.status === "Pending GM" && (roles.includes("GM") || roles.includes("Administrator"))) newStatus = "Pending MD";
      else if (pr.status === "Pending MD" && (roles.includes("MD") || roles.includes("Administrator"))) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== pr.status) {
      const payload = { status: newStatus };
      if (action === "approve") payload.rejectReason = "";
      const ok = await updateData("prs", id, payload, { skipLog: true });
      if (ok) {
        const actionLabel = action === "approve" ? "Approve" : "Reject";
        const detailPrefix = action === "approve" ? "Approve PR" : "Reject PR";
        await logAction(actionLabel, `${detailPrefix} ${pr.prNo || id}: ${pr.status} → ${newStatus}`, pr.projectId);
      }
    }
  }, [prs, roles, updateData, logAction]);

  const handlePOAction = useCallback(async (id, action) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    if (po.status === PO_REVISION_PENDING_PCM || po.status === PO_REVISION_PENDING_GM) return;
    let newStatus = po.status;
    const isAutoReceive = isReceiveAutoType(po.receiveType);
    const hasConfiguredInvoice = hasConfiguredPayBeforeReceive(po);
    const hasConfiguredReceive = hasConfiguredReceiveAfterPayment(po);
    const isPCMApprove = action === "approve" && po.status === "Pending PCM" && (roles.includes("PCM") || roles.includes("Administrator"));
    const isGMApprove = action === "approve" && po.status === "Pending GM" && (roles.includes("GM") || roles.includes("Administrator"));
    if (action === "approve") {
      if (isPCMApprove) newStatus = "Pending GM";
      else if (isGMApprove) {
        newStatus = getPoFinalApprovalStatus(po);
      }
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== po.status) {
      const payload: any = { status: newStatus, statusNow: newStatus };
      if (newStatus === "Received") payload.statusNow = "Received";
      if (newStatus === "Wait Invoice") payload.statusNow = "Wait Invoice";
      if (newStatus === "Paid") payload.statusNow = "Paid";
      if (action === "approve") {
        payload.rejectReason = "";
        payload.creatorSignatureDataUrl = deleteField();
        payload.pcmSignatureDataUrl = deleteField();
        payload.gmSignatureDataUrl = deleteField();
        const approvedAt = new Date().toISOString();
        if (isPCMApprove) {
          Object.assign(payload, buildPoApprovalIdentityFields("Signature2", userData, user), {
            pcmApprovedAt: approvedAt,
            pcmSignatureUrl: userData?.signatureUrl || null,
          });
        }
        if (isGMApprove) {
          Object.assign(payload, buildPoApprovalIdentityFields("Signature3", userData, user), {
            gmApprovedAt: approvedAt,
            gmSignatureUrl: userData?.signatureUrl || null,
          });
        }
      }
      let autoInvoiceNo = "";
      if (action === "approve" && po.status === "Pending GM" && hasConfiguredInvoice) {
        const existingInvoice = invoices.find((invoice) => invoice.poId === po.id);
        if (existingInvoice) {
          autoInvoiceNo = existingInvoice.invNo || existingInvoice.id || "";
        } else {
          const invoiceData = buildConfiguredInvoiceData({
            po,
            setup: po.payBeforeReceiveInvoiceSetup,
            vendors,
            userData,
          });
          if (!invoiceData) return;
          const invoiceOk = await addData("invoices", invoiceData, null, { skipLog: true });
          if (!invoiceOk) return;
          autoInvoiceNo = invoiceData.invNo;
          await logAction(
            "Create Invoice",
            `${buildCrudCreateLogDetails("invoices", invoiceData, invoiceData.invNo || po.id)} | ที่มา: Auto Pay before receive`,
            po.projectId
          );
        }
      }
      let autoReceiveNo = "";
      if (action === "approve" && po.status === "Pending GM" && hasConfiguredReceive) {
        const existingConfiguredReceive = receives.find((receive) => receive.poId === po.id);
        if (existingConfiguredReceive) {
          autoReceiveNo = existingConfiguredReceive.rpNo || existingConfiguredReceive.receiveNo || existingConfiguredReceive.id || "";
        } else {
          const project = projects.find((item) => item.id === po.projectId) || null;
          const configuredReceive = buildConfiguredReceiveData({
            po,
            setup: po.receivedAfterPaymentSetup,
            prs,
            vendors,
            receives,
            project,
            user,
            userData,
          });
          if (!configuredReceive) return;
          const receiveOk = await addData("receives", configuredReceive.receiveData, null, { skipLog: true });
          if (!receiveOk) return;
          autoReceiveNo = configuredReceive.receiveNo;
          await logAction(
            "Create Receive",
            `${buildCrudCreateLogDetails("receives", configuredReceive.receiveData, configuredReceive.receiveNo || po.id)} | ที่มา: Auto received after payment`,
            po.projectId
          );
        }
      } else if (action === "approve" && newStatus === "Received" && isAutoReceive) {
        const existingAutoReceive = findAutoReceiveForPO(receives, po.id);
        if (existingAutoReceive) {
          autoReceiveNo = existingAutoReceive.rpNo || existingAutoReceive.receiveNo || "";
        } else {
          const project = projects.find((item) => item.id === po.projectId) || null;
          const autoReceive = buildAutoReceiveData({
            po,
            prs,
            vendors,
            receives,
            project,
            user,
            userData,
          });
          if (autoReceive) {
            const receiveOk = await addData("receives", autoReceive.receiveData, null, { skipLog: true });
            if (!receiveOk) return;
            autoReceiveNo = autoReceive.receiveNo;
            await logAction(
              "Create Receive",
              `${buildCrudCreateLogDetails("receives", autoReceive.receiveData, autoReceive.receiveNo || po.id)} | ที่มา: Auto Receive`,
              po.projectId
            );
          }
        }
      }
      const ok = await updateData("pos", id, payload, { skipLog: true });
      if (ok) {
        const actionLabel = action === "approve" ? "Approve" : "Reject";
        const detailPrefix = action === "approve" ? "Approve PO" : "Reject PO";
        const autoInvoiceSuffix = autoInvoiceNo ? ` | Auto Invoice ${autoInvoiceNo}` : "";
        const autoReceiveSuffix = autoReceiveNo ? ` | Auto Receive ${autoReceiveNo}` : "";
        await logAction(actionLabel, `${detailPrefix} ${po.poNo || id}: ${po.status} → ${newStatus}${autoInvoiceSuffix}${autoReceiveSuffix}`, po.projectId);
      }
    }
  }, [pos, roles, receives, invoices, projects, prs, vendors, user, userData, addData, updateData, logAction]);

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
        statusNow: "Draft",
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
    projects, budgets, vendors, materials, prs, pos, invoices, payments, paymentsReady, billings, pays, receives, vendorEvaluations,
    // derived
    visibleProjects,
    // pending (global, for bell + sidebar badges)
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal,
    totalPendingCount, pendingByProject, pendingCountByMenu, pendingBudgetReturnByProject,
    // CRUD
    addData, updateData, deleteData,
    // lazy / one-shot load (ลดโควต้า — โหลดเมื่อเข้าหน้าที่ใช้)
    loadVendors, loadMaterials, loadVendorEvaluations,
    vendorsLoading, materialsLoading, vendorEvaluationsLoading,
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
    availableRoles, saveAvailableRoles,
    rolePermissions, rolePermissionsReady, saveRolePermissions,
    functionPermissions, canUseFunction, saveFunctionPermissions,
    getAllowedPRTypes,
    // raw Firebase (for views that need direct Firestore access)
    db, appId,
  }), [
    projects, budgets, vendors, materials, prs, pos, invoices, payments, paymentsReady, billings, pays, receives,
    visibleProjects,
    pendingBudgetsGlobal, pendingSubItemsGlobal,
    pendingPRsGlobal, pendingPOsGlobal, pendingPaymentsGlobal,
    totalPendingCount, pendingByProject, pendingCountByMenu, pendingBudgetReturnByProject,
    addData, updateData, deleteData,
    loadVendors, loadMaterials, loadVendorEvaluations,
    vendorsLoading, materialsLoading, vendorEvaluationsLoading, vendorEvaluations,
    columnWidths, handleColumnResize,
    columnVisibility, saveColumnVisibility, isColumnVisible,
    handlePRAction, handlePOAction, handlePORevisionAllow, handlePORevisionDeny,
    showAlert, openConfirm, logAction,
    userRole, roles, userData, user,
    canAccessModule, availableRoles, saveAvailableRoles, rolePermissions, rolePermissionsReady, saveRolePermissions,
    functionPermissions, canUseFunction, saveFunctionPermissions,
    getAllowedPRTypes,
  ]);

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
};

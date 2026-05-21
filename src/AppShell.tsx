// @ts-nocheck
import React, { useContext, useEffect, useState, useRef, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import {
  LayoutDashboard, Briefcase, Wallet, FileText, ShoppingCart, FileInput,
  Users, Settings, Bell, ChevronDown, LogOut, Shield, UserCircle, AtSign,
  User, Lock, Unlock, UserCheck, History, Plus, Trash2, Edit, CheckCircle,
  XCircle, Key, Save, RefreshCw, Hash, FileOutput, Search, ListFilter,
  Clock, Package, Tag, ClipboardList, CheckSquare, Square,
  Paperclip, Mail, Flame, MapPinned, CircleDot, Zap, Building2, MapPin,
  DollarSign, Calendar, PlusCircle, ChevronRight, ChevronLeft, ChevronUp, Play, BarChart3, Menu,
  FileSpreadsheet, Download, Upload, CreditCard, BookOpen
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, doc, onSnapshot, query, updateDoc, addDoc, deleteDoc,
  orderBy, limit, getDocs, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, getBytes } from "firebase/storage";
import { db, appId, storage, FORM_TEMPLATE_PATHS } from "./lib/firebase";
import { generatePRPdfBytes, generatePOPdfBytes, downloadBytes, uploadGeneratedPdf, deleteGeneratedPdf } from "./lib/pdfForms";
import { getResumeStatusForPR } from "./lib/prAllocation";
import { computeBudgetUsedAfterPrRevision, getLinkedPoRefsForPr, getPrBudgetReturnInfo, scalePrItemsToTotal } from "./lib/prBudgetReturn";
import { Card, Button, InputGroup, Badge, formatCurrency } from "./components/ui";
import ResizableTh from "./components/ResizableTh";
import { useProportionalTableLayout, chainTableResizeHandlers } from "./hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "./lib/tableLayoutDefaults";
import { MODULE_ACCESS, MODULE_FUNCTIONS, PURCHASE_TYPES } from "./lib/constants";
import { AuthContext } from "./auth/AuthContext";
import { useAppData } from "./contexts/AppDataContext";
import { useUI } from "./contexts/UIContext";
import { SidebarItem } from "./components/ui";
import DashboardView from "./views/DashboardView";
import VendorView from "./views/VendorView";
import MaterialView from "./views/MaterialView";
import InvoiceView from "./views/InvoiceView";
import BillingPayView from "./views/BillingPayView";
import ReceiveView from "./views/ReceiveView";
import ProjectsView from "./views/ProjectsView";
import PRView from "./views/PRView";
import POView from "./views/POView";
import PaymentView from "./views/PaymentView";
import PaymentTableView from "./views/PaymentTableView";
import BudgetView from "./views/BudgetView";
import BudgetSummaryReportView from "./views/BudgetSummaryReportView";
import ProjectSpendingView from "./views/ProjectSpendingView";
import UserManualView from "./views/UserManualView";
import ColumnVisibilityToggle from "./components/ColumnVisibilityToggle";

/** รูปโปรไฟล์ — ถ้าโหลดไม่สำเร็จ (ลิงก์หมดอายุ/ถูกบล็อก) จะแสดง fallback แทนไอคอนรูปพัง */
const ProfileAvatar = ({ src, className, fallback }) => {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return fallback;
  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => setFailed(true)}
    />
  );
};

const AppShell = () => {
  const { user, userData, logout } = useContext(AuthContext);
  const userRole = userData?.role || "Staff";
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);

  const {
    projects, budgets, vendors, materials, prs, pos, invoices,
    visibleProjects, columnWidths, handleColumnResize,
    addData, updateData, deleteData,
    loadVendors, loadMaterials,
    totalPendingCount, pendingByProject, pendingCountByMenu,
    handlePRAction, handlePOAction,
    showAlert, openConfirm,
    canAccessModule,
    rolePermissionsReady,
    userRoles = [userRole],
    logAction,
    isColumnVisible,
  } = useAppData();

  useEffect(() => {
    const onOutside = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) setProfileDropdownOpen(false);
    };
    document.addEventListener("click", onOutside);
    return () => document.removeEventListener("click", onOutside);
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem("cmgbudget_sidebarCollapsed");
      return v !== null ? v === "true" : true;
    } catch { return true; }
  });
  const [isCompactViewport, setIsCompactViewport] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.innerWidth < 1024;
  });
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const updateViewport = (event) => {
      const matches = typeof event?.matches === "boolean" ? event.matches : mediaQuery.matches;
      setIsCompactViewport(matches);
      setIsSidebarOpenMobile(false);
      if (matches) setSidebarCollapsed(false);
      else {
        try {
          const stored = localStorage.getItem("cmgbudget_sidebarCollapsed");
          setSidebarCollapsed(stored !== null ? stored === "true" : true);
        } catch {
          setSidebarCollapsed(true);
        }
      }
    };
    updateViewport();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }
    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  const toggleSidebar = () => {
    if (isCompactViewport) {
      setIsSidebarOpenMobile((open) => !open);
      return;
    }
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("cmgbudget_sidebarCollapsed", String(next)); } catch (_) { }
      return next;
    });
  };
  const closeMobileSidebar = useCallback(() => {
    if (isCompactViewport) setIsSidebarOpenMobile(false);
  }, [isCompactViewport]);

  const {
    activeMenu, setActiveMenu, handleMenuChange,
    selectedProjectId, setSelectedProjectId, handleProjectChange,
    isFullScreenModalOpen, setIsFullScreenModalOpen,
    budgetCategory, setBudgetCategory,
    expandedBudgetRows, setExpandedBudgetRows,
    expandedPrRows, setExpandedPrRows, togglePrRow,
    isBellOpen, setIsBellOpen,
    scrollToPendingAfterRender, setScrollToPendingAfterRender,
    pendingSectionRef,
  } = useUI();

  const [prTab, setPrTab] = useState<"system" | "table">("system");
  const [poTab, setPoTab] = useState<"system" | "table">("system");
  const [paymentSubTab, setPaymentSubTab] = useState<"system" | "table">("system");

  // ── Initial menu redirect — เด้งไปเมนูแรกที่มีสิทธิ์ทันทีที่ permissions พร้อม ──
  const MENU_ORDER = [
    "dashboard", "projects", "budget", "pr",
    "po", "payment-subcontract", "vendor", "material", "receive", "invoice", "billing", "pay",
    "budget-summary", "project-spending", "user-manual", "profile", "admin",
  ];
  const initialRedirectDone = useRef(false);
  useEffect(() => {
    if (!rolePermissionsReady || initialRedirectDone.current) return;
    initialRedirectDone.current = true;
    const firstMenu = MENU_ORDER.find((m) => canAccessModule(m));
    if (firstMenu) setActiveMenu(firstMenu);
  }, [rolePermissionsReady]); // eslint-disable-line

  // handleMenuChange + handleProjectChange → UIContext (useUI() above)
  // pendingBudgetsGlobal, totalPendingCount, pendingByProject → AppDataContext (useAppData() above)

  // Auto-select first visible project when selection is invalid (ไม่ใส่ selectedProjectId ใน deps เพื่อลดการรัน effect และกัน loop)
  useEffect(() => {
    const selectableProjects = activeMenu === "projects" || activeMenu === "budget"
      ? visibleProjects.filter((p) => p.status !== "Close")
      : visibleProjects.filter((p) => (p.status || "Active") === "Active");

    if (selectableProjects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId((current) => {
      if (!current || !selectableProjects.some((p) => p.id === current)) return selectableProjects[0].id;
      return current;
    });
  }, [visibleProjects, activeMenu]);

  // โหลด vendors เมื่อเข้าหน้า PO / ตาราง PO / Vendor (ลดโควต้า — โหลดเฉพาะเมื่อใช้)
  useEffect(() => {
    if (activeMenu === "po" || activeMenu === "po-table" || activeMenu === "vendor" || activeMenu === "billing" || activeMenu === "pay") loadVendors();
  }, [activeMenu, loadVendors]);

  useEffect(() => {
    closeMobileSidebar();
  }, [activeMenu, closeMobileSidebar]);

  const changeMenu = useCallback((menu) => {
    handleMenuChange(menu);
    if (isCompactViewport) {
      setProfileDropdownOpen(false);
      setIsBellOpen(false);
    }
  }, [handleMenuChange, isCompactViewport, setIsBellOpen]);

  const sidebarDense = isCompactViewport;
  const shouldShowSidebar = !isFullScreenModalOpen;
  const moduleMenus = ["budget", "pr", "po", "payment-subcontract", "invoice", "billing", "pay", "receive"].includes(activeMenu);

  return (
    <div className="app-shell-root relative flex overflow-hidden bg-slate-100 font-sans">
      {shouldShowSidebar && isCompactViewport && isSidebarOpenMobile && (
        <button
          type="button"
          aria-label="ปิดเมนู"
          onClick={closeMobileSidebar}
          className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
        />
      )}
      {shouldShowSidebar && (
        <aside
          className={`${isCompactViewport
            ? `fixed inset-y-0 left-0 z-40 w-[14.5rem] max-w-[78vw] transform transition-transform duration-200 ease-out ${isSidebarOpenMobile ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarCollapsed ? "w-[4.5rem]" : "w-64"} relative z-20 transition-[width] duration-200 ease-out`
            } ${isCompactViewport ? "bg-white text-slate-800 border-r border-slate-200" : "bg-slate-900 text-white"} flex flex-col shadow-xl overflow-hidden`}
        >
          <div className={`shrink-0 ${isCompactViewport ? "border-b border-slate-200 bg-white" : "border-b border-slate-800 bg-slate-950"} ${sidebarCollapsed && !isCompactViewport ? "p-2" : isCompactViewport ? "p-2.5" : "p-4"}`}>
            <div className={`rounded-xl ${isCompactViewport ? "bg-slate-50 border border-slate-200" : "bg-slate-800/80 border border-slate-700"} ${sidebarCollapsed && !isCompactViewport ? "p-2" : isCompactViewport ? "p-2" : "p-3"}`}>
              <div className={`flex items-center ${sidebarCollapsed && !isCompactViewport ? "justify-center" : "gap-3"}`}>
                <ProfileAvatar
                  src={userData?.profilePhotoUrl || user?.photoURL}
                  className={`${isCompactViewport ? "w-9 h-9 border-slate-300" : "w-11 h-11 border-slate-600"} rounded-full object-cover border-2 shadow-md flex-shrink-0`}
                  fallback={
                    <div className={`${isCompactViewport ? "w-9 h-9 text-xs" : "w-11 h-11 text-sm"} bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-md flex-shrink-0`}>
                      {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                    </div>
                  }
                />
                {(!sidebarCollapsed || isCompactViewport) && (
                  <div className="min-w-0 flex-1">
                    <p className={`font-bold truncate ${isCompactViewport ? "text-[12px] text-slate-800" : "text-sm text-white"}`}>
                      {userData?.firstName} {userData?.lastName}
                    </p>
                    <p className={`font-medium uppercase tracking-wide flex flex-wrap gap-0.5 ${isCompactViewport ? "text-[9px] text-slate-500" : "text-[10px] text-slate-400"}`}>
                      {userRoles.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <nav className={`flex-1 overflow-y-auto custom-scrollbar ${isCompactViewport ? "p-2 space-y-0.5" : "p-2 space-y-0.5"}`}>
            {canAccessModule("dashboard") && (
              <SidebarItem
                icon={<LayoutDashboard size={20} />}
                label="ภาพรวม"
                active={activeMenu === "dashboard"}
                onClick={() => changeMenu("dashboard")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {(!sidebarCollapsed || isCompactViewport) && (
              <div className={`font-bold uppercase tracking-wider ${isCompactViewport ? "pt-2.5 pb-1 px-2.5 text-[9px] text-slate-400" : "pt-4 pb-2 px-4 text-xs text-slate-500"}`}>
                Modules
              </div>
            )}
            {canAccessModule("projects") && (
              <SidebarItem
                icon={<Briefcase size={20} className="text-amber-300" />}
                label="จัดการโครงการ"
                active={activeMenu === "projects"}
                onClick={() => changeMenu("projects")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {(() => {
              const proj = pendingByProject?.find((x: any) => x.projectId === selectedProjectId);
              const projBadge = {
                budget: (proj?.budgets || 0) + (proj?.subItems || 0),
                pr: proj?.prs || 0,
                po: proj?.pos || 0,
                "payment-subcontract": proj?.payments || 0,
              };
              return (
                <>
                  {canAccessModule("budget") && (
                    <SidebarItem
                      icon={<Wallet size={20} className="text-emerald-300" />}
                      label="Project Budget"
                      active={activeMenu === "budget"}
                      onClick={() => changeMenu("budget")}
                      collapsed={sidebarCollapsed}
                      badge={projBadge.budget}
                      dense={sidebarDense}
                    />
                  )}
                  {(canAccessModule("pr") || canAccessModule("pr-table")) && (
                    <SidebarItem
                      icon={<FileText size={20} className="text-sky-300" />}
                      label="Purchase Request (PR)"
                      active={activeMenu === "pr"}
                      onClick={() => changeMenu("pr")}
                      collapsed={sidebarCollapsed}
                      badge={projBadge.pr}
                      dense={sidebarDense}
                    />
                  )}
                  {(canAccessModule("po") || canAccessModule("po-table")) && (
                    <SidebarItem
                      icon={<ShoppingCart size={20} className="text-rose-300" />}
                      label="Purchase Order (PO)"
                      active={activeMenu === "po"}
                      onClick={() => changeMenu("po")}
                      collapsed={sidebarCollapsed}
                      badge={projBadge.po}
                      dense={sidebarDense}
                    />
                  )}
                  {canAccessModule("payment-subcontract") && (
                    <SidebarItem
                      icon={<CreditCard size={20} className="text-orange-300" />}
                      label="Payment Subcontract"
                      active={activeMenu === "payment-subcontract"}
                      onClick={() => changeMenu("payment-subcontract")}
                      collapsed={sidebarCollapsed}
                      badge={projBadge["payment-subcontract"]}
                      dense={sidebarDense}
                    />
                  )}
                </>
              );
            })()}
            {canAccessModule("receive") && (
              <SidebarItem
                icon={<FileInput size={20} />}
                label="Receive"
                active={activeMenu === "receive"}
                onClick={() => changeMenu("receive")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {canAccessModule("invoice") && (
              <SidebarItem
                icon={<FileText size={20} />}
                label="Invoice"
                active={activeMenu === "invoice"}
                onClick={() => changeMenu("invoice")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {canAccessModule("billing") && (
              <SidebarItem
                icon={<FileOutput size={20} className="text-cyan-300" />}
                label="Billing"
                active={activeMenu === "billing"}
                onClick={() => changeMenu("billing")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {canAccessModule("pay") && (
              <SidebarItem
                icon={<CreditCard size={20} className="text-emerald-300" />}
                label="Pay"
                active={activeMenu === "pay"}
                onClick={() => changeMenu("pay")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}

            {(canAccessModule("budget-summary") || canAccessModule("project-spending")) && (
              <>
                {(!sidebarCollapsed || isCompactViewport) && (
                  <div className={`font-bold uppercase tracking-wider ${isCompactViewport ? "pt-2.5 pb-1 px-2.5 text-[9px] text-slate-400" : "pt-4 pb-2 px-4 text-xs text-slate-500"}`}>
                    Management Report
                  </div>
                )}
                {canAccessModule("budget-summary") && (
                  <SidebarItem
                    icon={<BarChart3 size={20} className="text-indigo-300" />}
                    label="Budget Summary Report"
                    active={activeMenu === "budget-summary"}
                    onClick={() => changeMenu("budget-summary")}
                    collapsed={sidebarCollapsed}
                    dense={sidebarDense}
                  />
                )}
                {canAccessModule("project-spending") && (
                  <SidebarItem
                    icon={<FileSpreadsheet size={20} className="text-pink-300" />}
                    label="Project Spending"
                    active={activeMenu === "project-spending"}
                    onClick={() => changeMenu("project-spending")}
                    collapsed={sidebarCollapsed}
                    dense={sidebarDense}
                  />
                )}
              </>
            )}

            {(!sidebarCollapsed || isCompactViewport) && (
              <div className={`font-bold uppercase tracking-wider ${isCompactViewport ? "pt-2.5 pb-1 px-2.5 text-[9px] text-slate-400" : "pt-4 pb-2 px-4 text-xs text-slate-500"}`}>
                Database
              </div>
            )}
            {canAccessModule("vendor") && (
              <SidebarItem
                icon={<Building2 size={20} className="text-violet-300" />}
                label="Vendor Management"
                active={activeMenu === "vendor"}
                onClick={() => changeMenu("vendor")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {canAccessModule("material") && (
              <SidebarItem
                icon={<Package size={20} className="text-teal-300" />}
                label="Material"
                active={activeMenu === "material"}
                onClick={() => changeMenu("material")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}

            {(!sidebarCollapsed || isCompactViewport) && (
              <div className={`font-bold uppercase tracking-wider ${isCompactViewport ? "pt-2.5 pb-1 px-2.5 text-[9px] text-slate-400" : "pt-4 pb-2 px-4 text-xs text-slate-500"}`}>
                System
              </div>
            )}
            {canAccessModule("user-manual") && (
              <>
                {(!sidebarCollapsed || isCompactViewport) && (
                  <div className={`font-bold uppercase tracking-wider ${isCompactViewport ? "pt-2.5 pb-1 px-2.5 text-[9px] text-slate-400" : "pt-4 pb-2 px-4 text-xs text-slate-500"}`}>
                    Help
                  </div>
                )}
                <SidebarItem
                  icon={<BookOpen size={20} className="text-cyan-300" />}
                  label="User Manual"
                  active={activeMenu === "user-manual"}
                  onClick={() => changeMenu("user-manual")}
                  collapsed={sidebarCollapsed}
                  dense={sidebarDense}
                />
              </>
            )}
            {canAccessModule("profile") && (
              <SidebarItem
                icon={<User size={20} />}
                label="ข้อมูลส่วนตัว (Profile)"
                active={activeMenu === "profile"}
                onClick={() => changeMenu("profile")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
            {canAccessModule("admin") && (
              <SidebarItem
                icon={<Shield size={20} />}
                label="ผู้ดูแลระบบ (Admin)"
                active={activeMenu === "admin"}
                onClick={() => changeMenu("admin")}
                collapsed={sidebarCollapsed}
                dense={sidebarDense}
              />
            )}
          </nav>
          <div className={`${isCompactViewport ? "border-t border-slate-200" : "border-t border-slate-800"} shrink-0 flex items-center justify-center gap-1 ${isCompactViewport ? "p-2.5" : sidebarCollapsed ? "py-2 px-1" : "p-4"}`}>
            <button
              type="button"
              onClick={toggleSidebar}
              className={`p-2 rounded-lg transition-colors ${isCompactViewport ? "text-slate-500 hover:text-slate-700 hover:bg-slate-100" : "text-slate-400 hover:text-white hover:bg-slate-800"}`}
              title={isCompactViewport ? "ปิดแถบเมนู" : sidebarCollapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
            >
              {isCompactViewport ? <ChevronLeft size={18} /> : sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
            {(!sidebarCollapsed || isCompactViewport) && (
              <span className={`text-center flex-1 ${isCompactViewport ? "text-[9px] text-slate-400" : "text-[10px] text-slate-500"}`}>CMG Budget Control V.20</span>
            )}
          </div>
        </aside>
      )}

      <main className="app-shell-main min-w-0 flex-1 flex flex-col overflow-hidden bg-slate-50/50">
        {!isFullScreenModalOpen && (
          <header className="bg-white/80 backdrop-blur-md shadow-sm px-3 py-2 md:px-5 md:py-2.5 flex flex-wrap items-center gap-2 md:gap-3 sticky top-0 z-20 border-b border-slate-100 overflow-visible">
            {isCompactViewport && (
              <button
                type="button"
                onClick={toggleSidebar}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-100 lg:hidden"
                title="เปิดเมนู"
              >
                <Menu size={16} />
              </button>
            )}
            <h1 className="min-w-0 flex-1 text-[15px] font-bold text-slate-800 flex items-center gap-2 md:flex-none md:text-lg">
              {activeMenu === "dashboard"
                ? "Dashboard"
                : activeMenu === "projects"
                  ? "จัดการโครงการ"
                  : activeMenu === "budget"
                    ? "Project Budget"
                    : activeMenu === "pr"
                      ? "Purchase Request (PR)"
                      : activeMenu === "po"
                        ? "Purchase Order (PO)"
                        : activeMenu === "vendor"
                          ? "Vendor Management"
                          : activeMenu === "material"
                            ? "Material"
                            : activeMenu === "invoice"
                              ? "Invoice"
                              : activeMenu === "billing"
                                ? "Billing"
                                : activeMenu === "pay"
                                  ? "Pay"
                              : activeMenu === "receive"
                                ? "Receive"
                                : activeMenu === "profile"
                                  ? "User Profile"
                                  : activeMenu === "admin"
                                    ? "Admin Dashboard"
                                  : activeMenu === "payment-subcontract"
                                    ? "Payment Subcontractor"
                                    : activeMenu === "budget-summary"
                                      ? "Budget Summary Report"
                                      : activeMenu === "project-spending"
                                        ? "Project Spending Separate Code"
                                      : activeMenu === "user-manual"
                                        ? "User Manual"
                                        : "Module View"}
            </h1>
            {!isCompactViewport && <div className="flex-1" />}

            {/* Project Cards — อยู่ขวา ก่อนกระดิ่ง ขยายออกซ้ายเมื่อมีโครงการเพิ่ม */}
            {(() => {
              const selectableProjects = activeMenu === "projects" || activeMenu === "budget"
                ? visibleProjects.filter((p) => p.status !== "Close")
                : visibleProjects.filter((p) => (p.status || "Active") === "Active");
              return moduleMenus && selectableProjects.length > 0;
            })() && (
              <div className={`${isCompactViewport ? "order-3 flex w-full overflow-x-auto overflow-y-visible no-scrollbar pt-1 pb-1" : "flex items-center gap-1.5 shrink-0"}`}>
                <div className={`${isCompactViewport ? "flex min-w-max items-center gap-1.5" : "flex items-center gap-1.5 shrink-0"}`}>
                  {(activeMenu === "projects" || activeMenu === "budget"
                    ? visibleProjects.filter((p) => p.status !== "Close")
                    : visibleProjects.filter((p) => (p.status || "Active") === "Active")
                  ).map((p) => {
                    const projPending = pendingByProject?.find((x) => x.projectId === p.id);
                    const pendingTotal = projPending?.total || 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedProjectId(p.id)}
                        title={p.name}
                        className={`relative flex-shrink-0 rounded-lg font-extrabold transition-all text-center flex items-center justify-center break-all ${isCompactViewport ? "w-8 h-8 px-0.5 text-[9px]" : "w-9 h-9 px-0.5 text-[10px]"
                          } ${selectedProjectId === p.id
                            ? "bg-orange-500 text-white shadow-md scale-105"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                          }`}
                      >
                        {(() => {
                          if (!p.jobNo) return (p.name || "?").slice(0, 4);
                          const segs = String(p.jobNo).trim().split("-");
                          const last = segs.pop() || "";
                          // 3-digit pure number (e.g. "072") → strip 1 leading zero → "72"
                          const compact = /^0\d{2}$/.test(last) ? last.slice(1) : last;
                          return "J" + compact;
                        })()}
                        {pendingTotal > 0 && (
                          <span className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5 shadow animate-pulse">
                            {pendingTotal > 99 ? "99+" : pendingTotal}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={`flex items-center gap-2 shrink-0 ${isCompactViewport ? "ml-auto" : "gap-2.5"}`}>
              {/* Bell notification button */}
              <div className="relative">
                <button
                  onClick={() => setIsBellOpen(!isBellOpen)}
                  className={`relative text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors ${isCompactViewport ? "p-2" : "p-1.5"}`}
                  title="รายการรออนุมัติ"
                >
                  <Bell size={18} />
                  {totalPendingCount > 0 && (
                    <span className="absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-md animate-pulse">
                      {totalPendingCount > 99 ? "99+" : totalPendingCount}
                    </span>
                  )}
                </button>
                <AnimatePresence>
                  {isBellOpen && (
                    <motion.div
                      className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                      <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                        <span className="text-sm font-bold flex items-center gap-2">
                          <Bell size={14} /> รายการรออนุมัติ
                        </span>
                        <span className="bg-red-500 text-[10px] font-bold rounded-full px-2 py-0.5">
                          {totalPendingCount} รายการ
                        </span>
                      </div>
                      {pendingByProject.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 text-sm">
                          ไม่มีรายการรออนุมัติ
                        </div>
                      ) : (
                        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                          {pendingByProject.map((item) => (
                            <button
                              key={item.projectId}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                              onClick={() => {
                                setSelectedProjectId(item.projectId);
                                handleMenuChange("budget");
                                setBudgetCategory("OVERVIEW");
                                setScrollToPendingAfterRender(true);
                                setIsBellOpen(false);
                              }}
                            >
                              <div className="text-xs font-bold text-slate-800 truncate">
                                {item.projectName}
                              </div>
                              <div className="flex gap-2 mt-1">
                                {item.budgets > 0 && (
                                  <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                    Budget: {item.budgets}
                                  </span>
                                )}
                                {item.prs > 0 && (
                                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                    PR: {item.prs}
                                  </span>
                                )}
                                {item.pos > 0 && (
                                  <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                    PO: {item.pos}
                                  </span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="relative shrink-0" ref={profileDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen((o) => !o)}
                  className={`flex items-center rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200/80 transition-colors ${isCompactViewport ? "gap-1.5 px-2 py-1.5" : "gap-2 px-2.5 py-1"
                    }`}
                  title="โปรไฟล์"
                >
                  <ProfileAvatar
                    src={userData?.profilePhotoUrl || user?.photoURL}
                    className={`${isCompactViewport ? "w-8 h-8" : "w-7 h-7"} rounded-full object-cover border border-slate-300`}
                    fallback={
                      <div className={`${isCompactViewport ? "w-8 h-8" : "w-7 h-7"} bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md`}>
                        {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                      </div>
                    }
                  />
                  <ChevronDown size={14} className="text-slate-500" />
                </button>
                <AnimatePresence>
                  {profileDropdownOpen && (
                    <motion.div
                      className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1 z-50"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          changeMenu("profile");
                          setProfileDropdownOpen(false);
                        }}
                      >
                        <User size={16} /> อัพเดทโปรไฟล์
                      </button>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                      >
                        <LogOut size={16} /> ออกจากระบบ
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>
        )}
        <div
          className={`app-shell-content ${["projects", "budget", "pr", "po", "payment-subcontract", "vendor", "material", "invoice", "billing", "pay", "receive", "admin", "budget-summary", "project-spending", "user-manual"].includes(
            activeMenu
          )
            ? "p-3 pt-4 md:p-6 w-full max-w-none min-w-0"
            : "p-3 pt-4 md:p-8 max-w-[1600px] mx-auto"
            }`}
        >
          {!rolePermissionsReady ? (
            <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
              <svg className="animate-spin w-5 h-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" strokeOpacity=".25" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
              <span className="text-sm">กำลังโหลด...</span>
            </div>
          ) : (
            <motion.div
              key={activeMenu}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <div data-menu-page="dashboard" style={{ display: activeMenu === "dashboard" ? undefined : "none" }}>
                {activeMenu === "dashboard" && <DashboardView />}
              </div>
              <div data-menu-page="projects" style={{ display: activeMenu === "projects" ? undefined : "none" }}>
                {activeMenu === "projects" && <ProjectsView />}
              </div>
              <div data-menu-page="budget" style={{ display: activeMenu === "budget" ? undefined : "none" }}>
                {activeMenu === "budget" && <BudgetView />}
              </div>
              <div data-menu-page="pr" style={{ display: activeMenu === "pr" ? undefined : "none" }}>
                {activeMenu === "pr" && (
                  <>
                    <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm border border-slate-200 p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setPrTab("system")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${prTab === "system"
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><FileText size={16} /> ระบบ PR</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrTab("table")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${prTab === "table"
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><FileSpreadsheet size={16} /> Log PR</span>
                      </button>
                    </div>
                    {prTab === "system" && <PRView />}
                    {prTab === "table" && (
                      <PRPOTableView
                        mode="pr"
                        prs={prs}
                        pos={pos}
                        budgets={budgets}
                        projects={projects}
                        vendors={vendors}
                        columnWidths={columnWidths}
                        handleColumnResize={handleColumnResize}
                        userRole={userRole}
                        updateData={updateData}
                        deleteData={deleteData}
                        showAlert={showAlert}
                        openConfirm={openConfirm}
                        selectedProjectId={selectedProjectId}
                      />
                    )}
                  </>
                )}
              </div>
              <div data-menu-page="po" style={{ display: activeMenu === "po" ? undefined : "none" }}>
                {activeMenu === "po" && (
                  <>
                    <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm border border-slate-200 p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setPoTab("system")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${poTab === "system"
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><ShoppingCart size={16} /> ระบบ PO</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPoTab("table")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${poTab === "table"
                          ? "bg-blue-600 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><FileSpreadsheet size={16} /> Log PO</span>
                      </button>
                    </div>
                    {poTab === "system" && <POView />}
                    {poTab === "table" && (
                      <PRPOTableView
                        mode="po"
                        prs={prs}
                        pos={pos}
                        budgets={budgets}
                        projects={projects}
                        vendors={vendors}
                        columnWidths={columnWidths}
                        handleColumnResize={handleColumnResize}
                        userRole={userRole}
                        updateData={updateData}
                        deleteData={deleteData}
                        showAlert={showAlert}
                        openConfirm={openConfirm}
                        selectedProjectId={selectedProjectId}
                      />
                    )}
                  </>
                )}
              </div>
              <div data-menu-page="payment-subcontract" style={{ display: activeMenu === "payment-subcontract" ? undefined : "none" }}>
                {activeMenu === "payment-subcontract" && (
                  <>
                    <div className="flex items-center gap-1 mb-4 bg-white rounded-xl shadow-sm border border-slate-200 p-1 w-fit">
                      <button
                        type="button"
                        onClick={() => setPaymentSubTab("system")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${paymentSubTab === "system"
                          ? "bg-orange-500 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><CreditCard size={16} />Payment Subcontractor</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentSubTab("table")}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${paymentSubTab === "table"
                          ? "bg-orange-500 text-white shadow"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                          }`}
                      >
                        <span className="flex items-center gap-2"><FileSpreadsheet size={16} />Log Payment</span>
                      </button>
                    </div>
                    {paymentSubTab === "system" && <PaymentView />}
                    {paymentSubTab === "table" && <PaymentTableView />}
                  </>
                )}
              </div>
              <div data-menu-page="vendor" style={{ display: activeMenu === "vendor" ? undefined : "none" }}>
                {activeMenu === "vendor" && <VendorView />}
              </div>
              <div data-menu-page="material" style={{ display: activeMenu === "material" ? undefined : "none" }}>
                {activeMenu === "material" && <MaterialView />}
              </div>
              <div data-menu-page="invoice" style={{ display: activeMenu === "invoice" ? undefined : "none" }}>
                {activeMenu === "invoice" && <InvoiceView menuType="invoice" />}
              </div>
              <div data-menu-page="billing" style={{ display: activeMenu === "billing" ? undefined : "none" }}>
                {activeMenu === "billing" && <BillingPayView menuType="billing" />}
              </div>
              <div data-menu-page="pay" style={{ display: activeMenu === "pay" ? undefined : "none" }}>
                {activeMenu === "pay" && <BillingPayView menuType="pay" />}
              </div>
              <div data-menu-page="receive" style={{ display: activeMenu === "receive" ? undefined : "none" }}>
                {activeMenu === "receive" && <ReceiveView />}
              </div>
              {activeMenu === "user-manual" && canAccessModule("user-manual") && (
                <div data-menu-page="user-manual">
                  <UserManualView />
                </div>
              )}
              {activeMenu === "budget-summary" && canAccessModule("budget-summary") && (
                <div data-menu-page="budget-summary">
                  <BudgetSummaryReportView />
                </div>
              )}
              {activeMenu === "project-spending" && canAccessModule("project-spending") && (
                <div data-menu-page="project-spending">
                  <ProjectSpendingView />
                </div>
              )}
              {activeMenu === "profile" && (
                <div data-menu-page="profile">
                  <UserProfile />
                </div>
              )}
              {activeMenu === "admin" && canAccessModule("admin") && (
                <div data-menu-page="admin">
                  <AdminDashboard />
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

// --- Sidebar Group (expandable sub-menu) ---
const SidebarGroup = ({ icon, label, isActive, children, collapsed }) => {
  const [open, setOpen] = React.useState(isActive);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const [popoverPos, setPopoverPos] = React.useState({ top: 0, left: 0 });
  const groupRef = React.useRef(null);
  React.useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  if (collapsed) {
    const handleBtnClick = () => {
      if (groupRef.current) {
        const rect = groupRef.current.getBoundingClientRect();
        setPopoverPos({ top: rect.top, left: rect.right + 6 });
      }
      setPopoverOpen((p) => !p);
    };

    return (
      <div className="relative" ref={groupRef}>
        <motion.button
          onClick={handleBtnClick}
          title={label}
          className={`relative w-full flex items-center justify-center p-3 rounded-lg group ${isActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {isActive && (
            <motion.div
              layoutId="sidebarGroupActive"
              className="absolute inset-0 rounded-lg bg-slate-700 -z-10"
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
            />
          )}
          <span className="relative z-10">{icon}</span>
        </motion.button>
        {ReactDOM.createPortal(
          <>
            {/* backdrop — รับ click นอก popup เพื่อปิด, z-index ต่ำกว่า popup */}
            {popoverOpen && (
              <div
                style={{ position: "fixed", inset: 0, zIndex: 9998 }}
                onClick={() => setPopoverOpen(false)}
                aria-hidden
              />
            )}
            {/* popup menu — z-index สูงกว่า backdrop ทำให้รับ click ได้ */}
            <AnimatePresence>
              {popoverOpen && (
                <motion.div
                  key="sidebar-group-popup"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left, zIndex: 9999 }}
                  className="min-w-[180px] py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
                  <div className="p-1 space-y-0.5">
                    {React.Children.map(children, (child) =>
                      React.isValidElement(child) && child.props?.onClick
                        ? React.cloneElement(child, {
                          onClick: () => {
                            child.props.onClick?.();
                            setPopoverOpen(false);
                          },
                        })
                        : child
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>,
          document.body
        )}
      </div>
    );
  }

  return (
    <div>
      <motion.button
        onClick={() => setOpen((p) => !p)}
        className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg group ${isActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {isActive && (
          <motion.div
            layoutId="sidebarGroupActive"
            className="absolute inset-0 rounded-lg bg-slate-700 -z-10"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <span className="relative z-10">{icon}</span>
        <span className="font-medium text-sm flex-1 text-left relative z-10">{label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="relative z-10"
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SidebarSubItem = ({ label, active, onClick }) => (
  <motion.button
    onClick={onClick}
    className={`relative w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium overflow-hidden text-left ${active ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-700/60"}`}
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.97 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
  >
    {active && (
      <motion.div
        layoutId="sidebarSubActive"
        className="absolute inset-0 bg-blue-600/90 rounded-md shadow-md"
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      />
    )}
    <span className="relative z-10 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current opacity-80" />
    <span className="relative z-10">{label}</span>
  </motion.button>
);

// --- PR / PO Combined Table View ---
const PRPOTableView = ({ mode, prs, pos, budgets, projects, vendors, columnWidths, handleColumnResize, userRole, updateData, deleteData, showAlert, openConfirm, selectedProjectId }: {
  mode: "pr" | "po";
  prs: any[];
  pos: any[];
  budgets: any[];
  projects: any[];
  vendors?: any[];
  columnWidths?: Record<string, Record<string, number>>;
  handleColumnResize?: (tableId: string, colKey: string, width: number) => void;
  userRole?: string;
  updateData?: (collection: string, id: string, data: any) => Promise<boolean>;
  deleteData?: (collection: string, id: string) => Promise<boolean>;
  showAlert?: (title: string, message: string, type: string) => void;
  openConfirm?: (title: string, message: string, onConfirm: () => void | Promise<void>, variant?: string) => void;
  selectedProjectId?: string | null;
}) => {
  const { canUseFunction, userRoles = [], userData, user, logAction, isColumnVisible, invoices = [], receives = [] } = useAppData();
  const PAGE_SIZE = 50;
  const ALL_TYPE_TAB_KEY = "__all__";
  const tableModule = mode === "pr" ? "pr-table" : "po-table";
  const tblId = mode === "pr" ? "pr-table" : "po-table";
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterProject, setFilterProject] = React.useState(selectedProjectId || "all");
  const [activeTypeTab, setActiveTypeTab] = React.useState("");
  const [currentPage, setCurrentPage] = React.useState(1);

  // ซิงก์ filterProject เมื่อ selectedProjectId เปลี่ยน (เช่นกดเปลี่ยนโครงการที่ header)
  React.useEffect(() => {
    setFilterProject(selectedProjectId || "all");
  }, [selectedProjectId]);
  const [emailModal, setEmailModal] = React.useState<{ doc: any; kind: "pr" | "po" } | null>(null);
  const [emailTo, setEmailTo] = React.useState("");
  const [pdfLoadingId, setPdfLoadingId] = React.useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = React.useState<string | null>(null);
  const [isReturnBalanceModalOpen, setIsReturnBalanceModalOpen] = React.useState(false);
  const [returnBalanceContext, setReturnBalanceContext] = React.useState<any>(null);
  const [returnBalanceValue, setReturnBalanceValue] = React.useState("");
  const [returnBalanceReason, setReturnBalanceReason] = React.useState("");

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

  const isPR = mode === "pr";
  const canViewPrBalance = isPR && canUseFunction("pr-table", "viewBalance");
  const canReturnPrBalance = isPR && canUseFunction("pr-table", "returnBalance");

  const getRelatedInvoicesForPo = React.useCallback((po: any) => {
    if (!po) return [];
    const poNo = String(po.poNo || "").trim();
    return invoices.filter((inv: any) =>
      inv?.poId === po.id ||
      (poNo && [inv?.poNo, inv?.poRef].some((value) => String(value || "").trim() === poNo))
    );
  }, [invoices]);

  const getRelatedReceivesForPo = React.useCallback((po: any) => {
    if (!po) return [];
    const poNo = String(po.poNo || "").trim();
    return receives.filter((rcv: any) =>
      rcv?.poId === po.id ||
      (poNo && String(rcv?.poNo || "").trim() === poNo)
    );
  }, [receives]);

  const handleActivePO = React.useCallback(async (po: any) => {
    if (!po || po.status !== "Closed PO") return false;
    try {
      const relatedInvoices = getRelatedInvoicesForPo(po);
      const relatedReceives = getRelatedReceivesForPo(po);

      for (const receive of relatedReceives) {
        if (receive?.pdfPath) await deleteGeneratedPdf(receive.pdfPath);
      }

      for (const invoice of relatedInvoices) {
        const deleted = await deleteData?.("invoices", invoice.id, { skipLog: true });
        if (!deleted) throw new Error(`ลบ Invoice ${invoice.invNo || invoice.id} ไม่สำเร็จ`);
      }

      for (const receive of relatedReceives) {
        const deleted = await deleteData?.("receives", receive.id, { skipLog: true });
        if (!deleted) throw new Error(`ลบ Receive ${receive.rpNo || receive.receiveNo || receive.id} ไม่สำเร็จ`);
      }

      const resumed = await updateData?.("pos", po.id, {
        status: "Approved",
        statusNow: "Approved",
        closeRequestedAt: null,
      }, { skipLog: true });
      if (!resumed) throw new Error(`คืนสถานะ PO ${po.poNo || po.id} ไม่สำเร็จ`);

      await logAction?.(
        "Approve Active PO",
        `คืนสถานะ PO ${po.poNo || po.id}: Closed PO → Approved, ลบ ${relatedInvoices.length} Invoice และ ${relatedReceives.length} Receive`,
        po.projectId
      );
      showAlert?.(
        "สำเร็จ",
        `PO ${po.poNo || po.id} กลับเป็น Approved แล้ว และลบ ${relatedInvoices.length} Invoice / ${relatedReceives.length} Receive เรียบร้อย`,
        "success"
      );
      return true;
    } catch (e: any) {
      showAlert?.("คืนสถานะ PO ไม่สำเร็จ", errMsg(e), "error");
      return false;
    }
  }, [deleteData, getRelatedInvoicesForPo, getRelatedReceivesForPo, logAction, showAlert, updateData]);

  const prPoTableWrapRef = React.useRef(null);
  const resizeFn = handleColumnResize || ((_tid: string, _k: string, _w: number) => { });
  const prTableLayout = useProportionalTableLayout({
    tableId: "pr-table",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["pr-table"],
    savedWidths: columnWidths?.["pr-table"],
    containerRef: prPoTableWrapRef,
    enabled: isPR,
    driftKey: "description",
    handleColumnResize: resizeFn,
  });
  const poTableLayout = useProportionalTableLayout({
    tableId: "po-table",
    defaultWeights: TABLE_LAYOUT_DEFAULTS["po-table"],
    savedWidths: columnWidths?.["po-table"],
    containerRef: prPoTableWrapRef,
    enabled: !isPR,
    driftKey: "project",
    handleColumnResize: resizeFn,
  });
  const onPrPoTableResize = useMemo(
    () => chainTableResizeHandlers(prTableLayout.handleResize, poTableLayout.handleResize),
    [prTableLayout.handleResize, poTableLayout.handleResize]
  );
  const prPoScaled = isPR ? prTableLayout.scaled : poTableLayout.scaled;

  const errMsg = (e: any): string => {
    if (!e) return "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ";
    if (typeof e === "string") return e;
    if (e?.message) return String(e.message);
    if (e?.code) return String(e.code);
    try { return JSON.stringify(e); } catch { return "เกิดข้อผิดพลาด"; }
  };

  const statusColors: Record<string, string> = {
    "Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "PO Issued": "bg-teal-50 text-teal-700 border-teal-200",
    "Pending Close": "bg-amber-50 text-amber-700 border-amber-200",
    "Closed PR": "bg-slate-100 text-slate-600 border-slate-300",
    "Closed PR Auto": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Pending Close PO": "bg-amber-50 text-amber-700 border-amber-200",
    "Wait Invoice": "bg-amber-50 text-amber-800 border-amber-300",
    "Invoice Issue": "bg-violet-50 text-violet-700 border-violet-200",
    "Received": "bg-emerald-100 text-emerald-800 border-emerald-300",
    "Closed PO": "bg-slate-100 text-slate-600 border-slate-300",
    "Edit Budget": "bg-red-100 text-red-800 border-red-300",
    "Pending MD": "bg-purple-50 text-purple-700 border-purple-200",
    "Pending GM": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Pending PM": "bg-blue-50 text-blue-700 border-blue-200",
    "Pending CM": "bg-cyan-50 text-cyan-700 border-cyan-200",
    "Pending PCM": "bg-orange-50 text-orange-700 border-orange-200",
    "PO Edit Pending PCM": "bg-amber-50 text-amber-900 border-amber-300",
    "PO Edit Pending GM": "bg-violet-50 text-violet-800 border-violet-300",
    "Pending Active PR": "bg-teal-50 text-teal-800 border-teal-300",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Draft": "bg-slate-50 text-slate-500 border-slate-200",
    "Paid": "bg-teal-50 text-teal-700 border-teal-200",
    "Partial": "bg-yellow-50 text-yellow-700 border-yellow-200",
  };

  const getBudgetDesc = (costCode: string, projectId: string) =>
    budgets.find((b) => b.code === costCode && b.projectId === projectId)?.description || "-";

  const getPrBudgetItemName = (pr: any) => {
    const headerBudgetItem = pr?.budgetId
      ? budgets.find((b: any) => b.id === pr.budgetId && b.projectId === pr.projectId)
      : pr?.costCode
        ? budgets.find((b: any) => b.code === pr.costCode && b.projectId === pr.projectId)
        : null;

    if (!headerBudgetItem) return "";

    const mainDesc = headerBudgetItem.description || "";
    const subItemId = pr?.selectedSubItemId || pr?.subItemId
      || pr?.items?.[0]?.subItemId || pr?.items?.[0]?.budgetSubItemId;

    let subDesc = "";
    if (subItemId && headerBudgetItem?.subItems?.length > 0) {
      const sub = headerBudgetItem.subItems.find((s: any) => s.id === subItemId);
      subDesc = sub?.description || "";
    }

    return mainDesc && subDesc ? `${mainDesc} + ${subDesc}` : (mainDesc || subDesc || "");
  };

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || projectId;

  const getPoLinkedPrMeta = useCallback((po: any) => {
    if (!po) return { prNos: [], costCodes: [] };

    const itemPrIds = Array.isArray(po.items)
      ? po.items.flatMap((item: any) => {
        const directPrId = item?.prId ? [item.prId] : [];
        const disPrIds = Array.isArray(item?.disPrAllocations)
          ? item.disPrAllocations.map((a: any) => a?.prId).filter(Boolean)
          : [];
        return [...directPrId, ...disPrIds];
      })
      : [];
    const selectedPrIds = Array.isArray(po.selectedPrIds) ? po.selectedPrIds.filter(Boolean) : [];
    const prRefIds = po.prRefId ? [po.prRefId] : [];
    const allPrIds = [...new Set([...itemPrIds, ...selectedPrIds, ...prRefIds])];

    const linkedPrs = allPrIds
      .map((prId: string) => prs.find((pr: any) => pr.id === prId))
      .filter(Boolean);

    const itemPrNos = Array.isArray(po.items)
      ? po.items.map((item: any) => item?.prNo).filter(Boolean)
      : [];

    const prNos = [...new Set([...linkedPrs.map((pr: any) => pr.prNo).filter(Boolean), ...itemPrNos])];
    const costCodes = [...new Set([
      ...linkedPrs.map((pr: any) => pr.costCode).filter(Boolean),
      ...(po.costCode ? [po.costCode] : []),
    ])];

    return { prNos, costCodes };
  }, [prs]);

  const getPrBalanceAmount = React.useCallback((pr: any) => {
    return getPrBudgetReturnInfo(pr, pos).returnAmount;
  }, [pos]);

  const handleReturnPrBalanceToBudget = React.useCallback((pr: any) => {
    if (!pr?.id) return;
    if (!canReturnPrBalance) {
      showAlert?.("ไม่มีสิทธิ์", "คุณไม่มีสิทธิ์คืน Balance PR", "warning");
      return;
    }

    const info = getPrBudgetReturnInfo(pr, pos);
    if (info.returnAmount <= 0) {
      showAlert?.("ไม่มี Balance ให้คืน", "ยอด PR ปัจจุบันไม่มากกว่า PO Sub Total ที่ใช้ไปแล้ว", "info");
      return;
    }

    const prNo = pr.prNo || pr.id;
    openConfirm?.(
      "คืน Balance PR กลับ Budget",
      `PR: ${prNo}\nยอด PR ปัจจุบัน: ${formatCurrency(info.currentTotal)}\nPO Sub Total ที่ใช้ไปแล้ว: ${formatCurrency(info.poSubTotalUsed ?? info.poGrandTotalUsed)}\nยอดที่จะคืน Budget: ${formatCurrency(info.returnAmount)}\nยอด PR หลัง Rev: ${formatCurrency(info.revisedTotal)}\n\nระบบจะคง PR ID / PR No. เดิม และแก้เฉพาะยอดตัวเลขกับประวัติ Rev ของ PR นี้`,
      () => {
        setReturnBalanceContext({ prId: pr.id });
        setReturnBalanceValue(formatReturnBalanceFixed2(Math.round(Number(info.returnAmount || 0) * 100) / 100));
        setReturnBalanceReason("");
        setIsReturnBalanceModalOpen(true);
      },
      "warning"
    );
  }, [budgets, canReturnPrBalance, logAction, openConfirm, pos, prs, showAlert, updateData, user?.email, userData, userRole]);

  const handleConfirmReturnBalance = React.useCallback(async () => {
    const prId = returnBalanceContext?.prId;
    if (!prId) return;
    const latestPr = prs.find((p: any) => p.id === prId);
    if (!latestPr) {
      showAlert?.("ไม่พบ PR", "ไม่พบข้อมูล PR ล่าสุด", "warning");
      return;
    }

    const latestInfo = getPrBudgetReturnInfo(latestPr, pos);
    const maxReturnRaw = Number(latestInfo.returnAmount || 0);
    const maxReturn = Math.max(0, Math.round(maxReturnRaw * 100) / 100);
    if (maxReturn <= 0) {
      showAlert?.("ไม่มี Balance ให้คืน", "ข้อมูลล่าสุดไม่มียอดคงเหลือที่สามารถคืน Budget ได้", "info");
      setIsReturnBalanceModalOpen(false);
      setReturnBalanceContext(null);
      setReturnBalanceValue("");
      setReturnBalanceReason("");
      return;
    }

    const requestedRaw = parseReturnBalanceInput(returnBalanceValue);
    const requested = Math.round(requestedRaw * 100) / 100;
    if (!Number.isFinite(requested) || requested <= 0) {
      showAlert?.("ยอดไม่ถูกต้อง", "กรุณากรอกยอดเงินที่ต้องการคืนมากกว่า 0", "warning");
      return;
    }
    if (requested > maxReturn) {
      showAlert?.("ยอดเกิน Balance", `คืนได้สูงสุด ${formatCurrency(maxReturn)} เท่านั้น`, "warning");
      return;
    }
    const reason = (returnBalanceReason || "").trim();
    if (!reason) {
      showAlert?.("กรุณาระบุเหตุผล", "กรุณากรอกเหตุผลการคืน Budget จาก PR", "warning");
      return;
    }

    const revisedTotalRaw = Math.max(0, latestInfo.currentTotal - requested);
    const revisedTotal = Math.round(revisedTotalRaw * 100) / 100;
    const nextStatus = revisedTotal <= 0 ? "Closed PR Auto" : (latestPr.status || "Approved");
    const history = Array.isArray(latestPr.budgetReturnRevisions)
      ? latestPr.budgetReturnRevisions
      : [];
    const byName = userData
      ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim()
      : "";
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
    const payload = {
      items: scalePrItemsToTotal(latestPr.items || [], revisedTotal),
      totalAmount: revisedTotal,
      amount: revisedTotal,
      status: nextStatus,
      budgetReturnRevisions: [...history, revision],
      budgetReturnRevNo: revision.revNo,
      lastBudgetReturnAt: revision.at,
      lastBudgetReturnAmount: requested,
      lastBudgetReturnReason: reason,
    };

    const ok = await updateData?.("prs", latestPr.id, payload, { skipLog: true });
    if (!ok) return;

    const budget = latestPr.budgetId
      ? budgets.find((b: any) => b.id === latestPr.budgetId)
      : budgets.find((b: any) => b.projectId === latestPr.projectId && b.code === latestPr.costCode);
    if (budget?.id) {
      const usedAmount = computeBudgetUsedAfterPrRevision(prs, latestPr, revisedTotal);
      await updateData?.("budgets", budget.id, { usedAmount }, { skipLog: true });
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
      await updateData?.("budgets", budget.id, { budgetReturnNotifications: [...returnNotifications, notification] }, { skipLog: true });
    }

    await logAction?.(
      "Rev PR Return Balance",
      `Rev PR ${latestPr.prNo || latestPr.id}: คืน Budget ${formatCurrency(requested)} (${formatCurrency(latestInfo.currentTotal)} → ${formatCurrency(revisedTotal)}, PO Sub Total ${formatCurrency(latestInfo.poSubTotalUsed ?? latestInfo.poGrandTotalUsed)})`,
      latestPr.projectId
    );
    setIsReturnBalanceModalOpen(false);
    setReturnBalanceContext(null);
    setReturnBalanceValue("");
    setReturnBalanceReason("");
    showAlert?.("คืนยอดสำเร็จ", `คืน Budget จาก PR ${latestPr.prNo || latestPr.id} จำนวน ${formatCurrency(requested)} แล้ว (รอรับยอดใน Budget)`, "success");
  }, [budgets, logAction, pos, prs, returnBalanceContext?.prId, returnBalanceReason, returnBalanceValue, showAlert, updateData, user?.email, userData, userRole]);

  const allStatuses = isPR
    ? ["Approved", "PO Issued", "Edit Budget", "Pending Close", "Closed PR", "Closed PR Auto", "Pending Active PR", "Pending MD", "Pending GM", "Pending PM", "Pending CM", "Rejected"]
    : ["Approved", "Pending PCM", "Pending GM", "PO Edit Pending PCM", "PO Edit Pending GM", "Rejected", "Paid", "Partial", "Draft", "Pending Close PO", "Wait Invoice", "Invoice Issue", "Received", "Closed PO"];

  const handlePRDownloadPDF = (pr: any) => {
    const docId = pr.id || pr.prNo || "pr";
    setPdfLoadingId(docId);
    (async () => {
      try {
        const projName = getProjectName(pr.projectId);
        const budgetDesc = getBudgetDesc(pr.costCode, pr.projectId);
        const bytes = await generatePRPdfBytes(pr, { projectName: projName, budgetDesc });
        downloadBytes(bytes, `PR-${pr.prNo || pr.id || "unknown"}.pdf`);
        showAlert?.("สำเร็จ", `ดาวน์โหลด PDF เรียบร้อย`, "success");
      } catch (e: any) {
        console.error("[PDF PR] error:", e);
        showAlert?.("PDF ไม่สำเร็จ", errMsg(e), "error");
      } finally {
        setPdfLoadingId(null);
      }
    })();
  };

  const handlePRSendEmail = (pr: any, email: string) => {
    if (!email || !email.includes("@")) { showAlert?.("ข้อมูลไม่ครบ", "กรุณากรอกอีเมลปลายทางที่ถูกต้อง", "warning"); return; }
    const docId = pr.id || pr.prNo || "pr";
    setPdfLoadingId(docId);
    setEmailModal(null);
    setEmailTo("");
    (async () => {
      try {
        const projName = getProjectName(pr.projectId);
        const budgetDesc = getBudgetDesc(pr.costCode, pr.projectId);
        const bytes = await generatePRPdfBytes(pr, { projectName: projName, budgetDesc });
        const path = `generated/pr/${pr.prNo || pr.id || "unknown"}.pdf`;
        const url = await uploadGeneratedPdf(bytes, path);
        const subject = encodeURIComponent(`PR ${pr.prNo || pr.id}`);
        const body = encodeURIComponent(`แนบลิงก์ไฟล์ PDF (ดาวน์โหลด):\n${url}\n\n*ไฟล์นี้ถูกสร้างจากแบบฟอร์ม PR ในระบบ`);
        window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`, "_blank");
        try { await navigator.clipboard.writeText(url); } catch (_) { }
        showAlert?.("เตรียมอีเมลแล้ว", "เปิดหน้าส่งเมลให้แล้ว และคัดลอกลิงก์ PDF เรียบร้อย", "success");
      } catch (e: any) {
        console.error("[Email PR] error:", e);
        showAlert?.("ส่งเมลไม่สำเร็จ", errMsg(e), "error");
      } finally {
        setPdfLoadingId(null);
      }
    })();
  };

  const handlePODownloadPDF = (po: any) => {
    if (po.pdfUrl) {
      window.open(po.pdfUrl, "_blank");
    } else {
      showAlert?.("ไม่พบ PDF", "ยังไม่มี PDF สำหรับ PO นี้ — ลองบันทึก PO ใหม่อีกครั้ง หรือตรวจสอบ Firebase Storage Rules", "info");
    }
  };

  const handlePOSendEmail = (po: any, email: string) => {
    if (!email || !email.includes("@")) { showAlert?.("ข้อมูลไม่ครบ", "กรุณากรอกอีเมลปลายทางที่ถูกต้อง", "warning"); return; }
    if (!po.pdfUrl) {
      showAlert?.("ไม่พบ PDF", "ยังไม่มี PDF สำหรับ PO นี้ — ลองบันทึก PO ใหม่อีกครั้ง", "warning");
      setEmailModal(null); setEmailTo(""); return;
    }
    const subject = encodeURIComponent(`PO ${po.poNo || po.id}`);
    const body = encodeURIComponent(`แนบลิงก์ไฟล์ PDF (ดาวน์โหลด):\n${po.pdfUrl}\n\n*ไฟล์นี้ถูกสร้างจากแบบฟอร์ม PO ในระบบ`);
    window.open(`mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`, "_blank");
    try { navigator.clipboard.writeText(po.pdfUrl); } catch (_) { }
    setEmailModal(null); setEmailTo("");
    showAlert?.("เตรียมอีเมลแล้ว", "เปิดหน้าส่งเมลให้แล้ว และคัดลอกลิงก์ PDF เรียบร้อย", "success");
  };

  const rows = isPR ? prs : pos;

  const filtered = React.useMemo(() => rows.filter((r: any) => {
    const noField = isPR ? r.prNo : r.poNo;
    const lowerSearch = (searchTerm || "").toLowerCase();
    const poRefText = isPR
      ? pos
        .filter((po: any) =>
          (po.selectedPrIds || []).includes(r.id) ||
          (po.items || []).some((it: any) => it.prId === r.id) ||
          po.prRefId === r.id
        )
        .map((po: any) => po.poNo || po.id)
        .filter(Boolean)
        .join(", ")
      : "";
    const poLinkedMeta = !isPR ? getPoLinkedPrMeta(r) : { prNos: [], costCodes: [] };
    const poProjectName = !isPR ? getProjectName(r.projectId) : "";
    const poVendorName = !isPR
      ? (r.vendor || (vendors || []).find((v: any) => v.id === r.vendorId)?.name || "-")
      : "";
    const poDateText = !isPR ? String(r.poDate || r.createdDate || "") : "";
    const poItemCountText = !isPR ? String(r.items?.length || (r.selectedPrIds?.length || 0)) : "";
    const poAmountText = !isPR ? String(r.grandTotal ?? r.amount ?? 0) : "";
    const poSearchBlob = !isPR
      ? [
        noField,
        poProjectName,
        poVendorName,
        r.poType,
        poLinkedMeta.prNos.join(", "),
        poLinkedMeta.costCodes.join(", "),
        poDateText,
        poItemCountText,
        poAmountText,
        r.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      : "";
    const matchSearch =
      !lowerSearch ||
      (noField || "").toLowerCase().includes(lowerSearch) ||
      (r.costCode || "").toLowerCase().includes(lowerSearch) ||
      (r.requestor || r.vendor || "").toLowerCase().includes(lowerSearch) ||
      (poRefText || "").toLowerCase().includes(lowerSearch) ||
      (!isPR && poSearchBlob.includes(lowerSearch));
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchProject = filterProject === "all" || r.projectId === filterProject;
    return matchSearch && matchStatus && matchProject;
  }), [filterProject, filterStatus, getPoLinkedPrMeta, isPR, pos, projects, rows, searchTerm, vendors]);

  const getShortTypeLabel = React.useCallback((typeValue: any) => {
    const raw = String(typeValue || "").trim();
    if (!raw) return "N/A";
    const codePart = raw.includes(">") ? raw.split(">").pop()?.trim() || raw : raw;
    return codePart.replace(/\s*,\s*/g, "/").replace(/\s+/g, "");
  }, []);

  const typeTabs = React.useMemo(() => {
    const groups = new Map<string, { key: string; label: string; rows: any[] }>();
    filtered.forEach((row: any) => {
      const rawType = isPR ? row.purchaseType : row.poType;
      const key = String(rawType || "ไม่ระบุ Type");
      if (!groups.has(key)) {
        groups.set(key, { key, label: getShortTypeLabel(rawType), rows: [] });
      }
      groups.get(key)!.rows.push(row);
    });
    const tabs = Array.from(groups.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
    );
    return [...tabs, { key: ALL_TYPE_TAB_KEY, label: "All", rows: filtered }];
  }, [ALL_TYPE_TAB_KEY, filtered, getShortTypeLabel, isPR]);

  React.useEffect(() => {
    if (typeTabs.length === 0) {
      if (activeTypeTab) setActiveTypeTab("");
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    if (!typeTabs.some((tab) => tab.key === activeTypeTab)) {
      setActiveTypeTab(typeTabs[0].key);
      setCurrentPage(1);
    }
  }, [activeTypeTab, currentPage, typeTabs]);

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterProject, mode]);

  const activeTypeGroup = typeTabs.find((tab) => tab.key === activeTypeTab) || typeTabs[0] || null;
  const activeRows = activeTypeGroup?.rows || [];
  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = activeRows.slice(pageStart, pageStart + PAGE_SIZE);
  const pageFrom = activeRows.length === 0 ? 0 : pageStart + 1;
  const pageTo = Math.min(pageStart + PAGE_SIZE, activeRows.length);

  const allProjects = Array.from(new Set(rows.map((r: any) => r.projectId))).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-2 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${isPR ? "bg-slate-700" : "bg-red-600"}`}>
            {isPR ? <FileText size={18} className="text-white" /> : <ShoppingCart size={18} className="text-white" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">
                {isPR ? "Log PR" : "Log PO"}
              </h2>
              <ColumnVisibilityToggle tableId={tblId} />
            </div>
            <p className="text-xs text-slate-500">
              {activeRows.length} รายการในแท็บนี้ / {filtered.length} รายการทั้งหมด {filterStatus !== "all" ? `(${filterStatus})` : ""}
            </p>
          </div>
        </div>

        {typeTabs.length > 0 && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:px-3">
            {typeTabs.map((tab) => {
              const active = (activeTypeGroup?.key || "") === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveTypeTab(tab.key);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${active
                    ? isPR
                      ? "bg-slate-800 border-slate-800 text-white"
                      : "bg-red-600 border-red-600 text-white"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                >
                  {tab.label}
                  <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {tab.rows.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isPR ? "ค้นหา PR No., Cost Code, Ref PO..." : "ค้นหา PO ได้ทุกคอลัมน์ (PO, Vendor, Cost Code, Ref PR...)"}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">ทุกโครงการ</option>
            {allProjects.map((pid: string) => (
              <option key={pid} value={pid}>{getProjectName(pid)}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">ทุกสถานะ</option>
            {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden w-full min-w-0">
        <div ref={prPoTableWrapRef} className="w-full min-w-0 overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-xs table-fixed md:min-w-0">
            <thead>
              <tr className="bg-slate-800 text-white">
                {isColumnVisible(tblId, "action") && <th className="px-2 py-0.5 font-semibold text-left md:hidden" style={{ width: prPoScaled.action }}>Action</th>}
                {isColumnVisible(tblId, "rowNum") && <th className="px-2 py-0.5 font-semibold" style={{ width: prPoScaled.rowNum }}>#</th>}
                {isColumnVisible(tblId, "no") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="no" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.no}>{isPR ? "PR No." : "PO No."}</ResizableTh>}
                {isColumnVisible(tblId, "project") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="project" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.project}>โครงการ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "costCode") && <ResizableTh tableId="pr-table" colKey="costCode" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.costCode}>Cost Code</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "description") && <ResizableTh tableId="pr-table" colKey="description" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.description}>รายการงบ</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "costCode") && <ResizableTh tableId="po-table" colKey="costCode" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.costCode}>Cost Code</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "vendor") && <ResizableTh tableId="po-table" colKey="vendor" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.vendor}>Vendor</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "prRef") && <ResizableTh tableId="po-table" colKey="prRef" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.prRef}>Ref PR No.</ResizableTh>}
                {isColumnVisible(tblId, "date") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="date" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.date}>วันที่</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "requestor") && <ResizableTh tableId="pr-table" colKey="requestor" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.requestor}>ผู้ขอ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "type") && <ResizableTh tableId="pr-table" colKey="type" className="px-2 py-0.5 font-semibold" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.type}>ประเภท</ResizableTh>}
                {isColumnVisible(tblId, "items") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="items" className="px-2 py-0.5 font-semibold text-right" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.items}>จำนวนรายการ</ResizableTh>}
                {isColumnVisible(tblId, "amount") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="amount" className="px-2 py-0.5 font-semibold text-right" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.amount}>ยอดรวม</ResizableTh>}
                {canViewPrBalance && isColumnVisible("pr-table", "balance") && <ResizableTh tableId="pr-table" colKey="balance" className="px-2 py-0.5 font-semibold text-right" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.balance}>Balance</ResizableTh>}
                {isColumnVisible(tblId, "status") && <ResizableTh tableId={isPR ? "pr-table" : "po-table"} colKey="status" className="px-2 py-0.5 font-semibold text-center" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.status}>สถานะ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "poRef") && <ResizableTh tableId="pr-table" colKey="poRef" className="px-2 py-0.5 font-semibold text-center" isAdmin={userRole === "Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.poRef}>Ref PO</ResizableTh>}
                {isColumnVisible(tblId, "action") && <th className="px-2 py-0.5 font-semibold text-center" style={{ width: prPoScaled.action }}>Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={99} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="opacity-30" />
                      <span>ไม่พบข้อมูล</span>
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((r: any, idx: number) => {
                  const noField = isPR ? r.prNo : r.poNo;
                  const dateField = isPR ? r.requestDate : (r.poDate || r.createdDate);
                  const amount = isPR ? r.totalAmount : (r.grandTotal ?? r.amount ?? 0);
                  const itemCount = isPR
                    ? (r.items?.length || 0)
                    : (r.items?.length || (r.selectedPrIds?.length || 0));
                  const statusClass = statusColors[r.status] || "bg-slate-50 text-slate-500 border-slate-200";
                  const isEven = idx % 2 === 0;
                  const vendorName = !isPR
                    ? (r.vendor || (vendors || []).find((v: any) => v.id === r.vendorId)?.name || "-")
                    : "";
                  const poLinkedMeta = !isPR ? getPoLinkedPrMeta(r) : { prNos: [], costCodes: [] };
                  const poRefNos = isPR
                    ? pos
                      .filter((po: any) =>
                        (po.selectedPrIds || []).includes(r.id) ||
                        (po.items || []).some((it: any) => it.prId === r.id) ||
                        po.prRefId === r.id
                      )
                      .map((po: any) => po.poNo || po.id)
                      .filter(Boolean)
                      .join(", ")
                    : "";
                  const prBalance = isPR ? getPrBalanceAmount(r) : 0;

                  return (
                    <tr key={r.id} className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${isEven ? "bg-white" : "bg-slate-50/40"}`} onClick={() => { if (!isPR && r.pdfUrl) setPdfPreviewUrl(r.pdfUrl); }}>
                      {isColumnVisible(tblId, "action") && <td className="px-2 py-0.5 md:hidden" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-start gap-1">
                          {canUseFunction(tableModule, "email") && (
                            <button type="button" disabled={pdfLoadingId === r.id} className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="ส่งไฟล์ PDF ทางเมล" onClick={() => { setEmailModal({ doc: r, kind: isPR ? "pr" : "po" }); setEmailTo(""); }}>
                              <Mail size={13} />
                            </button>
                          )}
                          {canUseFunction(tableModule, "download") && (
                            <button type="button" disabled={pdfLoadingId === r.id} className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="Download PDF" onClick={() => isPR ? handlePRDownloadPDF(r) : handlePODownloadPDF(r)}>
                              {pdfLoadingId === r.id ? (
                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                              ) : (
                                <Download size={13} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>}
                      {isColumnVisible(tblId, "rowNum") && <td className="px-2 py-0.5 text-slate-400 font-mono">{pageStart + idx + 1}</td>}
                      {isColumnVisible(tblId, "no") && (
                        <td className="px-2 py-0.5 font-bold text-slate-800 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Hash size={10} className={isPR ? "text-slate-500" : "text-red-500"} />
                            {noField || "-"}
                            {!isPR && r.pdfUrl && (
                              <span title="มี PDF — คลิกแถวเพื่อดู" className="ml-0.5 text-red-500"><FileText size={10} /></span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnVisible(tblId, "project") && (
                        <td className="px-2 py-0.5 text-slate-600 max-w-[140px] truncate" title={getProjectName(r.projectId)}>
                          {getProjectName(r.projectId)}
                        </td>
                      )}
                      {isPR && isColumnVisible("pr-table", "costCode") && (
                        <td className="px-2 py-0.5 font-mono text-slate-700">{r.costCode || "-"}</td>
                      )}
                      {isPR && isColumnVisible("pr-table", "description") && (
                        <td
                          className="px-2 py-0.5 text-slate-600 max-w-[220px]"
                          title={(() => {
                            const budgetItemName = getPrBudgetItemName(r);
                            const itemDescs = r.items && r.items.length > 0
                              ? r.items.map((it: any) => it.description).filter(Boolean).join(", ")
                              : getBudgetDesc(r.costCode, r.projectId);
                            return budgetItemName || itemDescs || "-";
                          })()}
                        >
                          <div className="leading-tight">
                            <span className="block truncate font-semibold text-slate-700">
                              {r.items && r.items.length > 0
                                ? r.items.map((it: any) => it.description).filter(Boolean).join(", ")
                                : (getPrBudgetItemName(r) || getBudgetDesc(r.costCode, r.projectId))}
                            </span>
                            {r.items && r.items.length > 0 && getPrBudgetItemName(r) && (
                              <span className="block truncate text-[10px] text-slate-400 mt-0.5">
                                {getPrBudgetItemName(r)}
                              </span>
                            )}
                          </div>
                        </td>
                      )}
                      {!isPR && isColumnVisible("po-table", "costCode") && (
                        <td className="px-2 py-0.5 font-mono text-slate-700" title={poLinkedMeta.costCodes.join(", ") || "-"}>
                          {poLinkedMeta.costCodes.length > 0 ? poLinkedMeta.costCodes.join(", ") : "-"}
                        </td>
                      )}
                      {!isPR && isColumnVisible("po-table", "vendor") && (
                        <td className="px-2 py-0.5 text-slate-700 font-medium">{vendorName}</td>
                      )}
                      {!isPR && isColumnVisible("po-table", "prRef") && (
                        <td className="px-2 py-0.5 text-slate-500 text-[11px]">
                          {poLinkedMeta.prNos.length > 0 ? poLinkedMeta.prNos.join(", ") : "-"}
                        </td>
                      )}
                      {isColumnVisible(tblId, "date") && (
                        <td className="px-2 py-0.5 text-slate-500 whitespace-nowrap">
                          {dateField
                            ? (dateField.includes("T")
                              ? new Date(dateField).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : dateField)
                            : "-"}
                        </td>
                      )}
                      {isPR && isColumnVisible("pr-table", "requestor") && <td className="px-2 py-0.5 text-slate-600">{r.requestor || "-"}</td>}
                      {isPR && isColumnVisible("pr-table", "type") && (
                        <td className="px-2 py-0.5">
                          {r.purchaseType ? (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0 rounded text-[10px]">{r.purchaseType}</span>
                          ) : "-"}
                        </td>
                      )}
                      {isColumnVisible(tblId, "items") && <td className="px-2 py-0.5 text-right text-slate-600">{itemCount} รายการ</td>}
                      {isColumnVisible(tblId, "amount") && (
                        <td className="px-2 py-0.5 text-right font-bold text-slate-800">
                          ฿{Number(amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      {canViewPrBalance && isColumnVisible("pr-table", "balance") && (
                        <td className="px-2 py-0.5 text-right font-semibold text-emerald-700">
                          ฿{Number(prBalance || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                      )}
                      {isColumnVisible(tblId, "status") && (
                        <td className="px-2 py-0.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0 rounded-full border text-[10px] font-semibold whitespace-nowrap ${statusClass}`}>
                            {r.status || "Draft"}
                          </span>
                        </td>
                      )}
                      {isPR && isColumnVisible("pr-table", "poRef") && (
                        <td className="px-2 py-0.5 text-slate-500 text-[11px] text-center">
                          {poRefNos || "-"}
                        </td>
                      )}
                      {isColumnVisible(tblId, "action") && <td className="px-2 py-0.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {canUseFunction(tableModule, "email") && (
                            <button type="button" disabled={pdfLoadingId === r.id} className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="ส่งไฟล์ PDF ทางเมล" onClick={() => { setEmailModal({ doc: r, kind: isPR ? "pr" : "po" }); setEmailTo(""); }}>
                              <Mail size={13} />
                            </button>
                          )}
                          {canUseFunction(tableModule, "download") && (
                            <button type="button" disabled={pdfLoadingId === r.id} className="p-1 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="Download PDF" onClick={() => isPR ? handlePRDownloadPDF(r) : handlePODownloadPDF(r)}>
                              {pdfLoadingId === r.id ? (
                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25" /><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                              ) : (
                                <Download size={13} />
                              )}
                            </button>
                          )}
                          {canUseFunction(tableModule, "requestClosePR") && isPR && r.status !== "Closed PR" && r.status !== "Closed PR Auto" && r.status !== "Pending Close" && r.status !== "Pending Active PR" && (
                            <button type="button" className="p-1 rounded hover:bg-amber-100 text-amber-700" title="ขอปิด PR (รอ PCM ยืนยัน)" onClick={() => openConfirm?.("ขอปิด PR", "เมื่อ PCM ยืนยันแล้ว สถานะจะเป็น Closed PR", async () => {
                              await updateData?.("prs", r.id, { status: "Pending Close", preCloseStatus: r.status, closeRequestedAt: new Date().toISOString() }, { skipLog: true });
                              await logAction?.("Submit", `Request Close PR ${r.prNo || r.id}: ${r.status} → Pending Close`, r.projectId);
                              showAlert?.("ส่งคำขอแล้ว", "รอ PCM ยืนยันการปิด PR", "info");
                            })}>
                              <XCircle size={13} />
                            </button>
                          )}
                          {canUseFunction("pr", "closePR") && isPR && r.status === "Pending Close" && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                            <button type="button" className="p-1 rounded hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium" title="ยืนยันปิด PR" onClick={() => openConfirm?.("ยืนยันปิด PR", "สถานะจะเปลี่ยนเป็น Closed PR", async () => {
                              await updateData?.("prs", r.id, { status: "Closed PR", preCloseStatus: r.preCloseStatus || r.status }, { skipLog: true });
                              await logAction?.("Approve", `Confirm Close PR ${r.prNo || r.id}: ${r.status} → Closed PR`, r.projectId);
                              showAlert?.("สำเร็จ", "ปิด PR เรียบร้อย", "success");
                            })}>
                              ยืนยันปิด
                            </button>
                          )}
                          {/* ขอ Active PR (Procurement/PCM) เมื่อ PR ถูกปิดแล้ว */}
                          {canUseFunction(tableModule, "requestActivePR") && isPR && (r.status === "Closed PR" || r.status === "Closed PR Auto") && (userRoles.includes("Procurement") || userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                            <button type="button" className="p-1.5 rounded hover:bg-teal-100 text-teal-700" title="ขอ Active PR คืน (รอ PCM อนุมัติ)" onClick={() => openConfirm?.("ขอ Active PR", "ส่งคำขอให้ PCM อนุมัติ Active PR คืน", async () => {
                              await updateData?.("prs", r.id, { status: "Pending Active PR", activeRequestedAt: new Date().toISOString() }, { skipLog: true });
                              logAction?.("Request Active PR", `ขอ Active PR ${r.prNo || r.id}`, r.projectId);
                              showAlert?.("ส่งคำขอแล้ว", "รอ PCM อนุมัติ Active PR", "info");
                            })}>
                              <CheckCircle size={14} />
                            </button>
                          )}
                          {/* PCM อนุมัติ Active PR */}
                          {canUseFunction(tableModule, "approveActivePR") && isPR && r.status === "Pending Active PR" && (userRoles.includes("PCM") || userRoles.includes("Administrator")) && (
                            <button type="button" className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium" title="อนุมัติ Active PR" onClick={() => openConfirm?.("อนุมัติ Active PR", "PR จะกลับไปสถานะก่อนถูกปิด", async () => {
                              const { status: resume, usedAmount, totalAmount } = getResumeStatusForPR(r, pos);
                              await updateData?.("prs", r.id, { status: resume, preCloseStatus: null, activeRequestedAt: null }, { skipLog: true });
                              logAction?.(
                                "Approved Active PR",
                                `อนุมัติ Active PR ${r.prNo || r.id} → ${resume} (PO linked ${formatCurrency(usedAmount)} / PR ${formatCurrency(totalAmount)})`,
                                r.projectId
                              );
                              const returnedAmount = Math.max(0, totalAmount - usedAmount);
                              showAlert?.(
                                "สำเร็จ",
                                `PR กลับสถานะ ${resume} แล้ว ยอดคงเหลือที่เปิดใช้ได้ ${formatCurrency(returnedAmount)}${usedAmount > 0 ? ` (ยังมี PO ผูกอยู่ ${formatCurrency(usedAmount)})` : ""}`,
                                "success"
                              );
                            })}>
                              Active PR
                            </button>
                          )}
                          {canReturnPrBalance && isPR && (() => {
                            const info = getPrBudgetReturnInfo(r, pos);
                            if (info.returnAmount <= 0) return null;
                            return (
                              <button
                                type="button"
                                className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700"
                                title={`คืน Balance PR กลับ Budget (${formatCurrency(info.returnAmount)})`}
                                onClick={() => handleReturnPrBalanceToBudget(r)}
                              >
                                <Wallet size={14} />
                              </button>
                            );
                          })()}
                          {canUseFunction(tableModule, "requestClosePO") && !isPR && r.status !== "Closed PO" && r.status !== "Pending Close PO" && r.status !== "Received" && (
                            <button type="button" className="p-1.5 rounded hover:bg-amber-100 text-amber-700" title="ขอปิด PO (รอ PCM ยืนยัน)" onClick={() => openConfirm?.("ขอปิด PO", "เมื่อ PCM ยืนยันแล้ว สถานะจะเป็น Closed PO", async () => {
                              await updateData?.("pos", r.id, { status: "Pending Close PO", closeRequestedAt: new Date().toISOString() }, { skipLog: true });
                              await logAction?.("Submit", `Request Close PO ${r.poNo || r.id}: ${r.status} → Pending Close PO`, r.projectId);
                              showAlert?.("ส่งคำขอแล้ว", "รอ PCM ยืนยันการปิด PO", "info");
                            })}>
                              <XCircle size={14} />
                            </button>
                          )}
                          {canUseFunction("po", "closePO") && !isPR && r.status === "Pending Close PO" && (userRole === "PCM" || userRole === "Administrator") && (
                            <button type="button" className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium" title="ยืนยันปิด PO" onClick={() => openConfirm?.("ยืนยันปิด PO", "สถานะจะเปลี่ยนเป็น Closed PO", async () => {
                              await updateData?.("pos", r.id, { status: "Closed PO" }, { skipLog: true });
                              await logAction?.("Approve", `Confirm Close PO ${r.poNo || r.id}: ${r.status} → Closed PO`, r.projectId);
                              showAlert?.("สำเร็จ", "ปิด PO เรียบร้อย", "success");
                            })}>
                              ยืนยันปิด
                            </button>
                          )}
                          {!isPR && userRoles.includes("Administrator") && r.status === "Closed PO" && (
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-teal-100 text-teal-700"
                              title="Active PO"
                              onClick={() => {
                                const relatedInvoices = getRelatedInvoicesForPo(r);
                                const relatedReceives = getRelatedReceivesForPo(r);
                                openConfirm?.(
                                  "Active PO",
                                  `การคืนสถานะ PO ${r.poNo || r.id} จะเปลี่ยนสถานะกลับเป็น Approved\n\nระบบจะลบข้อมูลต่อไปนี้ถาวร:\n- Invoice ที่ผูกกับ PO นี้ ${relatedInvoices.length} รายการ\n- Receive ที่ผูกกับ PO นี้ ${relatedReceives.length} รายการ\n- PDF ของ Receive ที่อยู่ใน Firebase Storage\n\nหากต้องการดำเนินการต่อ ให้พิมพ์ Confirm`,
                                  async () => {
                                    await handleActivePO(r);
                                  },
                                  "danger",
                                  {
                                    requireText: "Confirm",
                                    requireTextLabel: "พิมพ์ Confirm เพื่อยืนยันการคืนสถานะ PO",
                                    requireTextPlaceholder: "Confirm",
                                  }
                                );
                              }}
                            >
                              <CheckCircle size={14} />
                            </button>
                          )}
                          {canUseFunction(tableModule, "delete") && !isPR && (
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-red-100 text-red-600"
                              title="ลบ PO"
                              onClick={() => openConfirm?.("ยืนยันการลบ", `คุณต้องการลบ PO ${r.poNo || r.id} ใช่หรือไม่?`, async () => {
                                const prIds = r.items
                                  ? [...new Set(r.items.map((i: any) => i.prId).filter(Boolean))]
                                  : (r.prRefId ? [r.prRefId] : []);
                                if (r.pdfUrl) {
                                  const safePONo = (r.poNo || r.id).replace(/[^a-zA-Z0-9\-_]/g, "_");
                                  const safeProjId = r.projectId || "unknown";
                                  await deleteGeneratedPdf(`generated/pos/${safeProjId}/${safePONo}.pdf`);
                                }
                                const deleted = await deleteData?.("pos", r.id);
                                if (deleted && prIds.length > 0) {
                                  for (const prId of prIds) {
                                    const stillUsedByOtherPO = pos.some((p: any) => p.id !== r.id && p.items?.some((i: any) => i.prId === prId));
                                    if (!stillUsedByOtherPO) {
                                      await updateData?.("prs", prId, { status: "Approved" });
                                    }
                                  }
                                }
                              }, "danger")}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {activeRows.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-3 text-xs text-slate-500 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                แสดง {pageFrom}-{pageTo} จาก {activeRows.length} รายการ
                {activeTypeGroup ? ` (${activeTypeGroup.label})` : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  ก่อนหน้า
                </button>
                <span className="font-semibold text-slate-600">
                  หน้า {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100"
                >
                  ถัดไป
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {!isPR && (
                <span className="font-bold text-slate-600">
                  ยอดรวม Type นี้ (Ex VAT): ฿{activeRows.reduce((s: number, r: any) => {
                    // Calculate amount ex VAT for each PO
                    let subtotal = 0;
                    if (r.items && r.items.length > 0) {
                      subtotal = r.items.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
                    }
                    const discount = Number(r.discount || 0);
                    const amountExVat = Math.max(0, subtotal - discount);
                    return s + amountExVat;
                  }, 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                </span>
              )}
              <span className="font-bold text-slate-700">
                ยอดรวม Type นี้: ฿{activeRows.reduce((s: number, r: any) => s + Number(isPR ? r.totalAmount : r.grandTotal || r.amount || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </Card>

      {isReturnBalanceModalOpen && (() => {
        const latestPr = prs.find((p: any) => p.id === returnBalanceContext?.prId);
        const latestInfo = latestPr ? getPrBudgetReturnInfo(latestPr, pos) : null;
        const maxReturn = Math.max(0, Math.round(Number(latestInfo?.returnAmount || 0) * 100) / 100);
        const requested = Math.round(parseReturnBalanceInput(returnBalanceValue) * 100) / 100;
        const isRequestedValid = Number.isFinite(requested) && requested > 0 && requested <= maxReturn;
        return (
          <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[10011] p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-emerald-200 p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-lg font-extrabold text-red-600 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
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
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
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

      {/* Email modal for PR/PO PDF */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10010] p-4" onClick={() => setEmailModal(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-slate-800 mb-2">ส่งไฟล์ PDF ทางเมล</h3>
            <p className="text-xs text-slate-500 mb-2">
              {emailModal.kind === "pr"
                ? `PR: ${emailModal.doc?.prNo || emailModal.doc?.id}`
                : `PO: ${emailModal.doc?.poNo || emailModal.doc?.id}`}
            </p>
            <input type="email" placeholder="อีเมลปลายทาง" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3" />
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => { setEmailModal(null); setEmailTo(""); }}>ยกเลิก</Button>
              <Button variant="primary" size="sm" onClick={() => emailModal.kind === "pr" ? handlePRSendEmail(emailModal.doc, emailTo) : handlePOSendEmail(emailModal.doc, emailTo)}>ส่ง</Button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal (PO) */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-[10010] p-4" onClick={() => setPdfPreviewUrl(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ height: "88vh" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-700">ดูตัวอย่าง PDF</span>
              <div className="flex gap-2">
                <a href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">เปิดในแท็บใหม่ / ดาวน์โหลด</a>
                <button onClick={() => setPdfPreviewUrl(null)} className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium">ปิด</button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} className="flex-1 w-full rounded-b-xl" title="PDF Preview" />
          </div>
        </div>
      )}
    </div>
  );
};



const UserProfile = () => {
  const { user, userData, resetPassword, showAlert, logAction, refreshUserData } =
    useContext(AuthContext);
  const { userRoles = [], canUseFunction } = useAppData();
  const canEditProfile = canUseFunction?.("profile", "editProfile");
  const canResetPassword = canUseFunction?.("profile", "resetPassword");
  const canUploadSignature = canUseFunction?.("profile", "uploadSignature");
  const canRemoveSignature = canUseFunction?.("profile", "removeSignature");
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    firstName: userData?.firstName || "",
    lastName: userData?.lastName || "",
    position: userData?.position || "",
  });
  const [signatureUrl, setSignatureUrl] = useState(userData?.signatureUrl || null);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const signatureInputRef = useRef(null);

  // Sync signatureUrl when userData changes (after real-time update)
  useEffect(() => {
    setSignatureUrl(userData?.signatureUrl || null);
  }, [userData?.signatureUrl]);

  // Auto-generate signatureDataUrl for existing users (แก้ปัญหา CORS ตอน stamp)
  useEffect(() => {
    if (!user?.uid) return;
    if (!userData?.signatureUrl) return;
    if (userData?.signatureDataUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const storageRef = ref(storage, `signatures/${user.uid}/signature.png`);
        const bytes = await getBytes(storageRef);
        if (cancelled) return;
        const blob = new Blob([bytes], { type: "image/png" });
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Read signature failed"));
          reader.readAsDataURL(blob);
        });
        if (cancelled) return;
        await updateDoc(
          doc(db, "artifacts", appId, "public", "data", "users", user.uid),
          { signatureDataUrl: dataUrl }
        );
        await refreshUserData();
      } catch (_) {
        // ignore: user can re-upload if needed
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid, userData?.signatureUrl, userData?.signatureDataUrl]);

  const handleUpdate = async () => {
    if (!canEditProfile) return;
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        formData
      );
      await logAction(
        "Update",
        `Updated profile: ${formData.firstName} ${formData.lastName}`
      );
      setEditMode(false);
      showAlert("สำเร็จ", "บันทึกข้อมูลเรียบร้อย", "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handlePasswordReset = async () => {
    if (!canResetPassword) return;
    if (confirm(`ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ${user.email} หรือไม่?`)) {
      await resetPassword(user.email);
      await logAction("Update", "Requested password reset");
      showAlert(
        "สำเร็จ",
        "ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว กรุณาเช็คอีเมล",
        "success"
      );
    }
  };

  const handleSignatureUpload = async (e) => {
    if (!canUploadSignature) return;
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showAlert("ไฟล์ไม่ถูกต้อง", "กรุณาเลือกไฟล์รูปภาพ (PNG, JPG)", "warning");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showAlert("ไฟล์ใหญ่เกินไป", "ขนาดไฟล์ต้องไม่เกิน 2MB", "warning");
      return;
    }
    setUploadingSignature(true);
    try {
      const toDataUrl = (f: File) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Read file failed"));
          reader.readAsDataURL(f);
        });

      const toPngFile = async (inputFile: File) => {
        if (inputFile.type !== "image/webp") return inputFile;
        const bmp = await createImageBitmap(inputFile);
        const canvas = document.createElement("canvas");
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not supported");
        ctx.drawImage(bmp, 0, 0);
        const blob: Blob = await new Promise((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Convert WEBP failed"))), "image/png");
        });
        return new File([blob], "signature.png", { type: "image/png" });
      };

      const storageRef = ref(storage, `signatures/${user.uid}/signature.png`);
      const uploadFile = await toPngFile(file);
      const signatureDataUrl = await toDataUrl(uploadFile);
      await uploadBytes(storageRef, uploadFile, { contentType: uploadFile.type });
      const url = await getDownloadURL(storageRef);
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        { signatureUrl: url, signatureDataUrl }
      );
      setSignatureUrl(url);
      await refreshUserData();
      await logAction("Update", "Uploaded signature image");
      showAlert("สำเร็จ", "อัปโหลดลายเซ็นเรียบร้อย", "success");
    } catch (err) {
      showAlert("Error", err.message, "error");
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!canRemoveSignature) return;
    if (!confirm("ต้องการลบลายเซ็นหรือไม่?")) return;
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        { signatureUrl: null, signatureDataUrl: null }
      );
      setSignatureUrl(null);
      await refreshUserData();
      await logAction("Update", "Removed signature image");
      showAlert("สำเร็จ", "ลบลายเซ็นเรียบร้อย", "success");
    } catch (err) {
      showAlert("Error", err.message, "error");
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 space-y-4">
      <Card className="p-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b">
          <ProfileAvatar
            src={userData?.profilePhotoUrl || user?.photoURL}
            className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 shadow-md"
            fallback={
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-2xl">
                {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
              </div>
            }
          />
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {userData?.firstName} {userData?.lastName}
            </h2>
            <p className="text-slate-500">
              {userRoles.length ? userRoles.join(", ") : userData?.role} | {userData?.email}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <InputGroup label="ชื่อ">
              <input
                disabled={!editMode}
                type="text"
                className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
              />
            </InputGroup>
            <InputGroup label="นามสกุล">
              <input
                disabled={!editMode}
                type="text"
                className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
              />
            </InputGroup>
          </div>
          <InputGroup label="ตำแหน่ง">
            <input
              disabled={!editMode}
              type="text"
              className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
              value={formData.position}
              onChange={(e) =>
                setFormData({ ...formData, position: e.target.value })
              }
            />
          </InputGroup>
          <div className="flex justify-between items-center pt-4">
            {canResetPassword ? (
              <button
                onClick={handlePasswordReset}
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
              >
                <Key size={14} /> รีเซ็ตรหัสผ่าน
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {canEditProfile && editMode ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setEditMode(false)}
                  >
                    ยกเลิก
                  </Button>
                  <Button onClick={handleUpdate}>บันทึกการเปลี่ยนแปลง</Button>
                </>
              ) : canEditProfile ? (
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <Edit size={14} /> แก้ไขข้อมูล
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* Signature Card */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b">
          <FileOutput size={18} className="text-slate-600" />
          <h3 className="text-base font-semibold text-slate-800">ลายเซ็น (Signature)</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          ลายเซ็นนี้จะถูก Stamp ลงใน PDF อัตโนมัติเมื่อมีการสร้าง PO หรืออนุมัติ
        </p>
        {signatureUrl ? (
          <div className="flex flex-col items-start gap-3">
            <div className="border border-slate-200 rounded-lg bg-slate-50 p-3 w-full max-w-xs">
              <img
                src={signatureUrl}
                alt="ลายเซ็น"
                className="h-16 object-contain"
              />
            </div>
            {(canUploadSignature || canRemoveSignature) && (
              <div className="flex gap-2">
                {canUploadSignature && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => signatureInputRef.current?.click()}
                    disabled={uploadingSignature}
                  >
                    <Upload size={14} /> เปลี่ยนลายเซ็น
                  </Button>
                )}
                {canRemoveSignature && (
                  <button
                    className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                    onClick={handleRemoveSignature}
                  >
                    <Trash2 size={13} /> ลบ
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${canUploadSignature
              ? "border-slate-300 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40"
              : "border-slate-200 cursor-not-allowed bg-slate-50"
              }`}
            onClick={() => canUploadSignature && signatureInputRef.current?.click()}
          >
            {uploadingSignature ? (
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <RefreshCw size={24} className="animate-spin" />
                <span className="text-sm">กำลังอัปโหลด...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Upload size={28} />
                <span className="text-sm font-medium">คลิกเพื่ออัปโหลดลายเซ็น</span>
                <span className="text-xs">PNG, JPG — ไม่เกิน 2MB — แนะนำพื้นหลังโปร่งใส (PNG)</span>
              </div>
            )}
          </div>
        )}
        <input
          ref={signatureInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={!canUploadSignature}
          onChange={handleSignatureUpload}
        />
      </Card>
    </div>
  );
};


// Sidebar modules available for role-based visibility control
const SIDEBAR_MODULES = [
  { key: "dashboard", label: "ภาพรวม" },
  { key: "projects", label: "จัดการโครงการ" },
  { key: "budget", label: "Project Budget" },
  { key: "pr", label: "PR (ระบบ)" },
  { key: "pr-table", label: "PR (ตาราง)" },
  { key: "po", label: "PO (ระบบ)" },
  { key: "po-table", label: "PO (ตาราง)" },
  { key: "payment-subcontract", label: "Payment Subcontract" },
  { key: "vendor", label: "Vendor" },
  { key: "material", label: "Material" },
  { key: "receive", label: "Receive" },
  { key: "invoice", label: "Invoice" },
  { key: "profile", label: "โปรไฟล์" },
];

/** เติมฟังก์ชันที่ขาดเป็น [] ต่อ module ที่มีใน partial — บันทึกลง Firestore ให้ครบ key ป้องกัน canUseFunction เดา allow */
function normalizePartialFunctionPermissions(
  partial: Record<string, Record<string, string[]>>
): Record<string, Record<string, string[]>> {
  const out = { ...partial };
  for (const moduleKey of Object.keys(partial)) {
    const funcList = MODULE_FUNCTIONS[moduleKey];
    if (!funcList?.length) continue;
    const prev = partial[moduleKey] || {};
    const merged: Record<string, string[]> = {};
    funcList.forEach(({ key }) => {
      const v = prev[key];
      merged[key] = Array.isArray(v) ? [...v] : [];
    });
    out[moduleKey] = merged;
  }
  return out;
}

const AdminDashboard = () => {
  const { showAlert, logAction, userData } = useContext(AuthContext);
  const {
    columnWidths, handleColumnResize,
    rolePermissions, saveRolePermissions,
    functionPermissions, saveFunctionPermissions,
    isColumnVisible, availableRoles, saveAvailableRoles,
  } = useAppData();
  const userRole = userData?.role || "Staff";
  const adminUsersTableRef = useRef(null);
  const [activeTab, setActiveTab] = useState("users"); // 'users' | 'logs' | 'roles'
  const adminUsersTableLayout = useProportionalTableLayout({
    tableId: "users",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.users,
    savedWidths: columnWidths?.users,
    containerRef: adminUsersTableRef,
    enabled: activeTab === "users",
    driftKey: "name",
    handleColumnResize,
  });
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]); // V.16 Logs State
  const [logsPage, setLogsPage] = useState(1);
  const LOGS_PER_PAGE = 50;
  const paginatedLogs = useMemo(() => {
    const start = (logsPage - 1) * LOGS_PER_PAGE;
    return logs.slice(start, start + LOGS_PER_PAGE);
  }, [logs, logsPage]);
  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const [projects, setProjects] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    role: "",
    status: "",
    assignedProjectIds: [],
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Set Role tab state
  const [localPermissions, setLocalPermissions] = useState<Record<string, string[]>>(MODULE_ACCESS);
  const [localFunctionPermissions, setLocalFunctionPermissions] = useState<Record<string, Record<string, string[]>>>({});
  // PR Type visibility per role: { "CM": ["จัดซื้อ > WA, ST, ML, CS, SA", "จ้างเหมา > DL"], ... }
  const [localPRTypePermissions, setLocalPRTypePermissions] = useState<Record<string, string[]>>({});
  const [openPRTypeDropdown, setOpenPRTypeDropdown] = useState<string | null>(null);
  const [savingRoles, setSavingRoles] = useState(false);
  const [openFuncDropdown, setOpenFuncDropdown] = useState<string | null>(null); // "moduleKey:role"
  const [newRoleName, setNewRoleName] = useState("");
  const [savingNewRole, setSavingNewRole] = useState(false);
  const managedRoles = useMemo(
    () => [...new Set([...availableRoles, ...users.map((u) => String(u.role || "").trim()).filter(Boolean)])],
    [availableRoles, users]
  );

  useEffect(() => {
    const qUsers = query(
      collection(db, "artifacts", appId, "public", "data", "users")
    );
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const qProjects = query(
      collection(db, "artifacts", appId, "public", "data", "projects")
    );
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubProjects();
    };
  }, []);

  // Logs — lazy load เฉพาะเมื่อ activeTab === "logs"
  useEffect(() => {
    if (activeTab !== "logs") {
      setLogs([]);
      setLogsPage(1);
      return;
    }
    const qLogs = query(
      collection(db, "artifacts", appId, "public", "data", "logs"),
      orderBy("timestamp", "desc"),
      limit(1000)
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(
        snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((log) => log.action !== "Navigate")
      );
    });
    return () => unsubLogs();
  }, [activeTab]);

  // Sync local state when Firestore data loads
  useEffect(() => {
    setLocalPermissions(rolePermissions);
  }, [rolePermissions]);

  useEffect(() => {
    setLocalFunctionPermissions(functionPermissions);
  }, [functionPermissions]);

  // Sync PR Type permissions from Firestore (stored in functionPermissions.pr.viewPRTypeByRole)
  useEffect(() => {
    if (!functionPermissions || Object.keys(functionPermissions).length === 0) return;
    const stored = functionPermissions?.pr?.viewPRTypeByRole || {};
    console.log("[AppShell] Syncing PR Type permissions from Firestore:", JSON.stringify(stored));
    const prTypeMap: Record<string, string[]> = {};
    managedRoles.forEach((role) => {
      prTypeMap[role] = stored[role] || [];
    });
    setLocalPRTypePermissions(prTypeMap);
  }, [functionPermissions, managedRoles]);

  const handlePRTypeToggle = (role: string, prType: string) => {
    setLocalPRTypePermissions((prev) => {
      const current = prev[role] || [];
      const hasType = current.includes(prType);
      return {
        ...prev,
        [role]: hasType ? current.filter((t) => t !== prType) : [...current, prType],
      };
    });
  };

  const handlePRTypeAllToggle = (role: string) => {
    setLocalPRTypePermissions((prev) => {
      const current = prev[role] || [];
      const allSelected = current.length === PURCHASE_TYPES.length;
      return {
        ...prev,
        [role]: allSelected ? [] : [...PURCHASE_TYPES],
      };
    });
  };

  const handleRolePermissionToggle = (moduleKey: string, role: string) => {
    setLocalPermissions((prev) => {
      const current = prev[moduleKey] || [];
      const hasRole = current.includes(role);
      const next = {
        ...prev,
        [moduleKey]: hasRole ? current.filter((r) => r !== role) : [...current, role],
      };
      // If disabling read access, also clear all write functions for this role+module
      if (hasRole) {
        setLocalFunctionPermissions((fp) => {
          const modFuncs = { ...(fp[moduleKey] || {}) };
          Object.keys(modFuncs).forEach((funcKey) => {
            modFuncs[funcKey] = modFuncs[funcKey].filter((r) => r !== role);
          });
          return { ...fp, [moduleKey]: modFuncs };
        });
      }
      return next;
    });
  };

  const handleFunctionToggle = (moduleKey: string, role: string, funcKey: string) => {
    setLocalFunctionPermissions((prev) => {
      const modFuncs = { ...(prev[moduleKey] || {}) };
      const currentRoles = modFuncs[funcKey] || [];
      const hasRole = currentRoles.includes(role);
      modFuncs[funcKey] = hasRole
        ? currentRoles.filter((r) => r !== role)
        : [...currentRoles, role];
      return { ...prev, [moduleKey]: modFuncs };
    });
  };

  const handleSaveRolePermissions = async () => {
    setSavingRoles(true);
    try {
      const funcPayload = normalizePartialFunctionPermissions(localFunctionPermissions);
      // เพิ่ม PR Type permissions เข้าไปใน functionPermissions
      funcPayload.pr = funcPayload.pr || {};
      funcPayload.pr.viewPRTypeByRole = { ...localPRTypePermissions };

      const [okModule, okFunc] = await Promise.all([
        saveRolePermissions(localPermissions),
        saveFunctionPermissions(funcPayload),
      ]);
      if (okModule && okFunc) {
        showAlert("บันทึกสำเร็จ", "อัปเดตสิทธิ์ Role และ PR Type เรียบร้อยแล้ว", "success");
        await logAction("Update", "Updated role permissions + PR Type visibility");
      } else {
        showAlert("เกิดข้อผิดพลาด", "ไม่สามารถบันทึกสิทธิ์ได้ กรุณาลองใหม่", "error");
      }
    } finally {
      setSavingRoles(false);
    }
  };

  const handleAddRole = async () => {
    const nextRole = newRoleName.trim();
    if (!nextRole) {
      showAlert("ข้อมูลไม่ครบ", "กรุณาระบุชื่อ Role", "warning");
      return;
    }
    if (managedRoles.some((role) => role.toLowerCase() === nextRole.toLowerCase())) {
      showAlert("Role ซ้ำ", `มี Role "${nextRole}" อยู่แล้ว`, "warning");
      return;
    }
    setSavingNewRole(true);
    try {
      const ok = await saveAvailableRoles([...managedRoles, nextRole]);
      if (!ok) {
        showAlert("เกิดข้อผิดพลาด", "ไม่สามารถเพิ่ม Role ใหม่ได้", "error");
        return;
      }
      setNewRoleName("");
      await logAction("Create", `Created Role ${nextRole}`);
      showAlert("เพิ่มสำเร็จ", `เพิ่ม Role ${nextRole} แล้ว`, "success");
    } finally {
      setSavingNewRole(false);
    }
  };

  const handleFormUpload = async (kind, file) => {
    if (!file || file.type !== "application/pdf") {
      showAlert("รูปแบบไฟล์", "กรุณาเลือกไฟล์ PDF เท่านั้น", "warning");
      return;
    }
    const path = FORM_TEMPLATE_PATHS[kind];
    try {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file, { contentType: "application/pdf" });
      await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("อัปโหลดใช้เวลานานเกินไป กรุณาลองใหม่ (ตรวจสอบ Storage Rules/อินเทอร์เน็ต)")), 90000);
        task.on(
          "state_changed",
          () => { },
          (err) => {
            clearTimeout(timeout);
            reject(err);
          },
          async () => {
            clearTimeout(timeout);
            resolve(await getDownloadURL(storageRef));
          }
        );
      });
      showAlert("อัปโหลดสำเร็จ", `อัปโหลดแบบฟอร์ม ${kind === "pr" ? "PR" : "PO"} เรียบร้อย (แทนที่ของเก่า)`, "success");
    } catch (e) {
      showAlert("อัปโหลดไม่สำเร็จ", e?.message || "เกิดข้อผิดพลาด", "error");
    }
  };

  const handleEditClick = (user) => {
    setEditUser(user);
    setEditForm({
      role: user.role,
      status: user.status,
      assignedProjectIds: user.assignedProjectIds || [],
    });
    setIsEditModalOpen(true);
  };

  const handleProjectToggle = (projectId) => {
    setEditForm((prev) => {
      const currentIds = prev.assignedProjectIds;
      if (currentIds.includes(projectId)) {
        return {
          ...prev,
          assignedProjectIds: currentIds.filter((id) => id !== projectId),
        };
      } else {
        return { ...prev, assignedProjectIds: [...currentIds, projectId] };
      }
    });
  };

  const handleSaveUserChanges = async () => {
    if (!editUser) return;
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", editUser.id),
        {
          role: editForm.role,
          status: editForm.status,
          assignedProjectIds: editForm.assignedProjectIds,
        }
      );
      await logAction(
        "Update",
        `Admin updated user ${editUser.email}: Role=${editForm.role}, Status=${editForm.status}`
      );
      setIsEditModalOpen(false);
      showAlert("สำเร็จ", "บันทึกการแก้ไขสิทธิ์ผู้ใช้งานเรียบร้อย", "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handleApprove = async (userId, email) => {
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "users", userId),
      { status: "Approved" }
    );
    await logAction("Approve", `Admin approved user: ${email}`);
    showAlert(
      "อนุมัติแล้ว",
      "ผู้ใช้งานได้รับการอนุมัติให้เข้าสู่ระบบ",
      "success"
    );
  };

  const handleDeleteUser = async (userId, email) => {
    const confirmed = window.confirm(
      `ยืนยันการลบผู้ใช้ "${email}" ออกจากระบบ?\nการกระทำนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "public", "data", "users", userId)
      );
      await logAction("Delete", `Admin deleted user: ${email}`);
      showAlert("ลบสำเร็จ", `ลบผู้ใช้ ${email} ออกจากระบบเรียบร้อย`, "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  // Replace old-style "ID: <uuid>" patterns in legacy log details with readable label
  const cleanLogDetails = (details: string): string => {
    if (!details) return "";
    return details
      .replace(/Sub-Item ID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "Sub-Item")
      .replace(/\bID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
      .replace(/\bin Budget:\s*([^\s]+)/gi, "(Budget $1)")
      .replace(/\s{2,}/g, " ")
      .trim();
  };

  const getLogProjectName = (log: any): string => {
    if (!log.projectId) return "";
    const proj = projects.find((p) => p.id === log.projectId);
    return proj ? `${proj.jobNo} — ${proj.name}` : log.projectId;
  };

  const handleExportLogs = () => {
    const headers = "Timestamp,Action,User,Role,Project,Details\n";
    const rows = logs
      .map(
        (log) =>
          `"${new Date(log.timestamp).toLocaleString("th-TH")}",${log.action},${log.user},${log.role},"${getLogProjectName(log)}","${cleanLogDetails(log.details || "").replace(/"/g, '""')}"`
      )
      .join("\n");
    const bom = "\uFEFF";
    const csvContent =
      "data:text/csv;charset=utf-8," + encodeURIComponent(bom + headers + rows);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "system_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action) => {
    const map = {
      Login: "bg-blue-100 text-blue-800",
      Logout: "bg-gray-100 text-gray-800",
      Create: "bg-green-100 text-green-800",
      Update: "bg-orange-100 text-orange-800",
      Delete: "bg-red-100 text-red-800",
      Approve: "bg-purple-100 text-purple-800",
      Import: "bg-teal-100 text-teal-800",
      Navigate: "bg-slate-100 text-slate-500",
      "Select Project": "bg-cyan-100 text-cyan-800",
      Reject: "bg-red-100 text-red-700",
      Submit: "bg-indigo-100 text-indigo-800",
    };
    let style = map[action];
    if (!style) {
      if (action.includes("Add") || action.includes("Create")) style = map["Create"];
      else if (action.includes("Edit") || action.includes("Update")) style = map["Update"];
      else if (action.includes("Approve")) style = map["Approve"];
      else if (action.includes("Reject")) style = map["Reject"];
      else if (action.includes("Submit")) style = map["Submit"];
      else if (action.includes("Import")) style = map["Import"];
      else style = "bg-slate-100 text-slate-600";
    }
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style}`}>
        {action}
      </span>
    );
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Shield size={24} className="text-blue-600" /> Admin Dashboard
        </h2>
        {activeTab === "users" && <ColumnVisibilityToggle tableId="users" />}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "users"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} /> User Management
          </div>
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "logs"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <History size={16} /> System Logs
          </div>
        </button>
        <button
          onClick={() => setActiveTab("roles")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "roles"
            ? "border-orange-500 text-orange-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <Key size={16} /> Set Role
          </div>
        </button>
      </div>

      {activeTab === "users" && (
        <>
          <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2 w-full min-w-0">
            <div ref={adminUsersTableRef} className="w-full min-w-0">
              <table className="w-full text-left text-sm table-fixed">
                <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
                  <tr>
                    {isColumnVisible("users", "name") && <ResizableTh tableId="users" colKey="name" className="p-4" isAdmin={userRole === "Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.name}>Name</ResizableTh>}
                    {isColumnVisible("users", "role") && <ResizableTh tableId="users" colKey="role" className="p-4" isAdmin={userRole === "Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.role}>Role</ResizableTh>}
                    {isColumnVisible("users", "status") && <ResizableTh tableId="users" colKey="status" className="p-4" isAdmin={userRole === "Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.status}>Status</ResizableTh>}
                    {isColumnVisible("users", "projects") && <ResizableTh tableId="users" colKey="projects" className="p-4" isAdmin={userRole === "Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.projects}>Projects</ResizableTh>}
                    {isColumnVisible("users", "actions") && <th className="p-4 text-right" style={{ width: adminUsersTableLayout.scaled.actions }}>Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      {isColumnVisible("users", "name") && (
                        <td className="p-4" title={`${u.firstName || ""} ${u.lastName || ""} | ${u.email || ""}`}>
                          <div className="flex items-center gap-3">
                            <ProfileAvatar
                              src={u.profilePhotoUrl || u.photoURL}
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0"
                              fallback={
                                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                                  {u.firstName?.charAt(0) || u.email?.charAt(0) || "?"}
                                </div>
                              }
                            />
                            <div>
                              <div className="font-medium text-slate-900 cell-text">
                                {u.firstName} {u.lastName}
                              </div>
                              <div className="text-xs text-slate-500 cell-text">{u.email}</div>
                            </div>
                          </div>
                        </td>
                      )}
                      {isColumnVisible("users", "role") && (
                        <td className="p-4">
                          <span className="bg-slate-100 px-2 py-1 rounded text-xs font-semibold cell-text" title={u.role}>
                            {u.role}
                          </span>
                        </td>
                      )}
                      {isColumnVisible("users", "status") && (
                        <td className="p-4">
                          <Badge
                            status={
                              u.status === "Approved" ? "Approved User" : "Pending"
                            }
                          />
                        </td>
                      )}
                      {isColumnVisible("users", "projects") && (
                        <td className="p-4">
                          <div className="flex -space-x-2 overflow-hidden">
                            {(u.assignedProjectIds || []).length > 0 ? (
                              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full border border-blue-100">
                                {u.assignedProjectIds.length} Projects
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">None</span>
                            )}
                          </div>
                        </td>
                      )}
                      {isColumnVisible("users", "actions") && (
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-2 items-center">
                            {u.status === "Pending" && (
                              <Button
                                variant="success"
                                onClick={() => handleApprove(u.id, u.email)}
                              >
                                Approve
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              onClick={() => handleEditClick(u)}
                            >
                              <Settings size={14} /> Manage
                            </Button>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={`ลบผู้ใช้ ${u.email}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {activeTab === "logs" && (
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2 flex flex-col min-h-[calc(100vh-220px)]">
          <div className="px-3 py-2.5 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">
              System Logs (Last 1000 activities)
            </h3>
            <Button
              variant="outline"
              onClick={handleExportLogs}
              className="bg-white"
            >
              <FileSpreadsheet size={14} /> Export CSV
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-2.5 py-2 w-40">Timestamp</th>
                  <th className="px-2.5 py-2 w-44">User</th>
                  <th className="px-2.5 py-2 w-28">Action</th>
                  <th className="px-2.5 py-2 w-52">โครงการ</th>
                  <th className="px-2.5 py-2">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedLogs.map((log) => {
                  const projectName = getLogProjectName(log);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-2.5 py-2 text-[11px] text-slate-500 font-mono whitespace-nowrap align-top">
                        {new Date(log.timestamp).toLocaleString("th-TH")}
                      </td>
                      <td className="px-2.5 py-2 align-top">
                        <div className="text-[11px] font-bold text-slate-700 leading-tight">
                          {log.user}
                        </div>
                        <div className="text-[10px] text-slate-400 leading-tight">
                          {log.role}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 align-top">{getActionBadge(log.action)}</td>
                      <td className="px-2.5 py-2 align-top">
                        {projectName ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5 break-words max-w-[200px] leading-tight">
                            {projectName}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-[11px] text-slate-600 break-words max-w-xs leading-tight align-top">
                        {cleanLogDetails(log.details || "")}
                      </td>
                    </tr>
                  );
                })}
                {paginatedLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No logs available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-2 border-t bg-slate-50 text-xs">
                <span className="text-slate-500">
                  หน้า {logsPage} / {totalPages} ({logs.length} รายการ)
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                    disabled={logsPage <= 1}
                    className="px-2 py-1 rounded border bg-white disabled:opacity-40 hover:bg-slate-100"
                  >
                    &larr; ก่อนหน้า
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setLogsPage(p)}
                      className={`px-2 py-1 rounded border min-w-[1.75rem] ${
                        p === logsPage ? "bg-blue-600 text-white border-blue-600" : "bg-white hover:bg-slate-100"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setLogsPage((p) => Math.min(totalPages, p + 1))}
                    disabled={logsPage >= totalPages}
                    className="px-2 py-1 rounded border bg-white disabled:opacity-40 hover:bg-slate-100"
                  >
                    ถัดไป &rarr;
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === "roles" && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2" onClick={() => setOpenFuncDropdown(null)}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Key size={16} className="text-orange-500" /> Set Role Permissions
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                <strong>อ่าน</strong> = แสดงเมนูใน Sidebar &nbsp;|&nbsp; <strong>เขียน</strong> = เลือกฟังก์ชันที่ใช้ได้ในเมนูนั้น
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddRole();
                  }
                }}
                placeholder="เพิ่ม Role ใหม่"
                className="w-44 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              />
              <Button
                variant="outline"
                onClick={handleAddRole}
                disabled={savingNewRole}
                className="flex items-center gap-2"
              >
                <Plus size={14} />
                {savingNewRole ? "กำลังเพิ่ม..." : "เพิ่ม Role"}
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveRolePermissions}
                disabled={savingRoles}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white"
              >
                <Save size={14} />
                {savingRoles ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </div>

          <Card className="overflow-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200">
                  <th className="text-left p-3 font-bold text-slate-700 sticky left-0 bg-slate-50 z-10 min-w-[140px] border-r border-slate-200" rowSpan={2}>
                    Role
                  </th>
                  {SIDEBAR_MODULES.map((m) => (
                    <th
                      key={m.key}
                      className="p-2 text-center font-semibold text-slate-600 border-b border-slate-200 border-l border-slate-100"
                      colSpan={MODULE_FUNCTIONS[m.key]?.length > 0 ? 2 : 1}
                    >
                      <span className="text-xs">{m.label}</span>
                    </th>
                  ))}
                  <th className="p-2 text-center font-semibold text-slate-600 border-b border-slate-200 border-l border-slate-100">
                    <span className="text-xs">PR Type ที่มองเห็น</span>
                  </th>
                </tr>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500">
                  {SIDEBAR_MODULES.map((m) => (
                    MODULE_FUNCTIONS[m.key]?.length > 0 ? (
                      <React.Fragment key={m.key}>
                        <th className="px-2 py-1 text-center font-medium border-l border-slate-100 text-orange-500">อ่าน</th>
                        <th className="px-2 py-1 text-center font-medium text-blue-500">เขียน</th>
                      </React.Fragment>
                    ) : (
                      <th key={m.key} className="px-2 py-1 text-center font-medium border-l border-slate-100 text-orange-500">อ่าน</th>
                    )
                  ))}
                  <th className="px-2 py-1 text-center font-medium border-l border-slate-100 text-purple-500">เลือก PR Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managedRoles.map((role, idx) => {
                  const isAdminRole = role === "Administrator";
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/50";
                  return (
                    <tr key={role} className={`${rowBg} hover:bg-orange-50/30 transition-colors`}>
                      <td className={`p-3 sticky left-0 z-10 border-r border-slate-200 ${rowBg}`}>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${isAdminRole ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                          }`}>
                          {isAdminRole && <Shield size={10} />}
                          {role}
                        </span>
                      </td>
                      {SIDEBAR_MODULES.map((m) => {
                        const isAdminModuleLocked = m.key === "admin";
                        const readChecked = isAdminRole ? true : (localPermissions[m.key] || []).includes(role);
                        const readDisabled = isAdminRole || isAdminModuleLocked;
                        const funcs = MODULE_FUNCTIONS[m.key] || [];
                        const dropdownKey = `${m.key}:${role}`;
                        const isDropdownOpen = openFuncDropdown === dropdownKey;

                        // Count enabled write functions for this role+module
                        const enabledFuncCount = funcs.filter((f) => {
                          if (isAdminRole) return true;
                          const allowedRoles = localFunctionPermissions[m.key]?.[f.key];
                          if (!allowedRoles) return false; // default: not set = not enabled in UI
                          return allowedRoles.includes(role);
                        }).length;

                        return (
                          <React.Fragment key={m.key}>
                            {/* READ column */}
                            <td className="p-2 text-center border-l border-slate-100">
                              <label className={`inline-flex items-center justify-center ${readDisabled ? "cursor-not-allowed" : "cursor-pointer"}`}>
                                <input
                                  type="checkbox"
                                  checked={readChecked}
                                  disabled={readDisabled}
                                  onChange={() => !readDisabled && handleRolePermissionToggle(m.key, role)}
                                  className="w-4 h-4 rounded border-slate-300 accent-orange-500 disabled:opacity-40"
                                />
                              </label>
                            </td>
                            {/* WRITE column (only if module has functions) */}
                            {funcs.length > 0 && (
                              <td className="p-2 text-center relative">
                                {!readChecked && !isAdminRole ? (
                                  <span className="text-[10px] text-slate-300">—</span>
                                ) : (
                                  <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => setOpenFuncDropdown(isDropdownOpen ? null : dropdownKey)}
                                      disabled={isAdminRole}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${isAdminRole
                                        ? "bg-blue-50 text-blue-400 border-blue-100 cursor-not-allowed"
                                        : enabledFuncCount > 0
                                          ? "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100"
                                          : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                                        }`}
                                    >
                                      {isAdminRole ? `${funcs.length}/${funcs.length}` : `${enabledFuncCount}/${funcs.length}`} ▾
                                    </button>
                                    {isDropdownOpen && (
                                      <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl py-1">
                                        <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                          {m.label} — {role}
                                        </div>
                                        {funcs.map((f) => {
                                          const allowedRoles = localFunctionPermissions[m.key]?.[f.key];
                                          const isEnabled = allowedRoles ? allowedRoles.includes(role) : false;
                                          return (
                                            <label
                                              key={f.key}
                                              className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                                            >
                                              <input
                                                type="checkbox"
                                                checked={isEnabled}
                                                onChange={() => handleFunctionToggle(m.key, role, f.key)}
                                                className="w-3.5 h-3.5 rounded border-slate-300 accent-blue-500"
                                              />
                                              <span className="text-xs text-slate-700">{f.label}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </td>
                            )}
                          </React.Fragment>
                        );
                      })}
                      {/* PR Type column */}
                      <td className="p-2 text-center border-l border-slate-100 relative">
                        <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setOpenPRTypeDropdown(openPRTypeDropdown === role ? null : role)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${(localPRTypePermissions[role] || []).length > 0
                              ? "bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100"
                              : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                              }`}
                          >
                            {(localPRTypePermissions[role] || []).length}/{PURCHASE_TYPES.length} ▾
                          </button>
                          {openPRTypeDropdown === role && (
                            <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl py-1 max-h-60 overflow-y-auto">
                              <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide sticky top-0 bg-white">
                                PR Type — {role}
                              </div>
                              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer border-b border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={(localPRTypePermissions[role] || []).length === PURCHASE_TYPES.length}
                                  onChange={() => handlePRTypeAllToggle(role)}
                                  className="w-3.5 h-3.5 rounded border-slate-300 accent-purple-500"
                                />
                                <span className="text-xs text-slate-700 font-semibold">All Types</span>
                              </label>
                              {PURCHASE_TYPES.map((pt) => {
                                const isChecked = (localPRTypePermissions[role] || []).includes(pt);
                                return (
                                  <label
                                    key={pt}
                                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => handlePRTypeToggle(role, pt)}
                                      className="w-3.5 h-3.5 rounded border-slate-300 accent-purple-500"
                                    />
                                    <span className="text-xs text-slate-700">{pt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <p className="text-xs text-slate-400">
            * Administrator มีสิทธิ์ทุกอย่างเสมอ — เขียน X/Y หมายถึง X ฟังก์ชันที่ Role นี้ใช้ได้จากทั้งหมด Y ฟังก์ชัน (คลิกเพื่อเลือก)
          </p>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 pb-2 border-b">
              <h3 className="text-lg font-bold text-slate-800">
                จัดการสิทธิ์ผู้ใช้งาน
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                <strong>User:</strong> {editUser?.firstName}{" "}
                {editUser?.lastName} ({editUser?.email})
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Role (ตำแหน่ง/สิทธิ์)">
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({ ...editForm, role: e.target.value })
                    }
                  >
                    {managedRoles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </InputGroup>
                <InputGroup label="Status (สถานะ)">
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </InputGroup>
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  สิทธิ์การเข้าถึงโครงการ (Project Access)
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded bg-slate-50">
                  {projects.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 p-2 bg-white rounded border border-slate-100 cursor-pointer hover:border-blue-300 transition-colors"
                    >
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 shadow-sm checked:bg-blue-600 checked:border-blue-600"
                          checked={editForm.assignedProjectIds.includes(p.id)}
                          onChange={() => handleProjectToggle(p.id)}
                        />
                        <CheckSquare
                          className="absolute pointer-events-none hidden peer-checked:block text-white"
                          size={12}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-800">
                          {p.jobNo}
                        </div>
                        <div className="text-xs text-slate-500 truncate w-64">
                          {p.name}
                        </div>
                      </div>
                    </label>
                  ))}
                  {projects.length === 0 && (
                    <div className="text-center text-slate-400 text-xs py-4">
                      ไม่พบโครงการในระบบ
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  * ผู้ใช้งานจะเห็นเฉพาะโครงการที่ถูกเลือกเท่านั้น
                  (Administrator เห็นทั้งหมด)
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button
                  variant="secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleSaveUserChanges}>
                  บันทึกการเปลี่ยนแปลง
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// --- Main App Logic (Authenticated) ---


export default AppShell;

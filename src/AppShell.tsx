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
  DollarSign, Calendar, PlusCircle, ChevronRight, ChevronLeft, ChevronUp, Play, BarChart3,
  FileSpreadsheet, Download, Upload, CreditCard
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, doc, onSnapshot, query, updateDoc, addDoc, deleteDoc,
  orderBy, limit, getDocs, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, getBytes } from "firebase/storage";
import { db, appId, storage, FORM_TEMPLATE_PATHS } from "./lib/firebase";
import { generatePRPdfBytes, generatePOPdfBytes, downloadBytes, uploadGeneratedPdf, deleteGeneratedPdf } from "./lib/pdfForms";
import { Card, Button, InputGroup, Badge, formatCurrency } from "./components/ui";
import ResizableTh from "./components/ResizableTh";
import { useProportionalTableLayout, chainTableResizeHandlers } from "./hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "./lib/tableLayoutDefaults";
import { MODULE_ACCESS, MODULE_FUNCTIONS } from "./lib/constants";
import { AuthContext } from "./auth/AuthContext";
import { useAppData } from "./contexts/AppDataContext";
import { useUI } from "./contexts/UIContext";
import { SidebarItem } from "./components/ui";
import DashboardView from "./views/DashboardView";
import VendorView from "./views/VendorView";
import MaterialView from "./views/MaterialView";
import InvoiceView from "./views/InvoiceView";
import ReceiveView from "./views/ReceiveView";
import ProjectsView from "./views/ProjectsView";
import PRView from "./views/PRView";
import POView from "./views/POView";
import PaymentView from "./views/PaymentView";
import PaymentTableView from "./views/PaymentTableView";
import BudgetView from "./views/BudgetView";
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
  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem("cmgbudget_sidebarCollapsed", String(next)); } catch (_) {}
      return next;
    });
  };

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
    "po", "payment-subcontract", "vendor", "material", "receive", "invoice", "profile", "admin",
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
    if (visibleProjects.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    setSelectedProjectId((current) => {
      if (!current || !visibleProjects.some((p) => p.id === current)) return visibleProjects[0].id;
      return current;
    });
  }, [visibleProjects]);

  // โหลด vendors เมื่อเข้าหน้า PO / ตาราง PO / Vendor (ลดโควต้า — โหลดเฉพาะเมื่อใช้)
  useEffect(() => {
    if (activeMenu === "po" || activeMenu === "po-table" || activeMenu === "vendor") loadVendors();
  }, [activeMenu, loadVendors]);

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {!isFullScreenModalOpen && (
      <aside className={`${sidebarCollapsed ? "w-[4.5rem]" : "w-64"} bg-slate-900 text-white flex flex-col shadow-xl z-20 transition-[width] duration-200 ease-out overflow-hidden`}>
        <div className={`border-b border-slate-800 bg-slate-950 shrink-0 ${sidebarCollapsed ? "p-2" : "p-4"}`}>
          <div className={`rounded-xl bg-slate-800/80 border border-slate-700 ${sidebarCollapsed ? "p-2" : "p-3"}`}>
            <div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "gap-3"}`}>
              <ProfileAvatar
                src={userData?.profilePhotoUrl || user?.photoURL}
                className="w-11 h-11 rounded-full object-cover border-2 border-slate-600 shadow-md flex-shrink-0"
                fallback={
                  <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
                    {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </div>
                }
              />
              {!sidebarCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white truncate">
                    {userData?.firstName} {userData?.lastName}
                  </p>
                  <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide flex flex-wrap gap-0.5">
                    {userRoles.join(", ")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          {canAccessModule("dashboard") && (
            <SidebarItem
              icon={<LayoutDashboard size={20} />}
              label="ภาพรวม"
              active={activeMenu === "dashboard"}
              onClick={() => handleMenuChange("dashboard")}
              collapsed={sidebarCollapsed}
            />
          )}
          {!sidebarCollapsed && (
            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
              Modules
            </div>
          )}
          {canAccessModule("projects") && (
            <SidebarItem
              icon={<Briefcase size={20} className="text-amber-300" />}
              label="จัดการโครงการ"
              active={activeMenu === "projects"}
              onClick={() => handleMenuChange("projects")}
              collapsed={sidebarCollapsed}
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
                    onClick={() => handleMenuChange("budget")}
                    collapsed={sidebarCollapsed}
                    badge={projBadge.budget}
                  />
                )}
                {(canAccessModule("pr") || canAccessModule("pr-table")) && (
                  <SidebarItem
                    icon={<FileText size={20} className="text-sky-300" />}
                    label="Purchase Request (PR)"
                    active={activeMenu === "pr"}
                    onClick={() => handleMenuChange("pr")}
                    collapsed={sidebarCollapsed}
                    badge={projBadge.pr}
                  />
                )}
                {(canAccessModule("po") || canAccessModule("po-table")) && (
                  <SidebarItem
                    icon={<ShoppingCart size={20} className="text-rose-300" />}
                    label="Purchase Order (PO)"
                    active={activeMenu === "po"}
                    onClick={() => handleMenuChange("po")}
                    collapsed={sidebarCollapsed}
                    badge={projBadge.po}
                  />
                )}
                {canAccessModule("payment-subcontract") && (
                  <SidebarItem
                    icon={<CreditCard size={20} className="text-orange-300" />}
                    label="Payment Subcontract"
                    active={activeMenu === "payment-subcontract"}
                    onClick={() => handleMenuChange("payment-subcontract")}
                    collapsed={sidebarCollapsed}
                    badge={projBadge["payment-subcontract"]}
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
              onClick={() => handleMenuChange("receive")}
              collapsed={sidebarCollapsed}
            />
          )}
          {canAccessModule("invoice") && (
            <SidebarItem
              icon={<FileText size={20} />}
              label="Invoice"
              active={activeMenu === "invoice"}
              onClick={() => handleMenuChange("invoice")}
              collapsed={sidebarCollapsed}
            />
          )}

          {!sidebarCollapsed && (
            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
              Database
            </div>
          )}
          {canAccessModule("vendor") && (
            <SidebarItem
              icon={<Building2 size={20} className="text-violet-300" />}
              label="Vendor Management"
              active={activeMenu === "vendor"}
              onClick={() => handleMenuChange("vendor")}
              collapsed={sidebarCollapsed}
            />
          )}
          {canAccessModule("material") && (
            <SidebarItem
              icon={<Package size={20} className="text-teal-300" />}
              label="Material"
              active={activeMenu === "material"}
              onClick={() => handleMenuChange("material")}
              collapsed={sidebarCollapsed}
            />
          )}

          {!sidebarCollapsed && (
            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
              System
            </div>
          )}
          {canAccessModule("profile") && (
            <SidebarItem
              icon={<User size={20} />}
              label="ข้อมูลส่วนตัว (Profile)"
              active={activeMenu === "profile"}
              onClick={() => handleMenuChange("profile")}
              collapsed={sidebarCollapsed}
            />
          )}
          {canAccessModule("admin") && (
            <SidebarItem
              icon={<Shield size={20} />}
              label="ผู้ดูแลระบบ (Admin)"
              active={activeMenu === "admin"}
              onClick={() => handleMenuChange("admin")}
              collapsed={sidebarCollapsed}
            />
          )}
        </nav>
        <div className={`border-t border-slate-800 shrink-0 flex items-center justify-center gap-1 ${sidebarCollapsed ? "py-2 px-1" : "p-4"}`}>
          <button
            type="button"
            onClick={toggleSidebar}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title={sidebarCollapsed ? "ขยายแถบเมนู" : "ย่อแถบเมนู"}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          {!sidebarCollapsed && (
            <span className="text-[10px] text-slate-500 text-center flex-1">CMG Budget Control V.20</span>
          )}
        </div>
      </aside>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-50/50">
        {!isFullScreenModalOpen && (
        <header className="bg-white/80 backdrop-blur-md shadow-sm px-8 py-4 flex items-center gap-4 sticky top-0 z-20 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 shrink-0">
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
                              : activeMenu === "receive"
                              ? "Receive"
                              : activeMenu === "profile"
                                ? "User Profile"
                                : activeMenu === "admin"
                                  ? "Admin Dashboard"
                                  : "Module View"}
          </h1>
          {/* Spacer — ดัน project cards + bell + profile ไปชิดขวา */}
          <div className="flex-1" />

          {/* Project Cards — อยู่ขวา ก่อนกระดิ่ง ขยายออกซ้ายเมื่อมีโครงการเพิ่ม */}
          {["budget","pr","po","payment-subcontract","invoice","receive"].includes(activeMenu) && visibleProjects.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {visibleProjects.map((p) => {
                const projPending = pendingByProject?.find((x) => x.projectId === p.id);
                const pendingTotal = projPending?.total || 0;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProjectId(p.id)}
                    title={p.name}
                    className={`relative flex-shrink-0 w-10 h-10 rounded-lg text-[10px] font-extrabold transition-all text-center flex items-center justify-center px-0.5 break-all ${
                      selectedProjectId === p.id
                        ? "bg-orange-500 text-white shadow-md scale-105"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                    }`}
                  >
                    {p.jobNo || (p.name || "?").slice(0, 4)}
                    {pendingTotal > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-3.5 flex items-center justify-center px-0.5 shadow animate-pulse">
                        {pendingTotal > 99 ? "99+" : pendingTotal}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3 shrink-0">
            {/* Bell notification button */}
            <div className="relative">
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                title="รายการรออนุมัติ"
              >
                <Bell size={20} />
                {totalPendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-md animate-pulse">
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
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-slate-100 hover:bg-slate-200/80 transition-colors"
                title="โปรไฟล์"
              >
                <ProfileAvatar
                  src={userData?.profilePhotoUrl || user?.photoURL}
                  className="w-8 h-8 rounded-full object-cover border border-slate-300"
                  fallback={
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
                      {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                    </div>
                  }
                />
                <ChevronDown size={16} className="text-slate-500" />
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
                        handleMenuChange("profile");
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
          className={
            ["projects", "budget", "pr", "po", "payment-subcontract", "vendor", "material", "invoice", "receive", "admin"].includes(
              activeMenu
            )
              ? "p-4 md:p-6 w-full max-w-none min-w-0"
              : "p-8 max-w-[1600px] mx-auto"
          }
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
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    prTab === "system"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><FileText size={16} /> ระบบ PR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPrTab("table")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    prTab === "table"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet size={16} /> ตารางข้อมูล PR</span>
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
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    poTab === "system"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><ShoppingCart size={16} /> ระบบ PO</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPoTab("table")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    poTab === "table"
                      ? "bg-blue-600 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet size={16} /> ตารางข้อมูล PO</span>
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
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    paymentSubTab === "system"
                      ? "bg-orange-500 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><CreditCard size={16} /> ระบบ Payment Subcontract</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentSubTab("table")}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    paymentSubTab === "table"
                      ? "bg-orange-500 text-white shadow"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span className="flex items-center gap-2"><FileSpreadsheet size={16} /> ตารางข้อมูล Payment</span>
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
            <div data-menu-page="receive" style={{ display: activeMenu === "receive" ? undefined : "none" }}>
              {activeMenu === "receive" && <ReceiveView />}
            </div>
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
  const { canUseFunction, userRoles = [], logAction, isColumnVisible } = useAppData();
  const tableModule = mode === "pr" ? "pr-table" : "po-table";
  const tblId = mode === "pr" ? "pr-table" : "po-table";
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterProject, setFilterProject] = React.useState(selectedProjectId || "all");

  // ซิงก์ filterProject เมื่อ selectedProjectId เปลี่ยน (เช่นกดเปลี่ยนโครงการที่ header)
  React.useEffect(() => {
    setFilterProject(selectedProjectId || "all");
  }, [selectedProjectId]);
  const [emailModal, setEmailModal] = React.useState<{ doc: any; kind: "pr" | "po" } | null>(null);
  const [emailTo, setEmailTo] = React.useState("");
  const [pdfLoadingId, setPdfLoadingId] = React.useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = React.useState<string | null>(null);

  const isPR = mode === "pr";

  const prPoTableWrapRef = React.useRef(null);
  const resizeFn = handleColumnResize || ((_tid: string, _k: string, _w: number) => {});
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
        try { await navigator.clipboard.writeText(url); } catch (_) {}
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
    try { navigator.clipboard.writeText(po.pdfUrl); } catch (_) {}
    setEmailModal(null); setEmailTo("");
    showAlert?.("เตรียมอีเมลแล้ว", "เปิดหน้าส่งเมลให้แล้ว และคัดลอกลิงก์ PDF เรียบร้อย", "success");
  };

  const rows = isPR ? prs : pos;

  const filtered = rows.filter((r: any) => {
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
  });

  const allProjects = Array.from(new Set(rows.map((r: any) => r.projectId))).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${isPR ? "bg-slate-700" : "bg-red-600"}`}>
            {isPR ? <FileText size={18} className="text-white" /> : <ShoppingCart size={18} className="text-white" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-800">
                {isPR ? "ตารางข้อมูล Purchase Request" : "ตารางข้อมูล Purchase Order"}
              </h2>
              <ColumnVisibilityToggle tableId={tblId} />
            </div>
            <p className="text-xs text-slate-500">
              {filtered.length} รายการ {filterStatus !== "all" ? `(${filterStatus})` : "ทั้งหมด"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
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
        <div ref={prPoTableWrapRef} className="w-full min-w-0">
          <table className="w-full text-left text-xs table-fixed">
            <thead>
              <tr className="bg-slate-800 text-white">
                {isColumnVisible(tblId, "rowNum") && <th className="px-2 py-0.5 font-semibold" style={{ width: prPoScaled.rowNum }}>#</th>}
                {isColumnVisible(tblId, "no") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="no" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.no}>{isPR ? "PR No." : "PO No."}</ResizableTh>}
                {isColumnVisible(tblId, "project") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="project" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.project}>โครงการ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "costCode") && <ResizableTh tableId="pr-table" colKey="costCode" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.costCode}>Cost Code</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "description") && <ResizableTh tableId="pr-table" colKey="description" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.description}>รายการงบ</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "costCode") && <ResizableTh tableId="po-table" colKey="costCode" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.costCode}>Cost Code</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "vendor") && <ResizableTh tableId="po-table" colKey="vendor" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.vendor}>Vendor</ResizableTh>}
                {!isPR && isColumnVisible("po-table", "prRef") && <ResizableTh tableId="po-table" colKey="prRef" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={poTableLayout.scaled.prRef}>Ref PR No.</ResizableTh>}
                {isColumnVisible(tblId, "date") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="date" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.date}>วันที่</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "requestor") && <ResizableTh tableId="pr-table" colKey="requestor" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.requestor}>ผู้ขอ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "type") && <ResizableTh tableId="pr-table" colKey="type" className="px-2 py-0.5 font-semibold" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.type}>ประเภท</ResizableTh>}
                {isColumnVisible(tblId, "items") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="items" className="px-2 py-0.5 font-semibold text-right" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.items}>จำนวนรายการ</ResizableTh>}
                {isColumnVisible(tblId, "amount") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="amount" className="px-2 py-0.5 font-semibold text-right" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.amount}>ยอดรวม</ResizableTh>}
                {isColumnVisible(tblId, "status") && <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="status" className="px-2 py-0.5 font-semibold text-center" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prPoScaled.status}>สถานะ</ResizableTh>}
                {isPR && isColumnVisible("pr-table", "poRef") && <ResizableTh tableId="pr-table" colKey="poRef" className="px-2 py-0.5 font-semibold text-center" isAdmin={userRole==="Administrator"} onResize={onPrPoTableResize} currentWidth={prTableLayout.scaled.poRef}>Ref PO</ResizableTh>}
                {isColumnVisible(tblId, "action") && <th className="px-2 py-0.5 font-semibold text-center" style={{ width: prPoScaled.action }}>Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={99} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="opacity-30" />
                      <span>ไม่พบข้อมูล</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r: any, idx: number) => {
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

                  return (
                    <tr key={r.id} className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${isEven ? "bg-white" : "bg-slate-50/40"}`} onClick={() => { if (!isPR && r.pdfUrl) setPdfPreviewUrl(r.pdfUrl); }}>
                      {isColumnVisible(tblId, "rowNum") && <td className="px-2 py-0.5 text-slate-400 font-mono">{idx + 1}</td>}
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
                              {getPrBudgetItemName(r) || (r.items && r.items.length > 0
                                ? r.items.map((it: any) => it.description).filter(Boolean).join(", ")
                                : getBudgetDesc(r.costCode, r.projectId))}
                            </span>
                            {r.items && r.items.length > 0 && (
                              <span className="block truncate text-[10px] text-slate-400 mt-0.5">
                                {r.items.map((it: any) => it.description).filter(Boolean).join(", ")}
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
                                <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
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
                              const resume = r.preCloseStatus || "Approved";
                              await updateData?.("prs", r.id, { status: resume, preCloseStatus: null, activeRequestedAt: null }, { skipLog: true });
                              logAction?.("Approved Active PR", `อนุมัติ Active PR ${r.prNo || r.id} → ${resume}`, r.projectId);
                              showAlert?.("สำเร็จ", `PR กลับสถานะ ${resume} แล้ว`, "success");
                            })}>
                              Active PR
                            </button>
                          )}
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
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
            <span>แสดง {filtered.length} รายการ</span>
            <div className="flex gap-4">
              {!isPR && (
                <span className="font-bold text-slate-600">
                  ยอดรวมทั้งหมด (Ex VAT): ฿{filtered.reduce((s: number, r: any) => {
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
                ยอดรวมทั้งหมด: ฿{filtered.reduce((s: number, r: any) => s + Number(isPR ? r.totalAmount : r.grandTotal || r.amount || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}
      </Card>

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
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
              canUploadSignature
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

    // V.16 Fetch Logs
    const qLogs = query(
      collection(db, "artifacts", appId, "public", "data", "logs"),
      orderBy("timestamp", "desc"),
      limit(250)
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(
        snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((log) => log.action !== "Navigate")
      );
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubLogs();
    };
  }, []);

  // Sync local state when Firestore data loads
  useEffect(() => {
    setLocalPermissions(rolePermissions);
  }, [rolePermissions]);

  useEffect(() => {
    setLocalFunctionPermissions(functionPermissions);
  }, [functionPermissions]);

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
      const [okModule, okFunc] = await Promise.all([
        saveRolePermissions(localPermissions),
        saveFunctionPermissions(funcPayload),
      ]);
      if (okModule && okFunc) {
        showAlert("บันทึกสำเร็จ", "อัปเดตสิทธิ์ Role เรียบร้อยแล้ว", "success");
        await logAction("Update", "Updated role permissions (read + write)");
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
          () => {},
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
                {isColumnVisible("users", "name") && <ResizableTh tableId="users" colKey="name" className="p-4" isAdmin={userRole==="Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.name}>Name</ResizableTh>}
                {isColumnVisible("users", "role") && <ResizableTh tableId="users" colKey="role" className="p-4" isAdmin={userRole==="Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.role}>Role</ResizableTh>}
                {isColumnVisible("users", "status") && <ResizableTh tableId="users" colKey="status" className="p-4" isAdmin={userRole==="Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.status}>Status</ResizableTh>}
                {isColumnVisible("users", "projects") && <ResizableTh tableId="users" colKey="projects" className="p-4" isAdmin={userRole==="Administrator"} onResize={adminUsersTableLayout.handleResize} currentWidth={adminUsersTableLayout.scaled.projects}>Projects</ResizableTh>}
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
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">
              System Logs (Last 250 activities)
            </h3>
            <Button
              variant="outline"
              onClick={handleExportLogs}
              className="bg-white"
            >
              <FileSpreadsheet size={14} /> Export CSV
            </Button>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 w-40">Timestamp</th>
                  <th className="p-3 w-44">User</th>
                  <th className="p-3 w-28">Action</th>
                  <th className="p-3 w-52">โครงการ</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => {
                  const projectName = getLogProjectName(log);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="p-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString("th-TH")}
                      </td>
                      <td className="p-3">
                        <div className="text-xs font-bold text-slate-700">
                          {log.user}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {log.role}
                        </div>
                      </td>
                      <td className="p-3">{getActionBadge(log.action)}</td>
                      <td className="p-3">
                        {projectName ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 rounded px-2 py-0.5 break-words max-w-[200px]">
                            {projectName}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3 text-xs text-slate-600 break-words max-w-xs">
                        {cleanLogDetails(log.details || "")}
                      </td>
                    </tr>
                  );
                })}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No logs available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {managedRoles.map((role, idx) => {
                  const isAdminRole = role === "Administrator";
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-slate-50/50";
                  return (
                    <tr key={role} className={`${rowBg} hover:bg-orange-50/30 transition-colors`}>
                      <td className={`p-3 sticky left-0 z-10 border-r border-slate-200 ${rowBg}`}>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${
                          isAdminRole ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
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
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors ${
                                        isAdminRole
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

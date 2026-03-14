// @ts-nocheck
import React, { useContext, useEffect, useState, useRef } from "react";
import {
  LayoutDashboard, Briefcase, Wallet, FileText, ShoppingCart, FileInput,
  Users, Settings, Bell, ChevronDown, LogOut, Shield, UserCircle, AtSign,
  User, Lock, Unlock, UserCheck, History, Plus, Trash2, Edit, CheckCircle,
  XCircle, Key, Save, RefreshCw, Hash, FileOutput, Search, ListFilter,
  Clock, Package, Tag, ClipboardList, CheckSquare, Square,
  Paperclip, Mail, Flame, MapPinned, CircleDot, Zap, Building2, MapPin,
  DollarSign, Calendar, PlusCircle, ChevronRight, ChevronLeft, ChevronUp, Play, BarChart3,
  FileSpreadsheet, Download, Upload
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  collection, doc, onSnapshot, query, updateDoc, addDoc, deleteDoc,
  orderBy, limit, getDocs, where,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from "firebase/storage";
import { db, appId, storage, FORM_TEMPLATE_PATHS } from "./lib/firebase";
import { generatePRPdfBytes, generatePOPdfBytes, downloadBytes, uploadGeneratedPdf } from "./lib/pdfForms";
import { Card, Button, InputGroup, Badge, formatCurrency } from "./components/ui";
import ResizableTh from "./components/ResizableTh";
import { USER_ROLES } from "./lib/constants";
import { AuthContext } from "./auth/AuthContext";
import { useAppData } from "./contexts/AppDataContext";
import { useUI } from "./contexts/UIContext";
import { SidebarItem } from "./components/ui";
import DashboardView from "./views/DashboardView";
import VendorView from "./views/VendorView";
import MaterialView from "./views/MaterialView";
import InvoiceView from "./views/InvoiceView";
import ProjectsView from "./views/ProjectsView";
import PRView from "./views/PRView";
import POView from "./views/POView";
import BudgetView from "./views/BudgetView";
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
    totalPendingCount, pendingByProject,
    handlePRAction, handlePOAction,
    showAlert, openConfirm,
    canAccessModule,
    userRoles = [userRole],
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
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt=""
                  className="w-11 h-11 rounded-full object-cover border-2 border-slate-600 shadow-md flex-shrink-0"
                />
              ) : (
                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0">
                  {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                </div>
              )}
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
              icon={<Briefcase size={20} />}
              label="จัดการโครงการ"
              active={activeMenu === "projects"}
              onClick={() => handleMenuChange("projects")}
              collapsed={sidebarCollapsed}
            />
          )}
          {canAccessModule("budget") && (
            <SidebarItem
              icon={<Wallet size={20} />}
              label="Project Budget"
              active={activeMenu === "budget"}
              onClick={() => handleMenuChange("budget")}
              collapsed={sidebarCollapsed}
            />
          )}
          {(canAccessModule("pr") || canAccessModule("pr-table")) && (
            <SidebarGroup
              icon={<FileText size={20} />}
              label="Purchase Request (PR)"
              isActive={activeMenu === "pr" || activeMenu === "pr-table"}
              collapsed={sidebarCollapsed}
            >
              <SidebarSubItem
                label="ระบบ PR"
                active={activeMenu === "pr"}
                onClick={() => handleMenuChange("pr")}
              />
              <SidebarSubItem
                label="ตารางข้อมูล PR"
                active={activeMenu === "pr-table"}
                onClick={() => handleMenuChange("pr-table")}
              />
            </SidebarGroup>
          )}
          {(canAccessModule("po") || canAccessModule("po-table") || canAccessModule("vendor") || canAccessModule("material")) && (
            <SidebarGroup
              icon={<ShoppingCart size={20} />}
              label="Purchase Order (PO)"
              isActive={activeMenu === "po" || activeMenu === "po-table" || activeMenu === "vendor" || activeMenu === "material"}
              collapsed={sidebarCollapsed}
            >
              <SidebarSubItem
                label="ระบบ PO"
                active={activeMenu === "po"}
                onClick={() => handleMenuChange("po")}
              />
              <SidebarSubItem
                label="ตารางข้อมูล PO"
                active={activeMenu === "po-table"}
                onClick={() => handleMenuChange("po-table")}
              />
              <SidebarSubItem
                label="Vendor Management"
                active={activeMenu === "vendor"}
                onClick={() => handleMenuChange("vendor")}
              />
              <SidebarSubItem
                label="Material"
                active={activeMenu === "material"}
                onClick={() => handleMenuChange("material")}
              />
            </SidebarGroup>
          )}
          {canAccessModule("invoice") && (
            <SidebarItem
              icon={<FileInput size={20} />}
              label="Invoice Receive"
              active={activeMenu === "invoice"}
              onClick={() => handleMenuChange("invoice")}
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
                    ? "ระบบ Purchase Request (PR)"
                    : activeMenu === "pr-table"
                      ? "ตารางข้อมูล PR"
                      : activeMenu === "po"
                        ? "ระบบ Purchase Order (PO)"
                        : activeMenu === "po-table"
                          ? "ตารางข้อมูล PO"
                          : activeMenu === "vendor"
                            ? "Vendor Management"
                            : activeMenu === "material"
                              ? "Material"
                              : activeMenu === "invoice"
                              ? "Invoice Receive"
                              : activeMenu === "profile"
                                ? "User Profile"
                                : activeMenu === "admin"
                                  ? "Admin Dashboard"
                                  : "Module View"}
          </h1>
          {/* Spacer — ดัน project cards + bell + profile ไปชิดขวา */}
          <div className="flex-1" />

          {/* Project Cards — อยู่ขวา ก่อนกระดิ่ง ขยายออกซ้ายเมื่อมีโครงการเพิ่ม */}
          {["budget","pr","pr-table","po","po-table","invoice"].includes(activeMenu) && visibleProjects.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {visibleProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProjectId(p.id)}
                  title={p.name}
                  className={`flex-shrink-0 w-10 h-10 rounded-lg text-[10px] font-extrabold transition-all text-center flex items-center justify-center px-0.5 break-all ${
                    selectedProjectId === p.id
                      ? "bg-orange-500 text-white shadow-md scale-105"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                  }`}
                >
                  {p.jobNo || (p.name || "?").slice(0, 4)}
                </button>
              ))}
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
                            setActiveMenu("budget");
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
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover border border-slate-300"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
                    {userData?.firstName?.charAt(0) || user?.email?.charAt(0) || "?"}
                  </div>
                )}
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
                        setActiveMenu("profile");
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
        <div className="p-8 max-w-[1600px] mx-auto">
          <motion.div
            key={activeMenu}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div data-menu-page="dashboard" style={{ display: activeMenu === "dashboard" ? undefined : "none" }}>
              <DashboardView />
            </div>
            <div data-menu-page="projects" style={{ display: activeMenu === "projects" ? undefined : "none" }}>
              <ProjectsView />
            </div>
            <div data-menu-page="budget" style={{ display: activeMenu === "budget" ? undefined : "none" }}>
              <BudgetView />
            </div>
            <div data-menu-page="pr" style={{ display: activeMenu === "pr" ? undefined : "none" }}>
              <PRView />
            </div>
            <div data-menu-page="po" style={{ display: activeMenu === "po" ? undefined : "none" }}>
              <POView />
            </div>
            <div data-menu-page="vendor" style={{ display: activeMenu === "vendor" ? undefined : "none" }}>
              <VendorView />
            </div>
            <div data-menu-page="material" style={{ display: activeMenu === "material" ? undefined : "none" }}>
              <MaterialView />
            </div>
            <div data-menu-page="invoice" style={{ display: activeMenu === "invoice" ? undefined : "none" }}>
              <InvoiceView />
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
            {(activeMenu === "pr-table" || activeMenu === "po-table") && (
              <div data-menu-page="pr-po-table">
                <PRPOTableView
                  mode={activeMenu === "pr-table" ? "pr" : "po"}
                  prs={prs}
                  pos={pos}
                  budgets={budgets}
                  projects={projects}
                  vendors={vendors}
                  columnWidths={columnWidths}
                  handleColumnResize={handleColumnResize}
                  userRole={userRole}
                  updateData={updateData}
                  showAlert={showAlert}
                  openConfirm={openConfirm}
                />
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

// --- Sidebar Group (expandable sub-menu) ---
const SidebarGroup = ({ icon, label, isActive, children, collapsed }) => {
  const [open, setOpen] = React.useState(isActive);
  const [popoverOpen, setPopoverOpen] = React.useState(false);
  const groupRef = React.useRef(null);
  React.useEffect(() => { if (isActive) setOpen(true); }, [isActive]);

  if (collapsed) {
    return (
      <div className="relative" ref={groupRef}>
        <motion.button
          onClick={() => setPopoverOpen((p) => !p)}
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
        <AnimatePresence>
          {popoverOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPopoverOpen(false)} aria-hidden />
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="absolute left-full top-0 ml-1 z-40 min-w-[180px] py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden"
              >
                <div className="px-3 py-2 border-b border-slate-700 text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
                <div className="p-1 space-y-0.5" onClick={() => setPopoverOpen(false)}>
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
            </>
          )}
        </AnimatePresence>
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
const PRPOTableView = ({ mode, prs, pos, budgets, projects, vendors, columnWidths, handleColumnResize, userRole, updateData, showAlert, openConfirm }: {
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
  showAlert?: (title: string, message: string, type: string) => void;
  openConfirm?: (title: string, message: string, onConfirm: () => void | Promise<void>, variant?: string) => void;
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterProject, setFilterProject] = React.useState("all");
  const [emailModal, setEmailModal] = React.useState<{ doc: any; kind: "pr" | "po" } | null>(null);
  const [emailTo, setEmailTo] = React.useState("");
  const [pdfLoadingId, setPdfLoadingId] = React.useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = React.useState<string | null>(null);

  const isPR = mode === "pr";

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
    "Pending Close PO": "bg-amber-50 text-amber-700 border-amber-200",
    "Closed PO": "bg-slate-100 text-slate-600 border-slate-300",
    "Edit Budget": "bg-red-100 text-red-800 border-red-300",
    "Pending MD": "bg-purple-50 text-purple-700 border-purple-200",
    "Pending GM": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Pending PM": "bg-blue-50 text-blue-700 border-blue-200",
    "Pending CM": "bg-cyan-50 text-cyan-700 border-cyan-200",
    "Pending PCM": "bg-orange-50 text-orange-700 border-orange-200",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Draft": "bg-slate-50 text-slate-500 border-slate-200",
    "Paid": "bg-teal-50 text-teal-700 border-teal-200",
    "Partial": "bg-yellow-50 text-yellow-700 border-yellow-200",
  };

  const getBudgetDesc = (costCode: string, projectId: string) =>
    budgets.find((b) => b.code === costCode && b.projectId === projectId)?.description || "-";

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || projectId;

  const allStatuses = isPR
    ? ["Approved", "PO Issued", "Edit Budget", "Pending Close", "Closed PR", "Pending MD", "Pending GM", "Pending PM", "Pending CM", "Rejected"]
    : ["Approved", "Pending PCM", "Pending GM", "Rejected", "Paid", "Partial", "Draft", "Pending Close PO", "Closed PO"];

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
    const matchSearch =
      !searchTerm ||
      (noField || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.costCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.requestor || r.vendor || "").toLowerCase().includes(searchTerm.toLowerCase());
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
            <h2 className="text-lg font-bold text-slate-800">
              {isPR ? "ตารางข้อมูล Purchase Request" : "ตารางข้อมูล Purchase Order"}
            </h2>
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
              placeholder={isPR ? "ค้นหา PR No., Cost Code..." : "ค้นหา PO No., Vendor..."}
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
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-3 font-semibold w-6">#</th>
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="no" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.no}>{isPR ? "PR No." : "PO No."}</ResizableTh>
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="project" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.project}>โครงการ</ResizableTh>
                {isPR && <ResizableTh tableId="pr-table" colKey="costCode" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["pr-table"]?.costCode}>Cost Code</ResizableTh>}
                {isPR && <ResizableTh tableId="pr-table" colKey="description" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["pr-table"]?.description}>รายการงบ</ResizableTh>}
                {!isPR && <ResizableTh tableId="po-table" colKey="vendor" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["po-table"]?.vendor}>Vendor</ResizableTh>}
                {!isPR && <ResizableTh tableId="po-table" colKey="prRef" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["po-table"]?.prRef}>PR อ้างอิง</ResizableTh>}
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="date" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.date}>วันที่</ResizableTh>
                {isPR && <ResizableTh tableId="pr-table" colKey="requestor" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["pr-table"]?.requestor}>ผู้ขอ</ResizableTh>}
                {isPR && <ResizableTh tableId="pr-table" colKey="type" className="px-3 py-3 font-semibold" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.["pr-table"]?.type}>ประเภท</ResizableTh>}
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="items" className="px-3 py-3 font-semibold text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.items}>จำนวนรายการ</ResizableTh>
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="amount" className="px-3 py-3 font-semibold text-right" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.amount}>ยอดรวม</ResizableTh>
                <ResizableTh tableId={isPR?"pr-table":"po-table"} colKey="status" className="px-3 py-3 font-semibold text-center" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths?.[isPR?"pr-table":"po-table"]?.status}>สถานะ</ResizableTh>
                <th className="px-3 py-3 font-semibold text-center w-28">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
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

                  return (
                    <tr key={r.id} className={`hover:bg-blue-50/40 transition-colors cursor-pointer ${isEven ? "bg-white" : "bg-slate-50/40"}`} onClick={() => { if (!isPR && r.pdfUrl) setPdfPreviewUrl(r.pdfUrl); }}>
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Hash size={10} className={isPR ? "text-slate-500" : "text-red-500"} />
                          {noField || "-"}
                          {!isPR && r.pdfUrl && (
                            <span title="มี PDF — คลิกแถวเพื่อดู" className="ml-0.5 text-red-500"><FileText size={10} /></span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-[140px] truncate" title={getProjectName(r.projectId)}>
                        {getProjectName(r.projectId)}
                      </td>
                      {isPR && (
                        <td className="px-3 py-2.5 font-mono text-slate-700">{r.costCode || "-"}</td>
                      )}
                      {isPR && (
                        <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate"
                          title={r.items && r.items.length > 0
                            ? r.items.map((it: any) => it.description).filter(Boolean).join(", ")
                            : getBudgetDesc(r.costCode, r.projectId)}>
                          {r.items && r.items.length > 0
                            ? r.items.map((it: any) => it.description).filter(Boolean).join(", ")
                            : getBudgetDesc(r.costCode, r.projectId)}
                        </td>
                      )}
                      {!isPR && (
                        <td className="px-3 py-2.5 text-slate-700 font-medium">{vendorName}</td>
                      )}
                      {!isPR && (
                        <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                          {(r.selectedPrIds || []).length > 0
                            ? prs.filter((p: any) => (r.selectedPrIds || []).includes(p.id)).map((p: any) => p.prNo).join(", ")
                            : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">
                        {dateField
                          ? (dateField.includes("T")
                              ? new Date(dateField).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" })
                              : dateField)
                          : "-"}
                      </td>
                      {isPR && <td className="px-3 py-2.5 text-slate-600">{r.requestor || "-"}</td>}
                      {isPR && (
                        <td className="px-3 py-2.5">
                          {r.purchaseType ? (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{r.purchaseType}</span>
                          ) : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right text-slate-600">{itemCount} รายการ</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                        ฿{Number(amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${statusClass}`}>
                          {r.status || "Draft"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" disabled={pdfLoadingId === r.id} className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="ส่งไฟล์ PDF ทางเมล" onClick={() => { setEmailModal({ doc: r, kind: isPR ? "pr" : "po" }); setEmailTo(""); }}>
                            <Mail size={14} />
                          </button>
                          <button type="button" disabled={pdfLoadingId === r.id} className="p-1.5 rounded hover:bg-slate-200 text-slate-600 hover:text-slate-800 disabled:opacity-40" title="Download PDF" onClick={() => isPR ? handlePRDownloadPDF(r) : handlePODownloadPDF(r)}>
                            {pdfLoadingId === r.id ? (
                              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" /></svg>
                            ) : (
                              <Download size={14} />
                            )}
                          </button>
                          {isPR && r.status !== "Closed PR" && r.status !== "Pending Close" && (
                            <button type="button" className="p-1.5 rounded hover:bg-amber-100 text-amber-700" title="ขอปิด PR (รอ PCM ยืนยัน)" onClick={() => openConfirm?.("ขอปิด PR", "เมื่อ PCM ยืนยันแล้ว สถานะจะเป็น Closed PR", async () => { await updateData?.("prs", r.id, { status: "Pending Close", closeRequestedAt: new Date().toISOString() }); showAlert?.("ส่งคำขอแล้ว", "รอ PCM ยืนยันการปิด PR", "info"); })}>
                              <XCircle size={14} />
                            </button>
                          )}
                          {isPR && r.status === "Pending Close" && (userRole === "PCM" || userRole === "Administrator") && (
                            <button type="button" className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium" title="ยืนยันปิด PR" onClick={() => openConfirm?.("ยืนยันปิด PR", "สถานะจะเปลี่ยนเป็น Closed PR", async () => { await updateData?.("prs", r.id, { status: "Closed PR" }); showAlert?.("สำเร็จ", "ปิด PR เรียบร้อย", "success"); })}>
                              ยืนยันปิด
                            </button>
                          )}
                          {!isPR && r.status !== "Closed PO" && r.status !== "Pending Close PO" && (
                            <button type="button" className="p-1.5 rounded hover:bg-amber-100 text-amber-700" title="ขอปิด PO (รอ PCM ยืนยัน)" onClick={() => openConfirm?.("ขอปิด PO", "เมื่อ PCM ยืนยันแล้ว สถานะจะเป็น Closed PO", async () => { await updateData?.("pos", r.id, { status: "Pending Close PO", closeRequestedAt: new Date().toISOString() }); showAlert?.("ส่งคำขอแล้ว", "รอ PCM ยืนยันการปิด PO", "info"); })}>
                              <XCircle size={14} />
                            </button>
                          )}
                          {!isPR && r.status === "Pending Close PO" && (userRole === "PCM" || userRole === "Administrator") && (
                            <button type="button" className="p-1.5 rounded hover:bg-emerald-100 text-emerald-700 text-[10px] font-medium" title="ยืนยันปิด PO" onClick={() => openConfirm?.("ยืนยันปิด PO", "สถานะจะเปลี่ยนเป็น Closed PO", async () => { await updateData?.("pos", r.id, { status: "Closed PO" }); showAlert?.("สำเร็จ", "ปิด PO เรียบร้อย", "success"); })}>
                              ยืนยันปิด
                            </button>
                          )}
                        </div>
                      </td>
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
            <span className="font-bold text-slate-700">
              ยอดรวมทั้งหมด: ฿{filtered.reduce((s: number, r: any) => s + Number(isPR ? r.totalAmount : r.grandTotal || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </Card>

      {/* Email modal for PR/PO PDF */}
      {emailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEmailModal(null)}>
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
        <div className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-[9999] p-4" onClick={() => setPdfPreviewUrl(null)}>
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
  const { user, userData, resetPassword, showAlert, logAction } =
    useContext(AuthContext);
  const { userRoles = [] } = useAppData();
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

  const handleUpdate = async () => {
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
      const storageRef = ref(storage, `signatures/${user.uid}/signature.png`);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        { signatureUrl: url }
      );
      setSignatureUrl(url);
      await logAction("Update", "Uploaded signature image");
      showAlert("สำเร็จ", "อัปโหลดลายเซ็นเรียบร้อย", "success");
    } catch (err) {
      showAlert("Error", err.message, "error");
    } finally {
      setUploadingSignature(false);
    }
  };

  const handleRemoveSignature = async () => {
    if (!confirm("ต้องการลบลายเซ็นหรือไม่?")) return;
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        { signatureUrl: null }
      );
      setSignatureUrl(null);
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
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 shadow-md"
            />
          ) : (
            <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
              <User size={40} />
            </div>
          )}
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
            <button
              onClick={handlePasswordReset}
              className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Key size={14} /> รีเซ็ตรหัสผ่าน
            </button>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setEditMode(false)}
                  >
                    ยกเลิก
                  </Button>
                  <Button onClick={handleUpdate}>บันทึกการเปลี่ยนแปลง</Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <Edit size={14} /> แก้ไขข้อมูล
                </Button>
              )}
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
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => signatureInputRef.current?.click()}
                disabled={uploadingSignature}
              >
                <Upload size={14} /> เปลี่ยนลายเซ็น
              </Button>
              <button
                className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                onClick={handleRemoveSignature}
              >
                <Trash2 size={13} /> ลบ
              </button>
            </div>
          </div>
        ) : (
          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors"
            onClick={() => signatureInputRef.current?.click()}
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
          onChange={handleSignatureUpload}
        />
      </Card>
    </div>
  );
};


const AdminDashboard = () => {
  const { showAlert, logAction, userData } = useContext(AuthContext);
  const { columnWidths, handleColumnResize } = useAppData();
  const userRole = userData?.role || "Staff";
  const [activeTab, setActiveTab] = useState("users"); // 'users' | 'logs' | 'forms'
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
  // แบบฟอร์ม PDF (Admin) — เก็บ URL สำหรับแสดงตัวอย่าง
  const [prFormUrl, setPrFormUrl] = useState(null);
  const [poFormUrl, setPoFormUrl] = useState(null);
  const [uploadingForm, setUploadingForm] = useState(null); // 'pr' | 'po' | null
  const [uploadPercent, setUploadPercent] = useState({ pr: 0, po: 0 });

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
      limit(100)
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubLogs();
    };
  }, []);

  // โหลด URL แบบฟอร์มจาก Storage เมื่อเปิดแท็บแบบฟอร์ม
  useEffect(() => {
    if (activeTab !== "forms") return;
    const loadFormUrls = async () => {
      try {
        const [prUrl, poUrl] = await Promise.all([
          getDownloadURL(ref(storage, FORM_TEMPLATE_PATHS.pr)).catch(() => null),
          getDownloadURL(ref(storage, FORM_TEMPLATE_PATHS.po)).catch(() => null),
        ]);
        setPrFormUrl(prUrl);
        setPoFormUrl(poUrl);
      } catch (_) {
        setPrFormUrl(null);
        setPoFormUrl(null);
      }
    };
    loadFormUrls();
  }, [activeTab]);

  const handleFormUpload = async (kind, file) => {
    if (!file || file.type !== "application/pdf") {
      showAlert("รูปแบบไฟล์", "กรุณาเลือกไฟล์ PDF เท่านั้น", "warning");
      return;
    }
    const path = FORM_TEMPLATE_PATHS[kind];
    setUploadingForm(kind);
    setUploadPercent((p) => ({ ...p, [kind]: 0 }));
    try {
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file, { contentType: "application/pdf" });
      const url = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("อัปโหลดใช้เวลานานเกินไป กรุณาลองใหม่ (ตรวจสอบ Storage Rules/อินเทอร์เน็ต)")), 90000);
        task.on(
          "state_changed",
          (snap) => {
            const pct = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
            setUploadPercent((p) => ({ ...p, [kind]: pct }));
          },
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
      if (kind === "pr") setPrFormUrl(url);
      else setPoFormUrl(url);
      showAlert("อัปโหลดสำเร็จ", `อัปโหลดแบบฟอร์ม ${kind === "pr" ? "PR" : "PO"} เรียบร้อย (แทนที่ของเก่า)`, "success");
    } catch (e) {
      showAlert("อัปโหลดไม่สำเร็จ", e?.message || "เกิดข้อผิดพลาด", "error");
    } finally {
      setUploadingForm(null);
      setUploadPercent((p) => ({ ...p, [kind]: 0 }));
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

  const handleExportLogs = () => {
    const headers = "Timestamp,Action,User,Role,Details\n";
    const rows = logs
      .map(
        (log) =>
          `"${new Date(log.timestamp).toLocaleString("th-TH")}",${log.action},${log.user
          },${log.role},"${log.details.replace(/"/g, '""')}"`
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
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Shield size={24} className="text-blue-600" /> Admin Dashboard
      </h2>

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
          onClick={() => setActiveTab("forms")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "forms"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <FileText size={16} /> แบบฟอร์ม PDF
          </div>
        </button>
      </div>

      {activeTab === "users" && (
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
              <tr>
                <ResizableTh tableId="users" colKey="name" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.name}>Name</ResizableTh>
                <ResizableTh tableId="users" colKey="role" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.role}>Role</ResizableTh>
                <ResizableTh tableId="users" colKey="status" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.status}>Status</ResizableTh>
                <ResizableTh tableId="users" colKey="projects" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.projects}>Projects</ResizableTh>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-4" title={`${u.firstName || ""} ${u.lastName || ""} | ${u.email || ""}`}>
                    <div className="flex items-center gap-3">
                      {u.photoURL ? (
                        <img
                          src={u.photoURL}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                          {u.firstName?.charAt(0) || u.email?.charAt(0) || "?"}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-slate-900 cell-text">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-xs text-slate-500 cell-text">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="bg-slate-100 px-2 py-1 rounded text-xs font-semibold cell-text" title={u.role}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge
                      status={
                        u.status === "Approved" ? "Approved User" : "Pending"
                      }
                    />
                  </td>
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
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === "logs" && (
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">
              System Logs (Last 100 activities)
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
                  <th className="p-3 w-48">User</th>
                  <th className="p-3 w-24">Action</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
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
                    <td className="p-3 text-xs text-slate-600 break-words max-w-lg">
                      {log.details}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      No logs available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === "forms" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
          <p className="text-sm text-slate-600">
            อัปโหลดไฟล์ PDF แบบฟอร์ม (มี Form Fields) ระบบจะเปลี่ยนชื่อเก็บเป็น <strong>pr-form-lib.pdf</strong> / <strong>po-form-lib.pdf</strong> และใช้แบบฟอร์มนี้ทุกครั้งที่พิมพ์ PR/PO
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FileText size={18} className="text-blue-600" /> แบบฟอร์ม PR (Purchase Request)
              </h3>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">ตัวอย่างแบบฟอร์มปัจจุบัน</label>
                <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden min-h-[280px]">
                  {prFormUrl ? (
                    <iframe src={`${prFormUrl}#toolbar=0`} title="PR Form Preview" className="w-full h-[320px]" />
                  ) : (
                    <div className="w-full h-[320px] flex items-center justify-center text-slate-400 text-sm">ยังไม่มีแบบฟอร์ม — อัปโหลดไฟล์ PDF</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  id="form-upload-pr"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFormUpload("pr", f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={uploadingForm === "pr"}
                  onClick={() => document.getElementById("form-upload-pr")?.click()}
                >
                  {uploadingForm === "pr" ? `กำลังอัปโหลด... ${uploadPercent.pr || 0}%` : "อัปโหลดแบบฟอร์ม PR (แทนที่ของเก่า)"}
                </Button>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
                <FileText size={18} className="text-red-600" /> แบบฟอร์ม PO (Purchase Order)
              </h3>
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">ตัวอย่างแบบฟอร์มปัจจุบัน</label>
                <div className="border border-slate-200 rounded-lg bg-slate-50 overflow-hidden min-h-[280px]">
                  {poFormUrl ? (
                    <iframe src={`${poFormUrl}#toolbar=0`} title="PO Form Preview" className="w-full h-[320px]" />
                  ) : (
                    <div className="w-full h-[320px] flex items-center justify-center text-slate-400 text-sm">ยังไม่มีแบบฟอร์ม — อัปโหลดไฟล์ PDF</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  id="form-upload-po"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFormUpload("po", f);
                    e.target.value = "";
                  }}
                />
                <Button
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={uploadingForm === "po"}
                  onClick={() => document.getElementById("form-upload-po")?.click()}
                >
                  {uploadingForm === "po" ? `กำลังอัปโหลด... ${uploadPercent.po || 0}%` : "อัปโหลดแบบฟอร์ม PO (แทนที่ของเก่า)"}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
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
                    {USER_ROLES.map((r) => (
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
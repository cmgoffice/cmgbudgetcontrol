// @ts-nocheck
import React from "react";
import { motion } from "framer-motion";
import { Briefcase, ChevronDown, LayoutDashboard } from "lucide-react";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";

export const Card = ({ children, className = "", onClick }: any) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-lg shadow-sm border border-slate-200 ${className}`}
  >
    {children}
  </div>
);

export const Button = ({
  children,
  onClick = () => {},
  variant = "primary",
  className = "",
  disabled = false,
  type = "button",
  ...props
}: any) => {
  const baseStyle =
    "px-3 py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95";
  const variants: Record<string, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md",
    secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    success: "bg-green-600 text-white hover:bg-green-700 hover:shadow-md",
    warning: "bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md",
    outline: "border border-slate-300 text-slate-600 hover:bg-slate-50 bg-white",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 border-none shadow-none",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

export const InputGroup = ({ label, children, className = "" }: any) => (
  <div className={`mb-3 ${className}`}>
    <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
    {children}
  </div>
);

export const Badge = ({ status }: any) => {
  const styles: Record<string, string> = {
    Draft: "bg-slate-100 text-slate-600 border border-slate-200",
    "Wait MD Approve": "bg-blue-50 text-blue-700 border border-blue-200",
    Approved: "bg-green-50 text-green-700 border border-green-200",
    "Revision Pending": "bg-orange-50 text-orange-700 border border-orange-200",
    "Pending PM": "bg-yellow-50 text-yellow-700 border border-yellow-200",
    "Pending PCM": "bg-orange-50 text-orange-700 border border-orange-200",
    "Pending GM": "bg-blue-50 text-blue-700 border border-blue-200",
    "Pending MD": "bg-purple-50 text-purple-700 border border-purple-200",
    "PO Issued": "bg-indigo-50 text-indigo-700 border border-indigo-200",
    "Edit Budget": "bg-red-100 text-red-800 border border-red-300",
    Rejected: "bg-red-50 text-red-700 border border-red-200",
    Paid: "bg-green-100 text-green-800",
    Pending: "bg-yellow-100 text-yellow-800",
    "Approved User": "bg-green-100 text-green-800",
    Login: "bg-blue-50 text-blue-600",
    Logout: "bg-slate-100 text-slate-600",
    Create: "bg-green-50 text-green-600",
    Update: "bg-orange-50 text-orange-600",
    Delete: "bg-red-50 text-red-600",
    Approve: "bg-purple-50 text-purple-600",
    Import: "bg-teal-50 text-teal-600",
  };
  let displayText = status;
  if (status === "Revision Pending") displayText = "รออนุมัติแก้ไข";
  if (status === "Approved User") displayText = "Active";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${styles[status] || "bg-gray-100"}`}>
      {displayText}
    </span>
  );
};

export const ProjectSelect = ({ projects, selectedId, onChange }: any) => (
  <div className="relative inline-block w-full md:w-96 group">
    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
      <Briefcase size={16} />
    </div>
    <select
      className="appearance-none w-full bg-white border border-slate-300 text-slate-700 py-2 pl-9 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium cursor-pointer transition-all hover:border-blue-400 text-sm"
      value={selectedId || ""}
      onChange={onChange}
    >
      {projects.map((p: any) => (
        <option key={p.id} value={p.id}>
          {p.jobNo} - {p.name}
        </option>
      ))}
    </select>
    <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-500">
      <ChevronDown size={14} />
    </div>
  </div>
);

export const SidebarItem = ({ icon, label, active, onClick, collapsed }: any) => (
  <motion.button
    onClick={onClick}
    title={collapsed ? label : undefined}
    className={`relative w-full flex items-center rounded-lg overflow-hidden group ${collapsed ? "justify-center p-3" : "gap-3 px-4 py-3"} ${active ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
  >
    {active && (
      <motion.div
        layoutId="sidebarActive"
        className="absolute inset-0 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/30"
        style={{ originX: 0, originY: 0.5 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      />
    )}
    <span className={`relative z-10 flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="font-medium text-sm">{label}</span>}
    </span>
  </motion.button>
);

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(amount || 0);

// @ts-nocheck
import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, AlertTriangle, Info, AlertCircle } from "lucide-react";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";

export const CustomAlert = ({ isOpen, onClose, title, message, type = "info" }: any) => {
  if (!isOpen) return null;
  const overlayClasses = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200]";
  const modalClasses = "bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100";
  const typeConfig: Record<string, any> = {
    success: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", btn: "bg-green-600 hover:bg-green-700" },
    error: { icon: XCircle, color: "text-red-500", bg: "bg-red-50", btn: "bg-red-600 hover:bg-red-700" },
    warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-50", btn: "bg-amber-600 hover:bg-amber-700" },
    info: { icon: Info, color: "text-blue-500", bg: "bg-blue-50", btn: "bg-blue-600 hover:bg-blue-700" },
  };
  const Config = typeConfig[type];
  const Icon = Config.icon;
  return (
    <motion.div className={overlayClasses} initial="hidden" animate="visible" variants={modalOverlayVariants} transition={overlayTransition}>
      <motion.div className={modalClasses} initial="hidden" animate="visible" variants={modalContentVariants} transition={modalTransition}>
        <div className={`w-14 h-14 rounded-full ${Config.bg} flex items-center justify-center mb-5 mx-auto ring-4 ring-white shadow-sm`}>
          <Icon className={`w-8 h-8 ${Config.color}`} strokeWidth={2.5} />
        </div>
        <h3 className="text-xl font-bold text-center text-slate-800 mb-2 tracking-tight">{title}</h3>
        <p className="text-center text-slate-500 mb-8 text-sm leading-relaxed whitespace-pre-line">{message}</p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className={`w-full py-2.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md transition-all active:scale-95 ${Config.btn}`}
          >
            ตกลง
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export const CustomConfirmModal = ({
  isOpen, title, message, onConfirm, onCancel,
  confirmText = "ยืนยัน", cancelText = "ยกเลิก", variant = "primary",
}: any) => {
  if (!isOpen) return null;
  const overlayClasses = "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[210]";
  const modalClasses = "bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100";
  return (
    <motion.div className={overlayClasses} initial="hidden" animate="visible" variants={modalOverlayVariants} transition={overlayTransition}>
      <motion.div className={modalClasses} initial="hidden" animate="visible" variants={modalContentVariants} transition={modalTransition}>
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-600">
            <AlertCircle size={24} strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button onClick={onCancel} className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`py-2.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md transition-all active:scale-95 ${variant === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"}`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

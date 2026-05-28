import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { X, CheckCircle } from "lucide-react";

interface ReceiveEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (scores: { q1: number; q2: number }, suggestion: string) => void;
  vendorName: string;
}

export const ReceiveEvaluationModal: React.FC<ReceiveEvaluationModalProps> = ({ isOpen, onClose, onSubmit, vendorName }) => {
  const [scores, setScores] = useState<{ q1: number | null; q2: number | null }>({ q1: null, q2: null });
  const [suggestion, setSuggestion] = useState("");

  useEffect(() => {
    if (isOpen) {
      setScores({ q1: null, q2: null });
      setSuggestion("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isComplete = scores.q1 !== null && scores.q2 !== null;

  const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isComplete) {
      onSubmit(scores as { q1: number; q2: number }, suggestion);
    }
  };

  const questions = [
    {
      id: "q1",
      label: "1. สินค้า / บริการ ไม่มีปัญหาและมีคุณภาพตามข้อกำหนด",
      options: [
        { value: 1.0, label: "ดี", desc: "ไม่พบปัญหาเกิดขึ้นเลย" },
        { value: 0.75, label: "พอใช้", desc: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 1-3 ครั้ง" },
        { value: 0.5, label: "ปรับปรุง", desc: "มีปัญหาเล็กน้อยไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือมีปัญหาด้านคุณภาพที่สำคัญและกระทบกับลูกค้า 1 ครั้งขึ้นไป" },
      ]
    },
    {
      id: "q2",
      label: "2. จัดส่งสินค้าตามวันที่กำหนด",
      options: [
        { value: 1.0, label: "ดี", desc: "จัดส่งสินค้าภายในระยะเวลาที่กำหนดทุกครั้ง" },
        { value: 0.75, label: "พอใช้", desc: "มีปัญหาเล็กน้อยไม่กระทบลูกค้า 1-3 ครั้ง" },
        { value: 0.5, label: "ปรับปรุง", desc: "จัดส่งล่าช้าแต่ไม่กระทบต่อลูกค้า 3 ครั้งขึ้นไป และหรือก่อให้เกิดความเดือดร้อน 1 ครั้งขึ้นไป" },
      ]
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={modalOverlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={overlayTransition as any}
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[10020] p-4 sm:p-6"
        >
          <motion.div
            variants={modalContentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={modalTransition as any}
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-500 p-5 flex justify-between items-center text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                  <CheckCircle size={22} className="text-white drop-shadow-md" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight tracking-wide drop-shadow-sm">ประเมินผู้จำหน่าย (ตอนรับของ)</h3>
                  <p className="text-emerald-100 text-xs mt-0.5 opacity-90 truncate max-w-[280px] sm:max-w-md">
                    {vendorName}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {questions.map((q) => (
                <div key={q.id} className="space-y-3">
                  <h4 className="font-semibold text-slate-800 text-base">{q.label}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {q.options.map((opt) => {
                      const isSelected = scores[q.id as keyof typeof scores] === opt.value;
                      return (
                        <div
                          key={opt.label}
                          onClick={() => setScores((prev) => ({ ...prev, [q.id]: opt.value }))}
                          className={`relative border-2 rounded-xl p-3 cursor-pointer transition-all duration-200 flex flex-col gap-1.5 
                            ${isSelected
                              ? opt.label === "ดี" ? "border-emerald-500 bg-emerald-50 shadow-sm"
                              : opt.label === "พอใช้" ? "border-amber-500 bg-amber-50 shadow-sm"
                              : "border-rose-500 bg-rose-50 shadow-sm"
                              : "border-slate-100 hover:border-slate-300 hover:bg-slate-50"
                            }
                          `}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`font-bold text-sm
                              ${isSelected
                                ? opt.label === "ดี" ? "text-emerald-700"
                                : opt.label === "พอใช้" ? "text-amber-700"
                                : "text-rose-700"
                                : "text-slate-600"
                              }
                            `}>
                              {opt.label}
                            </span>
                            {isSelected && (
                              <CheckCircle size={16} className={
                                opt.label === "ดี" ? "text-emerald-500" :
                                opt.label === "พอใช้" ? "text-amber-500" :
                                "text-rose-500"
                              } />
                            )}
                          </div>
                          <p className="text-[11px] leading-snug text-slate-500">
                            {opt.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h4 className="font-semibold text-slate-800 text-base">คำแนะนำเพิ่มเติม</h4>
                <textarea
                  className="w-full border-2 border-slate-200 rounded-xl p-3 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition-all resize-none text-sm"
                  rows={3}
                  placeholder="ระบุคำแนะนำเพิ่มเติมเพื่อการปรับปรุง..."
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="text-sm font-semibold text-slate-600">
                คะแนนรวม: <span className="text-lg text-emerald-600">
                  {isComplete ? ((scores.q1 || 0) + (scores.q2 || 0)).toFixed(2) : "-"}
                </span> / 2.00
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-100 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!isComplete}
                  className={`px-6 py-2.5 rounded-xl font-semibold text-sm shadow-md transition-all ${
                    isComplete 
                      ? "bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95" 
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  บันทึกประเมิน & รับของ
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

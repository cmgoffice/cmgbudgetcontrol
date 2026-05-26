import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { modalOverlayVariants, modalContentVariants, modalTransition, overlayTransition } from "../lib/animations";
import { X, CheckCircle, AlertCircle } from "lucide-react";

interface VendorEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (scores: { q1: number; q2: number; q3: number }) => void;
  vendorName: string;
}

export const VendorEvaluationModal: React.FC<VendorEvaluationModalProps> = ({ isOpen, onClose, onSubmit, vendorName }) => {
  const [scores, setScores] = useState<{ q1: number | null; q2: number | null; q3: number | null }>({ q1: null, q2: null, q3: null });

  useEffect(() => {
    if (isOpen) {
      setScores({ q1: null, q2: null, q3: null });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isComplete = scores.q1 !== null && scores.q2 !== null && scores.q3 !== null;

  const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isComplete) {
      onSubmit(scores as { q1: number; q2: number; q3: number });
    }
  };

  const questions = [
    {
      id: "q1",
      title: "1. การให้คำแนะนำเกี่ยวกับสินค้าและบริการ",
      options: [
        { value: 1, label: "ดี", desc: "มีการให้คำแนะนำที่ดีและรวดเร็ว" },
        { value: 0.75, label: "พอใช้", desc: "มีการให้คำแนะนำล่าช้า และหรือแนะนำได้ปานกลาง 1-3 ครั้ง" },
        { value: 0.5, label: "ปรับปรุง", desc: "มีการให้คำแนะนำล่าช้า และหรือไม่มีการแนะนำ มากกว่า 3 ครั้งขึ้นไป" },
      ]
    },
    {
      id: "q2",
      title: "2. มีความรวดเร็วในการเสนอราคา",
      options: [
        { value: 1, label: "ดี", desc: "ส่งรวดเร็วทันเวลาที่กำหนดทุกครั้ง" },
        { value: 0.75, label: "พอใช้", desc: "ส่งล่าช้ากว่าเวลาที่กำหนด 1-3 ครั้ง" },
        { value: 0.5, label: "ปรับปรุง", desc: "ส่งล่าช้ากว่าเวลาที่กำหนด 3 ครั้ง" },
      ]
    },
    {
      id: "q3",
      title: "3. การประสานงานและให้การสนับสนุนที่เกี่ยวข้อง",
      options: [
        { value: 1, label: "ดี", desc: "มีความรวดเร็วในการประสานงานและให้การสนับสนุนทุกครั้ง" },
        { value: 0.75, label: "พอใช้", desc: "การประสานงานและให้การสนับสนุน ล่าช้ากว่าที่กำหนด 1-3 ครั้ง" },
        { value: 0.5, label: "ปรับปรุง", desc: "การประสานงานและให้การสนับสนุน ล่าช้ากว่าที่กำหนด 3 ครั้งขึ้นไป" },
      ]
    }
  ];

  const getOptionColor = (value: number) => {
    if (value === 1) return "text-green-600 bg-green-50 border-green-200 ring-green-500";
    if (value === 0.75) return "text-amber-600 bg-amber-50 border-amber-200 ring-amber-500";
    return "text-red-600 bg-red-50 border-red-200 ring-red-500";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[999999] p-4" initial="hidden" animate="visible" exit="hidden" variants={modalOverlayVariants} transition={overlayTransition as any}>
          <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100" initial="hidden" animate="visible" exit="hidden" variants={modalContentVariants} transition={modalTransition as any}>
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                  <CheckCircle size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">ประเมินผู้ขาย (Vendor Evaluation)</h3>
                  <p className="text-sm text-slate-500 font-medium">{vendorName || "ไม่ระบุผู้ขาย"}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-xl border border-blue-100 text-blue-800 mb-2">
                <AlertCircle size={20} className="mt-0.5 shrink-0" />
                <p className="text-sm leading-relaxed">
                  เนื่องจากคุณเลือก PO Type ที่กำหนด กรุณาทำแบบประเมินผู้ขายก่อนส่งขออนุมัติ<br/>
                  <span className="font-semibold text-blue-600">เกณฑ์คะแนน:</span> ดี = 1.00, พอใช้ = 0.75, ปรับปรุง = 0.50
                </p>
              </div>

              {questions.map((q) => (
                <div key={q.id} className="space-y-3">
                  <h4 className="font-semibold text-slate-800 text-base">{q.title}</h4>
                  <div className="grid grid-cols-1 gap-3">
                    {q.options.map((opt) => {
                      const isSelected = scores[q.id as keyof typeof scores] === opt.value;
                      const colorClass = isSelected ? getOptionColor(opt.value) : "border-slate-200 hover:border-blue-300 hover:bg-slate-50";
                      return (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${colorClass}`}
                        >
                          <div className="pt-0.5 flex-shrink-0">
                            <input
                              type="radio"
                              name={q.id}
                              value={opt.value}
                              checked={isSelected}
                              onChange={() => setScores((s) => ({ ...s, [q.id]: opt.value }))}
                              className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <span className="block font-semibold text-sm mb-0.5">{opt.label} <span className="font-normal text-slate-500">({opt.value} คะแนน)</span></span>
                            <span className={`block text-xs ${isSelected ? "" : "text-slate-500"}`}>{opt.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <div className="text-sm font-semibold text-slate-600">
                คะแนนรวม: <span className="text-lg text-blue-600">
                  {isComplete ? ((scores.q1 || 0) + (scores.q2 || 0) + (scores.q3 || 0)).toFixed(2) : "-"}
                </span> / 3.00
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
                      ? "bg-blue-600 hover:bg-blue-700 text-white active:scale-95" 
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                  }`}
                >
                  บันทึกประเมิน & บันทึก PO
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

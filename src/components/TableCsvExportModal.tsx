// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  FileSpreadsheet,
  Download,
  X,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  CheckSquare,
  Square,
  Check,
  Filter,
} from "lucide-react";
import { ExportColumnDef } from "../lib/csvExportUtils";

export interface TableCsvExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  tabLabel?: string;
  totalRows: number;
  defaultColumns: ExportColumnDef[];
  onExport: (selectedOrderedColumns: ExportColumnDef[]) => void;
}

interface ColumnItem {
  key: string;
  label: string;
  selected: boolean;
  originalDef: ExportColumnDef;
}

export const TableCsvExportModal: React.FC<TableCsvExportModalProps> = ({
  isOpen,
  onClose,
  title = "ส่งออกข้อมูล CSV (Export CSV)",
  tabLabel = "All",
  totalRows = 0,
  defaultColumns = [],
  onExport,
}) => {
  const [items, setItems] = useState<ColumnItem[]>([]);

  // ซิงก์คอลัมน์เริ่มต้นเมื่อเปิด Modal หรือ defaultColumns เปลี่ยน
  useEffect(() => {
    if (!isOpen) return;
    setItems(
      defaultColumns.map((col) => ({
        key: col.key,
        label: col.label,
        selected: col.defaultSelected !== false,
        originalDef: col,
      }))
    );
  }, [isOpen, defaultColumns]);

  // ปิดด้วยแป้น Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const selectedCount = useMemo(() => items.filter((it) => it.selected).length, [items]);

  const handleToggleSelect = useCallback((index: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], selected: !next[index].selected };
      return next;
    });
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index - 1];
      next[index - 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setItems((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      const temp = next[index + 1];
      next[index + 1] = next[index];
      next[index] = temp;
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: true })));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setItems((prev) => prev.map((it) => ({ ...it, selected: false })));
  }, []);

  const handleResetDefault = useCallback(() => {
    setItems(
      defaultColumns.map((col) => ({
        key: col.key,
        label: col.label,
        selected: col.defaultSelected !== false,
        originalDef: col,
      }))
    );
  }, [defaultColumns]);

  const handleConfirmExport = useCallback(() => {
    const selectedColumns = items
      .filter((it) => it.selected)
      .map((it) => it.originalDef);
    if (selectedColumns.length === 0) return;
    onExport(selectedColumns);
    onClose();
  }, [items, onExport, onClose]);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/80">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 shadow-sm shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800 truncate">
                {title}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  <Filter size={11} /> แท็บประเภท: {tabLabel}
                </span>
                <span>•</span>
                <span>ทั้งหมด <strong>{totalRows.toLocaleString()}</strong> รายการ</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700 transition-colors"
            title="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Info Banner */}
        <div className="px-5 py-2.5 bg-emerald-50/60 border-b border-emerald-100/60 flex items-start gap-2.5 text-xs text-emerald-800">
          <Check size={14} className="mt-0.5 shrink-0 text-emerald-600 font-bold" />
          <div>
            ระบบจะส่งออกข้อมูลรายการ<strong>ทั้งหมดที่มีอยู่ในแท็บ {tabLabel}</strong> (จำนวน {totalRows.toLocaleString()} รายการ) โดยคุณสามารถเลือกคอลัมน์และกดปุ่มลูกศรเพื่อเรียงลำดับคอลัมน์ในไฟล์ CSV ได้ตามต้องการ
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-white">
          <div className="text-xs font-semibold text-slate-600">
            เลือก <span className="text-emerald-600 font-bold">{selectedCount}</span> จาก {items.length} คอลัมน์
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleSelectAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <CheckSquare size={12} /> ทั้งหมด
            </button>
            <button
              type="button"
              onClick={handleDeselectAll}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Square size={12} /> ไม่เลือก
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
              title="รีเซ็ตลำดับและตัวเลือกเป็นค่าเริ่มต้น"
            >
              <RotateCcw size={12} /> รีเซ็ต
            </button>
          </div>
        </div>

        {/* Column List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5 max-h-[380px] bg-slate-50/30">
          {items.map((item, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === items.length - 1;
            return (
              <div
                key={item.key}
                className={`flex items-center justify-between px-3 py-2 rounded-xl border transition-all ${
                  item.selected
                    ? "bg-white border-slate-200 shadow-sm text-slate-800"
                    : "bg-slate-100/60 border-slate-200/60 text-slate-400 opacity-60"
                }`}
              >
                {/* Checkbox and Label */}
                <label className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0 pr-2">
                  <span
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                      item.selected
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => handleToggleSelect(idx)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
                  />
                  <span className="text-xs font-semibold truncate">
                    {item.label}
                  </span>
                </label>

                {/* Reorder Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(idx)}
                    disabled={isFirst}
                    className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="เลื่อนคอลัมน์นี้ขึ้น"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(idx)}
                    disabled={isLast}
                    className="p-1 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                    title="เลื่อนคอลัมน์นี้ลง"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3.5 bg-slate-50 flex items-center justify-between gap-3">
          <div className="text-xs">
            {selectedCount === 0 ? (
              <span className="text-red-500 font-semibold">
                * กรุณาเลือกอย่างน้อย 1 คอลัมน์
              </span>
            ) : (
              <span className="text-slate-500">
                พร้อมส่งออก {totalRows.toLocaleString()} แถว ({selectedCount} คอลัมน์)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={handleConfirmExport}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
            >
              <Download size={14} /> ดาวน์โหลด CSV ({selectedCount})
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
};

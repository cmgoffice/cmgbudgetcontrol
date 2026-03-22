// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Columns3, RotateCcw } from "lucide-react";
import { TABLE_COLUMN_DEFS } from "../lib/tableColumnDefs";
import { useAppData } from "../contexts/AppDataContext";

const ColumnVisibilityToggle = React.memo(({ tableId }: { tableId: string }) => {
  const { columnVisibility, saveColumnVisibility } = useAppData();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const defs = TABLE_COLUMN_DEFS[tableId];
  if (!defs || defs.length === 0) return null;

  const isVisible = (key: string) => {
    const userPref = columnVisibility?.[tableId]?.[key];
    if (userPref !== undefined) return userPref;
    const def = defs.find((d) => d.key === key);
    return def?.defaultVisible ?? true;
  };

  const toggle = (key: string) => {
    const current = isVisible(key);
    saveColumnVisibility(tableId, key, !current);
  };

  const resetAll = () => {
    defs.forEach((d) => {
      if (!d.locked) saveColumnVisibility(tableId, d.key, d.defaultVisible);
    });
  };

  const visibleCount = defs.filter((d) => d.locked || isVisible(d.key)).length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const rect = btnRef.current?.getBoundingClientRect();

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-all ${
          open
            ? "bg-orange-50 border-orange-300 text-orange-700 shadow-sm"
            : "bg-white border-slate-200 text-slate-600 hover:border-orange-300 hover:text-orange-600"
        }`}
        title="แสดง/ซ่อน คอลัมน์"
      >
        <Columns3 size={14} />
        <span className="hidden sm:inline">คอลัมน์</span>
        <span className="text-[10px] bg-orange-100 text-orange-700 rounded-full px-1.5 py-0.5 font-bold leading-none">
          {visibleCount}/{defs.length}
        </span>
      </button>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[99999] bg-white rounded-xl shadow-2xl border border-slate-200 py-2 w-56 max-h-80 flex flex-col"
          style={{
            top: rect.bottom + 6,
            left: Math.min(rect.left, window.innerWidth - 240),
          }}
        >
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">แสดง/ซ่อน คอลัมน์</span>
            <button
              onClick={resetAll}
              className="text-[10px] text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-orange-50 transition-colors"
              title="รีเซ็ตเป็นค่าเริ่มต้น"
            >
              <RotateCcw size={10} /> รีเซ็ต
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-1">
            {defs.map((d) => {
              const checked = d.locked || isVisible(d.key);
              return (
                <label
                  key={d.key}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-xs transition-colors ${
                    checked ? "text-slate-700" : "text-slate-400"
                  } ${d.locked ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"}`}
                >
                  <input
                    type="checkbox"
                    className="accent-orange-500 w-3.5 h-3.5"
                    checked={checked}
                    disabled={d.locked}
                    onChange={() => { if (!d.locked) toggle(d.key); }}
                  />
                  <span className={`flex-1 ${checked ? "font-medium" : ""}`}>{d.label}</span>
                  {d.locked && (
                    <span className="text-[9px] bg-slate-100 text-slate-500 rounded px-1 py-0.5 font-semibold">LOCK</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
});

export default ColumnVisibilityToggle;

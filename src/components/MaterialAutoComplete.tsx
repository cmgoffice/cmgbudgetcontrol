// @ts-nocheck
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

const MaterialAutoComplete = React.memo(({ value, onChange, onSelectMaterial, materials, disabled, className = "", placeholder }: any) => {
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceTimer = useRef(null);
  const inputRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return materials
      .filter((m: any) =>
        (m.materialNo || "").toLowerCase().includes(q) ||
        (m.name || "").toLowerCase().includes(q)
      )
      .slice(0, 10);
  }, [debouncedQuery, materials]);

  const updatePos = useCallback(() => {
    if (inputRef.current) {
      const r = inputRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 2, left: r.left, width: r.width });
    }
  }, []);

  const handleChange = useCallback((e: any) => {
    const val = e.target.value;
    onChange(val);
    updatePos();
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (val.trim()) {
      debounceTimer.current = setTimeout(() => {
        setDebouncedQuery(val);
        setOpen(true);
      }, 2000);
    } else {
      setDebouncedQuery("");
      setOpen(false);
    }
  }, [onChange, updatePos]);

  const handleSelect = useCallback((mat: any) => {
    setOpen(false);
    setDebouncedQuery("");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    onSelectMaterial(mat);
  }, [onSelectMaterial]);

  const handleFocus = useCallback(() => {
    updatePos();
    if (debouncedQuery.trim() && filtered.length > 0) setOpen(true);
  }, [debouncedQuery, filtered.length, updatePos]);

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 160);
  }, []);

  useEffect(() => () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }, []);

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        className={className}
        value={value ?? ""}
        placeholder={placeholder}
        disabled={disabled}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoComplete="off"
      />
      {open && filtered.length > 0 && !disabled && createPortal(
        <div
          className="fixed z-[9999] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ top: dropPos.top, left: dropPos.left, width: Math.max(dropPos.width, 260), maxHeight: 280, overflowY: "auto" }}
        >
          {filtered.map((mat: any) => (
            <button
              key={mat.id}
              type="button"
              className="w-full text-left px-3 py-2.5 text-xs hover:bg-red-50 flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 transition-colors"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(mat); }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                  {mat.materialNo || "—"}
                </span>
                <span className="text-slate-700 truncate font-medium">{mat.name}</span>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-red-700 text-[11px]">
                  {new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB" }).format(mat.price || 0)}
                </div>
                <div className="text-[10px] text-slate-400">{mat.unit || ""}</div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
});

export default MaterialAutoComplete;

// @ts-nocheck
import React, { useRef } from "react";

const ResizableTh = React.memo(({ tableId, colKey, isAdmin, onResize, currentWidth, className = "", style, children, ...rest }: {
  tableId: string;
  colKey: string;
  isAdmin?: boolean;
  onResize?: (tableId: string, colKey: string, width: number) => void;
  currentWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  [key: string]: any;
}) => {
  const thRef = useRef<HTMLTableCellElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  const startResize = (e: React.MouseEvent) => {
    if (!isAdmin || !onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = thRef.current?.offsetWidth ?? currentWidth ?? 80;
    if (handleRef.current) handleRef.current.classList.add("is-resizing");

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(30, startW + ev.clientX - startX);
      if (thRef.current) thRef.current.style.width = `${newW}px`;
    };
    const onUp = (ev: MouseEvent) => {
      if (handleRef.current) handleRef.current.classList.remove("is-resizing");
      const newW = Math.max(30, startW + ev.clientX - startX);
      onResize(tableId, colKey, newW);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const wStyle: React.CSSProperties = currentWidth
    ? { width: currentWidth, minWidth: currentWidth }
    : {};

  return (
    <th
      ref={thRef}
      className={`resizable-th ${className}`}
      style={{ ...wStyle, ...style }}
      {...rest}
    >
      {children}
      {isAdmin && onResize && (
        <div ref={handleRef} className="col-resize-handle" onMouseDown={startResize} />
      )}
    </th>
  );
});

export default ResizableTh;

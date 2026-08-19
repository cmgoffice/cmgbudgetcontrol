import React from "react";
import { History } from "lucide-react";
import { formatCurrency } from "./ui";

const money = (value: any) => formatCurrency(Number(value || 0));

const itemAmount = (item: any) => Number(item?.amount ?? (Number(item?.quantity || 0) * Number(item?.price || item?.unitPrice || 0)));

/** แสดงรายการเดิมก่อน Rev ของ PO แต่ละรอบ โดยไม่แก้ไขข้อมูลต้นฉบับ */
export default function PoRevisionHistory({ po }: { po?: any }) {
  const revisions = Array.isArray(po?.poBudgetReturnRevisions) ? po.poBudgetReturnRevisions : [];
  if (revisions.length === 0) return null;

  const ordered = [...revisions].sort((a, b) => Number(b?.revNo || 0) - Number(a?.revNo || 0));

  return (
    <div className="rounded-xl border border-amber-200 overflow-hidden bg-amber-50/40">
      <div className="bg-amber-100 px-4 py-2 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
          <History size={14} /> ประวัติรายการก่อน Rev PO
        </span>
        <span className="bg-white text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-amber-200">
          {revisions.length} Rev
        </span>
      </div>

      <div className="divide-y divide-amber-100">
        {ordered.map((revision: any) => {
          const items = Array.isArray(revision?.oldItems) ? revision.oldItems : [];
          const oldGross = items.reduce((sum: number, item: any) => sum + itemAmount(item), 0);
          return (
            <div key={`${revision?.jobId || revision?.revNo || "rev"}-${revision?.at || ""}`} className="p-3 bg-white/70">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-[11px]">
                <span className="font-bold text-amber-800">Rev {revision?.revNo || "-"}</span>
                {(revision?.oldPoNo || revision?.newPoNo) && (
                  <span className="text-slate-600">เลขที่: {revision?.oldPoNo || "-"} → <span className="font-bold text-blue-700">{revision?.newPoNo || "-"}</span></span>
                )}
                <span className="text-slate-500">{revision?.at ? new Date(revision.at).toLocaleString("th-TH") : "-"}</span>
                <span className="text-slate-600">ผู้ทำรายการ: {revision?.by || "-"}</span>
                <span className="font-semibold text-slate-700">ยอดสุทธิก่อน Rev: {money(revision?.oldNetAmount)}</span>
                <span className="font-semibold text-emerald-700">ยอดหลัง Rev: {money(revision?.newNetAmount)}</span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[10px] text-slate-600">
                <span>ยอดรายการเดิม (ก่อนหักส่วนลด): {money(oldGross)}</span>
                <span>ยอดคืน PR/Budget: {money(revision?.returnableAmount)}</span>
                <span>ส่วนลดจัดซื้อไม่คืน: {money(revision?.procurementSaving)}</span>
              </div>

              {items.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border border-amber-100">
                  <table className="w-full text-[10px] text-left">
                    <thead className="bg-amber-50 text-amber-900 font-semibold">
                      <tr>
                        <th className="px-2 py-1.5 w-8 text-center">#</th>
                        <th className="px-2 py-1.5">รายการเดิมก่อน Rev</th>
                        <th className="px-2 py-1.5 text-right">จำนวน</th>
                        <th className="px-2 py-1.5 text-right">ราคา/หน่วย</th>
                        <th className="px-2 py-1.5 text-right">รวมเดิม</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-50 bg-white/60">
                      {items.map((item: any, index: number) => (
                        <tr key={`${index}-${item?.description || "item"}`}>
                          <td className="px-2 py-1.5 text-center text-slate-400">{index + 1}</td>
                          <td className="px-2 py-1.5 text-slate-700">{item?.description || item?.name || "-"}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600">{Number(item?.quantity || item?.qty || 0).toLocaleString("th-TH")} {item?.unit || ""}</td>
                          <td className="px-2 py-1.5 text-right text-slate-600">{money(item?.price || item?.unitPrice)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-slate-700">{money(itemAmount(item))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-[10px] text-slate-400">ไม่มีรายละเอียดรายการเดิมในประวัติ Rev รอบนี้</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

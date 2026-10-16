import React, { useMemo, useRef, useState } from "react";
import { useAppData } from "../contexts/AppDataContext";
import { useUI } from "../contexts/UIContext";
import { db, appId } from "../lib/firebase";
import { getAdvancePoBalance, canApproveAdvance, toSatang, isAdvancePoEligible } from "../lib/advancePayment";
import { createAdvance, advanceAction } from "../lib/advancePaymentStore";
import { useAdvances, useAdvanceTransactions } from "../hooks/useAdvances";

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50";
const buttonClass = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed";
const primaryClass = `${buttonClass} bg-orange-600 text-white hover:bg-orange-700 border-orange-600`;
const money = (value: unknown) => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const satangMoney = (value: unknown) => money(Number(value || 0) / 100);
const statusLabel = (row: any) => Number(row.paidSatang) > 0 && Number(row.paidSatang) === Number(row.recoveredSatang) ? "หักคืนครบแล้ว" : row.status;
function dateText(value: any) {
  if (!value) return "—";
  const date = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("th-TH");
}
const emptyForm = { amount: "", workUnclaimedAmount: "", recoveryTerms: "", reason: "" };

export default function AdvancePaymentView() {
  const { selectedProjectId } = useUI() as any;
  // Remount local forms on project change so an old request cannot be submitted in a new project.
  return <AdvanceProjectView key={selectedProjectId || "none"} projectId={selectedProjectId} />;
}

function AdvanceProjectView({ projectId }: { projectId: string | null }) {
  const { pos = [], payments = [], paymentsReady, user, userData, userRoles = [], canUseFunction, showAlert } = useAppData() as any;
  const { advances, loading, error } = useAdvances(projectId);
  const [poId, setPoId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const audit = useAdvanceTransactions(projectId, selectedId);
  const [action, setAction] = useState<"approve" | "reject" | "pay" | null>(null);
  const [note, setNote] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const busy = useRef(false);
  const roles: string[] = userRoles;
  const canCreate = roles.some(role => ["CM", "PM", "Administrator"].includes(role));
  const canPay = !!canUseFunction?.("advance-payment", "confirmPay");
  const availablePos = useMemo(() => pos.filter((po: any) => po.projectId === projectId && isAdvancePoEligible(po)), [pos, projectId]);
  const po = availablePos.find((row: any) => row.id === poId);
  const balance = useMemo(() => {
    if (!po || !paymentsReady) return null;
    try { return { value: getAdvancePoBalance(po, payments), error: "" }; }
    catch (err: any) { return { value: null, error: err.message || String(err) }; }
  }, [po, payments, paymentsReady]);
  const selected = advances.find(row => row.id === selectedId);
  const actor = { uid: user?.uid, displayName: userData?.name || userData?.displayName || user?.displayName || user?.email || "", email: user?.email || "" };
  const totals = advances.reduce((result, row) => ({ paid: result.paid + Number(row.paidSatang || 0), recovered: result.recovered + Number(row.recoveredSatang || 0) }), { paid: 0, recovered: 0 });

  async function run(operation: () => Promise<any>, onSuccess: () => void) {
    if (busy.current) return;
    busy.current = true; setSubmitting(true); setSubmitError("");
    try {
      if (!user?.uid) throw new Error("กรุณาเข้าสู่ระบบก่อนทำรายการ");
      await operation(); onSuccess();
      showAlert?.("สำเร็จ", "บันทึกรายการ Advance payment แล้ว", "success");
    } catch (err: any) { setSubmitError(err.message || String(err)); }
    finally { busy.current = false; setSubmitting(false); }
  }
  function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!canCreate || !po || po.projectId !== projectId) throw new Error("กรุณาเลือก PO ที่อนุมัติแล้วในโครงการนี้ และตรวจสอบสิทธิ์ผู้ขอ");
      if (!paymentsReady) throw new Error("กรุณารอข้อมูล Payment ก่อนส่งคำขอ");
      if (!form.amount.trim() || !form.workUnclaimedAmount.trim() || !Number.isFinite(Number(form.amount)) || !Number.isFinite(Number(form.workUnclaimedAmount)) || Number(form.amount) <= 0 || Number(form.workUnclaimedAmount) < 0 || toSatang(form.amount) <= 0) throw new Error("กรอกจำนวนเงินมัดจำมากกว่า 0 และยอดงานที่ยังไม่เบิกตั้งแต่ 0 ขึ้นไป");
      if (!form.reason.trim() || !form.recoveryTerms.trim()) throw new Error("กรุณากรอกเหตุผลและเงื่อนไขการหักคืน");
      if (balance?.error) throw new Error(balance.error);
      await createAdvance({ db, appId, po, form: { ...form, amount: Number(form.amount), workUnclaimedAmount: Number(form.workUnclaimedAmount), reason: form.reason.trim(), recoveryTerms: form.recoveryTerms.trim() }, payments, user: actor });
    }, () => { setCreating(false); setForm(emptyForm); setPoId(""); });
  }
  function submitAction(event: React.FormEvent) {
    event.preventDefault();
    void run(async () => {
      if (!selected || selected.projectId !== projectId || !action) throw new Error("ไม่พบคำขอในโครงการนี้");
      if (action === "pay" ? selected.status !== "Approved" || !canPay : !canApproveAdvance(selected.status, roles)) throw new Error("สถานะหรือสิทธิ์เปลี่ยนแล้ว กรุณาตรวจสอบรายการล่าสุด");
      if (action === "reject" && !note.trim()) throw new Error("กรุณาระบุเหตุผลที่ปฏิเสธ");
      if (action === "pay" && (!paidDate || !paymentReference.trim())) throw new Error("กรุณาระบุวันที่จ่ายและเลขที่หลักฐานอ้างอิง");
      await advanceAction({ db, appId, id: selected.id, action, roles, user: actor, ...(action === "reject" ? { note: note.trim() } : {}), ...(action === "pay" ? { paidDate, paymentReference: paymentReference.trim() } : {}) });
    }, () => { setAction(null); setNote(""); setPaidDate(""); setPaymentReference(""); });
  }

  if (!projectId) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500">กรุณาเลือกโครงการเพื่อจัดการ Advance payment</div>;
  return <div className="w-full min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white/40 p-4">
      <div><h2 className="text-lg font-bold text-orange-800">Advance payment</h2><p className="text-sm text-slate-500">คำขอเงินมัดจำและติดตามยอดหักคืน</p></div>
      {canCreate && <button className={primaryClass} disabled={submitting || loading || !!error || !paymentsReady} onClick={() => { setCreating(!creating); setSubmitError(""); }}> {creating ? "ปิดแบบฟอร์ม" : "+ สร้างคำขอ"}</button>}
    </div>
    {(error || submitError) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || submitError}</div>}
    <div className="grid gap-3 sm:grid-cols-3">{[["จ่ายแล้ว", totals.paid], ["หักคืนสะสม", totals.recovered], ["คงเหลือหักคืน", totals.paid - totals.recovered]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="text-xl font-semibold text-slate-800">{satangMoney(value)} บาท</p></div>)}</div>
    {creating && canCreate && <form onSubmit={submitCreate} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">สร้างคำขอเงินมัดจำ</h3>
      <fieldset disabled={submitting} className="space-y-4">
        <label className="block text-sm">PO ที่อนุมัติแล้ว<select required className={inputClass} value={poId} onChange={event => setPoId(event.target.value)}><option value="">เลือก PO</option>{availablePos.map((row: any) => <option key={row.id} value={row.id}>{row.poNo || row.id} — {row.vendorName || row.vendor || ""}</option>)}</select></label>
        {!availablePos.length && <p className="text-sm text-slate-500">ไม่มี PO ที่เข้าเงื่อนไขในโครงการนี้</p>}
        {po && <div className="rounded-lg bg-orange-50 p-3 text-sm"><p>ผู้รับเงิน: {po.vendorName || po.vendor || "—"}</p><p>Payment คงเหลือเบิก: {!paymentsReady ? "กำลังโหลด Payment…" : balance?.error ? balance.error : `${money(balance?.value)} บาท`}</p><p className="text-xs text-slate-500">ยอดจะถูกเก็บเป็น snapshot เมื่อส่งคำขอ</p></div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">เงินมัดจำที่ต้องการ (บาท)<input required type="number" min="0.01" step="0.01" className={inputClass} value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label>
          <label className="text-sm">Payment ที่ทำแล้วแต่ยังไม่ได้เบิก (บาท)<input required type="number" min="0" step="0.01" className={inputClass} value={form.workUnclaimedAmount} onChange={event => setForm({ ...form, workUnclaimedAmount: event.target.value })} /></label>
          <label className="text-sm">เงื่อนไขการหักคืน<textarea required className={inputClass} rows={3} value={form.recoveryTerms} onChange={event => setForm({ ...form, recoveryTerms: event.target.value })} /></label>
          <label className="text-sm">เหตุผล<textarea required className={inputClass} rows={3} value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label>
        </div>
        <p className="text-sm text-slate-600">ไม่เกิน 100,000 บาท: PD → PCM → GM · เกิน 100,000 บาท: PD → PCM → GM → MD</p>
        <p className="text-sm font-medium text-orange-700">เส้นทางคำขอนี้: PD → PCM → GM{Number(form.amount) > 100000 ? " → MD" : ""} → Approved → ยืนยันจ่าย</p>
        <button type="submit" className={primaryClass} disabled={!po || !paymentsReady || loading || !!error || !!balance?.error}>{submitting ? "กำลังบันทึก…" : "ส่งคำขออนุมัติ"}</button>
      </fieldset>
    </form>}
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-left text-sm text-slate-600"><caption className="p-3 text-left font-semibold">รายการ Advance payment</caption><thead className="bg-slate-50 text-slate-900"><tr>{["PO / ผู้รับเงิน", "สถานะ", "ยอดขอ", "จ่ายแล้ว", "หักคืน", "คงเหลือ", "รายละเอียด"].map(label => <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>)}</tr></thead><tbody>
        {loading && <tr><td colSpan={7} className="p-6 text-center" role="status">กำลังโหลด…</td></tr>}
        {!loading && !advances.length && <tr><td colSpan={7} className="p-6 text-center">{error ? "ไม่สามารถโหลดรายการได้" : "ยังไม่มีคำขอเงินมัดจำ"}</td></tr>}
        {advances.map(row => <tr key={row.id} className="border-t border-slate-100"><td className="px-3 py-2"><div>{row.poNo || row.poId}</div><div className="text-xs text-slate-400">{row.vendorName}</div></td><td className="px-3 py-2">{statusLabel(row)}</td>{[row.amountSatang, row.paidSatang, row.recoveredSatang, Number(row.paidSatang || 0) - Number(row.recoveredSatang || 0)].map((value, index) => <td key={index} className="whitespace-nowrap px-3 py-2 text-right">{satangMoney(value)}</td>)}<td className="px-3 py-2"><button className={buttonClass} disabled={submitting} onClick={() => { setSelectedId(row.id); setAction(null); setSubmitError(""); setNote(""); setPaidDate(""); setPaymentReference(""); }}>ดูรายละเอียด</button></td></tr>)}
      </tbody></table>
    </div>
    {selected && <section aria-label="รายละเอียดคำขอ" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex justify-between gap-3"><h3 className="font-semibold">{selected.poNo} — {selected.vendorName} · {statusLabel(selected)}</h3><button className={buttonClass} disabled={submitting} onClick={() => { setSelectedId(""); setAction(null); }}>ปิด</button></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{[["เลขที่คำขอ", selected.id], ["ผู้ขอ", selected.createdByName || selected.createdByUid], ["วันที่สร้าง", dateText(selected.createdAt)], ["ปรับปรุงล่าสุด", dateText(selected.updatedAt)], ["ยอดเงินมัดจำ", `${satangMoney(selected.amountSatang)} บาท`], ["Payment ที่ทำแล้วแต่ยังไม่ได้เบิก", `${money(selected.workUnclaimedAmount)} บาท`], ["ยอดคงเหลือเบิก ณ วันขอ", `${money(selected.balanceSnapshot)} บาท`], ["เงื่อนไขการหักคืน", selected.recoveryTerms], ["เหตุผล", selected.reason], ["วันที่จ่าย", selected.paidDate || "—"], ["หลักฐานอ้างอิง", selected.paymentReference || "—"]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="whitespace-pre-wrap break-words">{value || "—"}</dd></div>)}</dl>
      <p className="text-sm">จ่ายแล้ว {satangMoney(selected.paidSatang)} · หักคืน {satangMoney(selected.recoveredSatang)} · คงเหลือ {satangMoney(Number(selected.paidSatang || 0) - Number(selected.recoveredSatang || 0))} บาท</p>
      <div className="flex flex-wrap gap-2">{canApproveAdvance(selected.status, roles) && <><button className={primaryClass} disabled={submitting || !!error} onClick={() => setAction("approve")}>อนุมัติ</button><button className={buttonClass} disabled={submitting || !!error} onClick={() => setAction("reject")}>ปฏิเสธ</button></>}{selected.status === "Approved" && canPay && <button className={primaryClass} disabled={submitting || !!error} onClick={() => setAction("pay")}>ยืนยันจ่าย</button>}</div>
      {action && <form onSubmit={submitAction} className="rounded-lg border border-orange-200 bg-orange-50 p-4"><fieldset disabled={submitting} className="space-y-3"><p className="font-medium">{action === "approve" ? `ยืนยันอนุมัติขั้น ${selected.status} จำนวน ${satangMoney(selected.amountSatang)} บาท` : action === "reject" ? "ยืนยันปฏิเสธคำขอ" : `ยืนยันจ่าย ${satangMoney(selected.amountSatang)} บาท`}</p>
        {action === "reject" && <label className="block text-sm">เหตุผลที่ปฏิเสธ<textarea required className={inputClass} value={note} onChange={event => setNote(event.target.value)} /></label>}
        {action === "pay" && <><label className="block text-sm">วันที่จ่าย<input required type="date" className={inputClass} value={paidDate} onChange={event => setPaidDate(event.target.value)} /></label><label className="block text-sm">เลขที่หลักฐาน / อ้างอิงการจ่าย<input required className={inputClass} value={paymentReference} onChange={event => setPaymentReference(event.target.value)} /></label><p className="text-sm text-slate-600">รายการจะเป็น Paid และพร้อมให้เลือกหักคืนหลังยืนยัน</p></>}
        <div className="flex gap-2"><button className={primaryClass} type="submit">{submitting ? "กำลังบันทึก…" : "ยืนยัน"}</button><button className={buttonClass} type="button" onClick={() => setAction(null)}>ยกเลิก</button></div>
      </fieldset></form>}
      <div><h4 className="mb-2 font-semibold">ประวัติ</h4>{!selected.history?.length && <p className="text-sm text-slate-500">ยังไม่มีประวัติ</p>}<ol className="space-y-2">{(selected.history || []).map((entry: any, index: number) => <li key={index} className="rounded-lg bg-slate-50 p-3 text-sm"><p>{entry.action || entry.status} · {entry.byName || entry.userName || entry.createdByName || entry.byUid || "—"} · {dateText(entry.at || entry.createdAt)}</p>{(entry.fromStatus || entry.toStatus) && <p>{entry.fromStatus} → {entry.toStatus}</p>}{entry.note && <p className="whitespace-pre-wrap break-words">{entry.note}</p>}</li>)}</ol></div>
      <div><h4 className="mb-2 font-semibold">ประวัติการหักคืน / ย้อนรายการ</h4>
        {audit.loading && <p role="status" className="text-sm text-slate-500">กำลังโหลดประวัติ…</p>}
        {audit.error && <p role="alert" className="text-sm text-red-700">{audit.error}</p>}
        {!audit.loading && !audit.error && !audit.transactions.length && <p className="text-sm text-slate-500">ยังไม่มีรายการหักคืน</p>}
        <ol className="space-y-2">{audit.transactions.map(entry => <li key={entry.id} className="rounded-lg bg-slate-50 p-3 text-sm">
          <p>{entry.type === "recovery" ? "หักคืน" : "ย้อนรายการหักคืน"} · {satangMoney(entry.amountSatang)} บาท · {dateText(entry.createdAt)}</p>
          <p className="break-words">เอกสาร: {entry.documentType} / {entry.documentId} · ผู้ทำรายการ: {entry.createdByName || entry.createdByUid || "—"}</p>
        </li>)}</ol>
      </div>
    </section>}
  </div>;
}

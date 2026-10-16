import React, { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { useAppData } from "../contexts/AppDataContext";
import { useAdvances } from "../hooks/useAdvances";
import { canChangeAdvanceRecovery, saveAdvanceRecovery } from "../lib/advanceRecoveryStore";
import { Button, formatCurrency } from "./ui";

export default function AdvanceRecoveryPanel({ documentType, document: initial, onChange }: any) {
  return <RecoveryDocumentPanel key={`${documentType}:${initial?.projectId}:${initial?.id}`} documentType={documentType} document={initial} onChange={onChange} />;
}

function RecoveryDocumentPanel({ documentType, document: initial, onChange }: any) {
  const { db, appId, user, canUseFunction, canAccessModule, payments = [], pos = [], paymentsReady } = useAppData() as any;
  const [record, setRecord] = useState(initial);
  const { advances, loading, error } = useAdvances(initial?.projectId);
  const [advanceId, setAdvanceId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setRecord(initial);
    setMessage("");
    if (!initial?.id) return;
    return onSnapshot(doc(db, "artifacts", appId, "public", "data", documentType, initial.id), (snap) => {
      if (snap.exists()) {
        const next = { ...snap.data(), id: snap.id };
        setRecord(next);
      } else setRecord(null);
    }, (err) => setMessage(err.message));
  }, [db, appId, documentType, initial?.id]);
  useEffect(() => {
    setAdvanceId(record?.advanceRecovery?.advanceId || "");
    setAmount(record?.advanceRecovery?.amountSatang ? String(record.advanceRecovery.amountSatang / 100) : "");
  }, [record?.id, record?.advanceRecovery?.advanceId, record?.advanceRecovery?.amountSatang]);
  if (!record) return null;
  const paymentDerived = documentType === "invoices" && (record.sourceType === "payment" || !!record.inheritedAdvanceRecovery || !!record.paymentId);
  const paymentId = record.inheritedAdvanceRecovery?.paymentId || record.paymentId || record.poId;
  const sourcePayment = paymentDerived ? payments.find((payment: any) => payment.id === paymentId && payment.projectId === record.projectId) : null;
  const source = paymentDerived ? sourcePayment : record;
  const poIds = source ? (documentType === "payments" || paymentDerived
    ? [source.poId, source.sourcePoId, ...(source.selectedPrIds || []), ...(source.items || []).map((item: any) => item.poId || item.prId)].filter(Boolean)
    : [source.poId]) : [];
  const relatedPos = pos.filter((po: any) => po.projectId === record.projectId && poIds.includes(po.id));
  const vendorId = source?.vendorId || source?.contractorId || record.vendorId || record.contractorId;
  const related = advances.filter((a: any) => a.projectId === record.projectId && poIds.includes(a.poId) && (vendorId
    ? a.vendorId === vendorId
    : relatedPos.some((po: any) => po.id === a.poId && (po.vendorId || po.supplierId) === a.vendorId)));
  const summaryPending = paymentDerived && (!paymentsReady || !sourcePayment);
  const marker = record.advanceRecovery || record.inheritedAdvanceRecovery;
  const deduction = Number(marker?.amountSatang || 0) / 100;
  const permitted = !!canAccessModule?.("advance-payment") &&
    !!canAccessModule?.(documentType === "payments" ? "payment-subcontract" : "invoice") &&
    !!canUseFunction?.("advance-payment", "applyRecovery");
  const editable = permitted && canChangeAdvanceRecovery(documentType, record);
  const reversible = permitted && !!record.advanceRecovery?.amountSatang && canChangeAdvanceRecovery(documentType, record, true);
  const selectable = related.filter((a: any) => a.status === "Paid" && (a.paidSatang > a.recoveredSatang || a.id === record.advanceRecovery?.advanceId));
  const save = async (reverse = false) => {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true); setMessage("");
    try {
      if (reverse ? !reversible : !editable || loading || !!error) throw new Error("ไม่สามารถแก้ไขรายการหัก Advance ในขณะนี้");
      await saveAdvanceRecovery({ db, appId, documentType, documentId: record.id, advanceId: reverse ? record.advanceRecovery.advanceId : advanceId, amount: reverse ? 0 : amount, user });
      setMessage(reverse ? "ย้อนรายการหักแล้ว" : "บันทึกรายการหักแล้ว");
      onChange?.();
    } catch (err: any) { setMessage(err.message || String(err)); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <section className="my-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs" aria-label="Advance payment">
    <h3 className="font-bold text-amber-900 mb-2">Advance payment — เงินจ่ายล่วงหน้า</h3>
    {loading ? <p>กำลังโหลด Advance...</p> : error ? <p role="alert" className="text-red-700">{error}</p> : summaryPending ? <p>{!paymentsReady ? "กำลังโหลด Payment ต้นทาง…" : "ไม่พบ Payment ต้นทาง จึงยังแสดงยอดสรุป Advance ไม่ได้"}</p> : <div className="flex flex-wrap gap-x-5 gap-y-1 mb-2">
      <span>อนุมัติแล้ว: {formatCurrency(related.filter((a: any) => ["Approved", "Paid"].includes(a.status)).reduce((sum: number, a: any) => sum + a.amountSatang / 100, 0))}</span>
      <span>จ่ายแล้ว: {formatCurrency(related.reduce((sum: number, a: any) => sum + a.paidSatang / 100, 0))}</span>
      <span>หักคืนแล้ว: {formatCurrency(related.reduce((sum: number, a: any) => sum + a.recoveredSatang / 100, 0))}</span>
      <span>คงเหลือหักคืน: {formatCurrency(related.reduce((sum: number, a: any) => sum + (a.paidSatang - a.recoveredSatang) / 100, 0))}</span>
    </div>}
    <p className="font-semibold">หัก Advance ในเอกสารนี้: {formatCurrency(deduction)} · ยอดงานหลังหัก Advance: {formatCurrency(Number(record.amount || 0) - deduction)} (ก่อนภาษีและรายการหักอื่น)</p>
    {record.inheritedAdvanceRecovery && <p className="mt-1">รับรายการหักจาก Payment แล้ว — ไม่ตัดยอด Advance ซ้ำ</p>}
    {editable && !loading && !error && <div className="mt-3 flex flex-wrap gap-2 items-end">
      <label className="flex flex-col gap-1">เลือก Advance ที่จ่ายแล้ว<select aria-label="เลือก Advance ที่จ่ายแล้ว" className="rounded border p-2 bg-white" value={advanceId} disabled={busy || !!record.advanceRecovery?.amountSatang} onChange={(e) => setAdvanceId(e.target.value)}>
        <option value="">เลือก Advance</option>{selectable.map((a: any) => <option key={a.id} value={a.id}>{a.poNo} · {a.id.slice(-8)} · คงเหลือ {formatCurrency((a.paidSatang - a.recoveredSatang) / 100)}</option>)}
      </select></label>
      <label className="flex flex-col gap-1">ยอดหักคืน (บาท)<input className="border rounded p-2" aria-label="ยอดหักคืน Advance" type="number" min="0.01" step="0.01" value={amount} disabled={busy} onChange={(e) => setAmount(e.target.value)} /></label>
      <Button disabled={busy || !advanceId || !(Number(amount) > 0)} onClick={() => save()}>บันทึกรายการหัก</Button>
    </div>}
    {reversible && <Button className="mt-2" variant="secondary" disabled={busy} onClick={() => save(true)}>ย้อนรายการหัก Advance</Button>}
    {!editable && !record.inheritedAdvanceRecovery && <p className="mt-2 text-slate-600">เลือกรายการหักได้ใน Payment สถานะ Active หรือ Invoice สถานะ Draft ก่อนส่งดำเนินการ</p>}
    {message && <p role="status" className="mt-2 text-amber-900">{message}</p>}
  </section>;
}

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Paperclip, Check, FileText } from "lucide-react";
import { db, appId } from "../lib/firebase";
import { uploadAttachment, deleteStorageFile } from "../lib/uploadAttachment";
import { confirmMaterialReceive } from "../lib/materialReceiveStore";
import { hasPassedMaterialReceive, isMaterialPending, materialInspectionScope, validateMaterialCertificate } from "../lib/materialReceive";

export default function MaterialReceivedModal({ po, user, userName, canConfirm, onClose, onSaved, showAlert }: any) {
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState(po.materialReceive?.note || "");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [removedUrls, setRemovedUrls] = useState<string[]>([]);
  const [failedDeletes, setFailedDeletes] = useState<any[]>([]);
  const savingRef = useRef(false);
  const passed = hasPassedMaterialReceive(po) || completed;
  const editable = !passed && canConfirm && isMaterialPending(po);
  const confirmedAt = po.materialReceive?.confirmedAt;
  const confirmedDate = confirmedAt?.toDate ? confirmedAt.toDate() : confirmedAt ? new Date(confirmedAt) : null;

  const deleteCertificates = async (certificates: any[]) => {
    const results = await Promise.allSettled(certificates.map((file) => deleteStorageFile(file.url, { strict: true })));
    const failed = certificates.filter((_, index) => results[index].status === "rejected");
    setFailedDeletes(failed);
    return failed;
  };

  const retryDelete = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (!(await deleteCertificates(failedDeletes)).length) onClose();
      else showAlert("ลบไฟล์ไม่สำเร็จ", "กรุณาลองลบไฟล์จาก Storage อีกครั้ง", "error");
    } finally { savingRef.current = false; setSaving(false); }
  };

  const save = async () => {
    if (!editable || savingRef.current || !user?.uid) return;
    savingRef.current = true;
    setSaving(true);
    const uploaded: any[] = [];
    let committed = false;
    let transactionAttempted = false;
    try {
      files.forEach(validateMaterialCertificate);
      for (const file of files) {
        const attachment = await uploadAttachment(file, { type: "material-received", projectId: po.projectId, docId: po.id });
        uploaded.push({ ...attachment, size: file.size, contentType: file.type });
      }
      transactionAttempted = true;
      committed = await confirmMaterialReceive({ db, appId, poId: po.id, projectId: po.projectId,
        certificates: uploaded, removedCertificateUrls: removedUrls, note, userId: user.uid, userName, expectedScope: materialInspectionScope(po) });
      if (!committed) {
        await Promise.allSettled(uploaded.map((file) => deleteStorageFile(file.url)));
        showAlert("Material Received", "PO นี้ผ่าน Material Received แล้ว กรุณาดูข้อมูลล่าสุด", "info");
      } else {
        setCompleted(true);
        // A log failure must never roll back an already committed inspection or its files.
        try { await onSaved(po); } catch (error) { console.warn("Material Receive log failed", error); }
        const failed = await deleteCertificates((po.materialReceive?.certificates || []).filter((file: any) => removedUrls.includes(file.url)));
        if (failed.length) {
          showAlert("ลบไฟล์ไม่ครบ", "ยืนยัน Material Received แล้ว แต่บางไฟล์ยังลบจาก Storage ไม่สำเร็จ กรุณากดลองลบอีกครั้ง", "warning");
          return;
        }
        showAlert("สำเร็จ", "ยืนยัน Material Received แล้ว สามารถรับของได้เมื่อถึงเงื่อนไขพร้อมรับของ", "success");
      }
      onClose();
    } catch (error: any) {
      if (!transactionAttempted) await Promise.allSettled(uploaded.map((file) => deleteStorageFile(file.url)));
      // Keep uploads on an unknown transaction outcome; removing them could break a committed record.
      showAlert("บันทึกไม่สำเร็จ", (error?.message || String(error)) + " กรุณาเปิดข้อมูลล่าสุดก่อนลองอีกครั้ง", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="material-received-title" className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        <header className="sticky top-0 flex items-center justify-between bg-blue-800 px-5 py-4 text-white">
          <div><h3 id="material-received-title" className="text-lg font-bold">Material Received</h3><p className="text-xs">{po.poNo} · {passed ? "ผ่านการตรวจแล้ว" : "ตรวจเอกสารก่อนรับของ"}</p></div>
          <button aria-label="ปิด Material Received" disabled={saving} onClick={onClose}><X size={20} /></button>
        </header>
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <p><strong>PO:</strong> {po.poNo}</p><p><strong>ผู้จำหน่าย:</strong> {po.vendorName || "-"}</p>
            <p><strong>สถานะ PO:</strong> {po.statusNow || po.status}</p><p><strong>ประเภทรับของ:</strong> {po.receiveType || "-"}</p>
          </div>
          <div className="rounded-lg border border-blue-200 p-3 text-sm">
            <h4 className="font-semibold text-blue-900 mb-1">Material Approve No.</h4>
            {(po.materialApproveRefs || []).map((reference: any) => <p key={reference.prId}>{reference.prNo} — {reference.no || "-"}</p>)}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100"><tr><th className="p-2">ลำดับ</th><th className="p-2">รหัสวัสดุ</th><th className="p-2">รายการ</th><th className="p-2 text-right">จำนวนสั่ง</th><th className="p-2">หน่วย</th></tr></thead>
              <tbody>{(po.items || []).map((item: any, index: number) => <tr key={index} className="border-t"><td className="p-2">{index + 1}</td><td className="p-2">{item.materialNo || "-"}</td><td className="p-2">{item.description}</td><td className="p-2 text-right">{item.quantity}</td><td className="p-2">{item.unit}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <h4 className="font-semibold text-sm flex items-center gap-1"><Paperclip size={15} /> Certificate</h4>
            {(po.materialReceive?.certificates || []).filter((file: any) => !removedUrls.includes(file.url)).map((file: any, index: number) => <div key={index} className="flex items-center justify-between gap-3">
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-700 underline py-1"><FileText size={13} className="inline" /> {file.name}</a>
              {editable && <button type="button" disabled={saving} aria-label={`ลบ ${file.name}`} onClick={() => setRemovedUrls((previous) => [...previous, file.url])} className="text-sm text-red-700 disabled:opacity-50">ลบ</button>}
            </div>)}
            {editable && removedUrls.length > 0 && <p className="text-xs text-red-700 mt-2">จะลบไฟล์ {removedUrls.length} รายการจาก Storage เมื่อยืนยัน Material Received <button type="button" disabled={saving} onClick={() => setRemovedUrls([])} className="underline">ยกเลิกการลบ</button></p>}
            {failedDeletes.length > 0 && <div role="alert" className="text-sm text-red-700 mt-2">ยังลบจาก Storage ไม่สำเร็จ: {failedDeletes.map((file) => file.name).join(", ")} <button type="button" disabled={saving} onClick={retryDelete} className="underline">ลองลบอีกครั้ง</button></div>}
            {passed && !(po.materialReceive?.certificates || []).length && <p className="text-xs text-slate-500 mt-1">ไม่มีไฟล์แนบ</p>}
            {editable && <>
              <p className="text-xs text-slate-500 my-2">แนบได้หลายไฟล์ PDF, PNG, JPG, WebP ไม่เกิน 20 MB ต่อไฟล์ (ไม่บังคับ)</p>
              <input aria-label="อัปโหลด Certificate" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" disabled={saving}
                onChange={(event) => {
                  const selected = Array.from(event.target.files || []);
                  try { selected.forEach(validateMaterialCertificate); setFiles((previous) => [...previous, ...selected]); }
                  catch (error: any) { showAlert("ไฟล์ไม่ถูกต้อง", error.message, "warning"); }
                  event.target.value = "";
                }} className="text-sm w-full" />
              {files.map((file, index) => <div key={index} className="flex justify-between text-xs py-2 gap-3"><span>{file.name}</span><button disabled={saving} onClick={() => setFiles((previous) => previous.filter((_, i) => i !== index))} className="text-red-700">ลบ</button></div>)}
            </>}
          </div>
          <div><label htmlFor="material-received-note" className="block font-semibold text-sm mb-1">หมายเหตุ</label><textarea id="material-received-note" value={note} onChange={(event) => setNote(event.target.value)} readOnly={!editable} disabled={saving} maxLength={4000} rows={3} className="w-full border rounded-lg p-2 text-sm" /></div>
          {passed && <p className="text-xs text-emerald-800">ยืนยันโดย {po.materialReceive?.confirmedByName || "-"} · {confirmedDate && !isNaN(confirmedDate.getTime()) ? confirmedDate.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : "-"}</p>}
          <p className="text-xs text-slate-500">ขั้นตอนนี้บันทึกผลตรวจเอกสารเท่านั้น กรุณากรอกจำนวนรับจริงในแท็บรับของภายหลัง</p>
        </div>
        <footer className="flex justify-end gap-2 border-t p-4">
          <button disabled={saving} onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">ปิด</button>
          {editable && <button disabled={saving} onClick={save} className="rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50 flex items-center gap-2"><Check size={16} />{saving ? "กำลังบันทึก..." : "ยืนยัน Material Received"}</button>}
        </footer>
      </section>
    </div>, document.body
  );
}

// @ts-nocheck
import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";

// ทุกที่ที่เก็บ Vendor ID ไว้ในเอกสารอื่น
// Payment ปกติใช้ contractorId แต่เอกสารบางรุ่นมี vendorId ด้วย จึงตรวจทั้งสองฟิลด์
export const VENDOR_REFERENCE_TARGETS = [
  { collection: "pos", field: "vendorId", label: "PO" },
  { collection: "payments", field: "contractorId", label: "Payment" },
  { collection: "payments", field: "vendorId", label: "Payment" },
  { collection: "invoices", field: "vendorId", label: "INV" },
  { collection: "receives", field: "vendorId", label: "Receive" },
  { collection: "billings", field: "vendorId", label: "Billing" },
  { collection: "pays", field: "vendorId", label: "Pay" },
  { collection: "vendorEvaluations", field: "vendorId", label: "ใบประเมิน" },
  { collection: "vendorEvaluations", field: "contractorId", label: "ใบประเมิน" },
];

export const VENDOR_REFERENCE_LABELS = Array.from(new Set(VENDOR_REFERENCE_TARGETS.map((t) => t.label)));

const VENDOR_FILL_FIELDS = ["name", "address", "tel", "creditTerm"];

// Firestore จำกัด operator "in" ไว้ 30 ค่า และ batch ไว้ 500 รายการ
const IN_QUERY_CHUNK = 30;
const WRITE_BATCH_LIMIT = 450;

const chunk = (values, size) => {
  const out = [];
  for (let i = 0; i < values.length; i += size) {
    out.push(values.slice(i, i + size));
  }
  return out;
};

const dataCollection = (db, appId, name) => collection(db, "artifacts", appId, "public", "data", name);

export const normalizeVendorCode = (code) => String(code || "").trim().toLowerCase();

export const isMergedVendor = (vendor) => vendor?.status === "merged";

// ดึงเอกสารทั้งหมดที่อ้างถึง Vendor ID ในรายการ แยกตามตำแหน่งที่อ้างถึง
async function findVendorReferences(db, appId, vendorIds) {
  const ids = Array.from(new Set((vendorIds || []).filter(Boolean)));
  const matches = [];
  if (!ids.length) return matches;
  for (const target of VENDOR_REFERENCE_TARGETS) {
    for (const idChunk of chunk(ids, IN_QUERY_CHUNK)) {
      const snap = await getDocs(query(dataCollection(db, appId, target.collection), where(target.field, "in", idChunk)));
      snap.docs.forEach((d) => {
        matches.push({ target, docId: d.id, vendorId: d.data()[target.field] });
      });
    }
  }
  return matches;
}

// นับเอกสารที่อ้างถึงแต่ละ Vendor ID
// คืนค่า { [vendorId]: { total, byLabel: { PO: n, ... } } }
// เอกสารเดียวที่อ้างถึงผ่านสองฟิลด์ (เช่นใบประเมินที่มีทั้ง vendorId และ contractorId) นับครั้งเดียว
export async function countVendorReferences(db, appId, vendorIds) {
  const result = {};
  (vendorIds || []).forEach((id) => {
    result[id] = { total: 0, byLabel: {} };
  });
  const matches = await findVendorReferences(db, appId, vendorIds);
  const counted = new Set();
  matches.forEach(({ target, docId, vendorId }) => {
    const key = `${vendorId}|${target.collection}/${docId}`;
    if (counted.has(key)) return;
    counted.add(key);
    const entry = result[vendorId] || (result[vendorId] = { total: 0, byLabel: {} });
    entry.total += 1;
    entry.byLabel[target.label] = (entry.byLabel[target.label] || 0) + 1;
  });
  return result;
}

const filledFieldCount = (vendor) =>
  VENDOR_FILL_FIELDS.filter((f) => String(vendor?.[f] ?? "").trim() !== "").length;

// ระบบเลือกรายการหลักของกลุ่มรหัสซ้ำ:
// 1) มีเอกสารผูกมากที่สุด  2) กรอกข้อมูลครบกว่า  3) id น้อยที่สุด (ผลคงที่ทุกครั้ง)
export function pickMasterVendor(group, refCounts) {
  const ranked = [...group].sort((a, b) => {
    const refDiff = (refCounts?.[b.id]?.total || 0) - (refCounts?.[a.id]?.total || 0);
    if (refDiff !== 0) return refDiff;
    const fillDiff = filledFieldCount(b) - filledFieldCount(a);
    if (fillDiff !== 0) return fillDiff;
    return String(a.id).localeCompare(String(b.id));
  });
  const master = ranked[0];
  const runnerUp = ranked[1];
  let reason = "ข้อมูลเท่ากันทุกด้าน เลือกตามลำดับ id";
  if (runnerUp) {
    const masterRefs = refCounts?.[master.id]?.total || 0;
    const runnerRefs = refCounts?.[runnerUp.id]?.total || 0;
    if (masterRefs !== runnerRefs) {
      reason = `มีเอกสารผูกมากที่สุด (${masterRefs} รายการ)`;
    } else if (filledFieldCount(master) !== filledFieldCount(runnerUp)) {
      reason = `เอกสารผูกเท่ากัน แต่กรอกข้อมูลครบกว่า (${filledFieldCount(master)}/${VENDOR_FILL_FIELDS.length} ช่อง)`;
    }
  }
  return { master, duplicates: ranked.slice(1), reason };
}

// ช่องที่รายการหลักว่าง เติมจากรายการซ้ำตัวแรกที่มีค่า ช่องที่มีค่าอยู่แล้วไม่ทับ
export function buildMasterFillPatch(master, duplicates) {
  const patch = {};
  VENDOR_FILL_FIELDS.forEach((field) => {
    if (String(master?.[field] ?? "").trim() !== "") return;
    const source = duplicates.find((d) => String(d?.[field] ?? "").trim() !== "");
    if (source) patch[field] = source[field];
  });
  return patch;
}

// รวม Vendor ซ้ำเข้ารายการหลัก
// - เปลี่ยนเฉพาะฟิลด์ id (vendorId/contractorId) ในเอกสารที่อ้างถึง ไม่แตะชื่อหรือรหัสที่เก็บไว้ในเอกสาร
// - เรียกซ้ำได้โดยไม่เสียหาย: ทุกครั้งจะค้นเอกสารที่ยังชี้ id ซ้ำอยู่ใหม่ และปิดรายการซ้ำเป็นขั้นสุดท้าย
// - updateVendor(id, patch) คือ updateData ของ context เพื่อให้ cache ในหน้าจออัปเดตด้วย
export async function mergeVendors(db, appId, { master, duplicates, actorName, updateVendor }) {
  const duplicateIds = duplicates.map((d) => d.id).filter((id) => id && id !== master.id);
  if (!duplicateIds.length) {
    return { updatedRefs: {}, masterPatch: {} };
  }

  const matches = await findVendorReferences(db, appId, duplicateIds);
  const updates = new Map();
  matches.forEach(({ target, docId }) => {
    const key = `${target.collection}/${docId}`;
    const existing = updates.get(key) || { collection: target.collection, docId, patch: {} };
    existing.patch[target.field] = master.id;
    updates.set(key, existing);
  });

  const updateList = Array.from(updates.values());
  for (const part of chunk(updateList, WRITE_BATCH_LIMIT)) {
    const batch = writeBatch(db);
    part.forEach((u) => {
      batch.update(doc(dataCollection(db, appId, u.collection), u.docId), u.patch);
    });
    await batch.commit();
  }

  const updatedRefs = {};
  updateList.forEach((u) => {
    (updatedRefs[u.collection] = updatedRefs[u.collection] || []).push({ id: u.docId, fields: Object.keys(u.patch) });
  });

  const masterPatch = buildMasterFillPatch(master, duplicates);
  if (Object.keys(masterPatch).length) {
    const ok = await updateVendor(master.id, masterPatch);
    if (!ok) throw new Error(`อัปเดตรายการหลัก ${master.code || master.id} ไม่สำเร็จ`);
  }

  const mergedAt = new Date().toISOString();
  for (const id of duplicateIds) {
    const ok = await updateVendor(id, {
      mergedInto: master.id,
      mergedAt,
      mergedBy: actorName || "",
      status: "merged",
    });
    if (!ok) throw new Error(`ปิดรายการซ้ำ ${id} ไม่สำเร็จ`);
  }

  return { updatedRefs, masterPatch };
}

// ข้อความ log สำหรับตรวจสอบและย้อนกลับ: เก็บ doc id ทุกตัวที่ถูกเปลี่ยน id
export function buildVendorMergeLogDetails(master, duplicates, result) {
  const counts = Object.entries(result.updatedRefs)
    .map(([col, list]) => `${col}: ${list.length}`)
    .join(", ");
  const payload = {
    masterId: master.id,
    masterCode: master.code || "",
    mergedIds: duplicates.map((d) => d.id),
    masterPatch: result.masterPatch,
    updatedRefs: result.updatedRefs,
  };
  return `Merge Vendor รหัส ${master.code || "-"} → ${master.name || master.id} | รวม ${duplicates.length} รายการ | เอกสารที่เปลี่ยน id: ${counts || "ไม่มี"} | ${JSON.stringify(payload)}`;
}

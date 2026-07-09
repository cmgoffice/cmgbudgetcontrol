/**
 * diagnose_pr_alloc.mjs
 * ตรวจสอบว่า PO ใดมี lockedPrAllocations ผูกกับ PR J72-RE-014 อยู่
 *
 * วิธีใช้:
 *   node diagnose_pr_alloc.mjs
 *
 * ต้องการ: .env ที่มี REACT_APP_FIREBASE_* หรือแก้ค่าตรง ๆ ด้านล่าง
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from "firebase/firestore";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── โหลด .env ──────────────────────────────────────────────
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), ".env");
    const lines = readFileSync(envPath, "utf8").split("\n");
    const env = {};
    lines.forEach((line) => {
      const m = line.match(/^([^=]+)=(.*)$/);
      if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
    return env;
  } catch {
    console.warn("ไม่พบไฟล์ .env — ใช้ process.env แทน");
    return process.env;
  }
}

const env = loadEnv();

const firebaseConfig = {
  apiKey:            env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             env.REACT_APP_FIREBASE_APP_ID,
};

const APP_ID = env.REACT_APP_APP_ID || "cmg-budget-control-default";
const TARGET_PR_NO = "J72-RE-014";

// ── Main ──────────────────────────────────────────────────
async function main() {
  console.log("🔍 เริ่มตรวจสอบ PR allocation สำหรับ:", TARGET_PR_NO);
  console.log("   APP_ID:", APP_ID);

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const posRef  = collection(db, "artifacts", APP_ID, "public", "data", "pos");
  const prsRef  = collection(db, "artifacts", APP_ID, "public", "data", "prs");

  const [posSnap, prsSnap] = await Promise.all([getDocs(posRef), getDocs(prsRef)]);

  const pos = posSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const prs = prsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // ค้นหา PR J72-RE-014
  const targetPr = prs.find(p => p.prNo === TARGET_PR_NO);
  if (!targetPr) {
    console.error("❌ ไม่พบ PR:", TARGET_PR_NO);
    process.exit(1);
  }

  console.log("\n✅ พบ PR:");
  console.log("   ID    :", targetPr.id);
  console.log("   PR No :", targetPr.prNo);
  console.log("   Status:", targetPr.status);
  console.log("   Total :", targetPr.totalAmount);

  // ── ตรวจสอบ PO ทุกตัว ──
  console.log("\n📦 ตรวจสอบ PO ที่อ้างอิง PR นี้...\n");

  let totalUsed = 0;
  const linkedPOs = [];

  for (const po of pos) {
    if (po.status === "Rejected") continue;

    let usedFromThisPo = 0;
    let source = "";

    // 1. lockedPrAllocations
    if (po.lockedPrAllocations && po.lockedPrAllocations[targetPr.id] != null) {
      usedFromThisPo = Number(po.lockedPrAllocations[targetPr.id]) || 0;
      source = "lockedPrAllocations";
    } else {
      // 2. disPrAllocations (ใน items)
      if (Array.isArray(po.items)) {
        for (const item of po.items) {
          if (Array.isArray(item.disPrAllocations) && item.disPrAllocations.length > 0) {
            for (const alloc of item.disPrAllocations) {
              if (alloc?.prId === targetPr.id) {
                usedFromThisPo += Number(alloc.amount) || 0;
                source = "disPrAllocations";
              }
            }
          } else if (item.prId === targetPr.id) {
            usedFromThisPo += Number(item.amount) || 0;
            source = "item.prId";
          }
        }
      }
    }

    if (usedFromThisPo > 0) {
      totalUsed += usedFromThisPo;
      linkedPOs.push({ po, usedAmount: usedFromThisPo, source });
      console.log(`   PO: ${po.poNo || po.id}`);
      console.log(`      Status : ${po.status}`);
      console.log(`      Source : ${source}`);
      console.log(`      Amount : ฿${usedFromThisPo.toLocaleString()}`);
      if (po.lockedPrAllocations) {
        console.log(`      lockedPrAllocations:`, JSON.stringify(po.lockedPrAllocations));
      }
      console.log("");
    }
  }

  console.log("─".repeat(60));
  console.log(`📊 ยอดรวมที่ PO กิน PR ไป: ฿${totalUsed.toLocaleString()}`);
  console.log(`   PR Total: ฿${Number(targetPr.totalAmount).toLocaleString()}`);
  console.log(`   คืนได้จริง: ฿${Math.max(0, Number(targetPr.totalAmount) - totalUsed).toLocaleString()}`);

  // ── ถามว่าจะลบ lockedPrAllocations หรือไม่ ──
  const lockedPos = linkedPOs.filter(x => x.source === "lockedPrAllocations");
  if (lockedPos.length > 0) {
    console.log("\n⚠️  พบ PO ที่มี lockedPrAllocations ล็อกยอด PR นี้ค้างอยู่:");
    lockedPos.forEach(x => {
      console.log(`   - ${x.po.poNo || x.po.id} (status: ${x.po.status}) locked: ฿${x.usedAmount.toLocaleString()}`);
    });

    console.log("\n💡 วิธีแก้: รัน script นี้ด้วย --fix เพื่อลบ lockedPrAllocations ออก:");
    console.log("   node diagnose_pr_alloc.mjs --fix");

    if (process.argv.includes("--fix")) {
      console.log("\n🔧 กำลังแก้ไข...");
      for (const { po } of lockedPos) {
        const poDocRef = doc(db, "artifacts", APP_ID, "public", "data", "pos", po.id);
        // ลบเฉพาะ key ของ PR นี้ออกจาก lockedPrAllocations
        const updatedLocked = { ...po.lockedPrAllocations };
        delete updatedLocked[targetPr.id];

        if (Object.keys(updatedLocked).length === 0) {
          // ถ้าไม่มี key เหลือเลย — ลบ field ทิ้งทั้งหมด
          await updateDoc(poDocRef, { lockedPrAllocations: deleteField(), updatedAt: new Date().toISOString() });
          console.log(`   ✅ ลบ lockedPrAllocations ทั้งหมดออกจาก PO ${po.poNo || po.id}`);
        } else {
          // ถ้ายังมี key อื่น — อัปเดตเฉพาะ key ที่เหลือ
          await updateDoc(poDocRef, { lockedPrAllocations: updatedLocked, updatedAt: new Date().toISOString() });
          console.log(`   ✅ ลบเฉพาะ key ของ PR ${TARGET_PR_NO} ออกจาก lockedPrAllocations ของ PO ${po.poNo || po.id}`);
        }
      }
      console.log("\n🎉 แก้ไขเสร็จสิ้น! ลองกด Active PR อีกครั้ง");
    }
  } else if (linkedPOs.length === 0) {
    console.log("\n✅ ไม่พบ PO ที่ผูกกับ PR นี้ (อาจมีปัญหาอื่น — ตรวจสอบสถานะ PR)");
  } else {
    console.log("\n✅ ไม่มี lockedPrAllocations ค้างอยู่ — ยอดที่กินอยู่มาจาก PO จริงๆ");
  }

  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

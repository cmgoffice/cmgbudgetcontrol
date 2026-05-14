#!/usr/bin/env node
/**
 * Migration Script: เพิ่มข้อมูล Vendor ลงใน PO และ Payment ที่มีอยู่แล้ว
 * 
 * สคริปต์นี้จะ:
 * 1. อ่านข้อมูล Vendors ทั้งหมด
 * 2. อัปเดต PO ที่มี vendorId แต่ยังไม่มี vendorName
 * 3. อัปเดต Payment ที่มี contractorId แต่ยังไม่มี contractorName
 * 
 * วิธีใช้งาน:
 * node migrate_vendor_data.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

// อ่าน Firebase config จาก .env
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');
const config = {};

envLines.forEach(line => {
  const match = line.match(/^REACT_APP_(.+?)=(.+)$/);
  if (match) {
    const key = match[1].toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    config[key] = match[2].trim().replace(/^["']|["']$/g, '');
  }
});

// Initialize Firebase
const app = initializeApp(config);
const db = getFirestore(app);
const appId = config.appId || 'app';

console.log('🚀 เริ่มต้น Migration: เพิ่มข้อมูล Vendor ลงใน PO และ Payment\n');

async function migrateVendorData() {
  try {
    // 1. โหลดข้อมูล Vendors ทั้งหมด
    console.log('📦 กำลังโหลดข้อมูล Vendors...');
    const vendorsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'vendors'));
    const vendors = {};
    vendorsSnap.forEach(doc => {
      const data = doc.data();
      vendors[doc.id] = {
        id: doc.id,
        name: data.name || '',
        code: data.code || '',
        type: data.type || '',
      };
    });
    console.log(`✅ โหลด Vendors สำเร็จ: ${Object.keys(vendors).length} รายการ\n`);

    // 2. อัปเดต POs
    console.log('📝 กำลังอัปเดต POs...');
    const posSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pos'));
    let poUpdated = 0;
    let poSkipped = 0;
    let poNoVendor = 0;

    for (const poDoc of posSnap.docs) {
      const po = poDoc.data();
      
      // ข้าม PO ที่มีข้อมูล Vendor อยู่แล้ว
      if (po.vendorName) {
        poSkipped++;
        continue;
      }

      // ข้าม PO ที่ไม่มี vendorId
      if (!po.vendorId) {
        poNoVendor++;
        continue;
      }

      // หา Vendor จาก vendorId
      const vendor = vendors[po.vendorId];
      if (!vendor) {
        console.log(`⚠️  PO ${po.poNo || poDoc.id}: ไม่พบ Vendor ID ${po.vendorId}`);
        poNoVendor++;
        continue;
      }

      // อัปเดต PO
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pos', poDoc.id), {
        vendorName: vendor.name,
        vendorCode: vendor.code,
        vendorType: vendor.type,
        updatedAt: new Date().toISOString(),
      });

      poUpdated++;
      console.log(`✅ PO ${po.poNo || poDoc.id}: เพิ่มข้อมูล Vendor "${vendor.name}"`);
    }

    console.log(`\n📊 สรุปการอัปเดต POs:`);
    console.log(`   - อัปเดตสำเร็จ: ${poUpdated} รายการ`);
    console.log(`   - มีข้อมูลอยู่แล้ว: ${poSkipped} รายการ`);
    console.log(`   - ไม่มี Vendor: ${poNoVendor} รายการ\n`);

    // 3. อัปเดต Payments
    console.log('💰 กำลังอัปเดต Payments...');
    const paymentsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payments'));
    let paymentUpdated = 0;
    let paymentSkipped = 0;
    let paymentNoVendor = 0;

    for (const paymentDoc of paymentsSnap.docs) {
      const payment = paymentDoc.data();
      
      // ข้าม Payment ที่มีข้อมูล Vendor อยู่แล้ว
      if (payment.contractorName) {
        paymentSkipped++;
        continue;
      }

      // ข้าม Payment ที่ไม่มี contractorId
      if (!payment.contractorId) {
        paymentNoVendor++;
        continue;
      }

      // หา Vendor จาก contractorId
      const vendor = vendors[payment.contractorId];
      if (!vendor) {
        console.log(`⚠️  Payment ${payment.paymentNo || paymentDoc.id}: ไม่พบ Vendor ID ${payment.contractorId}`);
        paymentNoVendor++;
        continue;
      }

      // อัปเดต Payment
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', paymentDoc.id), {
        contractorName: vendor.name,
        contractorCode: vendor.code,
        contractorType: vendor.type,
        updatedAt: new Date().toISOString(),
      });

      paymentUpdated++;
      console.log(`✅ Payment ${payment.paymentNo || paymentDoc.id}: เพิ่มข้อมูล Vendor "${vendor.name}"`);
    }

    console.log(`\n📊 สรุปการอัปเดต Payments:`);
    console.log(`   - อัปเดตสำเร็จ: ${paymentUpdated} รายการ`);
    console.log(`   - มีข้อมูลอยู่แล้ว: ${paymentSkipped} รายการ`);
    console.log(`   - ไม่มี Vendor: ${paymentNoVendor} รายการ\n`);

    console.log('🎉 Migration เสร็จสมบูรณ์!');
    console.log(`\n📈 สรุปรวม:`);
    console.log(`   - PO ที่อัปเดต: ${poUpdated} รายการ`);
    console.log(`   - Payment ที่อัปเดต: ${paymentUpdated} รายการ`);
    console.log(`   - รวมทั้งหมด: ${poUpdated + paymentUpdated} รายการ\n`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
    process.exit(1);
  }

  process.exit(0);
}

// เริ่มต้น Migration
migrateVendorData();

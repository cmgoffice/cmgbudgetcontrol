#!/usr/bin/env node
/**
 * Migration Script (Safe Version): เพิ่มข้อมูล Vendor ลงใน PO และ Payment ที่มีอยู่แล้ว
 * 
 * เวอร์ชันนี้จะแสดงข้อมูลที่จะอัปเดตก่อน และขอยืนยันจากผู้ใช้
 * 
 * วิธีใช้งาน:
 * node migrate_vendor_data_safe.mjs
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import * as readline from 'readline';

// อ่าน Firebase config จาก .env
const envContent = readFileSync('.env', 'utf-8');
const envLines = envContent.split('\n');

// สร้าง config object ตามรูปแบบที่ Firebase ต้องการ
const config = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
  measurementId: ''
};

envLines.forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('REACT_APP_FIREBASE_API_KEY=')) {
    config.apiKey = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_AUTH_DOMAIN=')) {
    config.authDomain = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_PROJECT_ID=')) {
    config.projectId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_STORAGE_BUCKET=')) {
    config.storageBucket = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_MESSAGING_SENDER_ID=')) {
    config.messagingSenderId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_APP_ID=')) {
    config.appId = trimmed.split('=')[1];
  } else if (trimmed.startsWith('REACT_APP_FIREBASE_MEASUREMENT_ID=')) {
    config.measurementId = trimmed.split('=')[1];
  }
});

// Initialize Firebase
const app = initializeApp(config);
const db = getFirestore(app);
const appId = 'cmg-budget-control-default'; // ใช้ค่าเดียวกับที่กำหนดใน firebase.ts

// สร้าง readline interface สำหรับรับ input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

console.log('🚀 Migration Script: เพิ่มข้อมูล Vendor ลงใน PO และ Payment');
console.log('📋 เวอร์ชัน: Safe Mode (มีการยืนยันก่อนรัน)\n');

async function analyzeData() {
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

    // 2. วิเคราะห์ POs
    console.log('🔍 กำลังวิเคราะห์ POs...');
    const posSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pos'));
    const posToUpdate = [];
    let poSkipped = 0;
    let poNoVendor = 0;

    for (const poDoc of posSnap.docs) {
      const po = poDoc.data();
      
      if (po.vendorName) {
        poSkipped++;
        continue;
      }

      if (!po.vendorId) {
        poNoVendor++;
        continue;
      }

      const vendor = vendors[po.vendorId];
      if (!vendor) {
        poNoVendor++;
        continue;
      }

      posToUpdate.push({
        id: poDoc.id,
        poNo: po.poNo || poDoc.id,
        vendorId: po.vendorId,
        vendorName: vendor.name,
        vendorCode: vendor.code,
        vendorType: vendor.type,
      });
    }

    console.log(`📊 สรุปการวิเคราะห์ POs:`);
    console.log(`   - จะอัปเดต: ${posToUpdate.length} รายการ`);
    console.log(`   - มีข้อมูลอยู่แล้ว: ${poSkipped} รายการ`);
    console.log(`   - ไม่มี Vendor: ${poNoVendor} รายการ\n`);

    // แสดงตัวอย่าง PO ที่จะอัปเดต (5 รายการแรก)
    if (posToUpdate.length > 0) {
      console.log('📝 ตัวอย่าง PO ที่จะอัปเดต (5 รายการแรก):');
      posToUpdate.slice(0, 5).forEach(po => {
        console.log(`   - ${po.poNo}: จะเพิ่ม "${po.vendorName}" (${po.vendorCode})`);
      });
      if (posToUpdate.length > 5) {
        console.log(`   ... และอีก ${posToUpdate.length - 5} รายการ`);
      }
      console.log('');
    }

    // 3. วิเคราะห์ Payments
    console.log('🔍 กำลังวิเคราะห์ Payments...');
    const paymentsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payments'));
    const paymentsToUpdate = [];
    let paymentSkipped = 0;
    let paymentNoVendor = 0;

    for (const paymentDoc of paymentsSnap.docs) {
      const payment = paymentDoc.data();
      
      if (payment.contractorName) {
        paymentSkipped++;
        continue;
      }

      if (!payment.contractorId) {
        paymentNoVendor++;
        continue;
      }

      const vendor = vendors[payment.contractorId];
      if (!vendor) {
        paymentNoVendor++;
        continue;
      }

      paymentsToUpdate.push({
        id: paymentDoc.id,
        paymentNo: payment.paymentNo || paymentDoc.id,
        contractorId: payment.contractorId,
        contractorName: vendor.name,
        contractorCode: vendor.code,
        contractorType: vendor.type,
      });
    }

    console.log(`📊 สรุปการวิเคราะห์ Payments:`);
    console.log(`   - จะอัปเดต: ${paymentsToUpdate.length} รายการ`);
    console.log(`   - มีข้อมูลอยู่แล้ว: ${paymentSkipped} รายการ`);
    console.log(`   - ไม่มี Vendor: ${paymentNoVendor} รายการ\n`);

    // แสดงตัวอย่าง Payment ที่จะอัปเดต (5 รายการแรก)
    if (paymentsToUpdate.length > 0) {
      console.log('💰 ตัวอย่าง Payment ที่จะอัปเดต (5 รายการแรก):');
      paymentsToUpdate.slice(0, 5).forEach(payment => {
        console.log(`   - ${payment.paymentNo}: จะเพิ่ม "${payment.contractorName}" (${payment.contractorCode})`);
      });
      if (paymentsToUpdate.length > 5) {
        console.log(`   ... และอีก ${paymentsToUpdate.length - 5} รายการ`);
      }
      console.log('');
    }

    // 4. สรุปรวม
    const totalToUpdate = posToUpdate.length + paymentsToUpdate.length;
    console.log('═══════════════════════════════════════════════════════');
    console.log(`📈 สรุปรวม: จะอัปเดตทั้งหมด ${totalToUpdate} รายการ`);
    console.log(`   - PO: ${posToUpdate.length} รายการ`);
    console.log(`   - Payment: ${paymentsToUpdate.length} รายการ`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (totalToUpdate === 0) {
      console.log('✅ ไม่มีข้อมูลที่ต้องอัปเดต ทุกอย่างเรียบร้อยแล้ว!');
      rl.close();
      process.exit(0);
    }

    // 5. ขอยืนยันจากผู้ใช้
    const answer = await question('❓ ต้องการดำเนินการอัปเดตข้อมูลหรือไม่? (yes/no): ');
    
    if (answer.toLowerCase() !== 'yes' && answer.toLowerCase() !== 'y') {
      console.log('\n❌ ยกเลิกการอัปเดต');
      rl.close();
      process.exit(0);
    }

    console.log('\n🚀 เริ่มต้นการอัปเดตข้อมูล...\n');

    // 6. อัปเดต POs
    if (posToUpdate.length > 0) {
      console.log('📝 กำลังอัปเดต POs...');
      for (const po of posToUpdate) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'pos', po.id), {
          vendorName: po.vendorName,
          vendorCode: po.vendorCode,
          vendorType: po.vendorType,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ ${po.poNo}: เพิ่มข้อมูล Vendor "${po.vendorName}"`);
      }
      console.log(`\n✅ อัปเดต PO สำเร็จ: ${posToUpdate.length} รายการ\n`);
    }

    // 7. อัปเดต Payments
    if (paymentsToUpdate.length > 0) {
      console.log('💰 กำลังอัปเดต Payments...');
      for (const payment of paymentsToUpdate) {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'payments', payment.id), {
          contractorName: payment.contractorName,
          contractorCode: payment.contractorCode,
          contractorType: payment.contractorType,
          updatedAt: new Date().toISOString(),
        });
        console.log(`✅ ${payment.paymentNo}: เพิ่มข้อมูล Vendor "${payment.contractorName}"`);
      }
      console.log(`\n✅ อัปเดต Payment สำเร็จ: ${paymentsToUpdate.length} รายการ\n`);
    }

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Migration เสร็จสมบูรณ์!');
    console.log(`📈 อัปเดตทั้งหมด: ${totalToUpdate} รายการ`);
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาด:', error);
    rl.close();
    process.exit(1);
  }

  rl.close();
  process.exit(0);
}

// เริ่มต้น Migration
analyzeData();

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';
import * as path from 'path';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
});
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';

async function run() {
  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
  const invoices = [];
  invSnap.forEach(doc => invoices.push({id: doc.id, ...doc.data()}));

  const grouped = new Map();
  invoices.forEach(inv => {
     const poNo = inv.poNo || inv.poRef;
     if (!poNo) return; 
     
     const amt = Number(inv.amount) || (Number(inv.invoiceQty||0)*Number(inv.price||0)) || 0;
     const key = `${inv.projectId}_${poNo}_${amt}`;
     
     if (!grouped.has(key)) {
         grouped.set(key, []);
     }
     grouped.get(key).push(inv);
  });

  const duplicates = [];
  grouped.forEach((invList, key) => {
     if (invList.length > 1) {
         duplicates.push({ key, invoices: invList });
     }
  });

  const projSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'projects'));
  const projects = new Map();
  projSnap.forEach(doc => projects.set(doc.id, doc.data().name || doc.data().jobNo));

  let duplicateCount = 0;
  
  duplicates.sort((a, b) => {
      const pA = projects.get(a.invoices[0].projectId) || a.invoices[0].projectId;
      const pB = projects.get(b.invoices[0].projectId) || b.invoices[0].projectId;
      return pA.localeCompare(pB);
  });

  let report = `# รายงานใบแจ้งหนี้ซ้ำซ้อน (Duplicate Invoices Report)

> [!WARNING]
> รายการด้านล่างนี้คือ PO ที่มีใบแจ้งหนี้ (Invoice) ผูกอยู่มากกว่า 1 ใบและมียอดเงินเท่ากัน ซึ่งเป็นสาเหตุที่ทำให้ยอด Spent (Inv) สูงกว่าความเป็นจริง รบกวนตรวจสอบและลบรายการที่ซ้ำออกครับ

`;

  let currentProject = "";

  duplicates.forEach(dup => {
      const inv1 = dup.invoices[0];
      const poNo = inv1.poNo || inv1.poRef;
      const projName = projects.get(inv1.projectId) || inv1.projectId;
      const amt = Number(inv1.amount) || (Number(inv1.invoiceQty||0)*Number(inv1.price||0)) || 0;
      
      if (projName !== currentProject) {
          report += `\n## โครงการ: ${projName}\n`;
          currentProject = projName;
      }
      
      report += `\n### PO: ${poNo} | ยอดเงิน: ${amt.toLocaleString('th-TH', {minimumFractionDigits: 2})}\n`;
      report += `| Invoice ID | Invoice No | Status | Payment Type | Date |\n`;
      report += `|---|---|---|---|---|\n`;
      
      dup.invoices.forEach(inv => {
          const date = inv.date || inv.createdAt || inv.invoiceDate || 'N/A';
          let dateStr = 'N/A';
          if (date && typeof date === 'string') {
              dateStr = new Date(date).toLocaleDateString('th-TH');
          }
          report += `| ${inv.id} | ${inv.invoiceNo || inv.docNo || '-'} | ${inv.status || '-'} | ${inv.paymentType || '-'} | ${dateStr} |\n`;
      });
      duplicateCount++;
  });
  
  report += `\n\n**รวม PO ทั้งหมดที่มีรายการซ้ำ: ${duplicateCount} รายการ**\n`;
  
  const artifactPath = "C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\2e5a1e69-6422-4593-b940-e10cf6add177\\duplicate_invoices_report.md";
  fs.writeFileSync(artifactPath, report);
  console.log("Report saved to artifact");
  
  process.exit(0);
}
run().catch(console.error);

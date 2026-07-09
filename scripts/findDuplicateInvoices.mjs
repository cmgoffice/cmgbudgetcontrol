import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import * as fs from 'fs';

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

  let report = "=== Potential Duplicate Invoices Report ===\n\n";
  let duplicateCount = 0;
  
  // Sort by project name
  duplicates.sort((a, b) => {
      const pA = projects.get(a.invoices[0].projectId) || a.invoices[0].projectId;
      const pB = projects.get(b.invoices[0].projectId) || b.invoices[0].projectId;
      return pA.localeCompare(pB);
  });

  duplicates.forEach(dup => {
      const inv1 = dup.invoices[0];
      const poNo = inv1.poNo || inv1.poRef;
      const projName = projects.get(inv1.projectId) || inv1.projectId;
      const amt = Number(inv1.amount) || (Number(inv1.invoiceQty||0)*Number(inv1.price||0)) || 0;
      
      report += `Project: ${projName} (ID: ${inv1.projectId})\n`;
      report += `PO No: ${poNo} | Amount: ${amt.toLocaleString('th-TH', {minimumFractionDigits: 2})}\n`;
      
      dup.invoices.forEach(inv => {
          const date = inv.date || inv.createdAt || inv.invoiceDate || 'N/A';
          report += `  - Inv ID: ${inv.id} | Inv No: ${inv.invoiceNo || inv.docNo || 'N/A'} | Status: ${inv.status || 'N/A'} | PayType: ${inv.paymentType || 'N/A'} | Date: ${date}\n`;
      });
      report += '\n';
      duplicateCount++;
  });
  
  report += `Total POs with identical invoice amounts: ${duplicateCount}\n`;
  
  fs.writeFileSync('duplicate_invoices_report.txt', report);
  console.log("Report saved to duplicate_invoices_report.txt");
  
  process.exit(0);
}
run().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a",
  measurementId: "G-YSPY0MTZG1"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const appId = "cmg-budget-control-default";

async function run() {
  const j72Id = 'J-72';
  
  const budgetsSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "budgets"));
  const budgets007 = [];
  budgetsSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === j72Id && data.code === '007') {
         budgets007.push({id: doc.id, ...data});
     }
  });
  console.log('Budgets 007 count:', budgets007.length);
  const budgetId = budgets007[0]?.id;
  const subItems = budgets007[0]?.subItems || [];

  const poSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "pos"));
  const pos = [];
  poSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === j72Id) pos.push({id: doc.id, ...data});
  });

  const invSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "invoices"));
  const invoices = [];
  invSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === j72Id) invoices.push({id: doc.id, ...data});
  });
  
  const paySnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "payments"));
  const payments = [];
  paySnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === j72Id) payments.push({id: doc.id, ...data});
  });
  
  const prSnap = await getDocs(collection(db, "artifacts", appId, "public", "data", "prs"));
  const prs = [];
  prSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === j72Id) prs.push({id: doc.id, ...data});
  });
  
  // Find related PRs for 007
  const relatedPRs = prs.filter(pr => {
     if (pr.status === "Rejected") return false;
     if (subItems.length > 0) {
        if (!pr.items) return false;
        return pr.items.some(i => i.budgetId === budgetId || subItems.some(sub => sub.id === i.budgetSubItemId || sub.id === i.subItemId));
     }
     return pr.budgetId === budgetId || pr.items?.some(i => i.budgetId === budgetId) || pr.costCode === '007';
  });
  
  // Find related POs for 007
  const relatedPOs = pos.filter(po => {
     if (po.status === "Rejected") return false;
     if (subItems.length > 0) {
        if (!po.items) return false;
        return po.items.some(i => i.budgetId === budgetId || subItems.some(sub => sub.id === i.budgetSubItemId || sub.id === i.subItemId));
     }
     return po.items?.some(i => i.budgetId === budgetId) || po.items?.some(i => i.costCode === '007');
  });
  
  console.log(`Related PRs: ${relatedPRs.length}, Related POs: ${relatedPOs.length}`);
  
  let poTotal = 0;
  relatedPOs.forEach(po => {
     let subtotal = 0;
     (po.items || []).forEach(i => {
         subtotal += Number(i.amount) || (Number(i.quantity||0) * Number(i.price||0)) || 0;
     });
     poTotal += po.totalAmount ? Number(po.totalAmount) : subtotal;
     console.log(`PO: ${po.poNo} | Amount: ${po.totalAmount} | Subtotal: ${subtotal}`);
  });
  console.log('Total PO Amount:', poTotal);
  
  const uniqueInvoices = new Map();
  const paidInvoiceIds = new Set();
  
  invoices.forEach(inv => {
     if (['Paid', 'ชำระแล้ว', 'Approve'].includes(inv.status) || inv.status) { // simplify
        if (inv.status === 'Draft') return;
        uniqueInvoices.set(inv.id, inv);
        paidInvoiceIds.add(String(inv.id));
     }
  });
  
  const map = new Map();
  uniqueInvoices.forEach(inv => {
      const amount = Number(inv.amount) || (Number(inv.invoiceQty||0)*Number(inv.price||0)) || 0;
      if (inv.poRef) map.set(inv.poRef, (map.get(inv.poRef)||0) + amount);
      else if (inv.poNo) map.set(inv.poNo, (map.get(inv.poNo)||0) + amount);
  });
  
  const payDocs = payments.filter(p => ['Paid', 'ชำระแล้ว', 'Approve'].includes(p.status));
  payDocs.forEach(row => {
      let linked = row.invoiceIds || [];
      if (!Array.isArray(linked)) linked = [linked];
      const hasLinked = linked.some(id => paidInvoiceIds.has(String(id)));
      if (!hasLinked) {
         const amount = Number(row.amount) || 0;
         if (row.poRef) map.set(row.poRef, (map.get(row.poRef)||0) + amount);
         else if (row.poNo) map.set(row.poNo, (map.get(row.poNo)||0) + amount);
      }
  });
  
  let invoiceTotal = 0;
  relatedPOs.forEach(po => {
      const invAmt = map.get(po.poNo) || 0;
      invoiceTotal += invAmt;
      console.log(`PO: ${po.poNo} -> Invoices: ${invAmt}`);
  });
  console.log('Total Invoice Amount via POs:', invoiceTotal);
  
  // SP Payments
  let spTotal = 0;
  const spPayments = payments.filter(p => p.paymentType === 'SP' && ['Paid', 'ชำระแล้ว', 'Approve'].includes(p.status));
  console.log('Total SP Payments in Project:', spPayments.length);
  spPayments.forEach(sp => {
      if (sp.poRef || sp.poNo) return;
      
      const isRelated = sp.selectedPrIds && sp.selectedPrIds.some(id => relatedPRs.some(pr => pr.id === id));
      if (isRelated) {
         const spAmt = Number(sp.amount) || 0;
         spTotal += spAmt;
         console.log(`SP Payment related: ${sp.docNo || sp.id}, Amount: ${spAmt}`);
      }
  });
  console.log('Total SP Amount for 007:', spTotal);
  
  console.log('Calculated Spent (Inv):', invoiceTotal + spTotal);
  
  process.exit(0);
}

run().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8',
  authDomain: 'cmg-budget-control.firebaseapp.com',
  projectId: 'cmg-budget-control',
  storageBucket: 'cmg-budget-control.firebasestorage.app',
  messagingSenderId: '106345631455',
  appId: '1:106345631455:web:f96f15b024e8c65334e36a',
});
const db = getFirestore(app);
const appId = 'cmg-budget-control-default';

const isPaidStatus = (value) => String(value || "").trim().toLowerCase() === "paid";
const isPaidInvoiceRecord = (invoice) => {
  if (isPaidStatus(invoice?.status) || isPaidStatus(invoice?.statusNow)) return true;
  const paymentType = String(invoice?.paymentType || "").trim();
  if (["เงินสด", "โอน", "เช็ค"].includes(paymentType)) return true;
  return false;
};
const normalizeIdList = (ids) =>
  Array.isArray(ids) ? ids.map(String) : typeof ids === "string" ? ids.split(",").map((s) => s.trim()) : [];

async function run() {
  const budgetsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'budgets'));
  const budgets007 = [];
  budgetsSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === 'J-72' && data.category === '007') {
         budgets007.push({id: doc.id, ...data});
     }
  });

  const poSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pos'));
  const projectPos = [];
  poSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === 'J-72') projectPos.push({id: doc.id, ...data});
  });

  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
  const invoices = [];
  invSnap.forEach(doc => invoices.push({id: doc.id, ...doc.data()}));
  
  const paySnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payments'));
  const payments = [];
  paySnap.forEach(doc => payments.push({id: doc.id, ...doc.data()}));
  
  const projectPoNos = new Set(projectPos.map(po => po.poNo).filter(Boolean));
  const uniqueInvoices = new Map();
  const paidInvoiceIds = new Set();
  
  invoices.forEach(invoice => {
      const invoiceProjectId = invoice?.projectId || projectPos.find(po => String(po.id) === String(invoice?.poId || ""))?.projectId || "";
      const belongsToProject = invoiceProjectId === 'J-72' || projectPoNos.has(invoice.poRef) || projectPoNos.has(invoice.poNo);
      
      if (belongsToProject && isPaidInvoiceRecord(invoice)) {
          uniqueInvoices.set(invoice.id, invoice);
          paidInvoiceIds.add(String(invoice.id));
      }
  });

  const invoiceAmountByPoRef = new Map();
  uniqueInvoices.forEach(invoice => {
      const amount = Number(invoice.amount) || (Number(invoice.invoiceQty||0)*Number(invoice.price||0)) || 0;
      if (invoice.poRef) {
          invoiceAmountByPoRef.set(invoice.poRef, (invoiceAmountByPoRef.get(invoice.poRef)||0) + amount);
      } else if (invoice.poNo) {
          invoiceAmountByPoRef.set(invoice.poNo, (invoiceAmountByPoRef.get(invoice.poNo)||0) + amount);
      }
  });

  const projectPayments = payments.filter(p => p.projectId === 'J-72');
  const payDocs = projectPayments.filter(row => isPaidStatus(row.status));
  
  payDocs.forEach(row => {
      let linked = normalizeIdList(row.invoiceIds || []);
      const hasLinked = linked.some(id => paidInvoiceIds.has(String(id)));
      const hasByPayNo = Array.from(uniqueInvoices.values()).some(inv => String(inv.payNo||"") === String(row.docNo||""));
      if (!hasLinked && !hasByPayNo) {
          const amt = Number(row.amount) || 0;
          if (row.poRef) invoiceAmountByPoRef.set(row.poRef, (invoiceAmountByPoRef.get(row.poRef)||0) + amt);
          else if (row.poNo) invoiceAmountByPoRef.set(row.poNo, (invoiceAmountByPoRef.get(row.poNo)||0) + amt);
      }
  });

  const getItemAmount = (item) => {
    const amount = Number(item?.amount);
    if (Number.isFinite(amount)) return amount;
    return (Number(item?.quantity || 0) * Number(item?.price || 0));
  };

  let totalInvoiceCalculated = 0;
  let totalPoCalculated = 0;
  
  console.log("Analyzing POs vs Invoices for category 007:");
  
  budgets007.forEach(budget => {
     const budgetDocId = budget.id;
     const hasSubItems = budget.subItems && budget.subItems.length > 0;
     const budgetCode = budget.code;
     const budgetDesc = (budget.description || '').trim();
     
     const itemBelongsToBudget = (item, parentDoc=null) => {
         if (hasSubItems) {
            if (item?.budgetId === budgetDocId) return true;
            if (item.budgetSubItemId || item.subItemId) {
                const subIds = new Set(budget.subItems.map(s=>s.id));
                if (subIds.has(item.budgetSubItemId) || subIds.has(item.subItemId)) return true;
            }
            return false;
         }
         if (item?.budgetId) return item.budgetId === budgetDocId;
         if (parentDoc?.budgetId) return parentDoc.budgetId === budgetDocId;
         if (item?.costCode) return item.costCode === budgetCode;
         return (item?.description || '').trim() === budgetDesc;
     };

     const relatedPOs = projectPos.filter(po => {
        if (po.status === 'Rejected') return false;
        if (hasSubItems) {
           if (!po.items || !po.items.length) return false;
           return po.items.some(i => itemBelongsToBudget(i));
        }
        if (po.items?.some(i => i.budgetId === budgetDocId)) return true;
        if (po.items?.some(i => i.costCode === budgetCode)) return true;
        return false;
     });

     const seenPoNosForInvoice = new Set();
     const seenPoNosForTotal = new Set();
     
     relatedPOs.forEach(po => {
         if (po.poNo && seenPoNosForTotal.has(po.poNo)) return;
         if (po.poNo) seenPoNosForTotal.add(po.poNo);
         
         const invAmt = invoiceAmountByPoRef.get(po.poNo) || 0;
         
         let subtotal = 0;
         if (po.items && po.items.length > 0) {
            subtotal = po.items.reduce((iSum, i) => {
               if (!itemBelongsToBudget(i)) return iSum;
               return iSum + getItemAmount(i);
            }, 0);
         }
         
         let allocatedInvAmt = 0;
         let allocatedPoAmt = 0;
         
         if (subtotal > 0) {
            const poSubtotal = po.items.reduce((s, i) => s + getItemAmount(i), 0);
            const itemRatio = poSubtotal > 0 ? subtotal / poSubtotal : 1;
            allocatedInvAmt = invAmt * itemRatio;
            
            // PO total calculation exactly as in BudgetView.tsx
            const poAmt = Number(po.totalAmount) || poSubtotal || 0;
            allocatedPoAmt = poAmt * itemRatio;
         } else if (!po.items || po.items.length === 0) {
            allocatedInvAmt = invAmt;
            allocatedPoAmt = Number(po.totalAmount) || 0;
         }
         
         totalInvoiceCalculated += allocatedInvAmt;
         totalPoCalculated += allocatedPoAmt;
         
         if (Math.abs(allocatedInvAmt - allocatedPoAmt) > 0.01) {
            console.log(`[Diff] PO: ${po.poNo}, PO Amount: ${allocatedPoAmt.toFixed(2)}, Inv Amount: ${allocatedInvAmt.toFixed(2)}, Diff: ${(allocatedInvAmt - allocatedPoAmt).toFixed(2)}`);
         }
     });
  });

  console.log('Total PO Calculated for 007:', totalPoCalculated.toFixed(2));
  console.log('Total Invoice Calculated for 007:', totalInvoiceCalculated.toFixed(2));
  process.exit(0);
}
run().catch(console.error);

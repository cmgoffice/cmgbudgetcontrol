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

async function run() {
  const budgetsSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'budgets'));
  const budgets007 = [];
  budgetsSnap.forEach(doc => {
     const data = doc.data();
     if (data.projectId === 'J-72' && data.category === '007') {
         budgets007.push({id: doc.id, ...data});
     }
  });

  const prSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'prs'));
  const prs = [];
  prSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === 'J-72') prs.push({id: doc.id, ...data});
  });
  const projectPrById = new Map();
  prs.forEach(pr => projectPrById.set(pr.id, pr));

  const poSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'pos'));
  const projectPos = [];
  poSnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === 'J-72') projectPos.push({id: doc.id, ...data});
  });

  const invSnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'invoices'));
  const invoices = [];
  invSnap.forEach(doc => {
     const data = doc.data();
     // no project filter for invoiceAmountByPoRef in actual code! Wait, actually:
     invoices.push({id: doc.id, ...data});
  });
  
  const paySnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payments'));
  const payments = [];
  paySnap.forEach(doc => {
      const data = doc.data();
      payments.push({id: doc.id, ...data});
  });
  
  // Replicate invoiceAmountByPoRef
  const projectPoNos = new Set(projectPos.map(po => po.poNo).filter(Boolean));
  const uniqueInvoices = new Map();
  const paidInvoiceIds = new Set();
  
  invoices.forEach(invoice => {
      const belongsToProject = invoice.projectId === 'J-72' || projectPoNos.has(invoice.poRef) || projectPoNos.has(invoice.poNo);
      const isPaid = invoice.status === 'Paid' || invoice.status === 'ชำระแล้ว' || invoice.status === 'Approve';
      if (belongsToProject && isPaid) {
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
  const payDocs = projectPayments.filter(row => row.status === 'Paid' || row.status === 'ชำระแล้ว' || row.status === 'Approve');
  
  payDocs.forEach(row => {
      let linked = row.invoiceIds || [];
      if (!Array.isArray(linked)) linked = [linked];
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
     const invoiceTotal = relatedPOs.reduce((sum, po) => {
         if (po.status === 'Rejected') return sum;
         if (po.poNo && seenPoNosForInvoice.has(po.poNo)) return sum;
         if (po.poNo) seenPoNosForInvoice.add(po.poNo);
         
         const invAmt = invoiceAmountByPoRef.get(po.poNo) || 0;
         if (invAmt === 0) return sum;
         
         let subtotal = 0;
         if (po.items && po.items.length > 0) {
            subtotal = po.items.reduce((iSum, i) => {
               if (!itemBelongsToBudget(i)) return iSum;
               return iSum + getItemAmount(i);
            }, 0);
         }
         
         if (subtotal > 0) {
            const poSubtotal = po.items.reduce((s, i) => s + getItemAmount(i), 0);
            const itemRatio = poSubtotal > 0 ? subtotal / poSubtotal : 1;
            return sum + (invAmt * itemRatio);
         }
         
         if (!po.items || po.items.length === 0) {
            return sum + invAmt;
         }
         return sum;
     }, 0);

     console.log(`Budget ${budget.code}: POs=${relatedPOs.length}, InvoiceTotal=${invoiceTotal}`);
     totalInvoiceCalculated += invoiceTotal;
  });

  console.log('Total Invoice Calculated for 007:', totalInvoiceCalculated);
  process.exit(0);
}
run().catch(console.error);

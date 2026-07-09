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

  const paySnap = await getDocs(collection(db, 'artifacts', appId, 'public', 'data', 'payments'));
  const payments = [];
  paySnap.forEach(doc => {
      const data = doc.data();
      if (data.projectId === 'J-72') payments.push({id: doc.id, ...data});
  });
  
  const spPaymentsForProject = payments.filter((payment) => payment.paymentType === 'SP' && Array.isArray(payment.selectedPrIds) && payment.selectedPrIds.length > 0);

  let totalSpAllocated = 0;

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

     const relatedPRs = prs.filter((pr) => {
        if (pr.status === "Rejected") return false;
        if (hasSubItems) {
            if (!pr.items || pr.items.length === 0) return false;
            return pr.items.some(i => itemBelongsToBudget(i, pr));
        }
        if (pr.budgetId === budgetDocId) return true;
        if (pr.items?.some(i => i.budgetId === budgetDocId)) return true;
        if (pr.costCode === budgetCode) return true;
        return false;
     });

     const seenSpDocNos = new Set();
     const spTotal = spPaymentsForProject.reduce((sum, sp) => {
         if (sp.poRef || sp.poNo) return sum;
         if (!['Paid', 'ชำระแล้ว', 'Approve'].includes(sp.status)) return sum;
         
         const docNo = sp.docNo || sp.id;
         if (seenSpDocNos.has(docNo)) return sum;
         
         const relatedPrIds = new Set(relatedPRs.map(pr => pr.id));
         const isRelated = sp.selectedPrIds && sp.selectedPrIds.some(prId => relatedPrIds.has(prId));
         
         if (!isRelated) return sum;
         seenSpDocNos.add(docNo);
         
         let budgetSubtotal = 0;
         let totalPrSubtotal = 0;
         
         sp.selectedPrIds.forEach(prId => {
             const pr = projectPrById.get(prId);
             if (!pr || !pr.items) return;
             
             pr.items.forEach(i => {
                 const amt = Number(i.amount) || (Number(i.quantity||0)*Number(i.price||0)) || 0;
                 totalPrSubtotal += amt;
                 if (itemBelongsToBudget(i, pr)) {
                    budgetSubtotal += amt;
                 }
             });
         });
         
         const spAmt = Number(sp.amount) || 0;
         
         if (totalPrSubtotal > 0) {
            const itemRatio = budgetSubtotal / totalPrSubtotal;
            if (itemRatio > 0) {
               console.log(`[${budget.code}] SP ${docNo} ratio ${itemRatio} added ${spAmt * itemRatio} (total: ${spAmt})`);
            }
            return sum + (spAmt * itemRatio);
         } else {
            console.log(`[${budget.code}] SP ${docNo} no PR items, fallback full added ${spAmt}`);
            return sum + spAmt;
         }
     }, 0);
     
     totalSpAllocated += spTotal;
  });

  console.log('Total SP Allocated for 007:', totalSpAllocated);
  process.exit(0);
}
run().catch(console.error);

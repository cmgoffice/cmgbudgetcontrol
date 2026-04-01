import { doc, updateDoc, getDocs, query, collection, where } from 'firebase/firestore';

export const recalculateBudgetTotals = async (db, appId, projectId, budgetCode = null) => {
  try {
    console.log('Starting budget totals recalculation...');
    
    // Get all budgets for the project
    const budgetsQuery = budgetCode 
      ? query(
          collection(db, "artifacts", appId, "public", "data", "budgets"),
          where("projectId", "==", projectId),
          where("code", "==", budgetCode)
        )
      : query(
          collection(db, "artifacts", appId, "public", "data", "budgets"),
          where("projectId", "==", projectId)
        );
    
    const budgetsSnapshot = await getDocs(budgetsQuery);
    const budgets = budgetsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Get all PRs for the project
    const prsQuery = query(
      collection(db, "artifacts", appId, "public", "data", "prs"),
      where("projectId", "==", projectId)
    );
    const prsSnapshot = await getDocs(prsQuery);
    const prs = prsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Get all POs for the project
    const posQuery = query(
      collection(db, "artifacts", appId, "public", "data", "pos"),
      where("projectId", "==", projectId)
    );
    const posSnapshot = await getDocs(posQuery);
    const pos = posSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`Found ${budgets.length} budgets, ${prs.length} PRs, ${pos.length} POs`);
    
    // Recalculate totals for each budget
    const updates = [];
    
    for (const budget of budgets) {
      const hasSubItems = budget.subItems && budget.subItems.length > 0;
      const subItemIds = hasSubItems ? budget.subItems.map(sub => sub.id) : [];
      
      // Function to check if item belongs to budget
      const itemBelongsToBudget = (item) => {
        if (hasSubItems) {
          // Check direct sub-item reference
          if (item.budgetSubItemId && subItemIds.includes(item.budgetSubItemId)) return true;
          if (item.subItemId && subItemIds.includes(item.subItemId)) return true;
          
          // Trace back through PR for PO items
          if (item.prId != null && item.prItemIndex != null) {
            const pr = prs.find(p => p.id === item.prId);
            const prItem = pr?.items?.[item.prItemIndex];
            if (prItem) {
              if (prItem.budgetSubItemId && subItemIds.includes(prItem.budgetSubItemId)) return true;
              if (prItem.subItemId && subItemIds.includes(prItem.subItemId)) return true;
            }
          }
          return false;
        }
        
        // For budgets without sub-items
        if (item.budgetId) return item.budgetId === budget.id;
        return false;
      };
      
      // Calculate PR total
      const prTotal = prs
        .filter(pr => pr.status !== 'Rejected' && pr.projectId === projectId)
        .reduce((sum, pr) => {
          if (pr.items && pr.items.length > 0) {
            const prAmount = pr.items.reduce((iSum, item) => {
              if (!itemBelongsToBudget(item)) return iSum;
              const itemAmount = item.amount != null && item.amount !== '' 
                ? Number(item.amount) 
                : (Number(item.quantity || 0) * Number(item.price || 0));
              return iSum + itemAmount;
            }, 0);
            return sum + prAmount;
          }
          return sum;
        }, 0);
      
      // Calculate PO total
      const poTotal = pos
        .filter(po => po.status !== 'Rejected' && po.projectId === projectId)
        .reduce((sum, po) => {
          if (po.items && po.items.length > 0) {
            const poAmount = po.items.reduce((iSum, item) => {
              if (!itemBelongsToBudget(item)) return iSum;
              const itemAmount = item.amount != null && item.amount !== '' 
                ? Number(item.amount) 
                : (Number(item.quantity || 0) * Number(item.price || 0));
              return iSum + itemAmount;
            }, 0);
            return sum + poAmount;
          }
          return sum;
        }, 0);
      
      console.log(`Budget ${budget.code}: PR Total = ${prTotal}, PO Total = ${poTotal}`);
      
      // Store update info
      updates.push({
        budgetId: budget.id,
        budgetCode: budget.code,
        prTotal,
        poTotal,
        calculatedAt: new Date().toISOString()
      });
    }
    
    // Optional: Store calculation results in a separate collection for reference
    // This doesn't modify the original budget documents
    console.log('Calculation completed. Results:', updates);
    
    return {
      success: true,
      updates,
      message: `Recalculated totals for ${updates.length} budgets`
    };
    
  } catch (error) {
    console.error('Error recalculating budget totals:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Function to apply the recalculated totals (optional - call this separately)
export const applyRecalculatedTotals = async (db, appId, updates) => {
  try {
    console.log('Applying recalculated totals to budget documents...');
    
    for (const update of updates) {
      const budgetRef = doc(db, "artifacts", appId, "public", "data", "budgets", update.budgetId);
      await updateDoc(budgetRef, {
        calculatedPrTotal: update.prTotal,
        calculatedPoTotal: update.poTotal,
        totalsUpdatedAt: update.calculatedAt
      });
      console.log(`Updated budget ${update.budgetCode}`);
    }
    
    return {
      success: true,
      message: `Applied updates to ${updates.length} budgets`
    };
  } catch (error) {
    console.error('Error applying updates:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

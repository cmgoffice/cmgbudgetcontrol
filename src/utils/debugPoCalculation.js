// Debug script to check PO calculation for budget 004002001
export const debugPoCalculation = (budgets, prs, pos, selectedProjectId) => {
  const targetBudgetCode = '004002001';
  const budget = budgets.find(b => b.code === targetBudgetCode && b.projectId === selectedProjectId);
  
  if (!budget) {
    console.log(`Budget ${targetBudgetCode} not found`);
    return;
  }
  
  console.log('=== Budget Info ===');
  console.log(`Code: ${budget.code}`);
  console.log(`Description: ${budget.description}`);
  console.log(`Has Sub-items: ${budget.subItems?.length > 0}`);
  
  if (budget.subItems?.length > 0) {
    console.log('\n=== Sub-items ===');
    budget.subItems.forEach((sub, idx) => {
      console.log(`${idx + 1}. ${sub.description} (ID: ${sub.id}) - Amount: ${sub.amount}`);
    });
  }
  
  // Find related PRs
  const relatedPRs = prs.filter(pr => {
    if (pr.projectId !== selectedProjectId) return false;
    if (pr.status === 'Rejected') return false;
    
    // Check if PR has items belonging to this budget
    if (pr.items?.length > 0) {
      return pr.items.some(item => {
        // Check direct budget ID match
        if (item.budgetId === budget.id) return true;
        // Check sub-item ID match
        if (budget.subItems?.some(sub => sub.id === item.budgetSubItemId || sub.id === item.subItemId)) return true;
        return false;
      });
    }
    
    // Check PR-level budget ID
    return pr.budgetId === budget.id;
  });
  
  console.log(`\n=== Related PRs (${relatedPRs.length}) ===`);
  relatedPRs.forEach(pr => {
    console.log(`\nPR: ${pr.prNo || pr.id}`);
    console.log(`Total Amount: ${pr.totalAmount || pr.amount}`);
    if (pr.items?.length > 0) {
      pr.items.forEach((item, idx) => {
        console.log(`  Item ${idx + 1}: ${item.description} - Amount: ${item.amount || (item.quantity * item.price)}`);
        console.log(`    Budget Sub-item ID: ${item.budgetSubItemId || item.subItemId || 'N/A'}`);
      });
    }
  });
  
  // Find related POs
  const relatedPOs = pos.filter(po => {
    if (po.projectId !== selectedProjectId) return false;
    if (po.status === 'Rejected') return false;
    
    if (po.items?.length > 0) {
      return po.items.some(item => {
        // Direct budget ID check
        if (item.budgetId === budget.id) return true;
        
        // Sub-item ID check
        if (budget.subItems?.some(sub => sub.id === item.budgetSubItemId || sub.id === item.subItemId)) return true;
        
        // Trace back through PR
        if (item.prId != null && item.prItemIndex != null) {
          const pr = prs.find(p => p.id === item.prId);
          const prItem = pr?.items?.[item.prItemIndex];
          if (prItem) {
            if (prItem.budgetId === budget.id) return true;
            if (budget.subItems?.some(sub => sub.id === prItem.budgetSubItemId || sub.id === prItem.subItemId)) return true;
          }
        }
        
        return false;
      });
    }
    
    return false;
  });
  
  console.log(`\n=== Related POs (${relatedPOs.length}) ===`);
  let totalPoAmount = 0;
  
  relatedPOs.forEach(po => {
    console.log(`\nPO: ${po.poNo || po.id}`);
    console.log(`Status: ${po.status}`);
    console.log(`Total Amount: ${po.amount}`);
    
    if (po.items?.length > 0) {
      let poItemTotal = 0;
      po.items.forEach((item, idx) => {
        const itemAmount = item.amount != null && item.amount !== '' 
          ? Number(item.amount) 
          : (Number(item.quantity || 0) * Number(item.price || 0));
        
        // Check if this item belongs to our budget
        let belongsToBudget = false;
        let subItemRef = 'N/A';
        
        if (item.budgetId === budget.id) {
          belongsToBudget = true;
          subItemRef = 'Main Budget';
        } else if (item.budgetSubItemId || item.subItemId) {
          const subId = item.budgetSubItemId || item.subItemId;
          if (budget.subItems?.some(sub => sub.id === subId)) {
            belongsToBudget = true;
            subItemRef = `Sub-item ID: ${subId}`;
          }
        } else if (item.prId != null && item.prItemIndex != null) {
          const pr = prs.find(p => p.id === item.prId);
          const prItem = pr?.items?.[item.prItemIndex];
          if (prItem) {
            const prSubId = prItem.budgetSubItemId || prItem.subItemId;
            if (prSubId && budget.subItems?.some(sub => sub.id === prSubId)) {
              belongsToBudget = true;
              subItemRef = `Sub-item ID (via PR): ${prSubId}`;
            }
          }
        }
        
        if (belongsToBudget) {
          poItemTotal += itemAmount;
          console.log(`  ✓ Item ${idx + 1}: ${item.description} - Amount: ${itemAmount} (${subItemRef})`);
        } else {
          console.log(`  ✗ Item ${idx + 1}: ${item.description} - Amount: ${itemAmount} (NOT COUNTED)`);
        }
      });
      
      console.log(`  PO Items Total (counted): ${poItemTotal}`);
      totalPoAmount += poItemTotal;
    }
  });
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total PO Amount for Budget ${targetBudgetCode}: ${totalPoAmount}`);
  
  return {
    budget,
    relatedPRs,
    relatedPOs,
    totalPoAmount
  };
};

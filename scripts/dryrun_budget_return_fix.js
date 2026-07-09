const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const projectId = 'cmg-budget-control';
  const appId = 'cmg-budget-control-default';
  
  let nextPageToken = '';
  let allBudgets = [];
  
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/budgets?pageSize=300${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
    const data = await fetchJson(url);
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      break;
    }
    
    if (data.documents) {
      allBudgets = allBudgets.concat(data.documents);
    }
    
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  
  console.log(`Starting dry-run for budget remediation...\n`);
  let affectedBudgetsCount = 0;
  
  allBudgets.forEach(docSnap => {
    const fields = docSnap.fields || {};
    const budgetId = docSnap.name.split('/').pop();
    
    const notifications = fields.budgetReturnNotifications && fields.budgetReturnNotifications.arrayValue 
      ? fields.budgetReturnNotifications.arrayValue.values || [] 
      : [];
      
    const acceptedNotifs = notifications.filter(nObj => {
      const n = nObj.mapValue?.fields || {};
      return n.status && n.status.stringValue === "accepted";
    });
    
    if (acceptedNotifs.length === 0) return;
    
    let subItemRestores = {};
    let mainBudgetRestore = 0;
    
    for (const nObj of acceptedNotifs) {
      const n = nObj.mapValue?.fields || {};
      let amt = 0;
      if (n.amount && n.amount.numberValue) amt = Number(n.amount.numberValue);
      else if (n.amount && n.amount.integerValue) amt = Number(n.amount.integerValue);
      else if (n.amount && n.amount.doubleValue) amt = Number(n.amount.doubleValue);
      else if (n.amount && n.amount.stringValue) amt = Number(n.amount.stringValue);
      
      if (amt <= 0) continue;
      
      const subItemId = n.subItemId && n.subItemId.stringValue ? n.subItemId.stringValue : null;
      if (subItemId) {
        subItemRestores[subItemId] = (subItemRestores[subItemId] || 0) + amt;
      } else {
        mainBudgetRestore += amt;
      }
    }
    
    if (Object.keys(subItemRestores).length === 0 && mainBudgetRestore === 0) return;
    
    let needsFix = false;
    let proposedChanges = [];
    
    const subItems = fields.subItems && fields.subItems.arrayValue ? fields.subItems.arrayValue.values || [] : [];
    
    subItems.forEach(subObj => {
      const sub = subObj.mapValue?.fields || {};
      const subId = sub.id ? sub.id.stringValue : null;
      if (subId && subItemRestores[subId]) {
        let currentAmount = 0;
        if (sub.amount && sub.amount.numberValue) currentAmount = Number(sub.amount.numberValue);
        else if (sub.amount && sub.amount.integerValue) currentAmount = Number(sub.amount.integerValue);
        else if (sub.amount && sub.amount.doubleValue) currentAmount = Number(sub.amount.doubleValue);
        else if (sub.amount && sub.amount.stringValue) currentAmount = Number(sub.amount.stringValue);
        
        const newAmount = currentAmount + subItemRestores[subId];
        const desc = sub.description ? sub.description.stringValue : 'Unknown';
        
        proposedChanges.push(`  - Sub-Item "${desc}" (ID: ${subId}):\n    Current Amount: ${currentAmount} -> Proposed New Amount: ${newAmount}`);
        needsFix = true;
      }
    });
    
    if (mainBudgetRestore > 0) {
      let currentMain = 0;
      if (fields.amount && fields.amount.numberValue) currentMain = Number(fields.amount.numberValue);
      else if (fields.amount && fields.amount.integerValue) currentMain = Number(fields.amount.integerValue);
      else if (fields.amount && fields.amount.doubleValue) currentMain = Number(fields.amount.doubleValue);
      else if (fields.amount && fields.amount.stringValue) currentMain = Number(fields.amount.stringValue);
      
      const newMain = currentMain - mainBudgetRestore;
      proposedChanges.push(`  - Main Budget Limit:\n    Current Amount: ${currentMain} -> Proposed New Amount: ${newMain}`);
      needsFix = true;
    }
    
    if (needsFix) {
      affectedBudgetsCount++;
      const projectId = fields.projectId ? fields.projectId.stringValue : 'Unknown';
      const costCode = fields.code ? fields.code.stringValue : 'Unknown';
      console.log(`====================================================`);
      console.log(`Budget ID: ${budgetId}`);
      console.log(`Project: ${projectId}, Cost Code: ${costCode}`);
      console.log(`Proposed Fixes:`);
      console.log(proposedChanges.join("\n"));
    }
  });
  
  console.log(`\n====================================================`);
  console.log(`Dry-run complete. Found ${affectedBudgetsCount} budgets affected by the bug.`);
  console.log(`No data was actually modified. Review the proposed changes above.`);
}

main().catch(console.error);

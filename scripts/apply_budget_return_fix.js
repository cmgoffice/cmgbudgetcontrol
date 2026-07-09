const https = require('https');

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function main() {
  const projectId = 'cmg-budget-control';
  const appId = 'cmg-budget-control-default';
  
  let nextPageToken = '';
  let allBudgets = [];
  
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/budgets?pageSize=300${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
    const res = await fetchJson(url);
    const data = res.body;
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      break;
    }
    
    if (data.documents) {
      allBudgets = allBudgets.concat(data.documents);
    }
    
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  
  console.log(`Starting execution for budget remediation...\n`);
  let affectedBudgetsCount = 0;
  
  for (const docSnap of allBudgets) {
    const fields = docSnap.fields || {};
    const budgetId = docSnap.name.split('/').pop();
    
    const notifications = fields.budgetReturnNotifications && fields.budgetReturnNotifications.arrayValue 
      ? fields.budgetReturnNotifications.arrayValue.values || [] 
      : [];
      
    const acceptedNotifs = notifications.filter(nObj => {
      const n = nObj.mapValue?.fields || {};
      return n.status && n.status.stringValue === "accepted";
    });
    
    if (acceptedNotifs.length === 0) continue;
    
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
    
    if (Object.keys(subItemRestores).length === 0 && mainBudgetRestore === 0) continue;
    
    let needsFix = false;
    
    const subItems = fields.subItems && fields.subItems.arrayValue ? fields.subItems.arrayValue.values || [] : [];
    
    // Create new subItems array keeping exact Firebase structure
    const newSubItems = subItems.map(subObj => {
      const sub = subObj.mapValue?.fields || {};
      const subId = sub.id ? sub.id.stringValue : null;
      if (subId && subItemRestores[subId]) {
        let currentAmount = 0;
        if (sub.amount && sub.amount.numberValue) currentAmount = Number(sub.amount.numberValue);
        else if (sub.amount && sub.amount.integerValue) currentAmount = Number(sub.amount.integerValue);
        else if (sub.amount && sub.amount.doubleValue) currentAmount = Number(sub.amount.doubleValue);
        else if (sub.amount && sub.amount.stringValue) currentAmount = Number(sub.amount.stringValue);
        
        let qty = 0;
        if (sub.quantity && sub.quantity.numberValue) qty = Number(sub.quantity.numberValue);
        else if (sub.quantity && sub.quantity.integerValue) qty = Number(sub.quantity.integerValue);
        else if (sub.quantity && sub.quantity.doubleValue) qty = Number(sub.quantity.doubleValue);
        else if (sub.quantity && sub.quantity.stringValue) qty = Number(sub.quantity.stringValue);
        
        const newAmount = currentAmount + subItemRestores[subId];
        const newUnitPrice = qty > 0 ? newAmount / qty : 0;
        
        const newSubFields = { ...sub };
        newSubFields.amount = { doubleValue: newAmount };
        newSubFields.unitPrice = { doubleValue: newUnitPrice };
        
        needsFix = true;
        return { mapValue: { fields: newSubFields } };
      }
      return subObj;
    });
    
    let newMainAmount = null;
    if (mainBudgetRestore > 0) {
      let currentMain = 0;
      if (fields.amount && fields.amount.numberValue) currentMain = Number(fields.amount.numberValue);
      else if (fields.amount && fields.amount.integerValue) currentMain = Number(fields.amount.integerValue);
      else if (fields.amount && fields.amount.doubleValue) currentMain = Number(fields.amount.doubleValue);
      else if (fields.amount && fields.amount.stringValue) currentMain = Number(fields.amount.stringValue);
      
      newMainAmount = currentMain - mainBudgetRestore;
      needsFix = true;
    }
    
    if (needsFix) {
      affectedBudgetsCount++;
      const projectId = fields.projectId ? fields.projectId.stringValue : 'Unknown';
      const costCode = fields.code ? fields.code.stringValue : 'Unknown';
      
      console.log(`Fixing Budget ID: ${budgetId} (${projectId} / ${costCode})...`);
      
      const updateFields = {};
      const updateMask = [];
      
      if (Object.keys(subItemRestores).length > 0) {
        updateFields.subItems = { arrayValue: { values: newSubItems } };
        updateMask.push('updateMask.fieldPaths=subItems');
      }
      if (newMainAmount !== null) {
        updateFields.amount = { doubleValue: newMainAmount };
        updateMask.push('updateMask.fieldPaths=amount');
      }
      
      const payload = JSON.stringify({ fields: updateFields });
      
      const patchUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/budgets/${budgetId}?${updateMask.join('&')}`;
      
      const patchOptions = {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        body: payload
      };
      
      const patchRes = await fetchJson(patchUrl, patchOptions);
      if (patchRes.status >= 200 && patchRes.status < 300) {
        console.log(`  -> Successfully updated ${budgetId}`);
      } else {
        console.error(`  -> Failed to update ${budgetId}:`, patchRes.body);
      }
    }
  }
  
  console.log(`\n====================================================`);
  console.log(`Execution complete. Fixed ${affectedBudgetsCount} budgets.`);
}

main().catch(console.error);

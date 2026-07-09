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
  let allDocuments = [];
  
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/prs?pageSize=300${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
    console.log("Fetching page...");
    const data = await fetchJson(url);
    
    if (data.error) {
      console.error("API Error:", data.error.message);
      break;
    }
    
    if (data.documents) {
      allDocuments = allDocuments.concat(data.documents);
    }
    
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  
  const targetDesc = "Pipe&Cables Supports";
  const costCode = "004002001";
  
  console.log(`Successfully fetched ${allDocuments.length} PRs in total.`);
  
  allDocuments.forEach(doc => {
    const fields = doc.fields;
    if (!fields) return;
    
    const prNo = fields.prNo ? fields.prNo.stringValue : 'Unknown';
    const items = fields.items && fields.items.arrayValue ? fields.items.arrayValue.values : [];
    
    let matchedItems = [];
    
    (items || []).forEach(itemObj => {
       if (!itemObj || !itemObj.mapValue || !itemObj.mapValue.fields) return;
       const itemMap = itemObj.mapValue.fields;
       
       const desc = itemMap.description ? itemMap.description.stringValue : '';
       const cCode = itemMap.costCode ? itemMap.costCode.stringValue : '';
       
       if (desc === targetDesc || cCode === costCode) {
           matchedItems.push({
               desc,
               cCode,
               qty: itemMap.quantity ? itemMap.quantity.numberValue || itemMap.quantity.integerValue || itemMap.quantity.stringValue : 0,
               price: itemMap.price ? itemMap.price.numberValue || itemMap.price.integerValue || itemMap.price.stringValue : 0,
               amount: itemMap.amount ? itemMap.amount.numberValue || itemMap.amount.integerValue || itemMap.amount.stringValue : 0
           });
       }
    });
    
    if (matchedItems.length > 0) {
        console.log(`\n==================================`);
        console.log(`Found PR: ${prNo} (ID: ${doc.name.split('/').pop()})`);
        matchedItems.forEach(mi => {
            console.log(`  - Item: ${mi.desc}, Cost Code: ${mi.cCode}`);
            console.log(`    Qty: ${mi.qty}, Price: ${mi.price}, Amount: ${mi.amount}`);
        });
    }
  });
}

main().catch(console.error);

import https from 'https';

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
    if (options.body) req.write(options.body);
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const budgetId = 'J-72-004002001-Civil Sub contractor (ผู้รับเหมาช่วงค่าแรง)';
  const docPath = 'artifacts/cmg-budget-control-default/public/data/budgets/' + encodeURIComponent(budgetId);
  const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/' + docPath;
  
  const res = await fetchJson(url);
  const fields = res.body.fields || {};
  const subItemsField = fields.subItems;
  if (subItemsField && subItemsField.arrayValue && subItemsField.arrayValue.values) {
    const subItems = subItemsField.arrayValue.values;
    for (const subItemObj of subItems) {
      const subItem = subItemObj.mapValue.fields;
      console.log('ID:', subItem.id ? subItem.id.stringValue : 'No ID', '| Desc:', subItem.description ? subItem.description.stringValue : 'No desc', '| Budget:', subItem.budget ? (subItem.budget.doubleValue || subItem.budget.integerValue || subItem.budget.numberValue) : 0);
    }
  } else {
    console.log('No subItems found in this budget');
  }
}

main().catch(console.error);

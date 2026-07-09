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
  const docId = 'J-72-007001001-Head office charge job site 7% (Addition Work)';
  const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/budgets/' + encodeURIComponent(docId);
  
  // Create the subItem that was lost
  const subItems = [
    {
      mapValue: {
        fields: {
          id: { stringValue: '07e1a368-8abc-426f-9bd3-67a4f857ce99' },
          description: { stringValue: 'Head office charge job site 7% (Addition Work)' },
          amount: { doubleValue: 476997.5 },
          quantity: { integerValue: '1' },
          unitPrice: { doubleValue: 476997.5 },
          unit: { stringValue: 'lot' }
        }
      }
    }
  ];

  // We patch amount back to 476997.5 and usedAmount back to 476997.5
  const updateFields = {
    subItems: { arrayValue: { values: subItems } },
    amount: { doubleValue: 476997.5 },
    usedAmount: { doubleValue: 476997.5 }
  };
  
  const payload = JSON.stringify({ fields: updateFields });
  
  const updateMask = 'updateMask.fieldPaths=subItems&updateMask.fieldPaths=amount&updateMask.fieldPaths=usedAmount';
  const patchUrl = url + '?' + updateMask;
  
  const patchOptions = {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    },
    body: payload
  };
  
  const res = await fetchJson(patchUrl, patchOptions);
  console.log('Update result:', res.status, res.body);
}

main().catch(console.error);

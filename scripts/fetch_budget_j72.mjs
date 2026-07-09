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
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const docId = 'J-72-007001001-Head office charge job site 7% (Addition Work)';
  const url = 'https://firestore.googleapis.com/v1/projects/cmg-budget-control/databases/(default)/documents/artifacts/cmg-budget-control-default/public/data/budgets/' + encodeURIComponent(docId);
  const res = await fetchJson(url);
  console.log(JSON.stringify(res.body, null, 2));
}

main().catch(console.error);

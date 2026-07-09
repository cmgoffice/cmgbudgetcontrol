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
  
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/artifacts/${appId}/public/data/prs?pageSize=300${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
    const data = await fetchJson(url);
    
    if (data.error) break;
    
    if (data.documents) {
      data.documents.forEach(doc => {
        const fields = doc.fields;
        if (!fields) return;
        const prNo = fields.prNo ? fields.prNo.stringValue : 'Unknown';
        if (prNo === 'J72-DC-028') {
          console.log(`PR ${prNo}: Created At: ${fields.createdAt ? fields.createdAt.stringValue : 'Unknown'}`);
          console.log(`Status: ${fields.status ? fields.status.stringValue : 'Unknown'}`);
        }
      });
    }
    
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
}

main().catch(console.error);

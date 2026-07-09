const fs = require('fs');
let code = fs.readFileSync('src/views/VendorView.tsx', 'utf8');

const oldLogic = `  const vendorScores = useMemo(() => {
    if (!vendorEvaluations) return [];
    const map = new Map();
    vendorEvaluations.forEach(ev => {
      const vid = ev.vendorId;
      if (!vid) return;
      if (!map.has(vid)) {
        map.set(vid, {
          vendorId: vid,
          vendorCode: vendors.find(v => v.id === vid)?.code || ev.vendorNo || '-',
          vendorName: ev.vendorName || vendors.find(v => v.id === vid)?.name || 'Unknown',
          count: 0,
          q1: 0, q2: 0, q3: 0, q4: 0, q5: 0,
          totalScore: 0
        });
      }
      const m = map.get(vid);
      m.count++;
      m.q1 += ev.scores?.q1?.score || 0;
      m.q2 += ev.scores?.q2?.score || 0;
      m.q3 += ev.scores?.q3?.score || 0;
      m.q4 += ev.scores?.q4?.score || 0;
      m.q5 += ev.scores?.q5?.score || 0;
      m.totalScore += ev.totalScore || 0;
    });`;

const newLogic = `  const vendorScores = useMemo(() => {
    if (!vendorEvaluations) return [];
    const map = new Map();
    vendorEvaluations.forEach(ev => {
      // In PaymentView, vendorId is contractorId or vendorId
      const vid = ev.vendorId || ev.contractorId; 
      if (!vid) return;
      if (!map.has(vid)) {
        map.set(vid, {
          vendorId: vid,
          vendorCode: vendors.find(v => v.id === vid)?.code || ev.vendorNo || ev.vendorCode || '-',
          vendorName: ev.vendorName || vendors.find(v => v.id === vid)?.name || 'Unknown',
          count: 0,
          q1: 0, q2: 0, q3: 0, q4: 0, q5: 0,
          totalScore: 0
        });
      }
      const m = map.get(vid);
      m.count++;
      
      const getScore = (val) => {
        if (typeof val === 'number') return val;
        if (val && typeof val.score === 'number') return val.score;
        return 0;
      };

      m.q1 += getScore(ev.scores?.q1);
      m.q2 += getScore(ev.scores?.q2);
      m.q3 += getScore(ev.scores?.q3);
      m.q4 += getScore(ev.scores?.q4);
      m.q5 += getScore(ev.scores?.q5);
      m.totalScore += (ev.totalScore || 0);
    });`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('src/views/VendorView.tsx', code);

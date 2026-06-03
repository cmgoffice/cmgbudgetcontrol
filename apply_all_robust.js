const fs = require('fs');

let code = fs.readFileSync('src/views/VendorView.tsx', 'utf8');

code = code.replace(
  'isColumnVisible } = useAppData();',
  'isColumnVisible, vendorEvaluations, loadVendorEvaluations } = useAppData();'
);

const logic = `
  const [activeTab, setActiveTab] = useState('vendor');

  useEffect(() => {
    if (activeTab === 'score') {
      if (typeof loadVendorEvaluations === 'function') {
        loadVendorEvaluations();
      }
    }
  }, [activeTab, loadVendorEvaluations]);

  const { paymentScores, receiveScores } = useMemo(() => {
    if (!vendorEvaluations) return { paymentScores: [], receiveScores: [] };
    const pMap = new Map();
    const rMap = new Map();

    vendorEvaluations.forEach(ev => {
      const vid = ev.vendorId || ev.contractorId;
      if (!vid) return;

      const getScore = (val) => {
        if (typeof val === 'number') return val;
        if (val && typeof val.score === 'number') return val.score;
        return 0;
      };

      const isPO = ev.evaluationStage === "PO Creation";
      const isReceive = ev.evaluationStage === "Receive";
      const isPayment = !ev.evaluationStage || ev.evaluationStage === "Payment";

      const poType = ev.poType || "";
      const isMaterialPO = ["CR", "SP", "SE", "RE"].includes(poType);
      
      const isReceiveGroup = isReceive || (isPO && isMaterialPO);
      const isPaymentGroup = isPayment || (isPO && !isMaterialPO);

      const initMap = (map) => {
        if (!map.has(vid)) {
          map.set(vid, {
            vendorId: vid,
            vendorCode: vendors.find(v => v.id === vid)?.code || ev.vendorNo || ev.vendorCode || '-',
            vendorName: ev.vendorName || vendors.find(v => v.id === vid)?.name || 'Unknown',
            count: 0, po_count: 0, other_count: 0,
            po_q1: 0, po_q2: 0, po_q3: 0,
            pmt_q1: 0, pmt_q2: 0, pmt_q3: 0, pmt_q4: 0, pmt_q5: 0,
            rcv_q1: 0, rcv_q2: 0,
            totalScore: 0
          });
        }
        return map.get(vid);
      };

      if (isPaymentGroup) {
        const m = initMap(pMap);
        m.count++;
        if (isPO) {
          m.po_count++;
          m.po_q1 += getScore(ev.scores?.q1);
          m.po_q2 += getScore(ev.scores?.q2);
          m.po_q3 += getScore(ev.scores?.q3);
        } else {
          m.other_count++;
          m.pmt_q1 += getScore(ev.scores?.q1);
          m.pmt_q2 += getScore(ev.scores?.q2);
          m.pmt_q3 += getScore(ev.scores?.q3);
          m.pmt_q4 += getScore(ev.scores?.q4);
          m.pmt_q5 += getScore(ev.scores?.q5);
        }
      }

      if (isReceiveGroup) {
        const m = initMap(rMap);
        m.count++;
        if (isPO) {
          m.po_count++;
          m.po_q1 += getScore(ev.scores?.q1);
          m.po_q2 += getScore(ev.scores?.q2);
          m.po_q3 += getScore(ev.scores?.q3);
        } else {
          m.other_count++;
          m.rcv_q1 += getScore(ev.scores?.q1);
          m.rcv_q2 += getScore(ev.scores?.q2);
        }
      }
    });

    const formatScores = (map, isPaymentType) => {
      return Array.from(map.values()).map(m => {
        const poCount = Math.max(1, m.po_count);
        const otherCount = Math.max(1, m.other_count);
        
        let q1=0, q2=0, q3=0, q4=0, q5=0, q6=0, q7=0, q8=0;
        let totalScore = 0;
        let maxScore = 0;

        if (isPaymentType) {
          q1 = m.po_q1 / poCount;
          q2 = m.po_q2 / poCount;
          q3 = m.po_q3 / poCount;
          q4 = m.pmt_q1 / otherCount;
          q5 = m.pmt_q2 / otherCount;
          q6 = m.pmt_q3 / otherCount;
          q7 = m.pmt_q4 / otherCount;
          q8 = m.pmt_q5 / otherCount;
          
          if (m.po_count > 0) { totalScore += (q1+q2+q3); maxScore += 3; }
          if (m.other_count > 0) { totalScore += (q4+q5+q6+q7+q8); maxScore += 5; }
          
          return { ...m, q1: q1.toFixed(2), q2: q2.toFixed(2), q3: q3.toFixed(2), q4: q4.toFixed(2), q5: q5.toFixed(2), q6: q6.toFixed(2), q7: q7.toFixed(2), q8: q8.toFixed(2), totalScore: totalScore.toFixed(2), maxScore };
        } else {
          q1 = m.po_q1 / poCount;
          q2 = m.po_q2 / poCount;
          q3 = m.po_q3 / poCount;
          q4 = m.rcv_q1 / otherCount;
          q5 = m.rcv_q2 / otherCount;
          
          if (m.po_count > 0) { totalScore += (q1+q2+q3); maxScore += 3; }
          if (m.other_count > 0) { totalScore += (q4+q5); maxScore += 2; }
          
          return { ...m, q1: q1.toFixed(2), q2: q2.toFixed(2), q3: q3.toFixed(2), q4: q4.toFixed(2), q5: q5.toFixed(2), totalScore: totalScore.toFixed(2), maxScore };
        }
      }).sort((a, b) => Number(b.totalScore) - Number(a.totalScore));
    };

    return {
      paymentScores: formatScores(pMap, true),
      receiveScores: formatScores(rMap, false)
    };
  }, [vendorEvaluations, vendors]);
`;

code = code.replace(
  'const emptyForm = { code: "", name: "", address: "", tel: "", creditTerm: "" };',
  logic + '\n  const emptyForm = { code: "", name: "", address: "", tel: "", creditTerm: "" };'
);

const tabsUI = `
      <div className="flex border-b border-slate-200 mb-4">
        <button
          className={\`px-4 py-2 text-sm font-medium border-b-2 \${activeTab === 'vendor' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}\`}
          onClick={() => setActiveTab('vendor')}
        >
          Vendor List
        </button>
        <button
          className={\`px-4 py-2 text-sm font-medium border-b-2 \${activeTab === 'score' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}\`}
          onClick={() => setActiveTab('score')}
        >
          Vendor Score
        </button>
      </div>

      {activeTab === 'vendor' ? (
`;

code = code.replace(
  '<Card className="overflow-hidden">',
  tabsUI + '<Card className="overflow-hidden">'
);

const scoreTableUI = `
      ) : (
        <div className="space-y-6">
        <Card className="overflow-hidden">
          <div className="bg-blue-50/50 px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-blue-800 text-sm">การประเมิน Payment (PO + Payment)</h3>
            <p className="text-xs text-slate-500 mt-0.5">หัวข้อประเมิน 8 ข้อ: PO (3 ข้อ) และ Payment (5 ข้อ)</p>
          </div>
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 min-w-[1200px]">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัส</th>
                  <th className="py-2 px-3">ชื่อ Vendor</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การให้คำแนะนำเกี่ยวกับสินค้าและบริการ">PO ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: มีความรวดเร็วในการเสนอราคา">PO ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การประสานงานและให้การสนับสนุนที่เกี่ยวข้อง">PO ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: วัสดุที่นำมาใช้ต้องมีคุณภาพและตรงตามข้อกำหนด">PMT ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การจัดสรรแรงงานที่มีความรู้และเพียงพอต่องาน">PMT ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การปฏิบัติตามกฎหมาย ข้อกำหนดของโครงการ และกฎระเบียบข้อบังคับด้านความปลอดภัยและอาชีวอนามัย">PMT ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การจัดสรรเครื่องมือและอุปกรณ์ให้พร้อมใช้งานและตรงตามข้อกำหนดของโครงการและความปลอดภัย">PMT ข้อ 4</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Payment: การส่งมอบงานตามเวลาที่กำหนด">PMT ข้อ 5</th>
                  <th className="py-2 px-3 text-right">รวมคะแนน</th>
                  <th className="py-2 px-3 text-right">จำนวนประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentScores.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-8 text-center text-slate-400">ไม่มีข้อมูลการประเมิน</td>
                  </tr>
                ) : (
                  paymentScores.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                      <td className="py-1.5 px-3 font-medium text-slate-700">{v.vendorCode}</td>
                      <td className="py-1.5 px-3 max-w-[200px] truncate" title={v.vendorName}>{v.vendorName}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q1}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q2}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q3}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q4}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q5}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q6}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q7}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q8}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-blue-600">{v.totalScore} <span className="text-[10px] text-slate-400 font-normal">/ {v.maxScore}</span></td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{v.count} ครั้ง</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="bg-teal-50/50 px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-teal-800 text-sm">การประเมิน CR SP SE RE (PO + Receive)</h3>
            <p className="text-xs text-slate-500 mt-0.5">หัวข้อประเมิน 5 ข้อ: PO (3 ข้อ) และ Receive (2 ข้อ)</p>
          </div>
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 min-w-[800px]">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัส</th>
                  <th className="py-2 px-3">ชื่อ Vendor</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การให้คำแนะนำเกี่ยวกับสินค้าและบริการ">PO ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: มีความรวดเร็วในการเสนอราคา">PO ข้อ 2</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="PO: การประสานงานและให้การสนับสนุนที่เกี่ยวข้อง">PO ข้อ 3</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Receive: สินค้า / บริการ ไม่มีปัญหาและมีคุณภาพตามข้อกำหนด">RCV ข้อ 1</th>
                  <th className="py-2 px-3 text-right text-[10px]" title="Receive: จัดส่งสินค้าตามวันที่กำหนด">RCV ข้อ 2</th>
                  <th className="py-2 px-3 text-right">รวมคะแนน</th>
                  <th className="py-2 px-3 text-right">จำนวนประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {receiveScores.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">ไม่มีข้อมูลการประเมิน</td>
                  </tr>
                ) : (
                  receiveScores.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                      <td className="py-1.5 px-3 font-medium text-slate-700">{v.vendorCode}</td>
                      <td className="py-1.5 px-3 max-w-[200px] truncate" title={v.vendorName}>{v.vendorName}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q1}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q2}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q3}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q4}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">{v.q5}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-teal-600">{v.totalScore} <span className="text-[10px] text-slate-400 font-normal">/ {v.maxScore}</span></td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{v.count} ครั้ง</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        </div>
      )}
`;

code = code.replace(/<\/Card>[\r\n\s]+{isModalOpen && \(/m, '</Card>\n' + scoreTableUI + '\n      {isModalOpen && (');

fs.writeFileSync('src/views/VendorView.tsx', code);
console.log('Done!');

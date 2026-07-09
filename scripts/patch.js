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

  const vendorScores = useMemo(() => {
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
    });

    return Array.from(map.values()).map(m => ({
      ...m,
      q1: (m.q1 / m.count).toFixed(2),
      q2: (m.q2 / m.count).toFixed(2),
      q3: (m.q3 / m.count).toFixed(2),
      q4: (m.q4 / m.count).toFixed(2),
      q5: (m.q5 / m.count).toFixed(2),
      totalScore: (m.totalScore / m.count).toFixed(2)
    }));
  }, [vendorEvaluations, vendors]);
`;

code = code.replace(
  'const emptyForm = { code: "", name: "", address: "", tel: "", creditTerm: "" };',
  logic + '\n  const emptyForm = { code: "", name: "", address: "", tel: "", creditTerm: "" };'
);

const tabsUI = `
      <div className="flex border-b border-slate-200">
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
        <Card className="overflow-hidden">
          <div className="w-full min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2 px-3">รหัส</th>
                  <th className="py-2 px-3">ชื่อ Vendor</th>
                  <th className="py-2 px-3 text-right" title="วัสดุที่นำมาใช้ต้องมีคุณภาพและตรงตามข้อกำหนด">ข้อ 1 (วัสดุ)</th>
                  <th className="py-2 px-3 text-right" title="การจัดสรรแรงงานที่มีความรู้และเพียงพอต่องาน">ข้อ 2 (แรงงาน)</th>
                  <th className="py-2 px-3 text-right" title="การปฏิบัติตามกฎหมาย ข้อกำหนดของโครงการ และกฎระเบียบข้อบังคับด้านความปลอดภัยและอาชีวอนามัย">ข้อ 3 (ความปลอดภัย)</th>
                  <th className="py-2 px-3 text-right" title="การจัดสรรเครื่องมือและอุปกรณ์ให้พร้อมใช้งานและตรงตามข้อกำหนดของโครงการและความปลอดภัย">ข้อ 4 (เครื่องมือ)</th>
                  <th className="py-2 px-3 text-right" title="การส่งมอบงานตามเวลาที่กำหนด">ข้อ 5 (ส่งมอบงาน)</th>
                  <th className="py-2 px-3 text-right">รวม (เต็ม 5)</th>
                  <th className="py-2 px-3 text-right">จำนวนประเมิน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendorScores.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      ไม่มีข้อมูลการประเมิน
                    </td>
                  </tr>
                ) : (
                  vendorScores.map((v) => (
                    <tr key={v.vendorId} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                      <td className="py-1.5 px-3 font-medium text-slate-700">{v.vendorCode}</td>
                      <td className="py-1.5 px-3">{v.vendorName}</td>
                      <td className="py-1.5 px-3 text-right">{v.q1}</td>
                      <td className="py-1.5 px-3 text-right">{v.q2}</td>
                      <td className="py-1.5 px-3 text-right">{v.q3}</td>
                      <td className="py-1.5 px-3 text-right">{v.q4}</td>
                      <td className="py-1.5 px-3 text-right">{v.q5}</td>
                      <td className="py-1.5 px-3 text-right font-bold text-blue-600">{v.totalScore}</td>
                      <td className="py-1.5 px-3 text-right text-slate-400">{v.count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
`;

code = code.replace(
  '</Card>\\n\\n      {isModalOpen && (',
  '</Card>\\n' + scoreTableUI + '\\n      {isModalOpen && ('
);
// In Javascript \\n replaces \n literally in string, let's use actual newline
code = code.replace(
  '</Card>\n\n      {isModalOpen && (',
  '</Card>\n' + scoreTableUI + '\n      {isModalOpen && ('
);

fs.writeFileSync('src/views/VendorView.tsx', code);

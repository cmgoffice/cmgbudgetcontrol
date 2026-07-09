const fs = require('fs');
let code = fs.readFileSync('src/views/VendorView.tsx', 'utf8');

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

code = code.replace(/<\/Card>\s*\{isModalOpen && \(/, '</Card>\n' + scoreTableUI + '\n      {isModalOpen && (');
fs.writeFileSync('src/views/VendorView.tsx', code);

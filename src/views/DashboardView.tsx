// @ts-nocheck
import React from "react";
import { Wallet, FileText, ShoppingCart, FileInput } from "lucide-react";
import { useUI } from "../contexts/UIContext";
import { Card } from "../components/ui";

const DashboardView = React.memo(() => {
  const { setActiveMenu } = useUI();
  return (
    <div className="text-center py-12 md:py-16 animate-in fade-in duration-500">
      <h1 className="text-3xl md:text-4xl font-bold text-slate-800 mb-3 tracking-tight">
        CMG Budget Control
      </h1>
      <p className="text-slate-500 max-w-lg mx-auto mb-8 text-base md:text-lg">
        ระบบบริหารจัดการโครงการก่อสร้าง
        <br />
        ควบคุมงบประมาณ จัดซื้อ และวางบิล
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 max-w-4xl mx-auto">
        <Card
          className="p-4 md:p-5 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-blue-500 rounded-xl"
          onClick={() => setActiveMenu("budget")}
        >
          <div className="bg-blue-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center mx-auto mb-3">
            <Wallet className="w-6 h-6 md:w-7 md:h-7 text-blue-600" />
          </div>
          <h3 className="font-bold text-base md:text-lg mb-1">Budget</h3>
          <p className="text-xs md:text-sm text-slate-500">ควบคุมงบประมาณ</p>
        </Card>
        <Card
          className="p-4 md:p-5 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-green-500 rounded-xl"
          onClick={() => setActiveMenu("pr")}
        >
          <div className="bg-green-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileText className="w-6 h-6 md:w-7 md:h-7 text-green-600" />
          </div>
          <h3 className="font-bold text-base md:text-lg mb-1">PR</h3>
          <p className="text-xs md:text-sm text-slate-500">ใบขอซื้อ</p>
        </Card>
        <Card
          className="p-4 md:p-5 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-orange-500 rounded-xl"
          onClick={() => setActiveMenu("po")}
        >
          <div className="bg-orange-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center mx-auto mb-3">
            <ShoppingCart className="w-6 h-6 md:w-7 md:h-7 text-orange-600" />
          </div>
          <h3 className="font-bold text-base md:text-lg mb-1">PO</h3>
          <p className="text-xs md:text-sm text-slate-500">ใบสั่งซื้อ</p>
        </Card>
        <Card
          className="p-4 md:p-5 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-purple-500 rounded-xl"
          onClick={() => setActiveMenu("invoice")}
        >
          <div className="bg-purple-50 w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center mx-auto mb-3">
            <FileInput className="w-6 h-6 md:w-7 md:h-7 text-purple-600" />
          </div>
          <h3 className="font-bold text-base md:text-lg mb-1">Invoice</h3>
          <p className="text-xs md:text-sm text-slate-500">วางบิล/จ่ายเงิน</p>
        </Card>
      </div>
    </div>
  );
});

export default DashboardView;

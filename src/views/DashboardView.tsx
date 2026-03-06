// @ts-nocheck
import React from "react";
import { Wallet, FileText, ShoppingCart, FileInput } from "lucide-react";
import { useUI } from "../contexts/UIContext";
import { Card } from "../components/ui";

const DashboardView = React.memo(() => {
  const { setActiveMenu } = useUI();
  return (
    <div className="text-center py-20 animate-in fade-in duration-500">
      <h1 className="text-4xl font-bold text-slate-800 mb-4 tracking-tight">
        CMG Budget Control
      </h1>
      <p className="text-slate-500 max-w-lg mx-auto mb-10 text-lg">
        ระบบบริหารจัดการโครงการก่อสร้าง
        <br />
        ควบคุมงบประมาณ จัดซื้อ และวางบิล
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
        <Card
          className="p-8 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-blue-500"
          onClick={() => setActiveMenu("budget")}
        >
          <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">Budget</h3>
          <p className="text-sm text-slate-500">ควบคุมงบประมาณ</p>
        </Card>
        <Card
          className="p-8 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-green-500"
          onClick={() => setActiveMenu("pr")}
        >
          <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">PR</h3>
          <p className="text-sm text-slate-500">ใบขอซื้อ</p>
        </Card>
        <Card
          className="p-8 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-orange-500"
          onClick={() => setActiveMenu("po")}
        >
          <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShoppingCart className="w-8 h-8 text-orange-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">PO</h3>
          <p className="text-sm text-slate-500">ใบสั่งซื้อ</p>
        </Card>
        <Card
          className="p-8 text-center hover:shadow-lg cursor-pointer transition-all hover:-translate-y-1 border-t-4 border-t-purple-500"
          onClick={() => setActiveMenu("invoice")}
        >
          <div className="bg-purple-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileInput className="w-8 h-8 text-purple-600" />
          </div>
          <h3 className="font-bold text-lg mb-2">Invoice</h3>
          <p className="text-sm text-slate-500">วางบิล/จ่ายเงิน</p>
        </Card>
      </div>
    </div>
  );
});

export default DashboardView;

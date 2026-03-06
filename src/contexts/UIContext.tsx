// @ts-nocheck
/**
 * UIContext — navigation, selection, and UI-toggle state.
 * แยก UI state ออกจาก data state เพื่อป้องกัน re-render ที่ไม่จำเป็น.
 */
import React, {
  createContext, useContext, useState, useCallback, useMemo, useRef,
} from "react";

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export const UIProvider = ({ children, logAction }) => {

  const [activeMenu,                    setActiveMenu]                    = useState("dashboard");
  const [selectedProjectId,             setSelectedProjectId]             = useState(null);
  const [isFullScreenModalOpen,         setIsFullScreenModalOpen]         = useState(false);
  const [budgetCategory,                setBudgetCategory]                = useState("OVERVIEW");
  const [expandedBudgetRows,            setExpandedBudgetRows]            = useState({});
  const [expandedPrRows,                setExpandedPrRows]                = useState({});
  const [isBellOpen,                    setIsBellOpen]                    = useState(false);
  const [scrollToPendingAfterRender,    setScrollToPendingAfterRender]    = useState(false);
  const pendingSectionRef = useRef(null);

  const menuLabelMap = {
    dashboard: "ภาพรวม (Dashboard)",
    projects: "จัดการโครงการ",
    budget: "Project Budget",
    pr: "ระบบ PR",
    "pr-table": "ตารางข้อมูล PR",
    po: "ระบบ PO",
    "po-table": "ตารางข้อมูล PO",
    vendor: "Vendor Management",
    material: "Material",
    invoice: "Invoice Receive",
    profile: "ข้อมูลส่วนตัว",
    admin: "Admin Dashboard",
  };

  const handleMenuChange = useCallback((menu) => {
    setActiveMenu(menu);
    setIsBellOpen(false);
    const label = menuLabelMap[menu] || menu;
    if (logAction) logAction("Navigate", `เปิดเมนู: ${label}`);
  }, [logAction]);

  const handleProjectChange = useCallback((projectId, projects = []) => {
    setSelectedProjectId(projectId);
    if (projectId && logAction) {
      const project = projects.find((p) => p.id === projectId);
      const name = project ? `${project.jobNo} - ${project.name}` : projectId;
      logAction("Select Project", `เลือกโครงการ: ${name}`);
    }
  }, [logAction]);

  const togglePrRow = useCallback((id) => {
    setExpandedPrRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const value = useMemo(() => ({
    activeMenu,     setActiveMenu,    handleMenuChange,
    selectedProjectId, setSelectedProjectId, handleProjectChange,
    isFullScreenModalOpen, setIsFullScreenModalOpen,
    budgetCategory, setBudgetCategory,
    expandedBudgetRows,  setExpandedBudgetRows,
    expandedPrRows,      setExpandedPrRows, togglePrRow,
    isBellOpen,          setIsBellOpen,
    scrollToPendingAfterRender, setScrollToPendingAfterRender,
    pendingSectionRef,
  }), [
    activeMenu,     handleMenuChange,
    selectedProjectId, handleProjectChange,
    isFullScreenModalOpen,
    budgetCategory,
    expandedBudgetRows,
    expandedPrRows, togglePrRow,
    isBellOpen,
    scrollToPendingAfterRender,
  ]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
};

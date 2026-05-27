// @ts-nocheck
import React, { useContext } from "react";
import "./migratePendingPM";

// Auth
import { AuthContext, AuthProvider } from "./auth/AuthContext";
import AuthForm from "./auth/AuthForm";

// Context providers
import { AppDataProvider } from "./contexts/AppDataContext";
import { UIProvider } from "./contexts/UIContext";

// Shell
import AppShell from "./AppShell";

// --- Authenticated wrapper — passes auth values into context providers ---
const AuthenticatedApp = () => {
  const { user, userData, showAlert, openConfirm, logAction } = useContext(AuthContext);
  // รวม roles[] กับ role เดี่ยว — ใช้ includes() ตรวจสิทธิ์ขั้นอนุมัติ (ไม่พึ่งแค่ roles[0])
  const userRoles = (() => {
    const fromArr = Array.isArray(userData?.roles) ? userData.roles.filter(Boolean) : [];
    const primary = userData?.role ? [userData.role] : [];
    const merged = [...new Set([...fromArr, ...primary])];
    return merged.length ? merged : ["Staff"];
  })();
  const userRole = userRoles[0] || "Staff";

  return (
    <AppDataProvider
      user={user}
      userData={userData}
      userRole={userRole}
      userRoles={userRoles}
      showAlert={showAlert}
      openConfirm={openConfirm}
      logAction={logAction}
    >
      <UIProvider logAction={logAction}>
        <AppShell />
      </UIProvider>
    </AppDataProvider>
  );
};

// --- Auth gate ---
const AuthWrapper = () => {
  const { user, loading } = useContext(AuthContext);
  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  return user ? <AuthenticatedApp /> : <AuthForm />;
};

// --- Root ---
export default function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  );
}

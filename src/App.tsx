// @ts-nocheck
import React, { useContext } from "react";

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
  const userRole = userData?.role || "Staff";

  return (
    <AppDataProvider
      user={user}
      userData={userData}
      userRole={userRole}
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

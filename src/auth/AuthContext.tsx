// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, createContext } from "react";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection } from "firebase/firestore";
import { auth, db, appId } from "../lib/firebase";
import { CustomAlert, CustomConfirmModal } from "../components/Dialogs";

export const AuthContext = createContext(null);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alertState, setAlertState] = useState({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
  });
  const [confirmState, setConfirmState] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => { },
    variant: "primary",
  });

  // Global Alert Functions
  const showAlert = useCallback((title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openConfirm = useCallback(
    (title, message, onConfirm, variant = "primary") => {
      setConfirmState({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          onConfirm();
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        },
        variant,
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // System Log Function
  const logAction = useCallback(
    async (action, details) => {
      if (!user) return;
      try {
        await addDoc(
          collection(db, "artifacts", appId, "public", "data", "logs"),
          {
            timestamp: new Date().toISOString(),
            action: action,
            details: details,
            user: userData
              ? `${userData.firstName} ${userData.lastName}`
              : user.email,
            role: userData ? userData.role : "Unknown",
            uid: user.uid,
          }
        );
      } catch (error) {
        console.error("Failed to write log:", error);
      }
    },
    [user, userData]
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userDocRef = doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "users",
          currentUser.uid
        );
        const userSnapshot = await getDoc(userDocRef);

        if (userSnapshot.exists()) {
          const data = userSnapshot.data();
          if (data.status === "Pending") {
            await signOut(auth);
            showAlert(
              "รอการอนุมัติ",
              "บัญชีของคุณอยู่ระหว่างการตรวจสอบโดยผู้ดูแลระบบ",
              "warning"
            );
            setUser(null);
            setUserData(null);
          } else {
            setUser(currentUser);
            setUserData(data);
            // Log login - ใช้ sessionStorage กัน log ซ้ำทุก re-render
            const sessionKey = `logged_${currentUser.uid}`;
            if (!sessionStorage.getItem(sessionKey)) {
              sessionStorage.setItem(sessionKey, "1");
              const fullName = `${data.firstName || ""} ${data.lastName || ""}`.trim();
              try {
                await addDoc(
                  collection(db, "artifacts", appId, "public", "data", "logs"),
                  {
                    timestamp: new Date().toISOString(),
                    action: "Login",
                    details: `เข้าสู่ระบบสำเร็จ (${data.role})`,
                    user: fullName || currentUser.email,
                    role: data.role || "Unknown",
                    uid: currentUser.uid,
                  }
                );
              } catch (e) { console.error("Login log error:", e); }
            }
          }
        } else {
          setUser(currentUser);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [showAlert]);

  const login = useCallback(async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  // Google Login Logic
  const googleProvider = useMemo(() => new GoogleAuthProvider(), []);
  const loginWithGoogle = useCallback(async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      const userDocRef = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "users",
        user.uid
      );
      const userSnapshot = await getDoc(userDocRef);

      if (!userSnapshot.exists()) {
        const usersRef = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "users"
        );
        const snapshot = await getDocs(usersRef);
        const isFirstUser = snapshot.empty;
        const role = isFirstUser ? "Administrator" : "Staff";
        const status = isFirstUser ? "Approved" : "Pending";

        const [firstName, ...lastNameParts] = (user.displayName || "").split(
          " "
        );
        const lastName = lastNameParts.join(" ");

        await setDoc(userDocRef, {
          uid: user.uid,
          firstName: firstName || "Google",
          lastName: lastName || "User",
          position: "Staff", // Default
          email: user.email,
          role,
          status,
          assignedProjectIds: [],
          createdAt: new Date().toISOString(),
          authProvider: "google",
          photoURL: user.photoURL || "",
        });

        if (status === "Pending") {
          await signOut(auth);
          showAlert(
            "ลงทะเบียนสำเร็จ!",
            "บัญชี Google ของคุณต้องรอการอนุมัติจากผู้ดูแลระบบ",
            "success"
          );
          return;
        }
      } else {
        const data = userSnapshot.data();
        if (user.photoURL && data.photoURL !== user.photoURL) {
          await updateDoc(userDocRef, { photoURL: user.photoURL });
        }
        if (data.status === "Pending") {
          await signOut(auth);
          showAlert(
            "รอการอนุมัติ",
            "บัญชีของคุณอยู่ระหว่างการตรวจสอบ",
            "warning"
          );
        }
      }
    } catch (error) {
      console.error(error);
      showAlert("Login Error", error.message, "error");
    }
  }, [googleProvider, showAlert]);

  const register = useCallback(
    async (email, password, firstName, lastName, position) => {
      const res = await createUserWithEmailAndPassword(auth, email, password);
      const uid = res.user.uid;

      const usersRef = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        "users"
      );
      const snapshot = await getDocs(usersRef);
      const isFirstUser = snapshot.empty;

      const role = isFirstUser ? "Administrator" : "Staff";
      const status = isFirstUser ? "Approved" : "Pending";

      await setDoc(
        doc(db, "artifacts", appId, "public", "data", "users", uid),
        {
          uid,
          firstName,
          lastName,
          position,
          email,
          role,
          status,
          assignedProjectIds: [],
          createdAt: new Date().toISOString(),
        }
      );

      await updateProfile(res.user, {
        displayName: `${firstName} ${lastName}`,
      });

      if (status === "Pending") {
        await signOut(auth);
      }

      return { role, status };
    },
    []
  );

  const logout = useCallback(async () => {
    await logAction("Logout", "User logged out");
    await signOut(auth);
  }, [logAction]);

  const resetPassword = useCallback((email) => {
    return sendPasswordResetEmail(auth, email);
  }, []);

  const authContextValue = useMemo(
    () => ({
      user,
      userData,
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      loading,
      showAlert,
      openConfirm,
      logAction,
    }),
    [
      user,
      userData,
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      loading,
      showAlert,
      openConfirm,
      logAction,
    ]
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
      <CustomAlert
        isOpen={alertState.isOpen}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        onClose={closeAlert}
      />
      <CustomConfirmModal
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
        variant={confirmState.variant}
      />
    </AuthContext.Provider>
  );
};
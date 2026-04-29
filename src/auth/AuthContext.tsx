// @ts-nocheck
import React, { useState, useEffect, useCallback, useMemo, createContext } from "react";
import {
  onAuthStateChanged, signOut, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, updateProfile,
} from "firebase/auth";
import { doc, getDoc, getDocs, setDoc, addDoc, updateDoc, collection } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, appId, storage } from "../lib/firebase";
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
    requireText: "",
    requireTextLabel: "",
    requireTextPlaceholder: "",
  });

  // Global Alert Functions
  const showAlert = useCallback((title, message, type = "info") => {
    setAlertState({ isOpen: true, title, message, type });
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const openConfirm = useCallback(
    (title, message, onConfirm, variant = "primary", options = {}) => {
      const resolvedOptions =
        variant && typeof variant === "object"
          ? variant
          : options;
      const resolvedVariant =
        typeof variant === "string"
          ? variant
          : resolvedOptions?.variant || "primary";
      setConfirmState({
        isOpen: true,
        title,
        message,
        onConfirm: () => {
          onConfirm();
          setConfirmState((prev) => ({ ...prev, isOpen: false }));
        },
        variant: resolvedVariant,
        requireText: resolvedOptions?.requireText || "",
        requireTextLabel: resolvedOptions?.requireTextLabel || "",
        requireTextPlaceholder: resolvedOptions?.requireTextPlaceholder || "",
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  // System Log Function
  const logAction = useCallback(
    async (action, details, projectId = null) => {
      if (!user) return;
      if (action === "Navigate") return;
      try {
        const rawAction = String(action || "").trim();
        const rawDetails = String(details || "").trim();
        const normalizeRules = [
          { match: /^Create\b|^Added\b|^Start Next Period\b/i, base: "Create" },
          { match: /^Update\b|^Save Draft\b|^Hold\b|^Recalculate\b/i, base: "Update" },
          { match: /^Delete\b|^Cleared\b/i, base: "Delete" },
          { match: /^Approve\b|^Allow\b|^Allowed\b|^PO Revision Allowed\b/i, base: "Approve" },
          { match: /^Reject\b|^Denied\b|^PO Revision Denied\b/i, base: "Reject" },
          { match: /^Submit\b|^Request\b/i, base: "Submit" },
          { match: /^Import\b/i, base: "Import" },
        ];
        let normalizedAction = rawAction || "Update";
        let normalizedDetails = rawDetails;
        for (const rule of normalizeRules) {
          if (rule.match.test(rawAction)) {
            normalizedAction = rule.base;
            normalizedDetails = rawDetails ? `${rawAction} — ${rawDetails}` : rawAction;
            break;
          }
        }
        if (rawAction === "Bulk") {
          const detailsLower = rawDetails.toLowerCase();
          if (detailsLower.includes("approve")) normalizedAction = "Approve";
          else if (detailsLower.includes("reject")) normalizedAction = "Reject";
          else if (detailsLower.includes("delete")) normalizedAction = "Delete";
          else if (detailsLower.includes("submit") || detailsLower.includes("sent")) normalizedAction = "Submit";
          else if (detailsLower.includes("import")) normalizedAction = "Import";
          else if (detailsLower.includes("create") || detailsLower.includes("added")) normalizedAction = "Create";
          else normalizedAction = "Update";
          normalizedDetails = rawDetails ? `${rawAction} — ${rawDetails}` : rawAction;
        }
        const logData: Record<string, any> = {
          timestamp: new Date().toISOString(),
          action: normalizedAction,
          details: normalizedDetails,
          user: userData
            ? `${userData.firstName} ${userData.lastName}`
            : user.email,
          role: userData ? userData.role : "Unknown",
          uid: user.uid,
        };
        if (projectId) logData.projectId = projectId;
        await addDoc(
          collection(db, "artifacts", appId, "public", "data", "logs"),
          logData
        );
      } catch (error) {
        console.error("Failed to write log:", error);
      }
    },
    [user, userData]
  );

  // ดึงรูปโปรไฟล์จาก URL (เช่น Google) แล้วอัปโหลดไป Storage ของเรา เพื่อไม่ให้รูปหายเมื่อลิงก์หมดอายุ
  // ใช้ in-memory flag กัน fetch ซ้ำในกรณีที่ onAuthStateChanged ถูกเรียกหลายครั้ง
  const uploadInProgress = React.useRef<Set<string>>(new Set());
  const pullAndUploadProfilePhoto = useCallback(async (uid, photoURL, userDocRef) => {
    if (!photoURL) return null;
    // ถ้ากำลัง upload อยู่แล้ว ให้ข้ามไป ไม่ fetch ซ้ำ
    if (uploadInProgress.current.has(uid)) return null;
    uploadInProgress.current.add(uid);
    try {
      const res = await fetch(photoURL, { mode: "cors" });
      if (!res.ok) return null;
      const blob = await res.blob();
      const ext = (blob.type || "").includes("png") ? "png" : "jpg";
      const storageRef = ref(storage, `profiles/${uid}/avatar.${ext}`);
      await uploadBytes(storageRef, blob, { contentType: blob.type });
      const downloadURL = await getDownloadURL(storageRef);
      await updateDoc(userDocRef, { profilePhotoUrl: downloadURL });
      return downloadURL;
    } catch (e) {
      console.warn("[pullAndUploadProfilePhoto]", e);
      return null;
    } finally {
      uploadInProgress.current.delete(uid);
    }
  }, []);

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
            // ถ้ามีรูปจาก Google แต่ยังไม่มี profilePhotoUrl (รูปของเรา) ให้ดึงมาอัปโหลดเลย
            if (currentUser.photoURL && !data.profilePhotoUrl) {
              pullAndUploadProfilePhoto(currentUser.uid, currentUser.photoURL, userDocRef).then((url) => {
                if (url) getDoc(userDocRef).then((snap) => snap.exists() && setUserData(snap.data()));
              });
            }
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
  }, [showAlert, pullAndUploadProfilePhoto]);

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
        if (user.photoURL) pullAndUploadProfilePhoto(user.uid, user.photoURL, userDocRef).catch(() => {});

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
        if (user.photoURL && !data.profilePhotoUrl) {
          pullAndUploadProfilePhoto(user.uid, user.photoURL, userDocRef).catch(() => {});
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
  }, [googleProvider, showAlert, pullAndUploadProfilePhoto]);

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

  const refreshUserData = useCallback(async () => {
    if (!user?.uid) return;
    try {
      const snap = await getDoc(doc(db, "artifacts", appId, "public", "data", "users", user.uid));
      if (snap.exists()) setUserData(snap.data());
    } catch (_) {}
  }, [user?.uid]);

  const authContextValue = useMemo(
    () => ({
      user,
      userData,
      login,
      loginWithGoogle,
      register,
      logout,
      resetPassword,
      refreshUserData,
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
      refreshUserData,
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
        requireText={confirmState.requireText}
        requireTextLabel={confirmState.requireTextLabel}
        requireTextPlaceholder={confirmState.requireTextPlaceholder}
      />
    </AuthContext.Provider>
  );
};

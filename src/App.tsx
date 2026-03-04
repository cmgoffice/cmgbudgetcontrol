// @ts-nocheck
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  createContext,
  useContext,
} from "react";
import {
  LayoutDashboard,
  Briefcase,
  Wallet,
  FileText,
  ShoppingCart,
  Users,
  FileInput,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  RefreshCw,
  UserCheck,
  Save,
  Upload,
  Download,
  BarChart3,
  Calendar,
  MapPin,
  DollarSign,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleArrowRight,
  CircleArrowDown,
  Info,
  Play,
  PlusCircle,
  CornerDownRight,
  FileSpreadsheet,
  AlertCircle,
  LogOut,
  Shield,
  User,
  Settings,
  Key,
  CheckSquare,
  Square,
  History,
  FileOutput,
  Search,
  ListFilter,
  Truck,
  Package,
  Paperclip,
  Mail,
  Clock,
  Flame,
  Bell,
  Hash,
  Tag,
  MapPinned,
  ClipboardList,
  CircleDot,
  Zap,
  Building2,
  UserCircle,
  AtSign,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Framer Motion: variants แบบมืออาชีพ (ไม่เวอร์) ---
const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};
const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};
const modalTransition = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] };
const overlayTransition = { duration: 0.18 };

// --- Firebase Imports ---
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  writeBatch,
  getDocs,
  getDoc,
  orderBy,
  limit,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";

// --- Firebase Configuration & Setup ---
const USER_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDOqRqNW06Lu5fIQ_2Whr02tg6sn8zltw8",
  authDomain: "cmg-budget-control.firebaseapp.com",
  projectId: "cmg-budget-control",
  storageBucket: "cmg-budget-control.firebasestorage.app",
  messagingSenderId: "106345631455",
  appId: "1:106345631455:web:f96f15b024e8c65334e36a",
  measurementId: "G-YSPY0MTZG1",
};

const firebaseConfig =
  typeof __firebase_config !== "undefined"
    ? JSON.parse(__firebase_config)
    : USER_FIREBASE_CONFIG;
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId =
  typeof __app_id !== "undefined" ? __app_id : "cmg-budget-control-default";

// --- Constants & Config ---
const COST_CATEGORIES = {
  "001": "ค่าจัดเตรียมงาน (Preparation Cost)",
  "002": "รายจ่ายประจำ ในหน่วยงาน (Site Overhead)",
  "003": "ค่าวัสดุจัดหาโดย บริษัท (Material by CMG)",
  "004": "ค่าแรง (Labour Cost)",
  "005": "ค่าเครื่องจักร (Machine Cost)",
  "006": "ผู้รับเหมาย่อย รายพิเศษ (Sub Contractor)",
  "007": "ค่าใช้จ่ายบริหาร (Management Salary)",
  "008": "ความปลอดภัย (Safety Cost)",
  "009": "งานสำรวจ (Survey Cost)",
};

const USER_ROLES = [
  "Administrator",
  "MD",
  "GM",
  "PM",
  "PCM",
  "PD",
  "CM",
  "Procurement",
  "Staff",
  "Admin Site",
];

const PURCHASE_TYPES = [
  "จัดซื้อจัดจ้าง > WA, ST, ML, CS, SA",
  "อุปกรณ์ใหม่ > EQM",
  "ขอซื้อเช่า > RE",
  "เงินสดย่อย > PT",
  "คอนกรีต > CC",
  "น้ำมัน > OL",
  "ค่าแรง > DC",
  "เงินเดือน > SM",
];

const PURCHASE_TYPE_CODES = {
  "จัดซื้อจัดจ้าง > WA, ST, ML, CS, SA": ["WA", "ST", "ML", "CS", "SA"],
  "อุปกรณ์ใหม่ > EQM": ["WA", "ST", "ML", "CS", "SA"],
  "ขอซื้อเช่า > RE": ["RT", "RI"],
  "เงินสดย่อย > PT": ["PT"],
  "คอนกรีต > CC": ["CC"],
  "น้ำมัน > OL": ["OL"],
  "ค่าแรง > DC": ["DC"],
  "เงินเดือน > SM": ["SM"],
  "ค่าแรง/เงินเดือน > SM, DC": ["SM", "DC"], // backward compat for existing PRs
};

// แสดงเฉพาะชื่อประเภท (ไม่แสดง Sub-Code) ใน dropdown
const getPurchaseTypeDisplayLabel = (key) =>
  key && key.includes(" > ") ? key.split(" > ")[0].trim() : key || "";

const PURCHASE_TYPE_RENTAL_LABEL = "ขอซื้อเช่า > RE"; // ชื่อประเภทที่ใช้ dropdown "Type การเช่า"
const PURCHASE_TYPE_EQUIPMENT = "อุปกรณ์ใหม่ > EQM"; // ไม่มี Sub-Code, PR No = EQM

const DELIVERY_LOCATIONS = [
  "Headoffice",
  "Workshop สโตร์กลางฝากรับของ",
  "Workshop สั่งให้ทำงาน",
  "จัดส่งเข้าโครงการทันที",
];

// --- Helper Components (UI) ---

const Card = ({ children, className = "", onClick }) => (
  <div
    onClick={onClick}
    className={`bg-white rounded-lg shadow-sm border border-slate-200 ${className}`}
  >
    {children}
  </div>
);

const Button = ({
  children,
  onClick = () => { },
  variant = "primary",
  className = "",
  disabled = false,
  type = "button",
  ...props
}) => {
  const baseStyle =
    "px-3 py-1.5 rounded-md font-medium transition-all flex items-center justify-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md",
    secondary:
      "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50",
    danger: "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100",
    success: "bg-green-600 text-white hover:bg-green-700 hover:shadow-md",
    warning: "bg-orange-500 text-white hover:bg-orange-600 hover:shadow-md",
    outline:
      "border border-slate-300 text-slate-600 hover:bg-slate-50 bg-white",
    ghost:
      "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700 border-none shadow-none",
  };
  return (
    <button
      type={type as any}
      onClick={onClick}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

const InputGroup = ({ label, children, className = "" }) => (
  <div className={`mb-3 ${className}`}>
    <label className="block text-xs font-medium text-slate-700 mb-1">
      {label}
    </label>
    {children}
  </div>
);

const Badge = ({ status }) => {
  const styles = {
    Draft: "bg-slate-100 text-slate-600 border border-slate-200",
    "Wait MD Approve": "bg-blue-50 text-blue-700 border border-blue-200",
    Approved: "bg-green-50 text-green-700 border border-green-200",
    "Revision Pending": "bg-orange-50 text-orange-700 border border-orange-200",
    "Pending PM": "bg-yellow-50 text-yellow-700 border border-yellow-200",
    "Pending PCM": "bg-orange-50 text-orange-700 border border-orange-200",
    "Pending GM": "bg-blue-50 text-blue-700 border border-blue-200",
    "Pending MD": "bg-purple-50 text-purple-700 border border-purple-200",
    "PO Issued": "bg-indigo-50 text-indigo-700 border border-indigo-200",
    Rejected: "bg-red-50 text-red-700 border border-red-200",
    Paid: "bg-green-100 text-green-800",
    Pending: "bg-yellow-100 text-yellow-800",
    "Approved User": "bg-green-100 text-green-800",
    Login: "bg-blue-50 text-blue-600",
    Logout: "bg-slate-100 text-slate-600",
    Create: "bg-green-50 text-green-600",
    Update: "bg-orange-50 text-orange-600",
    Delete: "bg-red-50 text-red-600",
    Approve: "bg-purple-50 text-purple-600",
    Import: "bg-teal-50 text-teal-600",
  };

  let displayText = status;
  if (status === "Revision Pending") displayText = "รออนุมัติแก้ไข";
  if (status === "Approved User") displayText = "Active";

  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${styles[status] || "bg-gray-100"
        }`}
    >
      {displayText}
    </span>
  );
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
  }).format(amount || 0);
};

const CustomAlert = ({ isOpen, onClose, title, message, type = "info" }) => {
  if (!isOpen) return null;
  const overlayClasses =
    "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[200]";
  const modalClasses =
    "bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100";
  const typeConfig = {
    success: {
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-50",
      btn: "bg-green-600 hover:bg-green-700",
    },
    error: {
      icon: XCircle,
      color: "text-red-500",
      bg: "bg-red-50",
      btn: "bg-red-600 hover:bg-red-700",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-50",
      btn: "bg-amber-600 hover:bg-amber-700",
    },
    info: {
      icon: Info,
      color: "text-blue-500",
      bg: "bg-blue-50",
      btn: "bg-blue-600 hover:bg-blue-700",
    },
  };
  const Config = typeConfig[type];
  const Icon = Config.icon;
  return (
    <motion.div
      className={overlayClasses}
      initial="hidden"
      animate="visible"
      variants={modalOverlayVariants}
      transition={overlayTransition}
    >
      <motion.div
        className={modalClasses}
        initial="hidden"
        animate="visible"
        variants={modalContentVariants}
        transition={modalTransition}
      >
        <div
          className={`w-14 h-14 rounded-full ${Config.bg} flex items-center justify-center mb-5 mx-auto ring-4 ring-white shadow-sm`}
        >
          <Icon className={`w-8 h-8 ${Config.color}`} strokeWidth={2.5} />
        </div>
        <h3 className="text-xl font-bold text-center text-slate-800 mb-2 tracking-tight">
          {title}
        </h3>
        <p className="text-center text-slate-500 mb-8 text-sm leading-relaxed whitespace-pre-line">
          {message}
        </p>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={`w-full py-2.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md transition-all active:scale-95 ${Config.btn}`}
          >
            ตกลง
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const CustomConfirmModal = ({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "ยืนยัน",
  cancelText = "ยกเลิก",
  variant = "primary",
}) => {
  if (!isOpen) return null;
  const overlayClasses =
    "fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[210]";
  const modalClasses =
    "bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-slate-100";
  return (
    <motion.div
      className={overlayClasses}
      initial="hidden"
      animate="visible"
      variants={modalOverlayVariants}
      transition={overlayTransition}
    >
      <motion.div
        className={modalClasses}
        initial="hidden"
        animate="visible"
        variants={modalContentVariants}
        transition={modalTransition}
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-600">
            <AlertCircle size={24} strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={onCancel}
            className="py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`py-2.5 px-4 rounded-xl text-white font-semibold text-sm shadow-md transition-all active:scale-95 ${variant === "danger"
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
              }`}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const ProjectSelect = ({ projects, selectedId, onChange }) => {
  return (
    <div className="relative inline-block w-full md:w-96 group">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
        <Briefcase size={16} />
      </div>
      <select
        className="appearance-none w-full bg-white border border-slate-300 text-slate-700 py-2 pl-9 pr-8 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium cursor-pointer transition-all hover:border-blue-400 text-sm"
        value={selectedId || ""}
        onChange={onChange}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.jobNo} - {p.name}
          </option>
        ))}
      </select>
      <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none text-slate-500">
        <ChevronDown size={14} />
      </div>
    </div>
  );
};

// --- Auth Components & Context ---

const AuthContext = createContext(null);

const AuthProvider = ({ children }) => {
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

const AuthForm = () => {
  const { login, loginWithGoogle, register, showAlert } =
    useContext(AuthContext);
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    position: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await login(formData.email, formData.password);
      } else {
        if (formData.password !== formData.confirmPassword)
          throw new Error("รหัสผ่านไม่ตรงกัน");
        const { status } = await register(
          formData.email,
          formData.password,
          formData.firstName,
          formData.lastName,
          formData.position
        );

        if (status === "Pending") {
          showAlert(
            "ลงทะเบียนสำเร็จ!",
            "กรุณารอผู้ดูแลระบบอนุมัติบัญชีของคุณก่อนเข้าใช้งาน",
            "success"
          );
          setIsLogin(true);
          setFormData({
            email: "",
            password: "",
            confirmPassword: "",
            firstName: "",
            lastName: "",
            position: "",
          });
        }
      }
    } catch (err) {
      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/wrong-password"
      ) {
        setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md p-8 shadow-xl border-t-4 border-t-blue-600">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800">
            CMG Budget Control
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            {isLogin ? "เข้าสู่ระบบเพื่อจัดการโครงการ" : "ลงทะเบียนบัญชีใหม่"}
          </p>
        </div>
        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-100 flex items-center gap-2">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-4">
              <InputGroup label="ชื่อ (First Name)">
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2 text-sm"
                  value={formData.firstName}
                  onChange={(e) =>
                    setFormData({ ...formData, firstName: e.target.value })
                  }
                />
              </InputGroup>
              <InputGroup label="นามสกุล (Last Name)">
                <input
                  type="text"
                  required
                  className="w-full border rounded p-2 text-sm"
                  value={formData.lastName}
                  onChange={(e) =>
                    setFormData({ ...formData, lastName: e.target.value })
                  }
                />
              </InputGroup>
            </div>
          )}
          {!isLogin && (
            <InputGroup label="ตำแหน่ง (Position)">
              <input
                type="text"
                required
                className="w-full border rounded p-2 text-sm"
                value={formData.position}
                onChange={(e) =>
                  setFormData({ ...formData, position: e.target.value })
                }
              />
            </InputGroup>
          )}
          <InputGroup label="อีเมล (Email)">
            <input
              type="email"
              required
              className="w-full border rounded p-2 text-sm"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </InputGroup>
          <InputGroup label="รหัสผ่าน (Password)">
            <input
              type="password"
              required
              className="w-full border rounded p-2 text-sm"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
          </InputGroup>
          {!isLogin && (
            <InputGroup label="ยืนยันรหัสผ่าน (Confirm Password)">
              <input
                type="password"
                required
                className="w-full border rounded p-2 text-sm"
                value={formData.confirmPassword}
                onChange={(e) =>
                  setFormData({ ...formData, confirmPassword: e.target.value })
                }
              />
            </InputGroup>
          )}
          <Button
            type="submit"
            className="w-full py-2.5 mt-4 text-sm"
            disabled={loading}
          >
            {loading
              ? "กำลังดำเนินการ..."
              : isLogin
                ? "เข้าสู่ระบบ (Login)"
                : "ลงทะเบียน (Register)"}
          </Button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">
              Or continue with
            </span>
          </div>
        </div>

        <button
          onClick={loginWithGoogle}
          type="button"
          className="w-full flex items-center justify-center gap-3 bg-white text-slate-700 font-medium py-2.5 px-4 border border-slate-300 rounded-md shadow-sm hover:bg-slate-50 transition-all active:scale-95 text-sm"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Sign in with Google
        </button>

        <div className="mt-6 text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="text-sm text-blue-600 hover:underline font-medium"
          >
            {isLogin
              ? "ยังไม่มีบัญชี? ลงทะเบียนที่นี่"
              : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
          </button>
        </div>
      </Card>
    </div>
  );
};

// --- Sub-Apps (Admin & Profile) ---

const UserProfile = () => {
  const { user, userData, resetPassword, showAlert, logAction } =
    useContext(AuthContext);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    firstName: userData?.firstName || "",
    lastName: userData?.lastName || "",
    position: userData?.position || "",
  });

  const handleUpdate = async () => {
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", user.uid),
        formData
      );
      await logAction(
        "Update",
        `Updated profile: ${formData.firstName} ${formData.lastName}`
      );
      setEditMode(false);
      showAlert("สำเร็จ", "บันทึกข้อมูลเรียบร้อย", "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handlePasswordReset = async () => {
    if (confirm(`ส่งลิงก์เปลี่ยนรหัสผ่านไปที่ ${user.email} หรือไม่?`)) {
      await resetPassword(user.email);
      await logAction("Update", "Requested password reset");
      showAlert(
        "สำเร็จ",
        "ส่งลิงก์เปลี่ยนรหัสผ่านแล้ว กรุณาเช็คอีเมล",
        "success"
      );
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8">
      <Card className="p-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b">
          <div className="w-20 h-20 bg-slate-200 rounded-full flex items-center justify-center text-slate-500">
            <User size={40} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {userData?.firstName} {userData?.lastName}
            </h2>
            <p className="text-slate-500">
              {userData?.role} | {userData?.email}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <InputGroup label="ชื่อ">
              <input
                disabled={!editMode}
                type="text"
                className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
                value={formData.firstName}
                onChange={(e) =>
                  setFormData({ ...formData, firstName: e.target.value })
                }
              />
            </InputGroup>
            <InputGroup label="นามสกุล">
              <input
                disabled={!editMode}
                type="text"
                className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
                value={formData.lastName}
                onChange={(e) =>
                  setFormData({ ...formData, lastName: e.target.value })
                }
              />
            </InputGroup>
          </div>
          <InputGroup label="ตำแหน่ง">
            <input
              disabled={!editMode}
              type="text"
              className="w-full border rounded p-2 text-sm disabled:bg-slate-50"
              value={formData.position}
              onChange={(e) =>
                setFormData({ ...formData, position: e.target.value })
              }
            />
          </InputGroup>
          <div className="flex justify-between items-center pt-4">
            <button
              onClick={handlePasswordReset}
              className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
            >
              <Key size={14} /> รีเซ็ตรหัสผ่าน
            </button>
            <div className="flex gap-2">
              {editMode ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => setEditMode(false)}
                  >
                    ยกเลิก
                  </Button>
                  <Button onClick={handleUpdate}>บันทึกการเปลี่ยนแปลง</Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setEditMode(true)}>
                  <Edit size={14} /> แก้ไขข้อมูล
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

const AdminDashboard = () => {
  const { showAlert, logAction } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState("users"); // 'users' or 'logs'
  const [users, setUsers] = useState([]);
  const [logs, setLogs] = useState([]); // V.16 Logs State
  const [projects, setProjects] = useState([]);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    role: "",
    status: "",
    assignedProjectIds: [],
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  useEffect(() => {
    const qUsers = query(
      collection(db, "artifacts", appId, "public", "data", "users")
    );
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const qProjects = query(
      collection(db, "artifacts", appId, "public", "data", "projects")
    );
    const unsubProjects = onSnapshot(qProjects, (snapshot) => {
      setProjects(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    // V.16 Fetch Logs
    const qLogs = query(
      collection(db, "artifacts", appId, "public", "data", "logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubUsers();
      unsubProjects();
      unsubLogs();
    };
  }, []);

  const handleEditClick = (user) => {
    setEditUser(user);
    setEditForm({
      role: user.role,
      status: user.status,
      assignedProjectIds: user.assignedProjectIds || [],
    });
    setIsEditModalOpen(true);
  };

  const handleProjectToggle = (projectId) => {
    setEditForm((prev) => {
      const currentIds = prev.assignedProjectIds;
      if (currentIds.includes(projectId)) {
        return {
          ...prev,
          assignedProjectIds: currentIds.filter((id) => id !== projectId),
        };
      } else {
        return { ...prev, assignedProjectIds: [...currentIds, projectId] };
      }
    });
  };

  const handleSaveUserChanges = async () => {
    if (!editUser) return;
    try {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "users", editUser.id),
        {
          role: editForm.role,
          status: editForm.status,
          assignedProjectIds: editForm.assignedProjectIds,
        }
      );
      await logAction(
        "Update",
        `Admin updated user ${editUser.email}: Role=${editForm.role}, Status=${editForm.status}`
      );
      setIsEditModalOpen(false);
      showAlert("สำเร็จ", "บันทึกการแก้ไขสิทธิ์ผู้ใช้งานเรียบร้อย", "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handleApprove = async (userId, email) => {
    await updateDoc(
      doc(db, "artifacts", appId, "public", "data", "users", userId),
      { status: "Approved" }
    );
    await logAction("Approve", `Admin approved user: ${email}`);
    showAlert(
      "อนุมัติแล้ว",
      "ผู้ใช้งานได้รับการอนุมัติให้เข้าสู่ระบบ",
      "success"
    );
  };

  const handleDeleteUser = async (userId, email) => {
    const confirmed = window.confirm(
      `ยืนยันการลบผู้ใช้ "${email}" ออกจากระบบ?\nการกระทำนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmed) return;
    try {
      await deleteDoc(
        doc(db, "artifacts", appId, "public", "data", "users", userId)
      );
      await logAction("Delete", `Admin deleted user: ${email}`);
      showAlert("ลบสำเร็จ", `ลบผู้ใช้ ${email} ออกจากระบบเรียบร้อย`, "success");
    } catch (e) {
      showAlert("Error", e.message, "error");
    }
  };

  const handleExportLogs = () => {
    const headers = "Timestamp,Action,User,Role,Details\n";
    const rows = logs
      .map(
        (log) =>
          `"${new Date(log.timestamp).toLocaleString("th-TH")}",${log.action},${log.user
          },${log.role},"${log.details.replace(/"/g, '""')}"`
      )
      .join("\n");
    const bom = "\uFEFF";
    const csvContent =
      "data:text/csv;charset=utf-8," + encodeURIComponent(bom + headers + rows);
    const link = document.createElement("a");
    link.setAttribute("href", csvContent);
    link.setAttribute("download", "system_logs.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getActionBadge = (action) => {
    const map = {
      Login: "bg-blue-100 text-blue-800",
      Logout: "bg-gray-100 text-gray-800",
      Create: "bg-green-100 text-green-800",
      Update: "bg-orange-100 text-orange-800",
      Delete: "bg-red-100 text-red-800",
      Approve: "bg-purple-100 text-purple-800",
      Import: "bg-teal-100 text-teal-800",
      Navigate: "bg-slate-100 text-slate-500",
      "Select Project": "bg-cyan-100 text-cyan-800",
      Reject: "bg-red-100 text-red-700",
      Submit: "bg-indigo-100 text-indigo-800",
    };
    let style = map[action];
    if (!style) {
      if (action.includes("Add") || action.includes("Create")) style = map["Create"];
      else if (action.includes("Edit") || action.includes("Update")) style = map["Update"];
      else if (action.includes("Approve")) style = map["Approve"];
      else if (action.includes("Reject")) style = map["Reject"];
      else if (action.includes("Submit")) style = map["Submit"];
      else if (action.includes("Import")) style = map["Import"];
      else style = "bg-slate-100 text-slate-600";
    }
    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${style}`}>
        {action}
      </span>
    );
  };


  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
        <Shield size={24} className="text-blue-600" /> Admin Dashboard
      </h2>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "users"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <Users size={16} /> User Management
          </div>
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${activeTab === "logs"
            ? "border-blue-600 text-blue-600"
            : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
        >
          <div className="flex items-center gap-2">
            <History size={16} /> System Logs
          </div>
        </button>
      </div>

      {activeTab === "users" && (
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b">
              <tr>
                <th className="p-4">Name</th>
                <th className="p-4">Role</th>
                <th className="p-4">Status</th>
                <th className="p-4">Projects</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-4" title={`${u.firstName || ""} ${u.lastName || ""} | ${u.email || ""}`}>
                    <div className="font-medium text-slate-900 cell-text">
                      {u.firstName} {u.lastName}
                    </div>
                    <div className="text-xs text-slate-500 cell-text">{u.email}</div>
                  </td>
                  <td className="p-4">
                    <span className="bg-slate-100 px-2 py-1 rounded text-xs font-semibold cell-text" title={u.role}>
                      {u.role}
                    </span>
                  </td>
                  <td className="p-4">
                    <Badge
                      status={
                        u.status === "Approved" ? "Approved User" : "Pending"
                      }
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex -space-x-2 overflow-hidden">
                      {(u.assignedProjectIds || []).length > 0 ? (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full border border-blue-100">
                          {u.assignedProjectIds.length} Projects
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">None</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2 items-center">
                      {u.status === "Pending" && (
                        <Button
                          variant="success"
                          onClick={() => handleApprove(u.id, u.email)}
                        >
                          Approve
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => handleEditClick(u)}
                      >
                        <Settings size={14} /> Manage
                      </Button>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.email)}
                        className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title={`ลบผู้ใช้ ${u.email}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {activeTab === "logs" && (
        <Card className="overflow-hidden animate-in fade-in slide-in-from-bottom-2">
          <div className="p-4 border-b flex justify-between items-center bg-slate-50">
            <h3 className="font-bold text-slate-700 text-sm">
              System Logs (Last 100 activities)
            </h3>
            <Button
              variant="outline"
              onClick={handleExportLogs}
              className="bg-white"
            >
              <FileSpreadsheet size={14} /> Export CSV
            </Button>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="p-3 w-40">Timestamp</th>
                  <th className="p-3 w-48">User</th>
                  <th className="p-3 w-24">Action</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="p-3 text-xs text-slate-500 font-mono whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("th-TH")}
                    </td>
                    <td className="p-3">
                      <div className="text-xs font-bold text-slate-700">
                        {log.user}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {log.role}
                      </div>
                    </td>
                    <td className="p-3">{getActionBadge(log.action)}</td>
                    <td className="p-3 text-xs text-slate-600 break-words max-w-lg">
                      {log.details}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-400">
                      No logs available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6 pb-2 border-b">
              <h3 className="text-lg font-bold text-slate-800">
                จัดการสิทธิ์ผู้ใช้งาน
              </h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle size={24} />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 p-3 rounded text-sm text-slate-600">
                <strong>User:</strong> {editUser?.firstName}{" "}
                {editUser?.lastName} ({editUser?.email})
              </div>

              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Role (ตำแหน่ง/สิทธิ์)">
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editForm.role}
                    onChange={(e) =>
                      setEditForm({ ...editForm, role: e.target.value })
                    }
                  >
                    {USER_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </InputGroup>
                <InputGroup label="Status (สถานะ)">
                  <select
                    className="w-full border rounded p-2 text-sm bg-white"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm({ ...editForm, status: e.target.value })
                    }
                  >
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Disabled">Disabled</option>
                  </select>
                </InputGroup>
              </div>

              <div className="border-t pt-4">
                <label className="block text-sm font-bold text-slate-700 mb-3">
                  สิทธิ์การเข้าถึงโครงการ (Project Access)
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded bg-slate-50">
                  {projects.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 p-2 bg-white rounded border border-slate-100 cursor-pointer hover:border-blue-300 transition-colors"
                    >
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 shadow-sm checked:bg-blue-600 checked:border-blue-600"
                          checked={editForm.assignedProjectIds.includes(p.id)}
                          onChange={() => handleProjectToggle(p.id)}
                        />
                        <CheckSquare
                          className="absolute pointer-events-none hidden peer-checked:block text-white"
                          size={12}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-800">
                          {p.jobNo}
                        </div>
                        <div className="text-xs text-slate-500 truncate w-64">
                          {p.name}
                        </div>
                      </div>
                    </label>
                  ))}
                  {projects.length === 0 && (
                    <div className="text-center text-slate-400 text-xs py-4">
                      ไม่พบโครงการในระบบ
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  * ผู้ใช้งานจะเห็นเฉพาะโครงการที่ถูกเลือกเท่านั้น
                  (Administrator เห็นทั้งหมด)
                </p>
              </div>

              <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
                <Button
                  variant="secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleSaveUserChanges}>
                  บันทึกการเปลี่ยนแปลง
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// --- Main App Logic (Authenticated) ---

const AuthenticatedApp = () => {
  const { userData, logout, showAlert, openConfirm, logAction } =
    useContext(AuthContext);
  const userRole = userData?.role || "Staff";

  const [activeMenu, setActiveMenu] = useState("dashboard");
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = useState(false);

  // Data States
  const [projects, setProjects] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [prs, setPrs] = useState([]);
  const [pos, setPos] = useState([]);
  const [invoices, setInvoices] = useState([]);

  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [budgetCategory, setBudgetCategory] = useState("OVERVIEW");
  const [expandedBudgetRows, setExpandedBudgetRows] = useState({});
  const [expandedPrRows, setExpandedPrRows] = useState({});
  const [isBellOpen, setIsBellOpen] = useState(false);
  const [scrollToPendingAfterRender, setScrollToPendingAfterRender] = useState(false);
  const pendingSectionRef = useRef(null);

  const togglePrRow = (prId) => {
    setExpandedPrRows((prev) => ({
      ...prev,
      [prId]: !prev[prId],
    }));
  };

  // menu label map สำหรับ log
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

  const handleMenuChange = (menu: string) => {
    setActiveMenu(menu);
    const label = menuLabelMap[menu] || menu;
    logAction("Navigate", `เปิดเมนู: ${label}`);
  };

  const handleProjectChange = (projectId: string | null) => {
    setSelectedProjectId(projectId);
    if (projectId) {
      const project = projects.find((p) => p.id === projectId);
      const projectName = project ? `${project.jobNo} - ${project.name}` : projectId;
      logAction("Select Project", `เลือกโครงการ: ${projectName}`);
    }
  };

  // --- Pending Approval Computations ---
  // Global counts for bell badge (across all visible projects)
  const pendingBudgetsGlobal = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    return budgets.filter(
      (b) => b.status === "Wait MD Approve" || b.status === "Revision Pending"
    );
  }, [budgets, userRole]);

  const pendingSubItemsGlobal = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    const pendingSubs = [];
    budgets.forEach(b => {
      if (b.subItems && b.subItems.length > 0) {
        b.subItems.forEach(sub => {
          if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
        });
      }
    });
    return pendingSubs;
  }, [budgets, userRole]);

  const pendingPRsGlobal = useMemo(() => {
    return prs.filter((pr) => {
      if (userRole === "Administrator" && pr.status && pr.status.startsWith("Pending")) return true;
      if (userRole === "CM" && pr.status === "Pending CM") return true;
      if (userRole === "PM" && pr.status === "Pending PM") return true;
      if (userRole === "GM" && pr.status === "Pending GM") return true;
      if (userRole === "MD" && pr.status === "Pending MD") return true;
      return false;
    });
  }, [prs, userRole]);

  const pendingPOsGlobal = useMemo(() => {
    return pos.filter((po) => {
      if (userRole === "Administrator" && po.status && po.status.startsWith("Pending")) return true;
      if (userRole === "PCM" && po.status === "Pending PCM") return true;
      if (userRole === "GM" && po.status === "Pending GM") return true;
      return false;
    });
  }, [pos, userRole]);

  const totalPendingCount = pendingBudgetsGlobal.length + pendingPRsGlobal.length + pendingPOsGlobal.length + pendingSubItemsGlobal.length;

  // Group pending items by project for bell popup
  const pendingByProject = useMemo(() => {
    const map = {};
    pendingBudgetsGlobal.forEach((b) => {
      if (!map[b.projectId]) map[b.projectId] = { budgets: 0, prs: 0, pos: 0, subItems: 0 };
      map[b.projectId].budgets++;
    });
    pendingSubItemsGlobal.forEach((s) => {
      const budget = budgets.find(b => b.id === s.budgetId);
      if (budget) {
        if (!map[budget.projectId]) map[budget.projectId] = { budgets: 0, prs: 0, pos: 0, subItems: 0 };
        map[budget.projectId].subItems++;
      }
    });
    pendingPRsGlobal.forEach((pr) => {
      if (!map[pr.projectId]) map[pr.projectId] = { budgets: 0, prs: 0, pos: 0, subItems: 0 };
      map[pr.projectId].prs++;
    });
    pendingPOsGlobal.forEach((po) => {
      if (!map[po.projectId]) map[po.projectId] = { budgets: 0, prs: 0, pos: 0, subItems: 0 };
      map[po.projectId].pos++;
    });
    return Object.entries(map).map(([projectId, counts]) => {
      const proj = projects.find((p) => p.id === projectId);
      return {
        projectId,
        projectName: proj ? `${proj.jobNo} - ${proj.name}` : projectId,
        ...counts,
        total: counts.budgets + counts.prs + counts.pos + counts.subItems,
      };
    });
  }, [pendingBudgetsGlobal, pendingSubItemsGlobal, pendingPRsGlobal, pendingPOsGlobal, projects, budgets]);

  // Per-project counts for the Budget OVERVIEW approval tables
  const pendingBudgetsForProject = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    return budgets.filter(
      (b) =>
        b.projectId === selectedProjectId &&
        (b.status === "Wait MD Approve" || b.status === "Revision Pending")
    );
  }, [budgets, userRole, selectedProjectId]);

  const pendingSubItemsForProject = useMemo(() => {
    if (userRole !== "MD" && userRole !== "Administrator") return [];
    const pendingSubs = [];
    budgets.forEach(b => {
      if (b.projectId === selectedProjectId && b.subItems && b.subItems.length > 0) {
        b.subItems.forEach(sub => {
          if (sub.status === "Wait MD Approve" || sub.status === "Revision Pending") pendingSubs.push({ ...sub, budgetId: b.id, budgetCode: b.code });
        });
      }
    });
    return pendingSubs;
  }, [budgets, userRole, selectedProjectId]);

  const pendingPRsForProject = useMemo(() => {
    return prs.filter((pr) => {
      if (pr.projectId !== selectedProjectId) return false;
      if (userRole === "Administrator" && pr.status && pr.status.startsWith("Pending")) return true;
      if (userRole === "CM" && pr.status === "Pending CM") return true;
      if (userRole === "PM" && pr.status === "Pending PM") return true;
      if (userRole === "GM" && pr.status === "Pending GM") return true;
      if (userRole === "MD" && pr.status === "Pending MD") return true;
      return false;
    });
  }, [prs, userRole, selectedProjectId]);

  const pendingPOsForProject = useMemo(() => {
    return pos.filter((po) => {
      if (po.projectId !== selectedProjectId) return false;
      if (userRole === "Administrator" && po.status && po.status.startsWith("Pending")) return true;
      if (userRole === "PCM" && po.status === "Pending PCM") return true;
      if (userRole === "GM" && po.status === "Pending GM") return true;
      return false;
    });
  }, [pos, userRole, selectedProjectId]);

  // Handler for PR approve/reject actions from the approval tasks table (Budget Overview page)
  const handlePRAction = async (id, action) => {
    const pr = prs.find((p) => p.id === id);
    if (!pr) return;
    let newStatus = pr.status;
    if (action === "approve") {
      if (pr.status === "Pending CM" && (userRole === "CM" || userRole === "Administrator")) newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (userRole === "PM" || userRole === "Administrator")) newStatus = "Approved"; // No GM/MD? User said "PM อนุมัติ ถือว่าสิ้นสุด"
      // User said: "PF > CM > PM -> Finished". So "Pending PM" -> "Approved".
      // Previous flow had GM/MD. I will comment them out or remove if not needed.
      // Wait, user request: "ทุกคนสามารถสร้าง PR > CM อนุมัติ > PM อนุมัติ ถือว่าสิ้นสุด"
      // So: Create -> Pending CM -> Pending PM -> Approved (PO Issued).

      // Keeping generic admin override just in case.
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== pr.status) {
      const updateDataPayload = { status: newStatus };
      if (action === "approve") updateDataPayload.rejectReason = "";
      await updateData("prs", id, updateDataPayload);
    }
  };

  const handlePOAction = async (id, action) => {
    const po = pos.find((p) => p.id === id);
    if (!po) return;
    let newStatus = po.status;
    if (action === "approve") {
      if (po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator")) newStatus = "Pending GM";
      else if (po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator")) newStatus = "Approved";
    } else if (action === "reject") {
      newStatus = "Rejected";
    }
    if (newStatus !== po.status) {
      const updateDataPayload = { status: newStatus };
      if (action === "approve") updateDataPayload.rejectReason = "";
      await updateData("pos", id, updateDataPayload);
    }
  };

  // --- Firestore Logic ---

  // Initial Data Mock
  const INITIAL_PROJECTS = [
    {
      jobNo: "JOB-67-001",
      name: "โครงการก่อสร้างอาคารสำนักงานใหญ่ CMG",
      location: "กรุงเทพฯ",
      contractValue: 50000000,
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      pmName: "คุณสมชาย ใจดี",
      cmName: "คุณสมศักดิ์ ช่างปูน",
    },
    {
      jobNo: "JOB-67-002",
      name: "โครงการหมู่บ้านจัดสรร เฟส 2",
      location: "เชียงใหม่",
      contractValue: 120000000,
      startDate: "2024-03-01",
      endDate: "2025-06-30",
      pmName: "คุณวิชัย เก่งงาน",
      cmName: "คุณมานะ อดทน",
    },
  ];
  const INITIAL_BUDGETS = [
    {
      projectRefId: "JOB-67-001",
      category: "001",
      code: "001001",
      description: "ค่ารั้วชั่วคราว",
      amount: 50000,
      status: "Approved",
      revisionReason: "",
      subItems: [],
    },
    {
      projectRefId: "JOB-67-001",
      category: "003",
      code: "003001",
      description: "คอนกรีตผสมเสร็จ",
      amount: 1000000,
      status: "Approved",
      revisionReason: "",
      subItems: [],
    },
    {
      projectRefId: "JOB-67-001",
      category: "003",
      code: "003002",
      description: "งานโครงสร้างเหล็ก (มีรายการย่อย)",
      amount: 500000,
      status: "Draft",
      revisionReason: "",
      subItems: [
        {
          id: "301",
          description: "เหล็กเส้น DB12",
          quantity: 15000,
          unitPrice: 20,
          amount: 300000,
        },
        {
          id: "302",
          description: "เหล็กเส้น DB16",
          quantity: 8000,
          unitPrice: 25,
          amount: 200000,
        },
      ],
    },
  ];
  const INITIAL_VENDORS = [
    {
      code: "V-001",
      name: "บริษัท คอนกรีตไทย จำกัด",
      type: "Material",
      email: "sales@thaiconcrete.com",
      tel: "02-123-4567",
      note: "ส่งของไว",
    },
  ];

  // Data Fetching & Sync
  useEffect(() => {
    const syncCollection = (collectionName, setter) => {
      const ref = collection(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        collectionName
      );
      const q = query(ref);
      return onSnapshot(
        q,
        (snapshot) => {
          const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          setter(data);
        },
        (error) => console.error(`Error syncing ${collectionName}:`, error)
      );
    };

    const unsubProjects = syncCollection("projects", (data) => {
      setProjects(data);
    });
    const unsubBudgets = syncCollection("budgets", setBudgets);
    const unsubVendors = syncCollection("vendors", setVendors);
    const unsubMaterials = syncCollection("materials", setMaterials);
    const unsubPrs = syncCollection("prs", setPrs);
    const unsubPos = syncCollection("pos", setPos);
    const unsubInvoices = syncCollection("invoices", setInvoices);

    return () => {
      unsubProjects();
      unsubBudgets();
      unsubVendors();
      unsubMaterials();
      unsubPrs();
      unsubPos();
      unsubInvoices();
    };
  }, []);

  // V.14 Logic: Visible Projects Calculation
  const visibleProjects = useMemo(() => {
    if (userRole === "Administrator") return projects;
    const assignedIds = userData?.assignedProjectIds || [];
    return projects.filter((p) => assignedIds.includes(p.id));
  }, [projects, userData, userRole]);

  // V.14 Logic: Auto-select valid project
  useEffect(() => {
    if (visibleProjects.length > 0) {
      if (
        !selectedProjectId ||
        !visibleProjects.find((p) => p.id === selectedProjectId)
      ) {
        setSelectedProjectId(visibleProjects[0].id);
      }
    } else {
      setSelectedProjectId(null);
    }
  }, [visibleProjects, selectedProjectId]);

  // 3. Auto-seed Initial Data
  useEffect(() => {
    const checkAndSeedData = async () => {
      try {
        const projectRef = collection(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "projects"
        );
        const snapshot = await getDocs(projectRef);

        if (snapshot.empty) {
          console.log("Database is empty. Seeding initial mock data...");
          const projectMap = {};

          for (const p of INITIAL_PROJECTS) {
            const docRef = doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "projects",
              p.jobNo
            );
            await setDoc(docRef, p);
            projectMap[p.jobNo] = p.jobNo;
          }

          const vendorRef = collection(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "vendors"
          );
          for (const v of INITIAL_VENDORS) {
            await addDoc(vendorRef, v);
          }

          const budgetRef = collection(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "budgets"
          );
          for (const b of INITIAL_BUDGETS) {
            const projectId = projectMap[b.projectRefId];
            if (projectId) {
              const { projectRefId, ...rest } = b;
              await addDoc(budgetRef, { ...rest, projectId: projectId });
            }
          }
        }
      } catch (error) {
        console.error("Error seeding initial data:", error);
      }
    };

    checkAndSeedData();
  }, []);

  // --- Helpers for Firestore Actions ---
  const addData = async (collectionName, data, customId = null) => {
    try {
      if (customId) {
        const ref = doc(db, "artifacts", appId, "public", "data", collectionName, customId);
        await setDoc(ref, data);
      } else {
        const ref = collection(db, "artifacts", appId, "public", "data", collectionName);
        await addDoc(ref, data);
      }
      await logAction("Create", `Added new ${collectionName.slice(0, -1)}`);
      return true;
    } catch (e) {
      showAlert(
        "Error",
        "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message,
        "error"
      );
      return false;
    }
  };

  const updateData = async (collectionName, id, data) => {
    try {
      const ref = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        collectionName,
        id
      );
      await updateDoc(ref, data);
      await logAction(
        "Update",
        `Updated ${collectionName.slice(0, -1)} ID: ${id}`
      );
      return true;
    } catch (e) {
      showAlert(
        "Error",
        "เกิดข้อผิดพลาดในการแก้ไขข้อมูล: " + e.message,
        "error"
      );
      return false;
    }
  };

  const deleteData = async (collectionName, id) => {
    try {
      const ref = doc(
        db,
        "artifacts",
        appId,
        "public",
        "data",
        collectionName,
        id
      );
      await deleteDoc(ref);
      await logAction(
        "Delete",
        `Deleted ${collectionName.slice(0, -1)} ID: ${id}`
      );
      return true;
    } catch (e) {
      showAlert("Error", "เกิดข้อผิดพลาดในการลบข้อมูล: " + e.message, "error");
      return false;
    }
  };

  // --- Views Definitions ---

  const ProjectsView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProjectId, setEditingProjectId] = useState(null);
    const [formData, setFormData] = useState({
      jobNo: "",
      name: "",
      location: "",
      contractValue: 0,
      startDate: "",
      endDate: "",
      pmName: "",
      cmName: "",
    });

    const handleSave = async () => {
      if (!formData.jobNo || !formData.name) return;

      if (editingProjectId) {
        const success = await updateData(
          "projects",
          editingProjectId,
          formData
        );
        if (success) {
          setIsModalOpen(false);
          setFormData({
            jobNo: "",
            name: "",
            location: "",
            contractValue: 0,
            startDate: "",
            endDate: "",
            pmName: "",
            cmName: "",
          });
          setEditingProjectId(null);
          showAlert("สำเร็จ", "แก้ไขข้อมูลโครงการเรียบร้อย", "success");
        }
      } else {
        try {
          const ref = doc(
            db,
            "artifacts",
            appId,
            "public",
            "data",
            "projects",
            formData.jobNo
          );
          await setDoc(ref, formData);
          await logAction("Create", `Created Project: ${formData.jobNo}`);
          setIsModalOpen(false);
          setFormData({
            jobNo: "",
            name: "",
            location: "",
            contractValue: 0,
            startDate: "",
            endDate: "",
            pmName: "",
            cmName: "",
          });
          showAlert("สำเร็จ", "เพิ่มโครงการใหม่เรียบร้อยแล้ว", "success");
        } catch (e) {
          showAlert(
            "Error",
            "เกิดข้อผิดพลาดในการบันทึกข้อมูล: " + e.message,
            "error"
          );
        }
      }
    };

    const handleEdit = (project) => {
      setFormData(project);
      setEditingProjectId(project.id);
      setIsModalOpen(true);
    };

    const handleDelete = (id) => {
      openConfirm(
        "ยืนยันการลบโครงการ",
        "ข้อมูลที่เกี่ยวข้องอาจค้างอยู่ในระบบ คุณแน่ใจหรือไม่?",
        async () => await deleteData("projects", id),
        "danger"
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">
            A. จัดการโครงการ (Projects)
          </h2>
          <Button
            onClick={() => {
              setEditingProjectId(null);
              setFormData({
                jobNo: "",
                name: "",
                location: "",
                contractValue: 0,
                startDate: "",
                endDate: "",
                pmName: "",
                cmName: "",
              });
              setIsModalOpen(true);
            }}
          >
            <Plus size={14} /> เพิ่มโครงการใหม่
          </Button>
        </div>
        <Card className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <th className="py-2 px-3">Job No.</th>
                <th className="py-2 px-3">Project Name</th>
                <th className="py-2 px-3">Location</th>
                <th className="py-2 px-3 text-right">Contract Value</th>
                <th className="py-2 px-3">Start</th>
                <th className="py-2 px-3">Finish</th>
                <th className="py-2 px-3">PM</th>
                <th className="py-2 px-3">CM</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {projects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium text-slate-900" title={p.jobNo}>
                    <span className="cell-text">{p.jobNo}</span>
                  </td>
                  <td className="py-2 px-3 font-medium" title={p.name}><span className="cell-text">{p.name}</span></td>
                  <td className="py-2 px-3 text-slate-500" title={p.location}><span className="cell-text">{p.location}</span></td>
                  <td className="py-2 px-3 text-right font-semibold text-blue-700">
                    {formatCurrency(p.contractValue)}
                  </td>
                  <td className="py-2 px-3 text-xs" title={p.startDate}><span className="cell-text">{p.startDate}</span></td>
                  <td className="py-2 px-3 text-xs" title={p.endDate}><span className="cell-text">{p.endDate}</span></td>
                  <td className="py-2 px-3 text-blue-600 font-medium" title={p.pmName}>
                    <span className="cell-text">{p.pmName}</span>
                  </td>
                  <td className="py-2 px-3 text-green-600 font-medium" title={p.cmName}>
                    <span className="cell-text">{p.cmName}</span>
                  </td>
                  <td className="py-2 px-3 text-right flex justify-end gap-1">
                    <button
                      className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                      onClick={() => handleEdit(p)}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                      onClick={() => handleDelete(p.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-4">
                {editingProjectId ? "แก้ไขข้อมูลโครงการ" : "เพิ่มโครงการใหม่"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Job No.">
                  <input
                    type="text"
                    className={`w-full border rounded p-2 text-sm ${
                      editingProjectId && userRole !== "Administrator"
                        ? "bg-gray-100 text-gray-500"
                        : ""
                    }`}
                    value={formData.jobNo}
                    onChange={(e) =>
                      setFormData({ ...formData, jobNo: e.target.value })
                    }
                    placeholder="JOB-XX-XXX"
                    disabled={!!editingProjectId && userRole !== "Administrator"}
                  />
                </InputGroup>
                <InputGroup label="Contract Value">
                  <input
                    type="number"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.contractValue}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        contractValue: Number(e.target.value),
                      })
                    }
                  />
                </InputGroup>
                <div className="col-span-2">
                  <InputGroup label="Project Name">
                    <input
                      type="text"
                      className="w-full border rounded p-2 text-sm"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </InputGroup>
                </div>
                <div className="col-span-2">
                  <InputGroup label="Location">
                    <input
                      type="text"
                      className="w-full border rounded p-2 text-sm"
                      value={formData.location}
                      onChange={(e) =>
                        setFormData({ ...formData, location: e.target.value })
                      }
                    />
                  </InputGroup>
                </div>
                <InputGroup label="Start">
                  <input
                    type="date"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData({ ...formData, startDate: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="Finish">
                  <input
                    type="date"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData({ ...formData, endDate: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="PM">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.pmName}
                    onChange={(e) =>
                      setFormData({ ...formData, pmName: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="CM">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.cmName}
                    onChange={(e) =>
                      setFormData({ ...formData, cmName: e.target.value })
                    }
                  />
                </InputGroup>
              </div>
              <div className="flex justify-end gap-2 mt-6 border-t pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleSave}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const BudgetView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
    const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
    const [isSubItemModalOpen, setIsSubItemModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importData, setImportData] = useState({});
    const [selectedImportCategories, setSelectedImportCategories] = useState(
      []
    );
    const [isClearConfirmOpen, setIsClearConfirmOpen] = useState(false);
    const [clearConfirmText, setClearConfirmText] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [sortConfig, setSortConfig] = useState({
      key: null,
      direction: "ascending",
    });
    const [editingBudgetId, setEditingBudgetId] = useState(null);
    const [selectedBudget, setSelectedBudget] = useState(null);
    const [editingSubItem, setEditingSubItem] = useState(null);
    const [revisionReason, setRevisionReason] = useState("");
    const [rejectReason, setRejectReason] = useState("");
    const [reasonModalOpen, setReasonModalOpen] = useState(false);
    const [reasonModalType, setReasonModalType] = useState("revision"); // 'revision' | 'reject'
    const [reasonModalValue, setReasonModalValue] = useState("");
    const [reasonModalContext, setReasonModalContext] = useState({ budgetId: null, subItemId: null });
    const [selectedBudgetIds, setSelectedBudgetIds] = useState([]); // สำหรับหน้า 001-009: เลือกรายการงบ
    const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
    const [pendingSelectedBudgetIds, setPendingSelectedBudgetIds] = useState([]); // สำหรับ Pending Approval Tasks
    const [pendingActionDropdownOpen, setPendingActionDropdownOpen] = useState(false);
    const [formData, setFormData] = useState({
      code: "",
      description: "",
      amount: 0,
    });
    const [subItemData, setSubItemData] = useState({
      description: "",
      quantity: 1,
      unitPrice: 0,
      amount: 0,
    });

    // เมื่อกดกระดิ่งแล้วเลือกโปรเจกต์ — เลื่อนลงไปที่รายการรออนุมัติ
    useEffect(() => {
      if (budgetCategory === "OVERVIEW" && scrollToPendingAfterRender && pendingSectionRef?.current) {
        pendingSectionRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
        setScrollToPendingAfterRender(false);
      }
    }, [budgetCategory, scrollToPendingAfterRender]);

    const currentBudgets = budgets.filter(
      (b) => b.projectId === selectedProjectId && b.category === budgetCategory
    );

    // V.20: Explicitly define pending lists with Admin Super-Powers
    const pendingBudgetsForProject = useMemo(() => {
      if (!selectedProjectId) return [];
      // MD or Admin sees pending budgets
      if (userRole !== "MD" && userRole !== "Administrator") return [];

      return budgets.filter(
        (b) =>
          b.projectId === selectedProjectId &&
          (b.status === "Wait MD Approve" || b.status === "Revision Pending")
      );
    }, [budgets, selectedProjectId, userRole]);

    const pendingPRsForProject = useMemo(() => {
      if (!selectedProjectId) return [];
      return prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;
        if (pr.status === "Rejected" || pr.status === "Approved" || pr.status === "PO Issued") return false;

        // Admin sees all pending
        if (userRole === "Administrator") return true;

        // Role-based visibility
        if (userRole === "CM" && pr.status === "Pending CM") return true;
        if (userRole === "PM" && pr.status === "Pending PM") return true;
        // Legacy or Extended
        if (userRole === "GM" && pr.status === "Pending GM") return true;
        if (userRole === "MD" && pr.status === "Pending MD") return true;

        return false;
      });
    }, [prs, selectedProjectId, userRole]);

    const sortedBudgets = useMemo(() => {
      let sortableItems = [...currentBudgets];
      if (sortConfig.key !== null) {
        sortableItems.sort((a, b) => {
          if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === "ascending" ? -1 : 1;
          }
          if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === "ascending" ? 1 : -1;
          }
          return 0;
        });
      }
      return sortableItems;
    }, [currentBudgets, sortConfig]);

    const requestSort = (key) => {
      let direction = "ascending";
      if (sortConfig.key === key && sortConfig.direction === "ascending") {
        direction = "descending";
      }
      setSortConfig({ key, direction });
    };

    const handleDownloadTemplate = () => {
      const headers = "Cost Code,Description,Budget\n";
      const sampleRows = `001001,ตัวอย่างค่าจัดเตรียมงาน,50000\n002001,ตัวอย่างค่าใช้จ่ายหน่วยงาน,10000\n003001,ตัวอย่างค่าวัสดุ,100000`;
      const bom = "\uFEFF";
      const csvContent =
        "data:text/csv;charset=utf-8," +
        encodeURIComponent(bom + headers + sampleRows);
      const link = document.createElement("a");
      link.setAttribute("href", csvContent);
      link.setAttribute("download", "cmg_budget_template.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).slice(1);
        const parsedData = {};
        rows.forEach((row) => {
          if (!row.trim()) return;
          
          const cols = [];
          let inQuotes = false;
          let currentVal = "";
          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cols.push(currentVal);
              currentVal = "";
            } else {
              currentVal += char;
            }
          }
          cols.push(currentVal);

          if (cols.length >= 3) {
            let costCode = cols[0].trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            let description = cols[1].trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();
            let amountStr = cols[2].trim().replace(/^"|"$/g, '').replace(/""/g, '"').trim();

            amountStr = amountStr.replace(/,/g, '');
            if (amountStr === "-" || amountStr === "") {
              amountStr = "0";
            }

            const amount = Number(amountStr) || 0;
            
            if (costCode.length >= 1) {
              // รองรับหลายรูปแบบ:
              // 6 หลัก: "003001" → rawCat "003" ✓
              // 4 หลัก: "1001"   → padStart(6) → "001001" → "001" ✓
              // 7 หลัก: "3001001" (Excel ตัด 00 นำหน้า) → padStart(9) → "003001001" → "003" ✓
              // 9 หลัก: "003001001" → rawCat "003" ✓
              let rawCat = costCode.length >= 3 ? costCode.substring(0, 3) : costCode.padStart(3, "0");
              let category = rawCat;
              if (!COST_CATEGORIES[rawCat]) {
                const paddedCat6 = costCode.padStart(6, "0").substring(0, 3);
                if (COST_CATEGORIES[paddedCat6]) {
                  category = paddedCat6;
                } else {
                  const paddedCat9 = costCode.padStart(9, "0").substring(0, 3);
                  if (COST_CATEGORIES[paddedCat9]) {
                    category = paddedCat9;
                  }
                }
              }
              // รับเฉพาะ Cost Code นำหน้า 001-009 เท่านั้น
              const ALLOWED_PREFIXES = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
              if (!ALLOWED_PREFIXES.includes(category)) return;
              if (COST_CATEGORIES[category]) {
                if (!parsedData[category]) parsedData[category] = [];
                // Normalize code ให้เป็น 9 หลักเสมอ เช่น 3001001 → 003001001
                const normalizedCode = costCode.padStart(9, "0");
                parsedData[category].push({
                  category: category,
                  code: normalizedCode,
                  description: description,
                  amount: amount,
                  status: "Draft",
                  subItems: [],
                });
              }
            }
          }
        });
        setImportData(parsedData);
        setSelectedImportCategories(Object.keys(parsedData));
        setIsImportModalOpen(true);
      };
      reader.readAsText(file);
    };

    const handleConfirmImport = async () => {
      if (!selectedProjectId)
        return showAlert("Error", "กรุณาเลือกโครงการก่อน Import", "error");
      let importCount = 0;
      const batchPromises = [];
      for (const cat of selectedImportCategories) {
        const items = importData[cat] || [];
        for (const item of items) {
          const budgetItem = { ...item, projectId: selectedProjectId };
          const safeDesc = budgetItem.description
            .replace(/\//g, "-")
            .replace(/[.#$[\]]/g, "")
            .trim();
          const budgetDocId = `${budgetItem.projectId}-${budgetItem.code}-${safeDesc}`;
          batchPromises.push(addData("budgets", budgetItem, budgetDocId));
          importCount++;
        }
      }
      await Promise.all(batchPromises);
      await logAction("Import", `Imported ${importCount} budget items`);
      setIsImportModalOpen(false);
      setImportData({});
      setSelectedImportCategories([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      showAlert(
        "Import สำเร็จ",
        `นำเข้าข้อมูล ${importCount} รายการเรียบร้อย`,
        "success"
      );
    };

    const calculateTotalBudget = (item) => {
      // Rule 1 & 3: Main Budget amount is fixed. 
      // It is no longer overwritten by sum of sub-items.
      return item.amount;
    };

    const getBudgetStats = (budget) => {
      // Step 1: Find ALL related PRs/POs by Cost Code only.
      // Granular filtering (Main vs Sub-Item) is handled in getNowStatus.
      const budgetCode = budget.code;

      const relatedPRs = prs.filter((pr) => {
        if (pr.projectId !== selectedProjectId) return false;
        // Match by PR-level cost code (legacy)
        if (pr.costCode === budgetCode) return true;
        // Match by item-level cost code
        if (pr.items && pr.items.length > 0) {
          return pr.items.some(i => (i.costCode || pr.costCode) === budgetCode);
        }
        return false;
      });

      const relatedPOs = pos.filter((po) => {
        if (po.projectId !== selectedProjectId) return false;
        if (po.items && po.items.length > 0) {
          return po.items.some(i => i.costCode === budgetCode);
        }
        return false;
      });

      const hasSubItems = budget.subItems && budget.subItems.length > 0;
      const budgetDesc = (budget.description || "").trim();

      // Helper: does this item belong to THIS specific budget?
      const itemBelongsToBudget = (item) => {
        if (hasSubItems) {
          // Budget with sub-items: any item with matching code belongs
          return true;
        }
        // Budget without sub-items: must also match description
        const iDesc = (item.description || "").trim();
        return iDesc === budgetDesc;
      };

      // Calculate Totals based on matching logic
      const prTotal = relatedPRs.reduce((sum, pr) => {
        if (pr.status === "Rejected") return sum;

        let prAmount = 0;
        if (pr.items && pr.items.length > 0) {
          prAmount = pr.items.reduce((iSum, i) => {
            const itemCode = i.costCode || pr.costCode;
            if (itemCode !== budgetCode) return iSum;
            if (!itemBelongsToBudget(i)) return iSum;
            return iSum + (Number(i.amount) || (Number(i.quantity) * Number(i.price)));
          }, 0);
        } else {
          prAmount = Number(pr.totalAmount || 0);
        }
        return sum + prAmount;
      }, 0);

      const poTotal = relatedPOs.reduce((sum, po) => {
        if (po.status === "Rejected") return sum;
        let poAmount = 0;
        if (po.items && po.items.length > 0) {
          poAmount = po.items.reduce((iSum, i) => {
            if (i.costCode !== budgetCode) return iSum;
            if (!itemBelongsToBudget(i)) return iSum;
            return iSum + (Number(i.amount) || (Number(i.quantity) * Number(i.price)));
          }, 0);
        } else {
          poAmount = Number(po.totalAmount || 0);
        }
        return sum + poAmount;
      }, 0);

      const relatedInvoices = invoices.filter((inv) =>
        relatedPOs.some((po) => po.poNo === inv.poRef && po.status !== "Rejected")
      );
      const invoiceTotal = relatedInvoices.reduce(
        (sum, inv) => sum + Number(inv.amount),
        0
      );
      return { prTotal, poTotal, invoiceTotal, relatedPRs, relatedPOs };
    };

    const getNowStatus = (budget, stats, filterMode = "ALL", targetSubDesc = null) => {
      const budgetCode = budget.code;
      const hasSubItems = budget.subItems && budget.subItems.length > 0;

      // Shared helper: Does this PR/PO item pass the current filter?
      const matchesFilter = (item, itemCostCode) => {
        if (itemCostCode !== budgetCode) return false;
        const iDesc = (item.description || "").trim();

        if (filterMode === "SUB_ITEM" && targetSubDesc) {
          // DEBUG: trace matching
          console.log("[SUB_ITEM MATCH]", {
            itemCostCode: itemCostCode,
            budgetCode: budgetCode,
            itemDesc: iDesc,
            targetSubDesc: targetSubDesc.trim(),
            descMatch: iDesc === targetSubDesc.trim(),
            itemSubItemId: item.subItemId,
            hasSubItems,
            subItemIds: hasSubItems ? budget.subItems.map(s => ({ id: s.id, desc: s.description })) : [],
          });
          // Try ID match first (if available)
          if (item.subItemId && hasSubItems) {
            const targetSub = budget.subItems.find(s => s.description === targetSubDesc);
            if (targetSub && item.subItemId === targetSub.id) return true;
            // ID didn't match → fall through to description match
          }
          // Fallback: description match
          return iDesc === targetSubDesc.trim();
        }

        if (filterMode === "MAIN_ONLY") {
          if (hasSubItems) {
            // Budget HAS sub-items → exclude items that belong to sub-items
            if (item.subItemId) {
              return !budget.subItems.some(sub => sub.id === item.subItemId);
            }
            return !budget.subItems.some(sub => sub.description.trim() === iDesc);
          } else {
            // Budget has NO sub-items → match description to prevent spill
            return iDesc === (budget.description || "").trim();
          }
        }

        if (filterMode === "ALL") {
          if (!hasSubItems) {
            return iDesc === (budget.description || "").trim();
          }
        }

        return true;
      };

      let statusesToReturn = [];

      // 1. Check PO Statuses
      if (stats.relatedPOs && stats.relatedPOs.length > 0) {
        const poGroups = stats.relatedPOs.reduce((acc, po) => {
          const s = po.status || "Pending PCM";
          if (!acc[s]) acc[s] = 0;
          let amount = 0;
          if (po.items && Array.isArray(po.items)) {
            amount = po.items
              .filter(i => matchesFilter(i, i.costCode || prs.find(p => p.id === i.prId)?.costCode))
              .reduce((sum, i) => sum + Number(i.amount), 0);
          } else if (po.costCode === budgetCode) {
            if (filterMode === "SUB_ITEM") amount = 0;
            else amount = Number(po.amount);
          }
          acc[s] += amount;
          return acc;
        }, {});

        if (poGroups["Rejected"] > 0) statusesToReturn.push({ label: "PO Rejected", amount: poGroups["Rejected"], color: "red" });
        if (poGroups["Pending PCM"] > 0) statusesToReturn.push({ label: "PO Pending PCM", amount: poGroups["Pending PCM"], color: "orange" });
        if (poGroups["Pending GM"] > 0) statusesToReturn.push({ label: "PO Pending GM", amount: poGroups["Pending GM"], color: "blue" });
        if (poGroups["Approved"] > 0) statusesToReturn.push({ label: "PO Approved", amount: poGroups["Approved"], color: "green" });
      }

      // 2. Check PR Statuses
      if (stats.relatedPRs && stats.relatedPRs.length > 0) {
        const prGroups = stats.relatedPRs.reduce((acc, pr) => {
          if (pr.status === "PO Issued") return acc;
          let amount = 0;
          if (pr.items && Array.isArray(pr.items)) {
            amount = pr.items
              .filter(i => matchesFilter(i, i.costCode || pr.costCode))
              .reduce((sum, i) => sum + (Number(i.amount) || (Number(i.quantity) * Number(i.price))), 0);
          } else {
            if (pr.costCode === budgetCode) {
              if (filterMode === "SUB_ITEM") amount = 0;
              else amount = Number(pr.totalAmount || pr.amount);
            }
          }
          if (amount > 0) {
            if (!acc[pr.status]) acc[pr.status] = 0;
            acc[pr.status] += amount;
          }
          return acc;
        }, {});

        if (prGroups["Rejected"] > 0) statusesToReturn.push({ label: "PR Rejected", amount: prGroups["Rejected"], color: "red" });
        if (prGroups["Pending CM"] > 0) statusesToReturn.push({ label: "PR Pending CM", amount: prGroups["Pending CM"], color: "cyan" });
        if (prGroups["Pending PM"] > 0) statusesToReturn.push({ label: "PR Pending PM", amount: prGroups["Pending PM"], color: "blue" });
        if (prGroups["Pending GM"] > 0) statusesToReturn.push({ label: "PR Pending GM", amount: prGroups["Pending GM"], color: "indigo" });
        if (prGroups["Pending MD"] > 0) statusesToReturn.push({ label: "PR Pending MD", amount: prGroups["Pending MD"], color: "purple" });
        if (prGroups["Approved"] > 0) statusesToReturn.push({ label: "PR Approved", amount: prGroups["Approved"], color: "green" });
      }

      return statusesToReturn;
    };

    const getCategorySummary = () => {
      return Object.entries(COST_CATEGORIES).map(([code, name]) => {
        const catBudgets = budgets.filter(
          (b) => b.projectId === selectedProjectId && b.category === code
        );
        const totalBudget = catBudgets.reduce(
          (sum, b) => sum + calculateTotalBudget(b),
          0
        );
        const catPRs = prs.filter(
          (pr) =>
            pr.projectId === selectedProjectId &&
            pr.costCode &&
            pr.costCode.startsWith(code) &&
            pr.status !== "Rejected"
        );
        const totalPR = catPRs.reduce(
          (sum, pr) => sum + Number(pr.totalAmount || pr.amount),
          0
        );

        // Filter POs relevant to this project
        const projectPOs = pos.filter((po) => po.projectId === selectedProjectId);

        // Calculate PO total for this category (checking items if available)
        const totalPO = projectPOs.reduce((sum, po) => {
          if (po.items && Array.isArray(po.items)) {
            const itemSum = po.items
              .filter(i => {
                const c = i.costCode || prs.find(p => p.id === i.prId)?.costCode;
                return c && c.startsWith(code);
              })
              .reduce((s, i) => s + Number(i.amount), 0);
            return sum + itemSum;
          } else if (po.costCode && po.costCode.startsWith(code)) {
            return sum + Number(po.amount);
          }
          return sum;
        }, 0);

        // Get PO Numbers that contain items from this category for Invoice filtering
        const catPO_Nos = projectPOs
          .filter(po => {
            if (po.items && Array.isArray(po.items)) {
              return po.items.some(i => {
                const c = i.costCode || prs.find(p => p.id === i.prId)?.costCode;
                return c && c.startsWith(code);
              });
            }
            return po.costCode && po.costCode.startsWith(code);
          })
          .map(po => po.poNo);

        const catInvoices = invoices.filter(
          (inv) =>
            inv.projectId === selectedProjectId && catPO_Nos.includes(inv.poRef)
        );

        // Note: Invoice logic assumes the whole invoice belongs to the category if the PO does.
        // For mixed POs, this might over-count if we don't have itemized invoices.
        // But preventing the crash is the priority.
        const totalInvoice = catInvoices.reduce(
          (sum, inv) => sum + Number(inv.amount),
          0
        );
        let categoryStatus = "No Budget";
        if (catBudgets.length > 0) {
          const hasDraft = catBudgets.some((b) => b.status === "Draft");
          const hasRevision = catBudgets.some(
            (b) => b.status === "Revision Pending"
          );
          const allApproved = catBudgets.every((b) => b.status === "Approved");
          if (hasDraft) categoryStatus = "Budget - Draft";
          else if (hasRevision) categoryStatus = "Budget - Revision Pending";
          else if (allApproved) categoryStatus = "Budget - MD Approved";
          else categoryStatus = "Budget - In Progress";
        }
        const catBalance = catBudgets.reduce((sum, b) => {
          const hasSubItems = b.subItems && b.subItems.length > 0;
          const sumSubItems = hasSubItems ? b.subItems.reduce((acc, sub) => acc + sub.amount, 0) : 0;
          const bTotal = Number(b.amount);

          if (hasSubItems) {
            return sum + (bTotal - sumSubItems);
          } else {
            // For budgets without subitems, deduct PRs that belong to it
            const bPRs = prs.filter(pr => pr.projectId === selectedProjectId && pr.costCode === b.code && pr.status !== "Rejected");
            const bPRTotal = bPRs.reduce((acc, pr) => acc + Number(pr.totalAmount || pr.amount), 0);
            return sum + (bTotal - bPRTotal);
          }
        }, 0);

        return {
          code,
          name,
          budget: totalBudget,
          pr: totalPR,
          po: totalPO,
          invoice: totalInvoice,
          balance: catBalance,
          status: categoryStatus,
        };
      });
    };

    const handleSaveBudget = async (newStatus = null) => {
      let success = false;
      try {
        if (editingBudgetId) {
          const updatePayload = {
            description: formData.description,
            amount: formData.amount,
            code: `${budgetCategory}${formData.code}`,
          };
          if (newStatus) updatePayload.status = newStatus;

          await updateDoc(
            doc(
              db,
              "artifacts",
              appId,
              "public",
              "data",
              "budgets",
              editingBudgetId
            ),
            updatePayload
          );
          await logAction("Update", `[Budget] ${formData.code} - ${formData.description} | โครงการ: ${projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}${newStatus ? ` | Status: ${newStatus}` : ''}`);
          showAlert("สำเร็จ", "แก้ไขรายการ Budget เรียบร้อย", "success");
        } else {
          const budgetData = {
            ...formData,
            projectId: selectedProjectId,
            category: budgetCategory,
            code: `${budgetCategory}${formData.code}`,
            status: "Draft",
            revisionReason: "",
            subItems: [],
          };
          const budgetDocId = `${selectedProjectId}-${budgetData.code}-${budgetData.description}`;
          await setDoc(
            doc(db, "artifacts", appId, "public", "data", "budgets", budgetDocId),
            budgetData
          );
          await logAction("Create", `[Budget] ${formData.code} - ${formData.description} | โครงการ: ${projects.find(p => p.id === selectedProjectId)?.name || selectedProjectId}`);
          showAlert("สำเร็จ", "เพิ่มรายการ Budget ใหม่เรียบร้อย", "success");
        }
        setIsModalOpen(false);
        setEditingBudgetId(null);
        setFormData({ code: "", description: "", amount: 0 });
      } catch (e) {
        showAlert("Error", e.message, "error");
      }
    };

    const handleDeleteBudget = async (id) => {
      openConfirm(
        "ยืนยันการลบ",
        "คุณต้องการลบรายการงบประมาณนี้ใช่หรือไม่?",
        async () => {
          try {
            await deleteDoc(
              doc(db, "artifacts", appId, "public", "data", "budgets", id)
            );
            await logAction("Delete", `Deleted Budget ID: ${id}`);
          } catch (e) {
            showAlert("Error", e.message, "error");
          }
        },
        "danger"
      );
    };

    const handleClearAllBudgets = () => {
      openConfirm(
        "⚠️ ล้างข้อมูลทั้งหมด",
        `คุณต้องการลบข้อมูลงบประมาณทั้งหมดในหน้านี้ (${currentBudgets.length} รายการ) ใช่หรือไม่?\nการดำเนินการนี้ไม่สามารถย้อนกลับได้`,
        () => {
          setClearConfirmText("");
          setIsClearConfirmOpen(true);
        },
        "danger"
      );
    };

    const handleConfirmClearAll = async () => {
      if (clearConfirmText !== "Confirm") return;
      try {
        await Promise.all(
          currentBudgets.map((b) =>
            deleteDoc(doc(db, "artifacts", appId, "public", "data", "budgets", b.id))
          )
        );
        await logAction("Delete", `Cleared all ${currentBudgets.length} budget items in category ${budgetCategory}`);
        setIsClearConfirmOpen(false);
        setClearConfirmText("");
        showAlert("สำเร็จ", `ลบข้อมูลงบประมาณ ${currentBudgets.length} รายการเรียบร้อยแล้ว`, "success");
      } catch (e) {
        showAlert("Error", e.message, "error");
      }
    };

    const handleEditClick = (item) => {
      const suffix = item.code.substring(3);
      setFormData({
        code: suffix,
        description: item.description,
        amount: item.amount,
      });
      setEditingBudgetId(item.id);
      setIsModalOpen(true);
    };

    const handleApproveBudget = async (budgetId) => {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { status: "Approved", revisionReason: "", rejectReason: "" }
      );
      await logAction("Approve", `Approved Budget ID: ${budgetId}`);
      showAlert(
        "อนุมัติแล้ว",
        "Budget ได้รับการอนุมัติโดย MD เรียบร้อย",
        "success"
      );
    };

    const handleSubmitBudget = async (id) => {
      openConfirm(
        "ยืนยันการส่ง",
        "คุณต้องการส่งขออนุมัติรายการนี้ใช่หรือไม่?",
        async () => {
          await updateDoc(
            doc(db, "artifacts", appId, "public", "data", "budgets", id),
            { status: "Wait MD Approve" }
          );
          showAlert(
            "ส่งคำขอสำเร็จ",
            "ส่งรายการ Budget ให้ MD ตรวจสอบแล้ว",
            "success"
          );
        }
      );
    };

    // ล้างการเลือกเมื่อเปลี่ยนหมวด
    useEffect(() => {
      setSelectedBudgetIds([]);
      setActionDropdownOpen(false);
    }, [budgetCategory]);

    const handleBulkSubmitBudgets = () => {
      setActionDropdownOpen(false);
      if (selectedBudgetIds.length === 0) {
        showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการที่ต้องการส่งอนุมัติก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
        return;
      }
      const toSubmit = selectedBudgetIds.filter((id) => {
        const b = budgets.find((x) => x.id === id);
        return b && b.status === "Draft";
      });
      if (toSubmit.length === 0) {
        showAlert("ไม่สามารถส่งได้", "ไม่มีรายการที่สถานะ Draft ในรายการที่เลือก (ส่งได้เฉพาะรายการแบบร่าง)", "warning");
        return;
      }
      openConfirm(
        "ยืนยันส่ง MD Approve",
        `ส่งรายการที่เลือก ${toSubmit.length} รายการไปยัง MD อนุมัติใช่หรือไม่?`,
        async () => {
          try {
            for (const id of toSubmit) {
              await updateDoc(
                doc(db, "artifacts", appId, "public", "data", "budgets", id),
                { status: "Wait MD Approve" }
              );
            }
            await logAction("Bulk", `Sent ${toSubmit.length} budgets to Wait MD Approve`);
            setSelectedBudgetIds([]);
            setActionDropdownOpen(false);
            showAlert("สำเร็จ", `ส่ง ${toSubmit.length} รายการไปยัง MD อนุมัติแล้ว`, "success");
          } catch (e) {
            showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถส่งได้", "error");
          }
        }
      );
    };

    const handleBulkDeleteBudgets = () => {
      setActionDropdownOpen(false);
      if (selectedBudgetIds.length === 0) {
        showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการที่ต้องการลบก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
        return;
      }
      const toDelete = selectedBudgetIds.filter((id) => {
        const b = budgets.find((x) => x.id === id);
        return b && (b.status === "Draft" || userRole === "MD" || userRole === "Administrator");
      });
      if (toDelete.length === 0) {
        showAlert("ไม่สามารถลบได้", "ไม่มีรายการที่ลบได้ในรายการที่เลือก (เฉพาะ Draft หรือ MD/Admin ลบได้)", "warning");
        return;
      }
      openConfirm(
        "ยืนยันลบหลายรายการ",
        `คุณต้องการลบรายการที่เลือก ${toDelete.length} รายการใช่หรือไม่? การดำเนินการนี้ไม่สามารถย้อนกลับได้`,
        async () => {
          try {
            for (const id of toDelete) {
              await deleteDoc(
                doc(db, "artifacts", appId, "public", "data", "budgets", id)
              );
            }
            await logAction("Bulk", `Deleted ${toDelete.length} budgets`);
            setSelectedBudgetIds([]);
            setActionDropdownOpen(false);
            showAlert("สำเร็จ", `ลบ ${toDelete.length} รายการเรียบร้อย`, "success");
          } catch (e) {
            showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถลบได้", "error");
          }
        },
        "danger"
      );
    };

    const handleBulkApprovePendingBudgets = () => {
      setPendingActionDropdownOpen(false);
      if (pendingSelectedBudgetIds.length === 0) {
        showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการงบที่ต้องการ Approve ก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
        return;
      }
      const toApprove = pendingSelectedBudgetIds.filter((id) => {
        const b = pendingBudgetsForProject.find((x) => x.id === id);
        return !!b;
      });
      if (toApprove.length === 0) {
        showAlert("ไม่พบรายการ", "ไม่มีรายการรออนุมัติที่ตรงกับการเลือก", "warning");
        return;
      }
      openConfirm(
        "ยืนยัน Approve หลายรายการ",
        `คุณต้องการ Approve Budget ที่เลือก ${toApprove.length} รายการใช่หรือไม่?`,
        async () => {
          try {
            for (const id of toApprove) {
              await updateDoc(
                doc(db, "artifacts", appId, "public", "data", "budgets", id),
                { status: "Approved", revisionReason: "", rejectReason: "" }
              );
            }
            await logAction("Bulk", `Approved ${toApprove.length} pending budgets from dashboard`);
            setPendingSelectedBudgetIds([]);
            setPendingActionDropdownOpen(false);
            showAlert("สำเร็จ", `Approve งบประมาณ ${toApprove.length} รายการเรียบร้อย`, "success");
          } catch (e) {
            showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถ Approve ได้", "error");
          }
        }
      );
    };

    const handleBulkRejectPendingBudgets = () => {
      setPendingActionDropdownOpen(false);
      if (pendingSelectedBudgetIds.length === 0) {
        showAlert("กรุณาเลือกรายการ", "กรุณาเลือกรายการงบที่ต้องการ Reject ก่อน (ติ๊กถูกหน้าบรรทัด)", "warning");
        return;
      }
      const toReject = pendingSelectedBudgetIds.filter((id) => {
        const b = pendingBudgetsForProject.find((x) => x.id === id);
        return !!b;
      });
      if (toReject.length === 0) {
        showAlert("ไม่พบรายการ", "ไม่มีรายการรออนุมัติที่ตรงกับการเลือก", "warning");
        return;
      }
      openConfirm(
        "ยืนยัน Reject หลายรายการ",
        `คุณต้องการ Reject Budget ที่เลือก ${toReject.length} รายการใช่หรือไม่?`,
        async () => {
          try {
            for (const id of toReject) {
              await updateDoc(
                doc(db, "artifacts", appId, "public", "data", "budgets", id),
                { status: "Rejected" }
              );
            }
            await logAction("Bulk", `Rejected ${toReject.length} pending budgets from dashboard`);
            setPendingSelectedBudgetIds([]);
            setPendingActionDropdownOpen(false);
            showAlert("สำเร็จ", `Reject งบประมาณ ${toReject.length} รายการเรียบร้อย`, "success");
          } catch (e) {
            showAlert("เกิดข้อผิดพลาด", e?.message || "ไม่สามารถ Reject ได้", "error");
          }
        },
        "danger"
      );
    };

    const handleRequestRevision = async () => {
      if (!selectedBudget || !revisionReason) return;
      await updateDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "budgets",
          selectedBudget.id
        ),
        { status: "Revision Pending", revisionReason: revisionReason }
      );
      await logAction(
        "Request",
        `Requested Revision for Budget: ${selectedBudget.code}`
      );
      setIsRevisionModalOpen(false);
      setRevisionReason("");
      setSelectedBudget(null);
      showAlert("ส่งคำขอแก้ไข", "ส่งเรื่องรอ MD อนุมัติการแก้ไขแล้ว", "info");
    };

    const handleAllowEdit = async (budgetId) => {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { status: "Draft", revisionReason: "", rejectReason: "" }
      );
      await logAction("Approve", `Allowed Edit for Budget ID: ${budgetId}`);
      showAlert(
        "อนุญาตแล้ว",
        "ปลดล็อครายการให้แก้ไขได้ (สถานะ Draft)",
        "success"
      );
    };

    const handleRejectRevision = async (budgetId) => {
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { status: "Approved", revisionReason: "" }
      );
      await logAction("Reject Revision", `Rejected revision request for Budget ID: ${budgetId} — สถานะกลับเป็น Approved`);
      showAlert("ไม่อนุญาตแก้ไข", "สถานะกลับเป็น Approved ตามเดิม", "info");
    };

    const openRejectModal = (budget) => {
      setSelectedBudget(budget);
      setRejectReason("");
      setIsRejectModalOpen(true);
    };

    const handleRejectBudget = async () => {
      if (!selectedBudget || !rejectReason) return;
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", selectedBudget.id),
        { status: "Rejected", rejectReason: rejectReason }
      );
      await logAction("Reject", `Rejected Budget: ${selectedBudget.code} - ${rejectReason}`);
      setIsRejectModalOpen(false);
      setRejectReason("");
      setSelectedBudget(null);
      showAlert("ปฏิเสธแล้ว", "รายการ Budget ถูกปฏิเสธเรียบร้อย", "error");
    };

    const handleApproveSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Approved", rejectReason: "" } : sub
      );

      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Approve Sub-Item", `Approved Sub-Item ID: ${subItemId} in Budget: ${budget.code}`);
      showAlert("อนุมัติแล้ว", "อนุมัติรายการย่อย (Sub-Item) เรียบร้อย", "success");
    };

    const handleRequestRevisionSubItem = async (budgetId, subItemId, reason) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Revision Pending", revisionReason: reason } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Request Revision Sub-Item", `Requested Revision for Sub-Item ID: ${subItemId} in Budget: ${budget.code}`);
      showAlert("ส่งคำขอแก้ไข", "ส่งเรื่องรอ MD อนุมัติการแก้ไขรายการย่อยแล้ว", "info");
    };

    const handleAllowEditSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Draft", revisionReason: "", rejectReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Allow Edit Sub-Item", `Allowed Edit for Sub-Item ID: ${subItemId} in Budget: ${budget.code}`);
      showAlert("อนุญาตแล้ว", "ปลดล็อครายการย่อยให้แก้ไขได้ (สถานะ Draft)", "success");
    };

    const handleRejectRevisionSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Approved", revisionReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Reject Revision Sub-Item", `Rejected revision for Sub-Item ID: ${subItemId} in Budget: ${budget.code} — สถานะกลับเป็น Approved`);
      showAlert("ไม่อนุญาตแก้ไข", "สถานะรายการย่อยกลับเป็น Approved ตามเดิม", "info");
    };

    const openReasonModal = (type, budgetId, subItemId) => {
      setReasonModalType(type);
      setReasonModalContext({ budgetId, subItemId });
      setReasonModalValue("");
      setReasonModalOpen(true);
    };

    const handleReasonModalSubmit = () => {
      const { budgetId, subItemId } = reasonModalContext;
      if (!reasonModalValue.trim()) return;
      if (reasonModalType === "revision") {
        handleRequestRevisionSubItem(budgetId, subItemId, reasonModalValue.trim());
      } else {
        handleRejectSubItem(budgetId, subItemId, reasonModalValue.trim());
      }
      setReasonModalOpen(false);
      setReasonModalValue("");
    };

    const handleSubmitSubItem = async (budgetId, subItemId) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;
      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Wait MD Approve", rejectReason: "" } : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Submit Sub-Item", `Submitted Sub-Item ID: ${subItemId} in Budget: ${budget.code} for approval`);
      showAlert("ส่งคำขอสำเร็จ", "ส่งรายการย่อยให้ MD ตรวจสอบแล้ว", "success");
    };

    const handleRejectSubItem = async (budgetId, subItemId, reason) => {
      const budget = budgets.find(b => b.id === budgetId);
      if (!budget) return;

      const newSubItems = budget.subItems.map(sub =>
        sub.id === subItemId ? { ...sub, status: "Rejected", rejectReason: reason } : sub
      );

      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", budgetId),
        { subItems: newSubItems }
      );
      await logAction("Reject Sub-Item", `Rejected Sub-Item ID: ${subItemId} in Budget: ${budget.code}`);
      showAlert("ปฏิเสธแล้ว", "ปฏิเสธรายการย่อย (Sub-Item) เรียบร้อย", "error");
    };

    const toggleRow = (id) => {
      setExpandedBudgetRows((prev) => ({ ...prev, [id]: !prev[id] }));
    };

    const openSubItemModal = (item) => {
      setSelectedBudget(item);
      setEditingSubItem(null);
      setSubItemData({ description: "", quantity: 1, unitPrice: 0, amount: 0 });
      setIsSubItemModalOpen(true);
    };

    const openEditSubItemModal = (mainItem, subItem) => {
      setSelectedBudget(mainItem);
      setEditingSubItem(subItem);
      setSubItemData({
        description: subItem.description,
        quantity: subItem.quantity,
        unitPrice: subItem.unitPrice || 0,
        amount: subItem.amount,
      });
      setIsSubItemModalOpen(true);
    };

    const handleResubmitSubItemFromModal = async () => {
      if (!selectedBudget || !editingSubItem) return;
      const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
      const updatedSub = {
        ...editingSubItem,
        description: subItemData.description,
        quantity: Number(subItemData.quantity),
        unitPrice: Number(subItemData.unitPrice),
        amount: amountToAdd,
        status: "Wait MD Approve",
        rejectReason: ""
      };
      const updatedSubItems = selectedBudget.subItems.map((sub) =>
        sub.id === editingSubItem.id ? updatedSub : sub
      );
      await updateDoc(
        doc(db, "artifacts", appId, "public", "data", "budgets", selectedBudget.id),
        { subItems: updatedSubItems }
      );
      setIsSubItemModalOpen(false);
      setEditingSubItem(null);
      setExpandedBudgetRows((prev) => ({ ...prev, [selectedBudget.id]: true }));
      showAlert("ส่งคำขอสำเร็จ", "ส่งรายการย่อยให้ MD ตรวจสอบแล้ว", "success");
    };

    const handleSaveSubItem = async () => {
      if (!selectedBudget) return;
      const amountToAdd = Number(subItemData.quantity) * Number(subItemData.unitPrice);
      const newSubItem = {
        id: editingSubItem ? editingSubItem.id : crypto.randomUUID(),
        description: subItemData.description,
        quantity: Number(subItemData.quantity),
        unitPrice: Number(subItemData.unitPrice),
        amount: amountToAdd,
        status: editingSubItem?.status === "Rejected" ? "Rejected" : "Draft",
        rejectReason: editingSubItem?.status === "Rejected" ? (editingSubItem.rejectReason || "") : ""
      };
      let updatedSubItems;
      if (editingSubItem) {
        updatedSubItems = selectedBudget.subItems.map((sub) =>
          sub.id === editingSubItem.id ? newSubItem : sub
        );
      } else {
        updatedSubItems = [...(selectedBudget.subItems || []), newSubItem];
      }
      const newTotal = updatedSubItems.reduce(
        (sum, sub) => sum + sub.amount,
        0
      );

      // Rule 3 Validation: Sub-items cannot exceed Main Budget's original amount
      if (newTotal > selectedBudget.amount) {
        return showAlert(
          "ยอดเงินเกินกำหนด",
          `ยอดรวมรายการย่อย (${formatCurrency(newTotal)}) ห้ามเกินงบประมาณหลักที่ตั้งไว้ (${formatCurrency(selectedBudget.amount)})`,
          "error"
        );
      }

      // Rule 4: Do NOT update main budget amount.
      const success = await updateDoc(
        doc(
          db,
          "artifacts",
          appId,
          "public",
          "data",
          "budgets",
          selectedBudget.id
        ),
        { subItems: updatedSubItems }
      );
      setIsSubItemModalOpen(false);
      setExpandedBudgetRows((prev) => ({ ...prev, [selectedBudget.id]: true }));
      showAlert(
        "สำเร็จ",
        editingSubItem
          ? "แก้ไขรายการย่อยเรียบร้อย"
          : "เพิ่มรายการย่อยเรียบร้อย",
        "success"
      );
    };

    const handleDeleteSubItem = async (mainId, subId) => {
      openConfirm(
        "ยืนยันการลบ",
        "ต้องการลบรายการย่อยนี้หรือไม่?",
        async () => {
          const mainBudget = budgets.find((b) => b.id === mainId);
          if (!mainBudget) return;
          const updatedSubItems = mainBudget.subItems.filter(
            (sub) => sub.id !== subId
          );
          await updateDoc(
            doc(db, "artifacts", appId, "public", "data", "budgets", mainId),
            { subItems: updatedSubItems }
          );
        },
        "danger"
      );
    };

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            B. Project Budget
          </h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
          />
        </div>
        <div className="flex overflow-x-auto gap-1 pb-2 border-b border-slate-200 no-scrollbar">
          <button
            onClick={() => setBudgetCategory("OVERVIEW")}
            className={`px-4 py-2 whitespace-nowrap text-xs font-medium rounded-t-lg transition-colors flex items-center gap-2 ${budgetCategory === "OVERVIEW"
              ? "bg-slate-800 text-white shadow-sm"
              : "bg-white text-slate-600 hover:bg-slate-50"
              }`}
          >
            <BarChart3 size={14} /> ภาพรวม (Overview)
          </button>
          {Object.entries(COST_CATEGORIES).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setBudgetCategory(key)}
              className={`px-4 py-2 whitespace-nowrap text-xs font-medium rounded-t-lg transition-colors ${budgetCategory === key
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
            >
              {key}
            </button>
          ))}
        </div>
        {budgetCategory === "OVERVIEW" ? (
          <>
            <Card className="overflow-x-auto">
              <div className="p-3 bg-slate-50 border-b">
                <h3 className="font-bold text-sm text-slate-800">
                  สรุปภาพรวมงบประมาณโครงการ (Project Budget Summary)
                </h3>
              </div>
              <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                <thead className="bg-slate-200 text-slate-900 uppercase font-bold border-b text-sm">
                  <tr>
                    <th className="py-3 px-4 border-r w-20">Code</th>
                    <th className="py-3 px-4 border-r min-w-[280px]">หมวดงาน</th>
                    <th className="py-3 px-4 text-right bg-blue-100 min-w-[120px]">
                      Budget Total
                    </th>
                    <th className="py-3 px-4 text-right text-orange-700 min-w-[100px]">
                      Spent (Inv)
                    </th>
                    <th className="py-3 px-4 text-right border-r font-bold text-green-800 min-w-[120px]">
                      Balance
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600 min-w-[100px]">
                      PR Total
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600 border-r-0 min-w-[100px]">
                      PO Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {getCategorySummary().map((cat) => (
                    <tr key={cat.code} className="hover:bg-slate-50">
                      <td className="py-2 px-4 border-r font-bold text-center bg-slate-50">
                        {cat.code}
                      </td>
                      <td className="py-2 px-4 border-r font-medium min-w-[280px]">
                        {cat.name}
                      </td>
                      <td className="py-2 px-4 text-right bg-blue-50/50 font-semibold text-slate-900">
                        {formatCurrency(cat.budget)}
                      </td>
                      <td className="py-2 px-4 text-right text-orange-600">
                        {formatCurrency(cat.invoice)}
                      </td>
                      <td
                        className={`py-2 px-4 text-right border-r font-bold ${cat.balance < 0 ? "text-red-600" : "text-green-600"
                          }`}
                      >
                        {formatCurrency(cat.balance)}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-500">
                        {formatCurrency(cat.pr)}
                      </td>
                      <td className="py-2 px-4 text-right text-slate-500 border-r-0">
                        {formatCurrency(cat.po)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-800 text-white font-bold">
                  <tr>
                    <td colSpan="2" className="py-2 px-3 text-right">
                      Grand Total
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatCurrency(
                        getCategorySummary().reduce((sum, c) => sum + c.budget, 0)
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-orange-300">
                      {formatCurrency(
                        getCategorySummary().reduce(
                          (sum, c) => sum + c.invoice,
                          0
                        )
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      {formatCurrency(
                        getCategorySummary().reduce(
                          (sum, c) => sum + c.balance,
                          0
                        )
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300">
                      {formatCurrency(
                        getCategorySummary().reduce((sum, c) => sum + c.pr, 0)
                      )}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-300 border-r-0">
                      {formatCurrency(
                        getCategorySummary().reduce((sum, c) => sum + c.po, 0)
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </Card>

            {/* ===== Approval Tasks Section (เลื่อนลงมาดูเมื่อกดกระดิ่ง) ===== */}
            {(pendingBudgetsForProject.length > 0 || pendingPRsForProject.length > 0 || pendingPOsForProject.length > 0 || pendingSubItemsForProject.length > 0) && (
              <div ref={pendingSectionRef} id="pending-approval-tasks" className="space-y-4 scroll-mt-4">
                <div className="flex items-center gap-2 pt-2">
                  <Bell size={16} className="text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-700">
                    รายการรออนุมัติ (Pending Approval Tasks)
                  </h3>
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-2 py-0.5 shadow-sm">
                    {pendingBudgetsForProject.length + pendingSubItemsForProject.length + pendingPRsForProject.length + pendingPOsForProject.length} รายการ
                  </span>
                </div>

                {/* ----- Budget Approval Table (MD only) ----- */}
                {pendingBudgetsForProject.length > 0 && (
                  <Card className="overflow-x-auto border-l-4 border-l-blue-500">
                    <div className="p-3 bg-blue-50 border-b flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={15} className="text-blue-600" />
                        <h4 className="font-bold text-xs text-blue-800 uppercase tracking-wide">
                          Project Budget — รออนุมัติ ({pendingBudgetsForProject.length} รายการ)
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <button
                            type="button"
                            className="flex items-center gap-1 px-3 py-1.5 h-8 rounded-md font-medium text-[11px] shadow-sm bg-slate-700 text-white hover:bg-slate-800"
                            onClick={() => setPendingActionDropdownOpen((v) => !v)}
                          >
                            Action
                            <ChevronDown size={12} className={pendingActionDropdownOpen ? "rotate-180" : ""} />
                          </button>
                          {pendingActionDropdownOpen && (
                            <div className="absolute right-0 top-full mt-1 z-20 py-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]">
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 text-green-700 flex items-center gap-2"
                                onClick={handleBulkApprovePendingBudgets}
                              >
                                Approve ({pendingSelectedBudgetIds.length} รายการ)
                              </button>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-700 flex items-center gap-2"
                                onClick={handleBulkRejectPendingBudgets}
                              >
                                Reject ({pendingSelectedBudgetIds.length} รายการ)
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                              checked={pendingSelectedBudgetIds.length > 0 && pendingSelectedBudgetIds.length === pendingBudgetsForProject.length}
                              onChange={(e) => {
                                if (e.target.checked) setPendingSelectedBudgetIds(pendingBudgetsForProject.map((b) => b.id));
                                else setPendingSelectedBudgetIds([]);
                              }}
                            />
                          </th>
                          <th className="py-2.5 px-4">Cost Code</th>
                          <th className="py-2.5 px-4">รายการ</th>
                          <th className="py-2.5 px-4 text-right">จำนวนเงิน</th>
                          <th className="py-2.5 px-4 text-center">สถานะ</th>
                          <th className="py-2.5 px-4 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingBudgetsForProject.map((b) => {
                          const totalBudget =
                            b.subItems && b.subItems.length > 0
                              ? b.subItems.reduce((sum, s) => sum + Number(s.amount), 0)
                              : Number(b.amount);
                          const isRevisionPending = b.status === "Revision Pending";
                          return (
                            <tr key={b.id} className={`hover:bg-blue-50/50 ${isRevisionPending ? "bg-orange-50/30" : ""}`}>
                              <td className="py-2 px-3 text-center align-middle">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  checked={pendingSelectedBudgetIds.includes(b.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setPendingSelectedBudgetIds((prev) => [...prev, b.id]);
                                    } else {
                                      setPendingSelectedBudgetIds((prev) => prev.filter((id) => id !== b.id));
                                    }
                                  }}
                                />
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-slate-800" title={b.code}><span className="cell-text">{b.code}</span></td>
                              <td className="py-2 px-3" title={b.description + (b.revisionReason ? ` | ขอแก้: ${b.revisionReason}` : "") + (b.rejectReason ? ` | ปฏิเสธ: ${b.rejectReason}` : "")}>
                                <span className="cell-text">{b.description}</span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-blue-700">
                                {formatCurrency(totalBudget)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge status={b.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1">
                                  {!isRevisionPending && (
                                    <>
                                      <Button
                                        variant="success"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleApproveBudget(b.id)}
                                      >
                                        <CheckCircle size={11} /> Approve
                                      </Button>
                                      <Button
                                        variant="danger"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => openRejectModal(b)}
                                      >
                                        <XCircle size={11} /> Reject
                                      </Button>
                                    </>
                                  )}
                                  {isRevisionPending && (
                                    <>
                                      <Button
                                        variant="warning"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleAllowEdit(b.id)}
                                      >
                                        อนุญาตแก้ไข
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                        onClick={() => handleRejectRevision(b.id)}
                                      >
                                        ไม่อนุญาตแก้ไข
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}

                {/* ----- Sub-Item Approval Table (MD only) ----- */}
                {pendingSubItemsForProject.length > 0 && (
                  <Card className="overflow-x-auto border-l-4 border-l-purple-500">
                    <div className="p-3 bg-purple-50 border-b flex items-center gap-2">
                      <CheckCircle size={15} className="text-purple-600" />
                      <h4 className="font-bold text-xs text-purple-800 uppercase tracking-wide">
                        Project Budget (Sub-Items) — รออนุมัติ ({pendingSubItemsForProject.length} รายการ)
                      </h4>
                    </div>
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-1.5 px-3">Cost Code</th>
                          <th className="py-1.5 px-3">รายการ</th>
                          <th className="py-1.5 px-3 text-right">จำนวนเงินรวม</th>
                          <th className="py-1.5 px-3 text-center">สถานะ</th>
                          <th className="py-1.5 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(() => {
                          const groupedSubs = pendingSubItemsForProject.reduce((acc, sub) => {
                            if (!acc[sub.budgetId]) acc[sub.budgetId] = { budgetCode: sub.budgetCode, subItems: [] };
                            acc[sub.budgetId].subItems.push(sub);
                            return acc;
                          }, {});

                          return Object.entries(groupedSubs).map(([bId, group]) => {
                            const b = budgets.find(bg => bg.id === bId);
                            if (!b) return null;
                            const isExpanded = expandedBudgetRows[b.id];

                            return (
                              <React.Fragment key={bId}>
                                <tr className="hover:bg-purple-50/40 cursor-pointer" onClick={() => toggleRow(b.id)}>
                                  <td className="py-2 px-3 font-mono font-bold text-slate-800">
                                    <div className="flex items-center gap-2">
                                      <button className="text-slate-400 hover:text-purple-600 transition-colors">
                                        {isExpanded
                                          ? <img src="/arrow_collapse.png" alt="collapse" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                          : <img src="/arrow_expand.png" alt="expand" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                                      </button>
                                      {b.code}
                                    </div>
                                  </td>
                                  <td className="py-2 px-3 font-medium text-slate-900">{b.description}</td>
                                  <td className="py-2 px-3 text-right font-semibold text-purple-700">
                                    {formatCurrency(group.subItems.reduce((sum, s) => sum + s.amount, 0))}
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <Badge status={group.subItems.some(s => s.status === "Revision Pending") ? "Revision Pending" : "Wait MD Approve"} />
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="text-[10px] text-slate-400">คลิกเพื่อดูรายการย่อยที่รออนุมัติ</span>
                                  </td>
                                </tr>
                                {isExpanded && group.subItems.map((sub, index) => (
                                  <tr key={sub.id} className="bg-slate-50/50 text-xs">
                                    <td className="py-1 px-3 border-r text-right text-slate-500 pr-4 font-mono relative">
                                      <span className="text-[9px] font-bold text-slate-400 absolute left-2 top-2.5">QTY</span>
                                      {sub.quantity}
                                    </td>
                                    <td className="py-1 px-3 border-r pl-8 flex items-center justify-between text-slate-600">
                                      <div className="flex items-center gap-2">
                                        <CornerDownRight size={12} className="text-slate-300" />
                                        {sub.description}
                                      </div>
                                      <div className="text-slate-400 text-[10px]">
                                        @ {formatCurrency(sub.unitPrice)}
                                      </div>
                                    </td>
                                    <td className="py-1 px-3 text-right text-red-600 pr-4 font-medium border-b border-slate-100">
                                      -{formatCurrency(sub.amount)}
                                    </td>
                                    <td className="py-1 px-3 text-center border-b border-slate-100">
                                      <Badge status={sub.status} />
                                    </td>
                                    <td className="py-1 px-3 text-center border-b border-slate-100">
                                      <div className="flex justify-center gap-1">
                                        {sub.status === "Revision Pending" ? (
                                          <>
                                            <Button variant="warning" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAllowEditSubItem(b.id, sub.id)}>
                                              อนุญาตแก้ไข
                                            </Button>
                                            <Button variant="secondary" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleRejectRevisionSubItem(b.id, sub.id)}>
                                              ไม่อนุญาตแก้ไข
                                            </Button>
                                          </>
                                        ) : (
                                          <>
                                            <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>
                                              <CheckCircle size={11} /> Approve
                                            </Button>
                                            <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => openReasonModal("reject", b.id, sub.id)}>
                                              <XCircle size={11} /> Reject
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </Card>
                )}

                {/* ----- PR Approval Table (PM / GM / MD by role) ----- */}
                {pendingPRsForProject.length > 0 && (
                  <Card className="overflow-x-auto border-l-4 border-l-green-500">
                    <div className="p-3 bg-green-50 border-b flex items-center gap-2">
                      <FileText size={15} className="text-green-600" />
                      <h4 className="font-bold text-xs text-green-800 uppercase tracking-wide">
                        Purchase Request (PR) — รออนุมัติ ({pendingPRsForProject.length} รายการ)
                      </h4>
                    </div>
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-1.5 px-3">PR No.</th>
                          <th className="py-1.5 px-3">วันที่</th>
                          <th className="py-1.5 px-3">Cost Code</th>
                          <th className="py-1.5 px-3">ประเภท</th>
                          <th className="py-1.5 px-3">ผู้ขอซื้อ</th>
                          <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                          <th className="py-1.5 px-3 text-center">สถานะ</th>
                          <th className="py-1.5 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingPRsForProject.map((pr) => {
                          const approveLabel =
                            userRole === "PM"
                              ? "PM Approve"
                              : userRole === "GM"
                                ? "GM Approve"
                                : userRole === "MD"
                                  ? "MD Approve"
                                  : "Approve"; // Default/Admin

                          // Admin sees all buttons? Or relies on current status?
                          // Logic: Show button if status matches role OR if Admin
                          const canApprove =
                            (pr.status === "Pending CM" && (userRole === "CM" || userRole === "Administrator")) ||
                            (pr.status === "Pending PM" && (userRole === "PM" || userRole === "Administrator")) ||
                            (pr.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator")) ||
                            (pr.status === "Pending MD" && (userRole === "MD" || userRole === "Administrator"));

                          if (!canApprove) return null; // Don't render row in "Pending Approval" table if can't approve? 
                          // Wait, this loop is inside "Pending Approval Tasks". 
                          // If Admin, they should see ALL pending tasks.
                          // The 'pendingPRsForProject' filter needs to be checked too.

                          return (
                            <tr key={pr.id} className="hover:bg-green-50/40">
                              <td className="py-2 px-3 font-medium text-slate-800" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>
                              <td className="py-2 px-3 text-slate-500" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>
                              <td className="py-2 px-3">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
                                  {pr.costCode}
                                </span>
                              </td>
                              <td className="py-2 px-3" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>
                              <td className="py-2 px-3" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>
                              <td className="py-2 px-3 text-right font-semibold text-green-700">
                                {formatCurrency(pr.totalAmount || pr.amount)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge status={pr.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="success"
                                    className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                    onClick={() => handlePRAction(pr.id, "approve")}
                                  >
                                    <CheckCircle size={11} /> {approveLabel}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                    onClick={() => handlePRAction(pr.id, "reject")}
                                  >
                                    <XCircle size={11} /> Reject
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}

                {/* ----- PO Approval Table (PCM / GM by role) ----- */}
                {pendingPOsForProject.length > 0 && (
                  <Card className="overflow-x-auto border-l-4 border-l-orange-500">
                    <div className="p-3 bg-orange-50 border-b flex items-center gap-2">
                      <FileText size={15} className="text-orange-600" />
                      <h4 className="font-bold text-xs text-orange-800 uppercase tracking-wide">
                        Purchase Order (PO) — รออนุมัติ ({pendingPOsForProject.length} รายการ)
                      </h4>
                    </div>
                    <table className="w-full text-left text-xs text-slate-600 whitespace-nowrap">
                      <thead className="bg-slate-200 text-slate-800 uppercase font-bold border-b text-sm">
                        <tr>
                          <th className="py-1.5 px-3">PO No.</th>
                          <th className="py-1.5 px-3">วันที่</th>
                          <th className="py-1.5 px-3">Cost Code</th>
                          <th className="py-1.5 px-3 text-right">จำนวนเงิน</th>
                          <th className="py-1.5 px-3 text-center">สถานะ</th>
                          <th className="py-1.5 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pendingPOsForProject.map((po) => {
                          const approveLabel =
                            userRole === "PCM"
                              ? "PCM Approve"
                              : userRole === "GM"
                                ? "GM Approve"
                                : "Approve"; // Default/Admin

                          const canApprove =
                            (po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator")) ||
                            (po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator"));

                          if (!canApprove) return null;

                          return (
                            <tr key={po.id} className="hover:bg-orange-50/40">
                              <td className="py-2 px-3 font-medium text-slate-800" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>
                              <td className="py-2 px-3 text-slate-500" title={po.date || po.poDate}><span className="cell-text">{po.date || po.poDate}</span></td>
                              <td className="py-2 px-3">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={po.costCode}>
                                  {po.costCode}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-right font-semibold text-orange-700">
                                {formatCurrency(po.amount || po.totalAmount || po.grandTotal)}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <Badge status={po.status} />
                              </td>
                              <td className="py-2 px-3 text-center">
                                <div className="flex justify-center gap-1">
                                  <Button
                                    variant="success"
                                    className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                    onClick={() => handlePOAction(po.id, "approve")}
                                  >
                                    <CheckCircle size={11} /> {approveLabel}
                                  </Button>
                                  <Button
                                    variant="danger"
                                    className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                    onClick={() => handlePOAction(po.id, "reject")}
                                  >
                                    <XCircle size={11} /> Reject
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Card>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-between items-center gap-2 mb-2 flex-wrap">
              <div className="flex gap-2 items-center">
                {budgetCategory !== "OVERVIEW" && (
                  <div className="relative z-[10]">
                    <button
                      type="button"
                      className="flex items-center gap-1 px-3 py-1.5 h-8 rounded-md font-medium text-xs shadow-sm bg-slate-600 text-white hover:bg-slate-700"
                      onClick={() => setActionDropdownOpen((v) => !v)}
                    >
                      Action
                      <ChevronDown size={12} className={actionDropdownOpen ? "rotate-180" : ""} />
                    </button>
                    {actionDropdownOpen && (
                      <div
                        className="absolute left-0 top-full mt-1 z-[20] py-1 bg-white border border-slate-200 rounded-lg shadow-lg min-w-[220px]"
                      >
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-green-50 text-green-700 flex items-center gap-2"
                          onClick={handleBulkSubmitBudgets}
                        >
                          ส่งไปยัง MD Approve ({selectedBudgetIds.length} รายการ)
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 text-red-700 flex items-center gap-2"
                          onClick={handleBulkDeleteBudgets}
                        >
                          ลบหลายรายการที่เลือก ({selectedBudgetIds.length})
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleClearAllBudgets}
                className="text-xs h-8 border-red-400 text-red-600 hover:bg-red-50"
                disabled={currentBudgets.length === 0}
              >
                <Trash2 size={14} /> ล้างข้อมูลทั้งหมด
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="text-xs h-8"
              >
                <Download size={14} /> Template
              </Button>
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-md font-medium transition-all text-xs shadow-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer h-8">
                <FileSpreadsheet size={14} /> Import CSV
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
              <div className="w-4"></div>
              <Button
                onClick={() => {
                  setEditingBudgetId(null);
                  setFormData({ code: "", description: "", amount: 0 });
                  setIsModalOpen(true);
                }}
              >
                <Plus size={14} /> ตั้งงบประมาณ (Budget)
              </Button>
              </div>
            </div>
            <Card className="overflow-hidden">
              <table className="w-full text-left text-xs text-slate-600 table-fixed">
                <thead className="bg-slate-200 text-slate-900 uppercase font-bold border-b text-sm">
                  <tr>
                    {budgetCategory !== "OVERVIEW" && (
                      <th className="py-3 px-2 border-r w-12 text-center align-middle">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          checked={sortedBudgets.length > 0 && selectedBudgetIds.length === sortedBudgets.length}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedBudgetIds(sortedBudgets.map((b) => b.id));
                            else setSelectedBudgetIds([]);
                          }}
                        />
                        <span className="block text-[9px] text-slate-500 mt-0.5">Select all</span>
                      </th>
                    )}
                    <th
                      className="py-3 px-4 border-r w-36 cursor-pointer hover:bg-slate-300 transition-colors"
                      onClick={() => requestSort("code")}
                    >
                      <div className="flex items-center justify-between">
                        Cost Code
                        {sortConfig.key === "code" &&
                          (sortConfig.direction === "ascending" ? (
                            <ChevronDown size={14} />
                          ) : (
                            <ChevronUp size={14} />
                          ))}
                      </div>
                    </th>
                    <th className="py-3 px-4 border-r w-[220px] max-w-[220px]">รายการ</th>
                    <th className="py-3 px-4 text-right bg-blue-100">Budget</th>
                    <th className="py-3 px-4 text-center">สถานะ</th>
                    <th className="py-3 px-4 text-right text-green-800 font-bold border-r">
                      Balance
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600">
                      PR Total
                    </th>
                    <th className="py-3 px-4 text-right text-slate-600">
                      PO Total
                    </th>
                    <th className="py-3 px-4 text-center min-w-[220px]">Now Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedBudgets.map((b) => {
                    const totalBudget = calculateTotalBudget(b);
                    const hasSubItems = b.subItems && b.subItems.length > 0;
                    const sumSubItems = hasSubItems ? b.subItems.reduce((sum, sub) => sum + sub.amount, 0) : 0;
                    const stats = getBudgetStats(b); // Pass the whole budget object
                    const budgetBalance = hasSubItems ? totalBudget - sumSubItems : totalBudget - stats.prTotal;
                    const isLocked =
                      b.status === "Approved" || b.status === "Wait MD Approve";
                    const canDelete = userRole === "MD" || b.status === "Draft";
                    const isExpanded = expandedBudgetRows[b.id];
                    const canEdit =
                      !isLocked && b.status !== "Revision Pending";
                    const isRevisionPending = b.status === "Revision Pending";
                    return (
                      <React.Fragment key={b.id}>
                        <tr
                          className={`cursor-pointer transition-colors group ${isExpanded ? "bg-amber-50/80 ring-1 ring-amber-200 ring-inset" : "hover:bg-blue-50 odd:bg-white even:bg-slate-50"}`}
                          onClick={() => toggleRow(b.id)}
                        >
                          {budgetCategory !== "OVERVIEW" && (
                            <td className="py-1 px-2 border-r w-12 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                checked={selectedBudgetIds.includes(b.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  if (e.target.checked) setSelectedBudgetIds((prev) => [...prev, b.id]);
                                  else setSelectedBudgetIds((prev) => prev.filter((id) => id !== b.id));
                                }}
                              />
                            </td>
                          )}
                          <td className="py-1 px-3 border-r font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              {hasSubItems && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleRow(b.id); }}
                                  className="text-slate-400 hover:text-blue-600 transition-colors"
                                >
                                  {isExpanded ? (
                                    <img src="/arrow_collapse.png" alt="collapse" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                  ) : (
                                    <img src="/arrow_expand.png" alt="expand" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                  )}
                                </button>
                              )}
                              {!hasSubItems && <span className="w-3.5"></span>}
                              {b.code}
                            </div>
                          </td>
                          <td className="py-1 px-3 border-r w-[220px] max-w-[220px] overflow-hidden" title={b.description}>
                            <div className="flex items-center justify-between group min-w-0">
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate block" title={b.description}>{b.description}</span>
                                {b.revisionReason && (
                                  <span className="text-xs text-orange-600 bg-orange-50 px-1 rounded w-fit mt-1 truncate block max-w-full" title={b.revisionReason}>
                                    เหตุผลขอแก้: {b.revisionReason}
                                  </span>
                                )}
                                {b.rejectReason && (
                                  <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit mt-1 inline-block truncate max-w-full" title={b.rejectReason}>
                                    เหตุผลปฏิเสธ: {b.rejectReason}
                                  </span>
                                )}
                              </div>
                              {b.status === "Approved" && (
                                <button
                                  onClick={() => openSubItemModal(b)}
                                  className="text-slate-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-all ml-2"
                                  title="เพิ่มรายการย่อย"
                                >
                                  <PlusCircle size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-1 px-3 text-right bg-blue-50/50 font-semibold">
                            {formatCurrency(totalBudget)}
                          </td>
                          <td className="py-1 px-3 text-center">
                            <Badge status={b.status} />
                          </td>
                          <td
                            className={`py-1 px-3 text-right border-r font-bold ${budgetBalance < 0
                              ? "text-red-600"
                              : "text-green-600"
                              }`}
                          >
                            {formatCurrency(budgetBalance)}
                          </td>
                          <td className="py-1 px-3 text-right text-slate-400">
                            {formatCurrency(stats.prTotal)}
                          </td>
                          <td className="py-1 px-3 text-right text-slate-400">
                            {formatCurrency(stats.poTotal)}
                          </td>
                          <td className="py-1 px-3 text-center align-top min-w-[220px]">
                            {(() => {
                              const statuses = getNowStatus(b, stats, "ALL");
                              const colorMap = {
                                green: "bg-green-50 text-green-700 border-green-200",
                                blue: "bg-blue-50 text-blue-700 border-blue-200",
                                orange: "bg-orange-50 text-orange-700 border-orange-200",
                                yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
                                red: "bg-red-50 text-red-700 border-red-200",
                                indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
                                purple: "bg-purple-50 text-purple-700 border-purple-200",
                                emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                slate: "bg-slate-50 text-slate-600 border-slate-200",
                              };
                              return (
                                <div className="flex flex-wrap items-start justify-center gap-2">
                                  {statuses.map((s, idx) => (
                                    <div key={idx} className="flex flex-col items-center">
                                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${colorMap[s.color] || colorMap.slate} whitespace-nowrap`}>
                                        {s.label}
                                      </span>
                                      {s.amount !== null && (
                                        <span className="text-[9px] text-slate-500">
                                          {formatCurrency(s.amount)}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-1 px-3 text-right">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {(userRole === "MD" || userRole === "Administrator") &&
                                b.status === "Wait MD Approve" && (
                                  <>
                                    <Button
                                      variant="success"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => handleApproveBudget(b.id)}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      variant="danger"
                                      className="px-2 py-0.5 text-[10px] whitespace-nowrap"
                                      onClick={() => openRejectModal(b)}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                              {(isRevisionPending && (userRole === "MD" || userRole === "Administrator")) && (
                                <>
                                  <Button
                                    variant="warning"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleAllowEdit(b.id); }}
                                  >
                                    อนุญาตแก้ไข
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    className="px-2 py-0.5 text-[10px]"
                                    onClick={(e) => { e.stopPropagation(); handleRejectRevision(b.id); }}
                                  >
                                    ไม่อนุญาตแก้ไข
                                  </Button>
                                </>
                              )}
                              {canEdit && (
                                <>
                                  <button
                                    className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                    title="แก้ไข"
                                    onClick={(e) => { e.stopPropagation(); handleEditClick(b); }}
                                  >
                                    <Edit size={14} />
                                  </button>
                                  {canDelete && (
                                    <button
                                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                      title="ลบ"
                                      onClick={(e) => { e.stopPropagation(); handleDeleteBudget(b.id); }}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  )}
                                </>
                              )}
                              {b.status === "Approved" && (
                                <button
                                  className="text-orange-500 hover:text-orange-700 p-1 hover:bg-orange-50 rounded"
                                  title="ขอแก้ไข (Revise)"
                                  onClick={() => {
                                    setSelectedBudget(b);
                                    setIsRevisionModalOpen(true);
                                  }}
                                >
                                  <RefreshCw size={14} />
                                </button>
                              )}
                              {b.status === "Draft" && (
                                <button
                                  className="text-green-500 hover:text-green-700 p-1 hover:bg-green-50 rounded"
                                  title="ส่งขออนุมัติ"
                                  onClick={() => handleSubmitBudget(b.id)}
                                >
                                  <Play size={14} fill="currentColor" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded &&
                          b.subItems &&
                          <>
                            {b.subItems.map((sub, index) => (
                              <tr
                                key={sub.id}
                                className="bg-slate-50/50 text-xs group"
                              >
                                {budgetCategory !== "OVERVIEW" && (
                                  <td className="py-1 px-2 border-r bg-slate-50/50 w-12" />
                                )}
                                <td className="py-1 px-3 border-r text-right text-slate-500 pr-4 font-mono relative">
                                  <span className="text-[9px] font-bold text-slate-400 absolute left-2 top-2.5">
                                    QTY
                                  </span>
                                  {sub.quantity}
                                </td>
                                <td className="py-1 px-3 border-r pl-8 w-[220px] max-w-[220px] overflow-hidden text-slate-600" title={sub.description}>
                                  <div className="flex items-center justify-between min-w-0 gap-1">
                                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-slate-400 w-4 text-center shrink-0">
                                          {index + 1}
                                        </span>
                                        <CornerDownRight
                                          size={12}
                                          className="text-slate-300 shrink-0"
                                        />
                                        <span className="truncate" title={sub.description}>{sub.description}</span>
                                      </div>
                                    {sub.status === "Rejected" && sub.rejectReason && (
                                      <span className="text-[10px] text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 w-fit mt-1 inline-block pl-6 truncate max-w-full" title={sub.rejectReason}>
                                        เหตุผลปฏิเสธ: {sub.rejectReason}
                                      </span>
                                    )}
                                    </div>
                                    <div className="text-slate-400 text-[10px] shrink-0">
                                      @ {formatCurrency(sub.unitPrice)}
                                    </div>
                                  </div>
                                </td>
                                <td className="py-1 px-3 text-right text-red-600 pr-4 font-medium border-b border-slate-100">
                                  -{formatCurrency(sub.amount)}
                                </td>
                                <td className="py-1 px-3 text-center border-b border-slate-100">
                                  {sub.status ? <Badge status={sub.status} /> : <Badge status="Approved" />}
                                </td>
                                <td
                                  colSpan="3"
                                  className="border-b border-slate-100"
                                ></td>
                                <td className="py-1 px-3 text-center align-top min-w-[220px] border-b border-slate-100">
                                  {(() => {
                                    const subStatuses = getNowStatus(b, stats, "SUB_ITEM", sub.description);
                                    const colorMap = {
                                      green: "bg-green-50 text-green-700 border-green-200",
                                      blue: "bg-blue-50 text-blue-700 border-blue-200",
                                      orange: "bg-orange-50 text-orange-700 border-orange-200",
                                      yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
                                      red: "bg-red-50 text-red-700 border-red-200",
                                      indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
                                      purple: "bg-purple-50 text-purple-700 border-purple-200",
                                      emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
                                      slate: "bg-slate-50 text-slate-600 border-slate-200",
                                    };
                                    if (subStatuses.length === 0) return null;
                                    return (
                                      <div className="flex flex-wrap items-start justify-center gap-1">
                                        {subStatuses.map((s, idx) => (
                                          <div key={idx} className="flex flex-col items-center">
                                            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border ${colorMap[s.color] || colorMap.slate} whitespace-nowrap`}>
                                              {s.label}
                                            </span>
                                            {s.amount !== null && (
                                              <span className="text-[8px] text-slate-400">
                                                {formatCurrency(s.amount)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="py-1 px-3 text-right border-b border-slate-100">
                                  <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {(sub.status === "Rejected" && (userRole === "PM" || userRole === "CM" || userRole === "MD" || userRole === "Administrator")) && (
                                      <button
                                        className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                        title="แก้ไขรายการที่ถูกปฏิเสธ"
                                        onClick={(e) => { e.stopPropagation(); openEditSubItemModal(b, sub); }}
                                      >
                                        <Edit size={14} />
                                      </button>
                                    )}
                                    {sub.status === "Draft" && (
                                      <>
                                        <button
                                          className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                                          title="แก้ไข"
                                          onClick={(e) => { e.stopPropagation(); openEditSubItemModal(b, sub); }}
                                        >
                                          <Edit size={14} />
                                        </button>
                                        <button
                                          className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                                          title="ลบ"
                                          onClick={() => handleDeleteSubItem(b.id, sub.id)}
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                        <button
                                          className="text-green-500 hover:text-green-700 p-1 hover:bg-green-50 rounded"
                                          title="ส่งขออนุมัติ"
                                          onClick={() => handleSubmitSubItem(b.id, sub.id)}
                                        >
                                          <Play size={14} fill="currentColor" />
                                        </button>
                                      </>
                                    )}
                                    {sub.status === "Approved" && (
                                      <button
                                        className="text-orange-500 hover:text-orange-700 p-1 hover:bg-orange-50 rounded"
                                        title="ขอแก้ไข (Revise)"
                                        onClick={(e) => { e.stopPropagation(); openReasonModal("revision", b.id, sub.id); }}
                                      >
                                        <RefreshCw size={14} />
                                      </button>
                                    )}
                                    {(userRole === "MD" || userRole === "Administrator") && sub.status === "Revision Pending" && (
                                      <>
                                        <Button
                                          variant="warning"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleAllowEditSubItem(b.id, sub.id); }}
                                        >
                                          อนุญาตแก้ไข
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          className="px-2 py-0.5 text-[10px]"
                                          onClick={(e) => { e.stopPropagation(); handleRejectRevisionSubItem(b.id, sub.id); }}
                                        >
                                          ไม่อนุญาตแก้ไข
                                        </Button>
                                      </>
                                    )}
                                    {(userRole === "MD" || userRole === "Administrator") && sub.status === "Wait MD Approve" && (
                                      <>
                                        <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleApproveSubItem(b.id, sub.id)}>Approve</Button>
                                        <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={(e) => { e.stopPropagation(); openReasonModal("reject", b.id, sub.id); }}>Reject</Button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {/* เว้นพื้นที่ว่างใต้รายการ Sub เมื่อกาง (แยกตารางย่อยจากตารางหลัก) */}
                            <tr className="bg-transparent" aria-hidden="true">
                              <td colSpan={9} className="py-4 border-0 bg-slate-100/50"></td>
                            </tr>
                          </>
                        }
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </>
        )}
        {/* Modals - Same as previous version, condensed for brevity */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <FileSpreadsheet size={20} /> นำเข้าข้อมูลงบประมาณ
              </h3>
              <div className="min-h-[150px] max-h-80 overflow-y-auto border border-slate-200 rounded-lg p-2 bg-slate-50 mb-4">
                {Object.keys(importData).length === 0 ? (
                  <div className="flex items-center justify-center h-[130px] text-slate-400 text-sm">
                    ไม่มีรายการให้เลือก
                  </div>
                ) : Object.keys(importData).map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-3 p-3 hover:bg-white rounded cursor-pointer border-b border-slate-100 last:border-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedImportCategories.includes(cat)}
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedImportCategories([
                            ...selectedImportCategories,
                            cat,
                          ]);
                        else
                          setSelectedImportCategories(
                            selectedImportCategories.filter((c) => c !== cat)
                          );
                      }}
                      className="w-4 h-4 rounded text-blue-600"
                    />
                    <div className="flex-1">
                      <span className="font-bold text-slate-800">{cat}</span>{" "}
                      <span className="text-xs text-slate-500">
                        ({importData[cat].length} items)
                      </span>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportData({});
                    setSelectedImportCategories([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  ยกเลิก
                </Button>
                <Button
                  onClick={handleConfirmImport}
                  disabled={selectedImportCategories.length === 0}
                >
                  ยืนยันการนำเข้า
                </Button>
              </div>
            </Card>
          </div>
        )}
        {isClearConfirmOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-sm p-6 border-red-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">ยืนยันการล้างข้อมูล</h3>
                  <p className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                พิมพ์ <span className="font-bold text-red-600 bg-red-50 px-1 rounded">Confirm</span> เพื่อยืนยันการลบข้อมูลงบประมาณ <span className="font-bold">{currentBudgets.length} รายการ</span>
              </p>
              <input
                type="text"
                className="w-full border rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 mb-4"
                placeholder='พิมพ์ "Confirm" เพื่อยืนยัน'
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirmClearAll(); }}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => { setIsClearConfirmOpen(false); setClearConfirmText(""); }}
                >
                  ยกเลิก
                </Button>
                <Button
                  onClick={handleConfirmClearAll}
                  disabled={clearConfirmText !== "Confirm"}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-40"
                >
                  <Trash2 size={14} /> ล้างข้อมูลทั้งหมด
                </Button>
              </div>
            </Card>
          </div>
        )}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4">
                {editingBudgetId ? "แก้ไขรายการ Budget" : "เพิ่มรายการ Budget"}{" "}
                ({budgetCategory})
              </h3>
              <InputGroup label={`Cost Code`}>
                {budgetCategory}
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value })
                  }
                />
              </InputGroup>
              <InputGroup label="Description">
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                />
              </InputGroup>
              <InputGroup label="Amount">
                <input
                  type="number"
                  className="w-full border rounded p-2"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: Number(e.target.value) })
                  }
                  disabled={selectedBudget?.subItems?.length > 0}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-6">
                {editingBudgetId && budgets.find(b => b.id === editingBudgetId)?.status === "Rejected" ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setIsModalOpen(false)}
                    >
                      ยกเลิก (Cancel)
                    </Button>
                    <Button
                      variant="warning" // Or secondary/info
                      onClick={() => handleSaveBudget("Draft")}
                    >
                      บันทึก (Draft)
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleSaveBudget("Wait MD Approve")}
                    >
                      ส่งขออนุมัติ (Resubmit)
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setIsModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={() => handleSaveBudget()}>Save</Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
        {isSubItemModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[300] animate-in fade-in duration-200">
            <Card className="w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold mb-2">
                {editingSubItem?.status === "Rejected" ? "แก้ไขรายการ (ถูกปฏิเสธ)" : "Sub-Item"}
              </h3>
              {editingSubItem?.status === "Rejected" && editingSubItem?.rejectReason && (
                <div className="mb-3 text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded border border-red-200">
                  เหตุผลปฏิเสธ: {editingSubItem.rejectReason}
                </div>
              )}
              <InputGroup label="Name">
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  value={subItemData.description}
                  onChange={(e) =>
                    setSubItemData({
                      ...subItemData,
                      description: e.target.value,
                    })
                  }
                />
              </InputGroup>
              <InputGroup label="Qty">
                <input
                  type="number"
                  className="w-full border rounded p-2"
                  value={subItemData.quantity}
                  onChange={(e) =>
                    setSubItemData({
                      ...subItemData,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </InputGroup>
              <InputGroup label="Unit Price">
                <input
                  type="number"
                  className="w-full border rounded p-2"
                  value={subItemData.unitPrice}
                  onChange={(e) =>
                    setSubItemData({
                      ...subItemData,
                      unitPrice: Number(e.target.value),
                    })
                  }
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                {editingSubItem?.status === "Rejected" ? (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setIsSubItemModalOpen(false);
                        setEditingSubItem(null);
                      }}
                    >
                      ยกเลิก
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleSaveSubItem}
                    >
                      บันทึก
                    </Button>
                    <Button
                      onClick={handleResubmitSubItemFromModal}
                    >
                      ขออนุมัติ
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => setIsSubItemModalOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={handleSaveSubItem}>Save</Button>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
        {isRevisionModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-orange-600">
                ขอแก้ไขงบประมาณ
              </h3>
              <InputGroup label="เหตุผล">
                <textarea
                  className="w-full border rounded p-2 h-24"
                  value={revisionReason}
                  onChange={(e) => setRevisionReason(e.target.value)}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsRevisionModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button variant="warning" onClick={handleRequestRevision}>
                  Submit
                </Button>
              </div>
            </Card>
          </div>
        )}
        {isRejectModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-red-600">
                ปฏิเสธงบประมาณ (Reject Budget)
              </h3>
              <p className="text-sm text-slate-600 mb-3">
                รายการ: <span className="font-semibold text-slate-800">{selectedBudget?.code} — {selectedBudget?.description}</span>
              </p>
              <InputGroup label="เหตุผลที่ปฏิเสธ (Reject Reason)">
                <textarea
                  className="w-full border rounded p-2 h-24"
                  placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ เช่น ตรงไหนเพราะอะไร..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsRejectModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRejectBudget}
                  disabled={!rejectReason.trim()}
                >
                  ยืนยันปฏิเสธ
                </Button>
              </div>
            </Card>
          </div>
        )}
        {/* Modal กรอกเหตุผล (แทน window.prompt) — ขอแก้ไข / ปฏิเสธ รายการย่อย */}
        {reasonModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200 p-4">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                {reasonModalType === "revision" ? (
                  <><RefreshCw size={20} className="text-orange-600" /> ระบุเหตุผลที่ขอแก้ไข (Revision Reason)</>
                ) : (
                  <><XCircle size={20} className="text-red-600" /> ระบุเหตุผลที่ไม่อนุมัติ (Reject Reason)</>
                )}
              </h3>
              <InputGroup label={reasonModalType === "revision" ? "เหตุผลที่ขอแก้ไข" : "เหตุผลที่ปฏิเสธ"}>
                <textarea
                  className="w-full border border-slate-200 rounded-lg p-3 h-24 text-sm"
                  placeholder={reasonModalType === "revision" ? "กรุณาระบุเหตุผลที่ต้องการแก้ไข..." : "กรุณาระบุเหตุผลที่ไม่อนุมัติ..."}
                  value={reasonModalValue}
                  onChange={(e) => setReasonModalValue(e.target.value)}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReasonModalOpen(false);
                    setReasonModalValue("");
                  }}
                >
                  ยกเลิก
                </Button>
                <Button
                  variant={reasonModalType === "revision" ? "warning" : "danger"}
                  onClick={handleReasonModalSubmit}
                  disabled={!reasonModalValue.trim()}
                >
                  {reasonModalType === "revision" ? "ส่งคำขอแก้ไข" : "ยืนยันปฏิเสธ"}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const PRView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPrRejectModalOpen, setIsPrRejectModalOpen] = useState(false);
    const [prRejectReason, setPrRejectReason] = useState("");

    const [selectedPrForReject, setSelectedPrForReject] = useState(null);
    const [expandedBudgetIdsInModal, setExpandedBudgetIdsInModal] = useState({});

    const toggleBudgetInModal = (id) => {
      setExpandedBudgetIdsInModal(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleRejectPrConfirm = async () => {
      if (!selectedPrForReject || !prRejectReason) return;
      await updateData("prs", selectedPrForReject.id, {
        status: "Rejected",
        rejectReason: prRejectReason,
      });
      setIsPrRejectModalOpen(false);
      setPrRejectReason("");
      setSelectedPrForReject(null);
    };
    const [headerData, setHeaderData] = useState({
      prNo: "",
      subCode: "",
      requestDate: new Date().toISOString().split("T")[0],
      requestor: "",
      requestorEmail: "",
      costCode: "",
      selectedBudgetId: "", // รหัสงบที่เลือก (ใช้แสดงยอดคงเหลือที่ตรงรายการ)
      urgency: "Normal",
      purchaseType: "",
      deliveryLocation: "",
      attachment: null,
    });

    // Generate PR No. automatically (อุปกรณ์ใหม่ = EQM; ขอซื้อเช่า = ST/SI; อื่นๆ = subCode)
    const generatePrNo = (subCode, purchaseType) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject) return "";
      const jobNoClean = (currentProject.jobNo || "").replace(/-/g, "");
      let prefix;
      if (purchaseType === PURCHASE_TYPE_EQUIPMENT) {
        prefix = `${jobNoClean}-EQM-`;
      } else if (purchaseType === PURCHASE_TYPE_RENTAL_LABEL || (PURCHASE_TYPE_CODES[PURCHASE_TYPE_RENTAL_LABEL] || []).includes(subCode)) {
        if (!subCode) return "";
        prefix = `${jobNoClean}-${subCode}-`;
      } else {
        if (!subCode) return "";
        prefix = `${jobNoClean}-${subCode}-`;
      }
      const existingCount = prs.filter(
        (pr) => pr.projectId === selectedProjectId && pr.prNo && pr.prNo.startsWith(prefix)
      ).length;
      const nextNo = String(existingCount + 1).padStart(3, "0");
      return `${prefix}${nextNo}`;
    };
    const [newItem, setNewItem] = useState({
      description: "",
      quantity: 1,
      unit: "Job",
      price: 0,
      requiredDate: "",
      note: "",
    });
    const [editingItemId, setEditingItemId] = useState(null);
    const [lineItems, setLineItems] = useState([]);
    const [editingPRId, setEditingPRId] = useState(null);
    const [isCostCodeModalOpen, setIsCostCodeModalOpen] = useState(false);
    const [selectedSubItemsForPR, setSelectedSubItemsForPR] = useState([]); // Multi-select state

    const projectBudgets = budgets.filter(
      (b) => b.projectId === selectedProjectId
    );
    const calculateTotal = () =>
      lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

    const availableBudgets = useMemo(() => {
      const approved = budgets.filter(
        (b) => b.projectId === selectedProjectId && b.status === "Approved"
      );
      return approved
        .map((b) => {
          const relatedPRs = prs.filter(
            (p) => {
              if (p.projectId !== selectedProjectId || p.status === "Rejected") return false;
              if (p.budgetId) return p.budgetId === b.id;
              return p.costCode === b.code;
            }
          );
          const usedAmount = relatedPRs.reduce(
            (sum, p) => sum + (Number(p.totalAmount) || 0),
            0
          );
          const budgetAmount = Number(b.amount); // Always use the actual total budget amount
          return {
            ...b,
            budgetAmount,
            usedAmount,
            remainingBalance: budgetAmount - usedAmount,
          };
        })
        .filter((b) => {
          // If budget has sub-items, always show it so sub-items can be individually selected.
          if (b.subItems && b.subItems.length > 0) return true;
          // For budgets without sub-items: แสดงจนกว่าคงเหลือจะหมด (เปิด PR ซ้ำได้จนงบหมด)
          return b.remainingBalance > 0;
        });
    }, [budgets, prs, selectedProjectId]);

    const handleAddItem = () => {
      if (!newItem.description || newItem.quantity <= 0)
        return showAlert(
          "ข้อมูลไม่ครบ",
          "กรุณากรอกรายละเอียดและจำนวนให้ถูกต้อง",
          "warning"
        );
      if (editingItemId) {
        setLineItems(
          lineItems.map((item) =>
            item.id === editingItemId ? { ...newItem, id: editingItemId } : item
          )
        );
        setEditingItemId(null);
      } else {
        setLineItems([...lineItems, { ...newItem, id: crypto.randomUUID() }]);
      }
      setNewItem({
        description: "",
        quantity: 1,
        unit: "Job",
        price: 0,
        requiredDate: "",
        note: "",
      });
    };

    const handleEditItem = (item) => {
      setNewItem(item);
      setEditingItemId(item.id);
    };
    const handleRemoveItem = (itemId) => {
      setLineItems(lineItems.filter((item) => item.id !== itemId));
      if (editingItemId === itemId) {
        setEditingItemId(null);
        setNewItem({
          description: "",
          quantity: 1,
          unit: "Job",
          price: 0,
          requiredDate: "",
          note: "",
        });
      }
    };

    const handleEditClick = (pr) => {
      setEditingPRId(pr.id);
      setHeaderData({
        prNo: pr.prNo,
        subCode: pr.subCode || "",
        requestDate: pr.requestDate || new Date().toISOString().split("T")[0],
        requestor: pr.requestor,
        requestorEmail: pr.requestorEmail || "",
        costCode: pr.costCode,
        selectedBudgetId: pr.budgetId || "",
        urgency: pr.urgency || "Normal",
        purchaseType: pr.purchaseType || "",
        deliveryLocation: pr.deliveryLocation || "",
        attachment: null,
      });
      setLineItems(pr.items || []);
      setIsModalOpen(true);
      setIsFullScreenModalOpen(true);
    };

    const handleSavePR = async () => {
      if (
        !headerData.prNo ||
        !headerData.costCode ||
        !headerData.requestDate ||
        !headerData.purchaseType ||
        !headerData.deliveryLocation ||
        lineItems.length === 0
      ) {
        return showAlert(
          "ข้อมูลไม่ครบ",
          "กรุณากรอกข้อมูลให้ครบถ้วน ทุกช่อง รวมถึงรายการสินค้าอย่างน้อย 1 รายการ",
          "warning"
        );
      }

      const budgetItem = headerData.selectedBudgetId
        ? budgets.find((b) => b.id === headerData.selectedBudgetId && b.projectId === selectedProjectId)
        : budgets.find((b) => b.code === headerData.costCode && b.projectId === selectedProjectId);
      if (!budgetItem)
        return showAlert(
          "ไม่พบ Cost Code",
          "กรุณาเลือก Cost Code ที่ถูกต้อง",
          "error"
        );

      const currentPrTotal = prs
        .filter((pr) => {
          if (pr.projectId !== selectedProjectId || pr.status === "Rejected" || pr.id === editingPRId) return false;
          if (headerData.selectedBudgetId && pr.budgetId) return pr.budgetId === headerData.selectedBudgetId;
          return pr.costCode === headerData.costCode;
        })
        .reduce((sum, pr) => sum + Number(pr.totalAmount), 0);
      const thisPrTotal = calculateTotal();
      const totalBudget =
        budgetItem.subItems && budgetItem.subItems.length > 0
          ? budgetItem.subItems.reduce((sum, s) => sum + s.amount, 0)
          : budgetItem.amount;

      if (currentPrTotal + thisPrTotal > totalBudget) {
        return showAlert(
          "งบประมาณไม่พอ",
          `งบทั้งหมด: ${formatCurrency(
            totalBudget
          )} \nใช้ไปแล้ว: ${formatCurrency(
            currentPrTotal
          )} \nขอซื้อครั้งนี้: ${formatCurrency(
            thisPrTotal
          )} \nคงเหลือจริง: ${formatCurrency(totalBudget - currentPrTotal)}`,
          "error"
        );
      }

      let success = false;
      const prPayload = {
        ...headerData,
        budgetId: headerData.selectedBudgetId || undefined,
        projectId: selectedProjectId,
        items: lineItems,
        totalAmount: thisPrTotal,
        status: "Pending CM",
      };

      if (editingPRId) {
        success = await updateData("prs", editingPRId, prPayload);
        if (success)
          showAlert("สำเร็จ", "แก้ไขใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
      } else {
        success = await addData("prs", prPayload, prPayload.prNo);
        if (success)
          showAlert("สำเร็จ", "บันทึกใบขอซื้อ (PR) เรียบร้อยแล้ว", "success");
      }

      if (success) {
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setHeaderData({
          prNo: "",
          subCode: "",
          requestDate: new Date().toISOString().split("T")[0],
          requestor: "",
          requestorEmail: "",
          costCode: "",
          selectedBudgetId: "",
          urgency: "Normal",
          purchaseType: "",
          deliveryLocation: "",
          attachment: null,
        });
        setLineItems([]);
        setEditingItemId(null);
        setEditingPRId(null);
      }
    };

    const handleToggleSubItem = (sub, budgetCode, budgetId) => {
      setSelectedSubItemsForPR((prev) => {
        const withBudgetId = { ...sub, parentCode: budgetCode, parentBudgetId: budgetId || (typeof sub.id === "string" && sub.id.startsWith("main-") ? sub.id.replace("main-", "") : null) };
        // เลือกได้เพียง 1 รายการเท่านั้น: ถ้ากดซ้ำบนรายการเดิมให้ยกเลิก ถ้ากดรายการใหม่ให้แทนที่
        const alreadySelected = prev.length === 1 && prev[0].id === sub.id;
        if (alreadySelected) return [];
        return [withBudgetId];
      });
    };

    const handleAddSelectedSubItems = () => {
      if (selectedSubItemsForPR.length === 0) return;
      const first = selectedSubItemsForPR[0];
      const budgetCode = first.parentCode;
      const budgetId = first.parentBudgetId || (first.id && String(first.id).startsWith("main-") ? String(first.id).replace("main-", "") : null);

      // Update Header (เก็บรหัสงบที่เลือกเพื่อแสดงยอดคงเหลือของรายการนั้นโดยเฉพาะ)
      setHeaderData((prev) => ({ ...prev, costCode: budgetCode, selectedBudgetId: budgetId || "" }));

      // Add Items
      const newItems = selectedSubItemsForPR.map((sub) => {
        const isMainItem = typeof sub.id === 'string' && sub.id.startsWith('main-');
        return {
          id: crypto.randomUUID(),
          subItemId: isMainItem ? null : sub.id, // Use null for Firestore compatibility
          description: sub.description,
          quantity: sub.quantity || 1,
          unit: sub.unit || "Job",
          price: sub.unitPrice || 0,
          requiredDate: new Date().toISOString().split("T")[0],
          note: "",
        };
      });
      setLineItems((prev) => [...prev, ...newItems]);
      setSelectedSubItemsForPR([]);
      setIsCostCodeModalOpen(false);
    };

    const handleAction = async (id, action) => {
      const pr = prs.find((p) => p.id === id);
      if (!pr) return;
      if (action === "reject") {
        setSelectedPrForReject(pr);
        setPrRejectReason("");
        setIsPrRejectModalOpen(true);
        return;
      }
      let newStatus = pr.status;

      if (pr.status === "Pending CM" && (userRole === "CM" || userRole === "Administrator"))
        newStatus = "Pending PM";
      else if (pr.status === "Pending PM" && (userRole === "PM" || userRole === "Administrator"))
        newStatus = "Approved";

      if (newStatus !== pr.status)
        await updateData("prs", id, { status: newStatus, rejectReason: "" });
    };

    const groupedBudgets = useMemo(() => {
      const groups = {};
      const ALLOWED_CATS = ["001", "002", "003", "004", "005", "006", "007", "008", "009"];
      availableBudgets.forEach((b) => {
        const cat = b.code.substring(0, 3);
        if (!ALLOWED_CATS.includes(cat)) return;
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push(b);
      });
      return groups;
    }, [availableBudgets]);

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            C. Purchase Request (PR)
          </h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          />
          <Button
            onClick={() => {
              setIsModalOpen(true);
              setIsFullScreenModalOpen(true);
              setEditingPRId(null);
              setHeaderData({
                prNo: "",
                requestDate: new Date().toISOString().split("T")[0],
                requestor: userData ? `${userData.firstName || ""} ${userData.lastName || ""}`.trim() : "",
                requestorEmail: userData?.email || "",
                costCode: "",
                selectedBudgetId: "",
                urgency: "Normal",
                purchaseType: "",
                deliveryLocation: "",
                attachment: null,
              });
              setLineItems([]);
            }}
          >
            <Plus size={14} /> สร้าง PR ใหม่
          </Button>
        </div>
        <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-xs text-blue-800 mb-4 flex items-center gap-2">
          <Info size={16} />
          <strong>Flow การอนุมัติ PR:</strong> Pending PM → Pending GM → Pending
          MD → Approved (ออก PO ได้)
        </div>
        {/* overlay: คลิกนอก expanded row เพื่อหุบรายการ */}
        {Object.values(expandedPrRows).some(Boolean) && (
          <div
            className="fixed inset-0 z-[5]"
            onClick={() => setExpandedPrRows({})}
          />
        )}
        <Card className="relative z-[6]">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <th className="py-1 px-3">PR No.</th>
                <th className="py-1 px-3">Date</th>
                <th className="py-1 px-3">Cost Code</th>
                <th className="py-1 px-3">Description</th>
                <th className="py-1 px-3">Type</th>
                <th className="py-1 px-3">Requestor</th>
                <th className="py-1 px-3">Items</th>
                <th className="py-1 px-3 text-right">Amount</th>
                <th className="py-1 px-3 text-center">Status</th>
                <th className="py-1 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(
                prs
                  .filter((pr) => pr.projectId === selectedProjectId)
                  .reduce((groups, pr) => {
                    const type = pr.purchaseType || "Uncategorized";
                    if (!groups[type]) groups[type] = [];
                    groups[type].push(pr);
                    return groups;
                  }, {})
              ).map(([type, groupPrs]) => (
                <React.Fragment key={type}>
                  <tr className="bg-slate-100 border-b border-slate-200">
                    <td colSpan={10} className="py-2 px-3 font-bold text-slate-700">
                      {type} ({groupPrs.length})
                    </td>
                  </tr>
                  {groupPrs.map((pr) => (
                    <React.Fragment key={pr.id}>
                      <tr
                        className="hover:bg-blue-50 border-b cursor-pointer transition-colors odd:bg-white even:bg-slate-50"
                        onClick={() => togglePrRow(pr.id)}
                      >
                        <td className="py-1 px-3 font-medium" title={pr.prNo}><span className="cell-text">{pr.prNo}</span></td>
                        <td className="py-1 px-3" title={pr.requestDate}><span className="cell-text">{pr.requestDate}</span></td>
                        <td className="py-1 px-3">
                          <span className="bg-gray-100 px-2 py-0.5 rounded text-xs border border-gray-200 cell-text" title={pr.costCode}>
                            {pr.costCode}
                          </span>
                        </td>
                        <td
                          className="py-1 px-3 text-xs text-slate-500"
                          title={(() => {
                            const desc = budgets.find((b) => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-";
                            return pr.rejectReason ? `${desc} | ปฏิเสธ: ${pr.rejectReason}` : desc;
                          })()}
                        >
                          <span className="cell-text">
                            {budgets.find((b) => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-"}
                          </span>
                        </td>
                        <td className="py-1 px-3" title={pr.purchaseType}><span className="cell-text">{getPurchaseTypeDisplayLabel(pr.purchaseType)}</span></td>
                        <td className="py-1 px-3" title={pr.requestor}><span className="cell-text">{pr.requestor}</span></td>
                        <td className="py-1 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700">
                              {pr.items?.length || 0} รายการ
                            </span>
                            <div className="text-slate-400">
                              {expandedPrRows[pr.id] ? (
                                <ChevronUp size={16} />
                              ) : (
                                <ChevronDown size={16} />
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-1 px-3 text-right font-semibold">
                          {formatCurrency(pr.totalAmount || pr.amount)}
                        </td>
                        <td className="py-1 px-3 text-center">
                          <Badge status={pr.status} />
                        </td>
                        <td
                          className="py-1 px-3 text-right flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(userRole === "CM" || userRole === "Administrator") && pr.status === "Pending CM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>CM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "PM" || userRole === "Administrator") && pr.status === "Pending PM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>PM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "GM" || userRole === "Administrator") && pr.status === "Pending GM" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>GM Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {(userRole === "MD" || userRole === "Administrator") && pr.status === "Pending MD" && (
                            <>
                              <Button variant="success" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "approve")}>MD Approve</Button>
                              <Button variant="danger" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(pr.id, "reject")}>Reject</Button>
                            </>
                          )}
                          {pr.status === "Rejected" && (
                            <button
                              className="text-blue-500 hover:bg-blue-50 p-1.5 rounded-full transition-colors"
                              title="แก้ไข"
                              onClick={() => handleEditClick(pr)}
                            >
                              <Edit size={14} />
                            </button>
                          )}
                          <button
                            className="text-red-500 hover:bg-red-50 p-1.5 rounded-full transition-colors"
                            onClick={() => {
                              openConfirm(
                                "ยืนยันการลบ",
                                "คุณต้องการลบรายการ PR นี้ใช่หรือไม่?",
                                async () => await deleteData("prs", pr.id),
                                "danger"
                              );
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {expandedPrRows[pr.id] && (
                        <tr className="bg-slate-50/50 relative z-[7]">
                          <td colSpan={10} className="p-4 border-b cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm ml-8">
                              <h5 className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-2">
                                <ShoppingCart size={14} /> รายการสินค้าใน PR:{" "}
                                {pr.prNo}
                              </h5>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-gray-100 text-gray-600 border-b">
                                  <tr>
                                    <th className="p-2 w-10 text-center">#</th>
                                    <th className="p-2">
                                      รายการสินค้า (Description)
                                    </th>
                                    <th className="p-2 text-right">จำนวน</th>
                                    <th className="p-2 text-right">ราคา/หน่วย</th>
                                    <th className="p-2 text-right">รวม</th>
                                    <th className="p-2 text-center">
                                      วันที่ต้องใช้
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {pr.items &&
                                    pr.items.map((it, idx) => (
                                      <tr key={idx} className="hover:bg-gray-50">
                                        <td className="p-2 text-center text-slate-400">
                                          {idx + 1}
                                        </td>
                                        <td className="p-2 font-medium text-slate-700">
                                          {it.description}
                                        </td>
                                        <td className="p-2 text-right">
                                          {it.quantity} {it.unit}
                                        </td>
                                        <td className="p-2 text-right">
                                          {formatCurrency(it.price)}
                                        </td>
                                        <td className="p-2 text-right font-semibold">
                                          {formatCurrency(it.quantity * it.price)}
                                        </td>
                                        <td className="p-2 text-center text-slate-500">
                                          {it.requiredDate}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </Card>
        {isPrRejectModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 text-red-600">
                ปฏิเสธ PR (Reject PR)
              </h3>
              <p className="text-sm text-slate-600 mb-3">
                PR No.: <span className="font-semibold text-slate-800">{selectedPrForReject?.prNo}</span>
              </p>
              <InputGroup label="เหตุผลที่ปฏิเสธ (Reject Reason)">
                <textarea
                  className="w-full border rounded p-2 h-24"
                  placeholder="กรุณาระบุเหตุผลที่ปฏิเสธ..."
                  value={prRejectReason}
                  onChange={(e) => setPrRejectReason(e.target.value)}
                />
              </InputGroup>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsPrRejectModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={handleRejectPrConfirm}
                  disabled={!prRejectReason.trim()}
                >
                  ยืนยันปฏิเสธ
                </Button>
              </div>
            </Card>
          </div>
        )}
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center z-50 p-2 md:p-4"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-full max-w-5xl h-[82vh] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              {/* Sticky Header - โทนอ่อนใช้งานภายในองค์กร */}
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-600 shrink-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-500 rounded-lg flex items-center justify-center">
                      <ClipboardList size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">
                        {editingPRId
                          ? "แก้ไขใบขอซื้อ (Edit PR)"
                          : "สร้างใบขอซื้อ (Create PR)"}
                      </h3>
                      <p className="text-slate-300 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบขอซื้อ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="text-slate-300 hover:text-white hover:bg-slate-500 p-2 rounded-lg transition-all duration-200"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/50">
                {/* Header Fields - Section 1: ข้อมูลใบขอซื้อ */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <FileText size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">ข้อมูลใบขอซื้อ</span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                      {/* Row 1: PR No. / ประเภท / Sub-Code */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Hash size={11} className="text-slate-500" /> PR No.
                        </label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-700 font-mono font-semibold"
                          value={headerData.prNo}
                          readOnly
                          placeholder="(auto)"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Tag size={11} className="text-slate-500" /> ประเภทการขอซื้อ
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                          value={headerData.purchaseType}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const codes = PURCHASE_TYPE_CODES[newType] || [];
                            const isEquipment = newType === PURCHASE_TYPE_EQUIPMENT;
                            const isRental = newType === PURCHASE_TYPE_RENTAL_LABEL;
                            const autoCode = codes.length === 1 && !isRental ? codes[0] : "";
                            const newSubCode = isEquipment ? "" : autoCode;
                            const newPrNo = isEquipment ? generatePrNo("", newType) : (newSubCode ? generatePrNo(newSubCode, newType) : "");
                            setHeaderData({
                              ...headerData,
                              purchaseType: newType,
                              subCode: newSubCode,
                              prNo: newPrNo,
                            });
                          }}
                        >
                          <option value="">-- เลือกประเภท --</option>
                          {PURCHASE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {getPurchaseTypeDisplayLabel(t)}
                            </option>
                          ))}
                        </select>
                      </div>
                      {headerData.purchaseType && headerData.purchaseType !== PURCHASE_TYPE_EQUIPMENT && (PURCHASE_TYPE_CODES[headerData.purchaseType] || []).length > 1 && (
                        <div className="col-span-2">
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                            <CircleDot size={11} className="text-slate-500" />
                            {headerData.purchaseType === PURCHASE_TYPE_RENTAL_LABEL ? "Type การเช่า" : "Sub-Code"}
                          </label>
                          <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                            value={headerData.subCode}
                            onChange={(e) => {
                              const newSubCode = e.target.value;
                              const newPrNo = generatePrNo(newSubCode, headerData.purchaseType);
                              setHeaderData({
                                ...headerData,
                                subCode: newSubCode,
                                prNo: newPrNo,
                              });
                            }}
                          >
                            <option value="">-- เลือก --</option>
                            {(PURCHASE_TYPE_CODES[headerData.purchaseType] || []).map((code) => (
                              <option key={code} value={code}>
                                {code}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Row 2: ผู้ขอซื้อ / อีเมล / สถานที่จัดส่ง */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <UserCircle size={11} className="text-slate-500" /> ผู้ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestor}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestor: e.target.value,
                              })
                            }
                          />
                          <UserCircle className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <AtSign size={11} className="text-slate-500" /> อีเมลผู้ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="email"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestorEmail}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestorEmail: e.target.value,
                              })
                            }
                            placeholder="example@cmg.co.th"
                          />
                          <Mail className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Building2 size={11} className="text-slate-500" /> สถานที่จัดส่ง
                        </label>
                        <div className="relative">
                          <select
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm bg-white hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all cursor-pointer"
                            value={headerData.deliveryLocation}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                deliveryLocation: e.target.value,
                              })
                            }
                          >
                            <option value="">-- เลือกสถานที่ --</option>
                            {DELIVERY_LOCATIONS.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          <MapPinned className="absolute left-3 top-2.5 text-slate-400 pointer-events-none" size={14} />
                        </div>
                      </div>

                      {/* Row 3: วันที่ขอซื้อ / ความเร่งด่วน / แนบไฟล์ */}
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Calendar size={11} className="text-slate-500" /> วันที่ขอซื้อ
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full border border-slate-200 rounded-lg px-3 py-2 pl-9 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                            value={headerData.requestDate}
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                requestDate: e.target.value,
                              })
                            }
                          />
                          <Calendar className="absolute left-3 top-2.5 text-slate-400" size={14} />
                        </div>
                      </div>
                      <div className="col-span-2 flex items-end pb-1">
                        <div>
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">
                            <Zap size={11} className="text-slate-500" /> ความเร่งด่วน
                          </label>
                          <div className="flex gap-2">
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Normal" ? "border-slate-400 bg-slate-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <input
                                type="radio"
                                name="urgency"
                                value="Normal"
                                checked={headerData.urgency === "Normal"}
                                onChange={(e) =>
                                  setHeaderData({
                                    ...headerData,
                                    urgency: e.target.value,
                                  })
                                }
                                className="hidden"
                              />
                              <CircleDot size={13} className={headerData.urgency === "Normal" ? "text-slate-600" : "text-slate-400"} />
                              <span className={`text-xs font-medium ${headerData.urgency === "Normal" ? "text-slate-700" : "text-slate-500"}`}>ปกติ</span>
                            </label>
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all duration-200 ${headerData.urgency === "Urgent" ? "border-red-300 bg-red-50" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                              <input
                                type="radio"
                                name="urgency"
                                value="Urgent"
                                checked={headerData.urgency === "Urgent"}
                                onChange={(e) =>
                                  setHeaderData({
                                    ...headerData,
                                    urgency: e.target.value,
                                  })
                                }
                                className="hidden"
                              />
                              <Flame size={13} className={headerData.urgency === "Urgent" ? "text-red-500" : "text-slate-400"} />
                              <span className={`text-xs font-semibold ${headerData.urgency === "Urgent" ? "text-red-600" : "text-slate-500"}`}>ด่วน</span>
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Paperclip size={11} className="text-slate-500" /> แนบไฟล์
                        </label>
                        <div className="flex items-center gap-3 w-full border border-dashed border-slate-200 rounded-lg px-4 py-2 bg-slate-50 hover:border-slate-300 hover:bg-slate-100/50 transition-all duration-200 group cursor-pointer">
                          <div className="w-8 h-8 bg-slate-200 group-hover:bg-slate-300 rounded-md flex items-center justify-center transition-colors">
                            <Upload size={14} className="text-slate-500 group-hover:text-slate-600 transition-colors" />
                          </div>
                          <input
                            type="file"
                            className="hidden"
                            id="pr-attachment"
                            onChange={(e) =>
                              setHeaderData({
                                ...headerData,
                                attachment: e.target.files?.[0] || null,
                              })
                            }
                          />
                          <label
                            htmlFor="pr-attachment"
                            className="flex-1 text-xs text-slate-600 cursor-pointer"
                          >
                            {headerData.attachment
                              ? headerData.attachment.name
                              : "คลิกเพื่อเลือกไฟล์แนบ (PDF, Image, Excel ฯลฯ)"}
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Header Fields - Section 2: เลือกรายการที่ Approve */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <Settings size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                      เลือกรายการที่ Approve
                    </span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-6 gap-x-4 gap-y-4">
                      <div className="col-span-3 md:col-span-2 lg:col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <DollarSign size={11} className="text-slate-500" /> Cost Code
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            className="w-full border border-dashed border-slate-300 rounded-lg px-3 py-2 pr-9 text-sm bg-slate-50 cursor-pointer font-medium text-slate-700 hover:border-slate-400 transition-all duration-200"
                            value={
                              headerData.costCode ? `${headerData.costCode}` : ""
                            }
                            placeholder="คลิกเพื่อเลือก"
                            readOnly
                            onClick={() =>
                              !editingPRId && setIsCostCodeModalOpen(true)
                            }
                            disabled={!!editingPRId}
                          />
                          <ListFilter className="absolute right-3 top-2.5 text-slate-500" size={14} />
                        </div>
                        {headerData.costCode && (() => {
                          const selectedBudget = headerData.selectedBudgetId
                            ? availableBudgets.find((b) => b.id === headerData.selectedBudgetId)
                            : availableBudgets.find((b) => b.code === headerData.costCode);
                          return selectedBudget ? (
                            <div className="flex items-center gap-1 mt-1.5 px-2 py-0.5 bg-slate-100 rounded-lg w-fit ml-auto">
                              <Wallet size={10} className="text-slate-500" />
                              <span className="text-[10px] text-slate-600 font-semibold">
                                คงเหลือ:{" "}
                                {formatCurrency(selectedBudget.remainingBalance)}
                              </span>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Line Items Entry */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                      <ShoppingCart size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                      {editingItemId ? "แก้ไขรายการสินค้า" : "เพิ่มรายการสินค้า"}
                    </span>
                    {editingItemId && (
                      <span className="ml-2 px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-medium rounded">กำลังแก้ไข</span>
                    )}
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-12 gap-3 items-end">
                      <div className="col-span-4">
                        <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <Package size={10} className="text-slate-500" /> รายละเอียดสินค้า
                        </label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all placeholder:text-slate-400"
                          placeholder="ชื่อสินค้า/บริการ"
                          value={newItem.description}
                          onChange={(e) =>
                            setNewItem({ ...newItem, description: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">หน่วย</label>
                        <input
                          type="text"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.unit}
                          onChange={(e) =>
                            setNewItem({ ...newItem, unit: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] font-bold text-slate-500 block mb-1 uppercase tracking-wider">จำนวน</label>
                        <input
                          type="number"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.quantity}
                          onChange={(e) =>
                            setNewItem({
                              ...newItem,
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <DollarSign size={10} className="text-slate-500" /> ราคา/หน่วย
                        </label>
                        <input
                          type="number"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.price}
                          onChange={(e) =>
                            setNewItem({
                              ...newItem,
                              price: Number(e.target.value),
                            })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 mb-1 uppercase tracking-wider">
                          <Calendar size={10} className="text-slate-500" /> วันที่ใช้
                        </label>
                        <input
                          type="date"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm hover:border-slate-300 focus:border-slate-400 focus:ring-1 focus:ring-slate-100 transition-all"
                          value={newItem.requiredDate}
                          onChange={(e) =>
                            setNewItem({ ...newItem, requiredDate: e.target.value })
                          }
                        />
                      </div>
                      <div className="col-span-2">
                        <Button
                          onClick={handleAddItem}
                          variant={editingItemId ? "warning" : "primary"}
                          className="w-full justify-center h-[38px] text-xs rounded-lg transition-all"
                        >
                          {editingItemId ? <Save size={14} /> : <Plus size={14} />}{" "}
                          {editingItemId ? "บันทึก" : "เพิ่ม"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-100 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-600 rounded-md flex items-center justify-center">
                        <FileSpreadsheet size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">รายการสินค้า</span>
                    </div>
                    {lineItems.length > 0 && (
                      <span className="px-2.5 py-0.5 bg-slate-600 text-white text-[10px] font-medium rounded">{lineItems.length} รายการ</span>
                    )}
                  </div>
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4 w-10 text-center">#</th>
                        <th className="py-2.5 px-4">รายละเอียด</th>
                        <th className="py-2.5 px-4 text-center">หน่วย</th>
                        <th className="py-2.5 px-4 text-right">จำนวน</th>
                        <th className="py-2.5 px-4 text-right">ราคา/หน่วย</th>
                        <th className="py-2.5 px-4 text-right">รวม</th>
                        <th className="py-2.5 px-4">วันที่ใช้</th>
                        <th className="py-2.5 px-4 text-center">เครื่องมือ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lineItems.length === 0 && (
                        <tr>
                          <td colSpan="8" className="py-10 text-center">
                            <div className="flex flex-col items-center gap-2 text-slate-300">
                              <ShoppingCart size={32} />
                              <span className="text-sm font-medium">ยังไม่มีรายการสินค้า</span>
                              <span className="text-xs">เพิ่มรายการสินค้าด้านบน</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {lineItems.map((item, index) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition-all duration-150 ${editingItemId === item.id ? "bg-slate-100 border-l-4 border-l-slate-400" : ""
                            }`}
                        >
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 rounded-full text-[11px] font-bold text-slate-600">{index + 1}</span>
                          </td>
                          <td className="py-2.5 px-4 font-semibold text-slate-800">{item.description}</td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="px-2 py-0.5 bg-slate-100 rounded-md text-[11px] font-medium">{item.unit}</span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-medium">{item.quantity}</td>
                          <td className="py-2.5 px-4 text-right text-slate-500">
                            {formatCurrency(item.price)}
                          </td>
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800">
                            {formatCurrency(item.quantity * item.price)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="flex items-center gap-1 text-slate-500">
                              <Calendar size={11} className="text-slate-400" />
                              {item.requiredDate}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <div className="flex justify-center gap-1">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="text-slate-600 hover:text-slate-800 p-1.5 hover:bg-slate-200 rounded transition-all"
                                title="แก้ไข"
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                className="text-red-500 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-all"
                                title="ลบ"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {lineItems.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-600">
                          <td colSpan="5" className="py-3 px-4 text-right text-xs text-slate-200 font-medium">
                            ยอดรวมทั้งสิ้น (Total Amount):
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-bold text-white tracking-wide">{formatCurrency(calculateTotal())}</span>
                          </td>
                          <td colSpan="2"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="flex justify-between items-center px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Info size={13} />
                  <span>กรุณากรอกข้อมูลให้ครบถ้วนก่อนบันทึก</span>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="px-5 rounded-lg"
                  >
                    <XCircle size={15} /> ยกเลิก
                  </Button>
                  <Button
                    onClick={handleSavePR}
                    className="px-8 rounded-lg bg-slate-600 hover:bg-slate-700 text-white transition-all"
                  >
                    <Save size={16} /> บันทึก PR
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* V.19: Cost Code Selection Modal */}
        {isCostCodeModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[150]"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-full max-w-5xl p-6 max-h-[85vh] overflow-hidden flex flex-col rounded-xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              <div className="flex justify-between items-center mb-4 pb-2 border-b">
                <h3 className="text-lg font-bold text-slate-800">
                  เลือกรายการงบประมาณ (Approved Budgets)
                </h3>
                <button
                  onClick={() => setIsCostCodeModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2">
                {Object.keys(groupedBudgets).length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    ไม่พบรายการงบประมาณที่อนุมัติแล้ว หรือ งบประมาณหมด
                  </div>
                ) : (
                  Object.keys(groupedBudgets)
                    .sort()
                    .map((cat, idx) => (
                      <motion.div
                        key={cat}
                        className="mb-6"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04, duration: 0.24, ease: [0.25, 0.46, 0.45, 0.94] }}
                      >
                        <h4 className="text-xs font-bold text-white bg-slate-600 px-3 py-1 rounded-t-md sticky top-0 z-10 shadow-sm flex items-center justify-between">
                          <span>
                            หมวด {cat}: {COST_CATEGORIES[cat]}
                          </span>
                          <span className="bg-slate-500 text-xs px-2 py-0.5 rounded-full">
                            {groupedBudgets[cat].length} รายการ
                          </span>
                        </h4>
                        <div className="border border-slate-200 border-t-0 rounded-b-md overflow-hidden">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b">
                              <tr>
                                <th className="py-1.5 px-3">Cost Code</th>
                                <th className="py-1.5 px-3">รายการ</th>
                                <th className="py-1.5 px-3 text-right">Budget</th>
                                <th className="py-1.5 px-3 text-right text-orange-600">
                                  Used
                                </th>
                                <th className="py-1.5 px-3 text-right text-green-600">
                                  Balance
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {groupedBudgets[cat].map((b) => (
                                <React.Fragment key={b.id}>
                                  <tr
                                    className={`transition-colors group ${(!b.subItems || b.subItems.length === 0) ? "cursor-pointer hover:bg-blue-50" : "hover:bg-blue-50"} ${selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) ? "bg-blue-50 ring-1 ring-blue-200 ring-inset" : ""}`}
                                    onClick={(e) => {
                                      if (b.subItems && b.subItems.length > 0) {
                                        toggleBudgetInModal(b.id);
                                      } else {
                                        handleToggleSubItem({
                                          id: `main-${b.id}`,
                                          description: b.description,
                                          quantity: 1,
                                          unit: "Lot",
                                          unitPrice: b.remainingBalance,
                                          amount: b.remainingBalance
                                        }, b.code, b.id);
                                      }
                                    }}
                                  >
                                    <td className="py-1.5 px-3 font-medium text-slate-700">
                                      <div className="flex items-center gap-2">
                                        {(!b.subItems || b.subItems.length === 0) && (
                                          <span className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center mr-2 transition-all ${selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                            {selectedSubItemsForPR.some((i) => i.id === `main-${b.id}`) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                          </span>
                                        )}
                                        {b.subItems && b.subItems.length > 0 && (
                                          <button
                                            type="button"
                                            className="text-slate-400 hover:text-blue-600"
                                            onClick={(e) => { e.stopPropagation(); toggleBudgetInModal(b.id); }}
                                          >
                                            {expandedBudgetIdsInModal[b.id]
                                              ? <img src="/arrow_collapse.png" alt="collapse" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                                              : <img src="/arrow_expand.png" alt="expand" style={{ width: 18, height: 18, objectFit: 'contain' }} />}
                                          </button>
                                        )}
                                        {b.code}
                                      </div>
                                    </td>
                                    <td className="py-1.5 px-3 text-slate-600">
                                      {b.description}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-slate-500">
                                      {formatCurrency(b.budgetAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-orange-600">
                                      {formatCurrency(b.usedAmount)}
                                    </td>
                                    <td className="py-1.5 px-3 text-right font-bold text-green-600">
                                      {formatCurrency(b.remainingBalance)}
                                    </td>
                                  </tr>
                                  {
                                    expandedBudgetIdsInModal[b.id] && b.subItems && b.subItems.map((sub, sIdx) => {
                                      // Calculate sub-item usage
                                      // Logic: Find PRs with this CostCode AND containing item with same description
                                      const subUsed = prs
                                        .filter(p => p.costCode === b.code && p.status !== 'Rejected')
                                        .reduce((sum, p) => {
                                          const matchItem = p.items?.find(i => i.description === sub.description); // Simple matching
                                          return sum + (matchItem ? (matchItem.quantity * matchItem.price) : 0);
                                        }, 0);

                                      const isFullyUsed = subUsed >= sub.amount; // Or tolerance?

                                      if (isFullyUsed) return null; // Hide if used

                                      return (
                                        <tr
                                          key={`${b.id}-sub-${sIdx}`}
                                          className={`bg-slate-50/50 ${sub.status !== "Approved" ? "opacity-60" : "cursor-pointer hover:bg-blue-50"} ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "bg-blue-50/80 ring-1 ring-blue-200 ring-inset" : ""}`}
                                          onClick={() => {
                                            if (sub.status === "Approved") handleToggleSubItem(sub, b.code, b.id);
                                          }}
                                        >
                                          <td className="py-1.5 px-3 pl-8 border-l-2 border-blue-100">
                                            <span className={`inline-flex w-4 h-4 rounded-full border-2 flex-shrink-0 items-center justify-center transition-all ${selectedSubItemsForPR.some((i) => i.id === sub.id) ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>
                                              {selectedSubItemsForPR.some((i) => i.id === sub.id) && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                                            </span>
                                          </td>
                                          <td className="py-1.5 px-3 text-slate-700">
                                            {sub.description}
                                            {sub.status !== "Approved" && (
                                              <span className="text-orange-500 ml-2 font-bold">(รอ MD อนุมัติ)</span>
                                            )}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-red-600">
                                            -{formatCurrency(sub.amount)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right text-orange-400">
                                            {formatCurrency(subUsed)}
                                          </td>
                                          <td className="py-1.5 px-3 text-right font-bold text-green-600">
                                            {formatCurrency(sub.amount - subUsed)}
                                          </td>
                                        </tr>
                                      );
                                    })
                                  }
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    ))
                )}
              </div>
              <div className="pt-4 mt-2 border-t flex justify-between items-center">
                <span className="text-sm text-slate-500">
                  {selectedSubItemsForPR.length > 0
                    ? <span className="text-blue-700 font-semibold">เลือกแล้ว: {selectedSubItemsForPR[0].description}</span>
                    : <span className="text-slate-400">กรุณาเลือก 1 รายการ</span>}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setIsCostCodeModalOpen(false)}
                  >
                    ยกเลิก
                  </Button>
                  {selectedSubItemsForPR.length > 0 && (
                    <Button onClick={handleAddSelectedSubItems}>
                      ยืนยันการเลือก
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    );
  };

  /* 
   * =========================================
   *  D. Purchase Order (PO) - New Implementation
   * =========================================
   */
  const POView = () => {
    // UI States
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
    const [isPrSelectModalOpen, setIsPrSelectModalOpen] = useState(false);
    const [tempSelectedPrIds, setTempSelectedPrIds] = useState<string[]>([]);
    const [expandedPoRows, setExpandedPoRows] = useState({});
    const [editingPoId, setEditingPoId] = useState(null);

    const togglePoRow = (id) => {
      setExpandedPoRows((prev) => ({
        ...prev,
        [id]: !prev[id],
      }));
    };

    // PO Type options
    const PO_TYPES = [
      { code: "CR", label: "CR — เครดิต" },
      { code: "SP", label: "SP — ผู้รับเหมา" },
      { code: "CC", label: "CC — คอนกรีต" },
      { code: "OL", label: "OL — น้ำมัน" },
      { code: "DC", label: "DC — ค่าแรง" },
      { code: "SM", label: "SM — เงินเดือน" },
      { code: "CA", label: "CA — เงินสด/เงินโอน" },
      { code: "RE", label: "RE — เช่า" },
      { code: "WF", label: "WF — รายจ่ายประจำ" },
    ];

    // Form Data State
    const [formData, setFormData] = useState({
      poNo: "",
      poType: "",
      vendorId: "",
      requiredDate: "",
      vatType: "ex-vat", // "inc-vat" | "ex-vat"
      selectedPrIds: [], // Array of PR IDs
      items: [], // Array of selected items with order details
      note: ""
    });

    // Auto-generate PO No.: PO{YY}{JXX}-{POT}{XXXX}
    // ตัวอย่าง: PO26J01-CC0001
    const generatePoNo = (poTypeCode?: string) => {
      if (!selectedProjectId) return "";
      const currentProject = projects.find((p) => p.id === selectedProjectId);
      if (!currentProject || !currentProject.jobNo) return "";
      const typeCode = poTypeCode || formData.poType;
      if (!typeCode) return "";

      // YY = 2 ตัวท้าย ค.ศ.
      const yy = String(new Date().getFullYear()).slice(-2);

      // JXX = Job No. ไม่มีขีด เช่น J-01 → J01
      const jobRaw = String(currentProject.jobNo).trim();
      const jxx = jobRaw.replace(/-/g, "");

      // prefix คือส่วนที่ใช้นับ running number ของ type นี้
      const prefix = `PO${yy}${jxx}-${typeCode}`;

      // นับ PO ที่มี prefix เดียวกัน (ไม่รวมที่กำลัง edit)
      const existingCount = pos.filter(
        (po) => po.poNo && po.poNo.startsWith(prefix)
      ).length;
      const nextNo = existingCount + 1;
      // XXXX = 4 หลัก 0001..9999
      const suffix = String(nextNo).padStart(4, "0");
      return `${prefix}${suffix}`;
    };

    // Vendor Modal Form State is handled in separate VendorView, 
    // but here we might need a quick add. For now, let's use the main Vendor list.
    // If user wants to add vendor, we can switch view or open a mini-modal.
    // Let's implement a mini vendor modal here for convenience as requested.
    const [newVendor, setNewVendor] = useState({ name: "", code: "", type: "", tel: "" });

    // Helper to calculate used quantity for a specific PR Item
    const getUsedQuantity = (prId, itemIndex) => {
      // Filter other POs that use this PR Item, excluding current editing PO (if any - not impl yet)
      const relevantPOs = pos.filter(po => po.status !== "Rejected");
      let used = 0;
      relevantPOs.forEach(po => {
        if (po.items) {
          po.items.forEach(item => {
            if (item.prId === prId && item.prItemIndex === itemIndex) {
              used += Number(item.quantity) || 0;
            }
          });
        }
      });
      return used;
    };

    // Filter PRs that are Approved and belong to this project
    const approvedPRs = useMemo(() => {
      return prs.filter((pr) => {
        // Basic filtering
        if (pr.projectId !== selectedProjectId) return false;
        if (pr.status !== "Approved" && pr.status !== "PO Issued") return false;

        // Hiding fully ordered PRs
        if (pr.items && pr.items.length > 0) {
          const allItemsUsed = pr.items.every((item, idx) => {
            const used = getUsedQuantity(pr.id, idx);
            // Use tolerance for float comparison just in case, though usually int
            return used >= (item.quantity - 0.01);
          });
          if (allItemsUsed) return false;
        }
        return true;
      });
    }, [prs, selectedProjectId, pos]);

    // Handle toggling a PR selection
    const handlePrToggle = (prId) => {
      const currentIds = formData.selectedPrIds;
      if (currentIds.includes(prId)) {
        // Deselect: Remove PR and its items
        setFormData(prev => ({
          ...prev,
          selectedPrIds: currentIds.filter(id => id !== prId),
          items: prev.items.filter(item => item.prId !== prId)
        }));
      } else {
        // Select: Add PR
        setFormData(prev => ({
          ...prev,
          selectedPrIds: [...currentIds, prId]
        }));
      }
    };

    // Derived list of available items from selected PRs
    const availableItems = useMemo(() => {
      const items = [];
      formData.selectedPrIds.forEach(prId => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (pr && pr.items) {
          pr.items.forEach((item, idx) => {
            const used = getUsedQuantity(pr.id, idx);
            const remaining = item.quantity - used;
            if (remaining > 0) {
              items.push({
                prId: pr.id,
                prNo: pr.prNo,
                prDescription: budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-",
                prItemIndex: idx,
                materialNo: item.materialNo || "",
                description: item.description,
                unit: item.unit,
                originalQty: item.quantity,
                usedQty: used,
                remainingQty: remaining,
                costCode: pr.costCode,
                orderQty: remaining,
                price: item.price,
                amount: remaining * item.price
              });
            }
          });
        }
      });
      return items;
    }, [formData.selectedPrIds, approvedPRs, pos, budgets]);

    // คำนวณยอดรวม PR ที่เลือกทั้งหมด (สำหรับ validation Grand Total)
    const selectedPrsTotalAmount = useMemo(() => {
      return formData.selectedPrIds.reduce((sum, prId) => {
        const pr = approvedPRs.find(p => p.id === prId);
        if (!pr || !pr.items) return sum;
        return sum + pr.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0);
      }, 0);
    }, [formData.selectedPrIds, approvedPRs]);

    // Handle Item Checkbox (Include in PO)
    const handleItemToggle = (itemData) => {
      const exists = formData.items.find(i => i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex);
      if (exists) {
        // Remove
        setFormData(prev => ({
          ...prev,
          items: prev.items.filter(i => !(i.prId === itemData.prId && i.prItemIndex === itemData.prItemIndex))
        }));
      } else {
        // Add
        setFormData(prev => ({
          ...prev,
          items: [...prev.items, {
            prId: itemData.prId,
            prItemIndex: itemData.prItemIndex,
            materialNo: itemData.materialNo || "",
            description: itemData.description,
            prDescription: itemData.prDescription,
            remainingQty: itemData.remainingQty,
            unit: itemData.unit,
            quantity: itemData.orderQty,
            price: itemData.price,
            amount: itemData.amount,
            costCode: itemData.costCode
          }]
        }));
      }
    };

    // Handle Item Detail Change
    const handleItemChange = (prId, prItemIndex, field, value) => {
      setFormData(prev => ({
        ...prev,
        items: prev.items.map(item => {
          if (item.prId === prId && item.prItemIndex === prItemIndex) {
            const updates = { ...item, [field]: value };
            // Recalculate amount if qty or price changes
            if (field === 'quantity' || field === 'price') {
              updates.amount = Number(updates.quantity) * Number(updates.price);
            }
            return updates;
          }
          return item;
        })
      }));
    };

    const calculateTotals = () => {
      const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
      let vat = 0;
      let total = 0;
      if (formData.vatType === "inc-vat") {
        // Price includes VAT
        // Base = Total / 1.07
        // VAT = Total - Base
        // logic: The amount in line items is "Gross"
        total = subtotal;
      } else {
        // Ex-VAT
        vat = subtotal * 0.07;
        total = subtotal + vat;
      }
      return { subtotal, vat, total };
    };

    const handleSavePO = async () => {
      if (!formData.poType) {
        return showAlert("ข้อมูลไม่ครบ", "กรุณาเลือก PO Type ก่อน", "warning");
      }
      if (!formData.poNo || !formData.vendorId || formData.items.length === 0) {
        return showAlert("ข้อมูลไม่ครบ", "กรุณาระบุ PO No., Vendor, และเลือกรายการสินค้าอย่างน้อย 1 รายการ", "warning");
      }

      const totals = calculateTotals();

      // ตรวจสอบ Grand Total ต้องไม่เกินยอดรวมของ PR ที่เลือก
      if (totals.total > selectedPrsTotalAmount * 1.001) {
        return showAlert(
          "ยอดเกิน PR",
          `Grand Total (${formatCurrency(totals.total)}) ต้องไม่เกินยอดรวมของ PR ที่เลือก (${formatCurrency(selectedPrsTotalAmount)})`,
          "warning"
        );
      }

      const basePayload = {
        poNo: formData.poNo,
        poType: formData.poType,
        projectId: selectedProjectId,
        vendorId: formData.vendorId,
        requiredDate: formData.requiredDate,
        vatType: formData.vatType,
        items: formData.items,
        amount: totals.total,
        status: "Pending PCM",
        createdDate: new Date().toISOString(),
        rejectReason: "",
      };

      let success = false;

      if (editingPoId) {
        // แก้ไข PO ที่ถูก Reject แล้วส่งอนุมัติใหม่
        success = await updateData("pos", editingPoId, basePayload);
      } else {
        // สร้าง PO ใหม่
        success = await addData("pos", basePayload);
        if (success) {
          // Update PR status to "PO Issued" for all involved PRs
          // Note: Ideally, check if PR is *fully* closed, but "PO Issued" is good enough
          const uniquePrIds = [...new Set(formData.items.map(i => i.prId))];
          for (const prId of uniquePrIds) {
            await updateData("prs", prId, { status: "PO Issued" });
          }
        }
      }

      if (success) {
        setIsModalOpen(false);
        setIsFullScreenModalOpen(false);
        setEditingPoId(null);
        setFormData({
          poNo: "", poType: "", vendorId: "", requiredDate: "", vatType: "ex-vat", selectedPrIds: [], items: [], note: ""
        });
        showAlert("สำเร็จ", "บันทึกใบสั่งซื้อ PDF (PO) เรียบร้อย", "success");
      }
    };

    // Quick Add Vendor
    const handleQuickAddVendor = async () => {
      if (!newVendor.name) return;
      const payload = { ...newVendor, code: newVendor.code || "AUTO", type: newVendor.type || "General" };
      const success = await addData("vendors", payload);
      if (success) {
        setIsVendorModalOpen(false);
        setNewVendor({ name: "", code: "", type: "", tel: "" });
        // Ideally select the new vendor automatically, but refetch might delay. 
        // Simplified: User selects from list.
        showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
      }
    }

    const handleAction = async (poId, action, reason = "") => {
      const po = pos.find(p => p.id === poId);
      if (!po) return;

      let newStatus = po.status;
      if (action === "reject") {
        await updateData("pos", poId, { status: "Rejected", rejectReason: reason });
        showAlert("ปฏิเสธ", "PO ถูกปฏิเสธแล้ว", "error");
        return;
      }

      // Approve Flow
      if (po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator" /*Testing*/)) {
        newStatus = "Pending GM";
      } else if (po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator")) {
        newStatus = "Approved";
      }

      if (newStatus !== po.status) {
        await updateData("pos", poId, { status: newStatus, rejectReason: "" });
        showAlert("อนุมัติ", `เลื่อนสถานะเป็น ${newStatus}`, "success");
      }
    };

    // For Reject Modal
    const [rejectPoId, setRejectPoId] = useState(null);
    const [rejectReason, setRejectReason] = useState("");

    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">D. Purchase Order (PO)</h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          />
          <Button
            onClick={() => {
              setEditingPoId(null);
              setFormData({
                poNo: "",
                poType: "",
                vendorId: "",
                requiredDate: "",
                vatType: "ex-vat",
                selectedPrIds: [],
                items: [],
                note: "",
              });
              setIsModalOpen(true);
              setIsFullScreenModalOpen(true);
            }}
            variant="warning"
          >
            <Plus size={14} /> สร้างใบสั่งซื้อ (PO)
          </Button>
        </div>

        <div className="bg-orange-50 p-3 rounded-md border border-orange-100 text-xs text-orange-800 mb-4 flex items-center gap-2">
          <Info size={16} />
          <strong>Flow การอนุมัติ PO:</strong> Procurement (สร้าง) → Pending PCM → Pending GM → Approved
        </div>

        <Card>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <th className="py-2 px-3">PO No.</th>
                <th className="py-2 px-3 text-center">Type</th>
                <th className="py-2 px-3">Ref PR No.</th>
                <th className="py-2 px-3">Description PR</th>
                <th className="py-2 px-3">Vendor</th>
                <th className="py-2 px-3 text-center">Item</th>
                <th className="py-2 px-3 text-right">Amount</th>
                <th className="py-2 px-3 text-center">Status</th>
                <th className="py-2 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pos
                .filter((po) => po.projectId === selectedProjectId)
                .map((po) => {
                  const vendor = vendors.find((v) => v.id === po.vendorId);
                  // Count PRs and get details
                  const prIds = po.items ? [...new Set(po.items.map(i => i.prId))] : (po.prRefId ? [po.prRefId] : []);
                  const prNos = prIds.map(id => prs.find(p => p.id === id)?.prNo || "-").join(", ");

                  // Description: Use first item description + count if multiple
                  const firstDesc = po.items && po.items.length > 0 ? po.items[0].description : "-";
                  const descSummary = po.items && po.items.length > 1 ? `${firstDesc} (+${po.items.length - 1})` : firstDesc;

                  return (
                    <React.Fragment key={po.id}>
                      <tr
                        className="hover:bg-blue-50 cursor-pointer transition-colors border-b odd:bg-white even:bg-slate-50"
                        onClick={() => togglePoRow(po.id)}
                      >
                        <td className="py-2 px-3 font-medium text-blue-700" title={po.poNo}><span className="cell-text">{po.poNo}</span></td>
                        <td className="py-2 px-3 text-center">
                          {po.poType && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 whitespace-nowrap">
                              {po.poType}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-xs" title={prNos}><span className="cell-text">{prNos}</span></td>
                        <td className="py-2 px-3 text-xs text-slate-600" title={descSummary}><span className="cell-text">{descSummary}</span></td>
                        <td className="py-2 px-3" title={vendor?.name || "-"}><span className="cell-text">{vendor?.name || "-"}</span></td>
                        <td className="py-2 px-3 text-center">{po.items ? po.items.length : 1}</td>
                        <td className="py-2 px-3 text-right font-semibold">{formatCurrency(po.amount)}</td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex flex-col items-center">
                            <Badge status={po.status} />
                            {po.rejectReason && (
                              <span className="text-[10px] text-red-500 mt-1 max-w-[100px] truncate" title={po.rejectReason}>
                                {po.rejectReason}
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          className="py-2 px-3 text-right flex justify-end gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Approval Buttons */}
                          {po.status === "Pending PCM" && (userRole === "PCM" || userRole === "Administrator") && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>PCM Approve</Button>
                              <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>
                            </>
                          )}
                          {po.status === "Pending GM" && (userRole === "GM" || userRole === "Administrator") && (
                            <>
                              <Button variant="success" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => handleAction(po.id, "approve")}>GM Approve</Button>
                              <Button variant="danger" size="sm" className="px-2 py-0.5 text-[10px] whitespace-nowrap" onClick={() => { setRejectPoId(po.id); setRejectReason(""); }}>Reject</Button>
                            </>
                          )}
                          {po.status === "Rejected" && (userRole === "Procurement" || userRole === "Administrator") && (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="px-2 py-0.5 text-[10px]"
                              onClick={() => {
                                // เตรียมฟอร์มสำหรับแก้ไข PO ที่ถูก Reject
                                const prIdsFromItems = po.items ? [...new Set(po.items.map(i => i.prId))] : (po.prRefId ? [po.prRefId] : []);
                                setFormData({
                                  poNo: po.poNo || "",
                                  poType: po.poType || "",
                                  vendorId: po.vendorId || "",
                                  requiredDate: po.requiredDate || "",
                                  vatType: po.vatType || "ex-vat",
                                  selectedPrIds: prIdsFromItems,
                                  items: po.items || [],
                                  note: po.note || "",
                                });
                                setEditingPoId(po.id);
                                setIsModalOpen(true);
                                setIsFullScreenModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          )}

                          <button
                            className="text-red-500 hover:text-red-700 p-1"
                            onClick={() => {
                              openConfirm("ยืนยันการลบ", "คุณต้องการลบ PO นี้ใช่หรือไม่?", async () => await deleteData("pos", po.id), "danger");
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {expandedPoRows[po.id] && (
                        <tr className="bg-slate-50/50">
                          <td colSpan={9} className="p-4 border-b cursor-default" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-sm ml-8">
                              <h5 className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-2">
                                <ShoppingCart size={14} /> รายการสั่งซื้อใน PO: {po.poNo}
                              </h5>
                              <div className="flex justify-between items-center text-[11px] text-slate-500 mb-2">
                                <div>
                                  Vendor:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {vendor?.name || "-"}
                                  </span>
                                </div>
                                <div>
                                  วันรับของ:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {po.requiredDate || "-"}
                                  </span>
                                </div>
                              </div>
                              <table className="w-full text-xs text-left">
                                <thead className="bg-orange-50 text-orange-800 border-b border-orange-100">
                                  <tr>
                                    <th className="p-2 w-10 text-center">#</th>
                                    <th className="p-2">รายการสินค้า (Description)</th>
                                    <th className="p-2 text-right">จำนวน</th>
                                    <th className="p-2 text-right">ราคา/หน่วย</th>
                                    <th className="p-2 text-right">รวม</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {po.items && po.items.map((it, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50">
                                      <td className="p-2 text-center text-slate-400">{idx + 1}</td>
                                      <td className="p-2 font-medium text-slate-700">{it.description}</td>
                                      <td className="p-2 text-right">{it.quantity} {it.unit}</td>
                                      <td className="p-2 text-right">{formatCurrency(it.price)}</td>
                                      <td className="p-2 text-right font-semibold">{formatCurrency(it.quantity * it.price)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
            </tbody>
          </table>
        </Card>

        {/* Create PO Modal */}
        {isModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center z-50 p-2 md:p-4"
            initial="hidden"
            animate="visible"
            variants={modalOverlayVariants}
            transition={overlayTransition}
          >
            <motion.div
              className="w-full max-w-5xl h-[82vh] max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
              initial="hidden"
              animate="visible"
              variants={modalContentVariants}
              transition={modalTransition}
            >
              {/* Sticky Header - โทนแดง ขาว ดำ */}
              <div className="relative px-6 py-4 border-b border-black/10 bg-gradient-to-r from-red-600 via-red-700 to-red-900 shrink-0 overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvc3ZnPg==')] opacity-50"></div>
                <div className="relative flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center shadow-lg shadow-black/20 border border-white/30">
                      <ShoppingCart size={22} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white tracking-wide">สร้างใบสั่งซื้อ (Create PO)</h3>
                      <p className="text-white/80 text-xs mt-0.5">กรอกข้อมูลให้ครบถ้วนเพื่อสร้างใบสั่งซื้อ</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setIsModalOpen(false);
                      setIsFullScreenModalOpen(false);
                    }}
                    className="text-white/70 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all duration-200 border border-transparent hover:border-white/30"
                  >
                    <XCircle size={22} />
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-gradient-to-b from-slate-50/50 to-white">
                {/* 1. ข้อมูลส่วนหัว (Header) - โทนแดงขาวดำ */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-red-50 to-red-100/80 border-b border-red-200">
                    <div className="w-6 h-6 bg-red-600 rounded-lg flex items-center justify-center">
                      <FileText size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold text-red-900 tracking-wide uppercase">1. ข้อมูลส่วนหัว (Header)</span>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-4 gap-x-4 gap-y-4">
                      {/* PO Type */}
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Tag size={11} className="text-red-500" /> PO Type
                        </label>
                        <select
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all cursor-pointer text-slate-900"
                          value={formData.poType}
                          disabled={!!editingPoId}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const newPoNo = newType ? generatePoNo(newType) : "";
                            setFormData({ ...formData, poType: newType, poNo: newPoNo });
                          }}
                        >
                          <option value="">-- เลือก PO Type --</option>
                          {PO_TYPES.map((t) => (
                            <option key={t.code} value={t.code}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* PO No. (Auto) */}
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Hash size={11} className="text-red-500" /> PO No. (เลขที่ใบสั่งซื้อ)
                        </label>
                        <input
                          type="text"
                          readOnly
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-100 text-slate-700 font-mono font-semibold cursor-default"
                          placeholder={formData.poType ? "(Auto)" : "เลือก PO Type ก่อน"}
                          value={formData.poNo}
                        />
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          รูปแบบ: PO{String(new Date().getFullYear()).slice(-2)}JXX-{formData.poType || "TYPE"}XXXX
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">
                          <Building2 size={11} className="text-red-500" /> Vendor (ผู้ขาย)
                        </label>
                        <div className="flex gap-2">
                          <div className="flex-1 relative">
                            <select
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 pl-9 text-sm bg-white hover:border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100 transition-all cursor-pointer text-slate-900"
                              value={formData.vendorId}
                              onChange={e => setFormData({ ...formData, vendorId: e.target.value })}
                            >
                              <option value="">-- เลือก Vendor --</option>
                              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            <Building2 className="absolute left-3 top-2.5 text-red-400 pointer-events-none" size={14} />
                          </div>
                          <Button variant="secondary" onClick={() => setIsVendorModalOpen(true)} className="px-3 rounded-xl shrink-0" title="เพิ่ม Vendor">
                            <Plus size={16} />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-1.5 uppercase tracking-wider">
                          <Calendar size={11} className="text-emerald-500" /> กำหนดส่งของ
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 pl-9 text-sm hover:border-emerald-300 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
                            value={formData.requiredDate}
                            onChange={e => setFormData({ ...formData, requiredDate: e.target.value })}
                          />
                          <Calendar className="absolute left-3 top-2.5 text-emerald-400 pointer-events-none" size={14} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. เลือกใบขอซื้อ (Select PRs) */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                        <ClipboardList size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">2. เลือกใบขอซื้อ (Select PRs)</span>
                    </div>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-700 transition-all shadow-sm"
                      onClick={() => {
                        setTempSelectedPrIds([...formData.selectedPrIds]);
                        setIsPrSelectModalOpen(true);
                      }}
                    >
                      <ListFilter size={13} /> เลือก PR
                    </button>
                  </div>
                  <div className="p-5">
                    {formData.selectedPrIds.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                        <ClipboardList size={32} className="mb-2 opacity-40" />
                        <p className="text-sm text-slate-500">ยังไม่ได้เลือกใบขอซื้อ</p>
                        <p className="text-xs mt-0.5">กดปุ่ม "เลือก PR" เพื่อเลือกใบขอซื้อที่อนุมัติแล้ว</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {formData.selectedPrIds.map(prId => {
                          const pr = approvedPRs.find(p => p.id === prId);
                          if (!pr) return null;
                          return (
                            <div key={prId} className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs">
                              <Hash size={10} className="text-red-500 shrink-0" />
                              <span className="font-semibold text-slate-800">{pr.prNo}</span>
                              <span className="text-slate-500">{pr.requestor}</span>
                              <button
                                type="button"
                                className="ml-1 text-red-400 hover:text-red-600"
                                onClick={() => handlePrToggle(prId)}
                              >
                                <XCircle size={13} />
                              </button>
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          className="flex items-center gap-1 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition-all"
                          onClick={() => {
                            setTempSelectedPrIds([...formData.selectedPrIds]);
                            setIsPrSelectModalOpen(true);
                          }}
                        >
                          <Plus size={12} /> เพิ่ม/แก้ไข
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. เลือกรายการสินค้า (Select Items) - โทนแดงขาวดำ */}
                {formData.selectedPrIds.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-slate-100 to-slate-200/80 border-b border-slate-300">
                      <div className="w-6 h-6 bg-slate-800 rounded-lg flex items-center justify-center">
                        <Package size={13} className="text-white" />
                      </div>
                      <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">3. เลือกรายการสินค้า (Select Items)</span>
                    </div>
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full text-left text-xs rounded-xl overflow-hidden border border-slate-200">
                        <thead className="bg-slate-100 font-semibold text-slate-800 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 w-10 text-center">เลือก</th>
                            <th className="p-2.5 w-24">PR No.</th>
                            <th className="p-2.5 w-28">Material No.</th>
                            <th className="p-2.5">Description</th>
                            <th className="p-2.5">รายการ</th>
                            <th className="p-2.5 w-28">เหลือ (QTY)</th>
                            <th className="p-2.5 w-24">สั่งซื้อ (QTY)</th>
                            <th className="p-2.5 w-28">ราคา/หน่วย</th>
                            <th className="p-2.5 text-right w-24">รวม</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {availableItems.map((item) => {
                            const isSelected = formData.items.some(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex);
                            const selectedData = formData.items.find(i => i.prId === item.prId && i.prItemIndex === item.prItemIndex) || item;
                            const inputCls = "w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white";

                            return (
                              <tr key={`${item.prId}-${item.prItemIndex}`} className={isSelected ? "bg-white hover:bg-slate-50/30" : "bg-slate-50/60 opacity-60"}>
                                <td className="p-2.5 text-center">
                                  <input type="checkbox" checked={isSelected} onChange={() => handleItemToggle(item)} className="rounded border-slate-300 cursor-pointer" />
                                </td>
                                <td className="p-2.5 font-medium text-slate-800 whitespace-nowrap">
                                  {item.prNo}
                                </td>
                                {/* Material No. — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    className={inputCls}
                                    disabled={!isSelected}
                                    value={selectedData.materialNo ?? ""}
                                    placeholder="ระบุ Material No."
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "materialNo", e.target.value)}
                                  />
                                </td>
                                {/* Description (prDescription) — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    className={inputCls}
                                    disabled={!isSelected}
                                    value={selectedData.prDescription ?? item.prDescription}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "prDescription", e.target.value)}
                                  />
                                </td>
                                {/* รายการ (description) — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="text"
                                    className={inputCls}
                                    disabled={!isSelected}
                                    value={selectedData.description}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "description", e.target.value)}
                                  />
                                </td>
                                {/* เหลือ (QTY) — editable */}
                                <td className="p-2.5">
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      className={`${inputCls} text-right`}
                                      disabled={!isSelected}
                                      value={selectedData.remainingQty ?? item.remainingQty}
                                      onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "remainingQty", e.target.value)}
                                    />
                                    <span className="text-slate-400 text-[10px] shrink-0">{item.unit}</span>
                                  </div>
                                </td>
                                {/* สั่งซื้อ (QTY) — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.quantity}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "quantity", e.target.value)}
                                  />
                                </td>
                                {/* ราคา/หน่วย — editable */}
                                <td className="p-2.5">
                                  <input
                                    type="number"
                                    className={`${inputCls} text-right`}
                                    disabled={!isSelected}
                                    value={selectedData.price}
                                    onChange={(e) => handleItemChange(item.prId, item.prItemIndex, "price", e.target.value)}
                                  />
                                </td>
                                <td className="p-2.5 text-right font-bold text-slate-800 whitespace-nowrap">
                                  {formatCurrency(Number(selectedData.quantity) * Number(selectedData.price))}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer / Calculation - โทนแดงขาวดำ */}
              <div className="bg-gradient-to-r from-slate-100 to-slate-200/80 border-t border-slate-300 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                    <DollarSign size={16} className="text-slate-600" /> ประเภทภาษี:
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-xl border-2 transition-all duration-200 border-slate-300 hover:border-red-400 hover:bg-red-50/50">
                    <input type="radio" name="vat" value="ex-vat" checked={formData.vatType === "ex-vat"} onChange={() => setFormData({ ...formData, vatType: "ex-vat" })} className="text-red-600" />
                    <span className={formData.vatType === "ex-vat" ? "font-semibold text-red-700" : "text-slate-700"}>Ex-Vat (แยกภาษี)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-sm px-3 py-1.5 rounded-xl border-2 transition-all duration-200 border-slate-300 hover:border-red-400 hover:bg-red-50/50">
                    <input type="radio" name="vat" value="inc-vat" checked={formData.vatType === "inc-vat"} onChange={() => setFormData({ ...formData, vatType: "inc-vat" })} className="text-red-600" />
                    <span className={formData.vatType === "inc-vat" ? "font-semibold text-red-700" : "text-slate-700"}>Inc-Vat (รวมภาษี)</span>
                  </label>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    {selectedPrsTotalAmount > 0 && (
                      <div className="text-xs text-slate-500 mb-1">
                        ยอดรวม PR ที่เลือก:{" "}
                        <span className="font-semibold text-slate-700">{formatCurrency(selectedPrsTotalAmount)}</span>
                      </div>
                    )}
                    <div className="text-sm text-slate-600">ยอดรวม: {formatCurrency(calculateTotals().subtotal)}</div>
                    <div className="text-sm text-slate-600">VAT (7%): {formatCurrency(calculateTotals().vat)}</div>
                    <div className={`text-xl font-bold mt-0.5 flex items-center gap-1 ${calculateTotals().total > selectedPrsTotalAmount * 1.001 ? "text-red-600" : "text-slate-900"}`}>
                      <DollarSign size={18} className={calculateTotals().total > selectedPrsTotalAmount * 1.001 ? "text-red-600" : "text-red-500"} />
                      Grand Total: {formatCurrency(calculateTotals().total)}
                      {calculateTotals().total > selectedPrsTotalAmount * 1.001 && (
                        <span className="text-xs font-normal text-red-500 ml-1">(เกิน PR!)</span>
                      )}
                    </div>
                  </div>
                  <Button size="lg" className="px-8 shadow-lg shadow-red-200 rounded-xl flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white" onClick={handleSavePO}>
                    <Save size={18} /> บันทึก PO
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* PR Selection Modal */}
        {isPrSelectModalOpen && (
          <motion.div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center">
                    <ClipboardList size={18} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">เลือกใบขอซื้อ (Select PRs)</h3>
                    <p className="text-white/70 text-xs mt-0.5">สามารถเลือกได้หลายรายการ</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsPrSelectModalOpen(false)}
                  className="text-white/60 hover:text-white hover:bg-white/20 p-2 rounded-xl transition-all"
                >
                  <XCircle size={20} />
                </button>
              </div>

              {/* Content — Table View */}
              <div className="flex-1 overflow-y-auto">
                {approvedPRs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                    <ClipboardList size={40} className="mb-3 opacity-40" />
                    <p className="font-medium text-slate-500">ไม่มีใบขอซื้อที่อนุมัติแล้ว</p>
                    <p className="text-xs mt-1">เมื่อมีใบขอซื้อที่ได้รับการอนุมัติ จะแสดงในส่วนนี้</p>
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 w-12 text-center">
                          <input
                            type="checkbox"
                            className="rounded border-slate-300 cursor-pointer"
                            checked={tempSelectedPrIds.length === approvedPRs.length && approvedPRs.length > 0}
                            onChange={(e) => {
                              setTempSelectedPrIds(e.target.checked ? approvedPRs.map(p => p.id) : []);
                            }}
                            title="เลือกทั้งหมด"
                          />
                        </th>
                        <th className="px-4 py-3">PR No.</th>
                        <th className="px-4 py-3">Cost Code</th>
                        <th className="px-4 py-3">รายการงบ</th>
                        <th className="px-4 py-3">ผู้ขอซื้อ</th>
                        <th className="px-4 py-3">วันที่</th>
                        <th className="px-4 py-3 text-center">สินค้า</th>
                        <th className="px-4 py-3 text-right">ยอดรวม</th>
                        <th className="px-4 py-3 text-center">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {approvedPRs.map(pr => {
                        const isSelected = tempSelectedPrIds.includes(pr.id);
                        const prDesc = budgets.find(b => b.code === pr.costCode && b.projectId === pr.projectId)?.description || "-";
                        const totalAmt = pr.items?.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0) || 0;
                        return (
                          <tr
                            key={pr.id}
                            className={`cursor-pointer select-none transition-colors ${isSelected ? "bg-slate-700/10 hover:bg-slate-700/15" : "hover:bg-slate-50"}`}
                            onClick={() => {
                              setTempSelectedPrIds(prev =>
                                prev.includes(pr.id) ? prev.filter(id => id !== pr.id) : [...prev, pr.id]
                              );
                            }}
                          >
                            <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                className="rounded border-slate-300 cursor-pointer"
                                checked={isSelected}
                                onChange={() => {
                                  setTempSelectedPrIds(prev =>
                                    prev.includes(pr.id) ? prev.filter(id => id !== pr.id) : [...prev, pr.id]
                                  );
                                }}
                              />
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-800">{pr.prNo}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{pr.costCode}</span>
                            </td>
                            <td className="px-4 py-3 max-w-[220px]">
                              <span className="block truncate text-slate-600" title={prDesc}>{prDesc}</span>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestor}</td>
                            <td className="px-4 py-3 text-slate-500">{pr.requestDate}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold">{pr.items?.length || 0}</span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-slate-800">{formatCurrency(totalAmt)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">{pr.status}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                <span className="text-sm text-slate-600">
                  {tempSelectedPrIds.length > 0
                    ? <span className="font-semibold text-slate-800">เลือกแล้ว {tempSelectedPrIds.length} ใบ</span>
                    : <span className="text-slate-400">ยังไม่ได้เลือก</span>}
                </span>
                <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setIsPrSelectModalOpen(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    className="bg-slate-800 hover:bg-slate-700 text-white px-6 rounded-xl"
                    onClick={() => {
                      // Remove items from PRs that are no longer selected
                      const removedPrIds = formData.selectedPrIds.filter(id => !tempSelectedPrIds.includes(id));
                      setFormData(prev => ({
                        ...prev,
                        selectedPrIds: tempSelectedPrIds,
                        items: prev.items.filter(item => !removedPrIds.includes(item.prId)),
                      }));
                      setIsPrSelectModalOpen(false);
                    }}
                  >
                    ยืนยันการเลือก ({tempSelectedPrIds.length} ใบ)
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Quick Add Vendor Modal */}
        {isVendorModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <Card className="w-full max-w-sm p-6">
              <h3 className="font-bold mb-4">เพิ่ม Vendor ด่วน</h3>
              <div className="space-y-3">
                <InputGroup label="ชื่อร้านค้า/บริษัท"><input type="text" className="w-full border p-2 rounded text-sm" value={newVendor.name} onChange={e => setNewVendor({ ...newVendor, name: e.target.value })} /></InputGroup>
                <InputGroup label="เบอร์โทร"><input type="text" className="w-full border p-2 rounded text-sm" value={newVendor.tel} onChange={e => setNewVendor({ ...newVendor, tel: e.target.value })} /></InputGroup>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setIsVendorModalOpen(false)}>ยกเลิก</Button>
                <Button onClick={handleQuickAddVendor}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}

        {/* Reject Modal */}
        {rejectPoId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]">
            <Card className="w-full max-w-sm p-6">
              <h3 className="font-bold text-red-600 mb-4">ระบุเหตุผลการปฏิเสธ</h3>
              <textarea className="w-full border p-2 rounded h-24 text-sm" placeholder="เหตุผล..." value={rejectReason} onChange={e => setRejectReason(e.target.value)}></textarea>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setRejectPoId(null)}>ยกเลิก</Button>
                <Button variant="danger" onClick={() => { handleAction(rejectPoId, "reject", rejectReason); setRejectPoId(null); }}>ยืนยัน</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const VendorView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
      code: "",
      name: "",
      type: "",
      email: "",
      tel: "",
      note: "",
    });
    const handleAdd = async () => {
      const success = await addData("vendors", formData);
      if (success) {
        setIsModalOpen(false);
        setFormData({
          code: "",
          name: "",
          type: "",
          email: "",
          tel: "",
          note: "",
        });
        showAlert("สำเร็จ", "เพิ่ม Vendor เรียบร้อย", "success");
      }
    };
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-slate-800">
            E. ข้อมูล Vendor/Supplier
          </h2>
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={14} /> เพิ่ม Vendor
          </Button>
        </div>
        <Card>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <th className="py-2 px-3">Code</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Contact</th>
                <th className="py-2 px-3">Note</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50">
                  <td className="py-2 px-3 font-medium" title={v.code}><span className="cell-text">{v.code}</span></td>
                  <td className="py-2 px-3" title={v.name}><span className="cell-text">{v.name}</span></td>
                  <td className="py-2 px-3" title={v.type}><span className="cell-text">{v.type}</span></td>
                  <td className="py-2 px-3 text-xs" title={`${v.email || ""} ${v.tel || ""}`.trim()}>
                    <span className="cell-text">{v.email}{v.tel ? ` / ${v.tel}` : ""}</span>
                  </td>
                  <td className="py-2 px-3 text-xs text-slate-500" title={v.note}><span className="cell-text">{v.note}</span></td>
                  <td className="py-2 px-3 text-right">
                    <button
                      className="text-red-500"
                      onClick={() => {
                        openConfirm(
                          "ยืนยันการลบ",
                          "คุณต้องการลบข้อมูล Vendor นี้ใช่หรือไม่?",
                          async () => await deleteData("vendors", v.id),
                          "danger"
                        );
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-lg p-6">
              <h3 className="text-lg font-bold mb-4">เพิ่ม Vendor</h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Vendor Code">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="Type">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value })
                    }
                  />
                </InputGroup>
                <div className="col-span-2">
                  <InputGroup label="Name">
                    <input
                      type="text"
                      className="w-full border rounded p-2 text-sm"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                    />
                  </InputGroup>
                </div>
                <InputGroup label="Email">
                  <input
                    type="email"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="Tel">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.tel}
                    onChange={(e) =>
                      setFormData({ ...formData, tel: e.target.value })
                    }
                  />
                </InputGroup>
                <div className="col-span-2">
                  <InputGroup label="Note">
                    <textarea
                      className="w-full border rounded p-2 text-sm"
                      value={formData.note}
                      onChange={(e) =>
                        setFormData({ ...formData, note: e.target.value })
                      }
                    />
                  </InputGroup>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleAdd}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const MaterialView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [searchText, setSearchText] = useState("");
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importPreview, setImportPreview] = useState([]);
    const fileInputRef = useRef(null);

    const emptyForm = { materialNo: "", name: "", unit: "", price: "" };
    const [formData, setFormData] = useState(emptyForm);

    const filtered = useMemo(() => {
      const q = searchText.toLowerCase();
      return materials.filter(
        (m) =>
          !q ||
          (m.materialNo || "").toLowerCase().includes(q) ||
          (m.name || "").toLowerCase().includes(q) ||
          (m.unit || "").toLowerCase().includes(q)
      );
    }, [materials, searchText]);

    const handleOpenAdd = () => {
      setFormData(emptyForm);
      setEditingId(null);
      setIsModalOpen(true);
    };

    const handleOpenEdit = (m) => {
      setFormData({ materialNo: m.materialNo || "", name: m.name || "", unit: m.unit || "", price: m.price ?? "" });
      setEditingId(m.id);
      setIsModalOpen(true);
    };

    const handleSave = async () => {
      if (!formData.name.trim()) return showAlert("กรุณากรอกข้อมูล", "ต้องระบุชื่อ (Name) อย่างน้อย", "warning");
      const payload = {
        materialNo: formData.materialNo.trim(),
        name: formData.name.trim(),
        unit: formData.unit.trim(),
        price: Number(formData.price) || 0,
        createdAt: editingId ? undefined : new Date().toISOString(),
      };
      if (editingId) {
        delete payload.createdAt;
        await updateData("materials", editingId, payload);
        showAlert("สำเร็จ", "แก้ไขรายการ Material เรียบร้อย", "success");
      } else {
        await addData("materials", payload);
        showAlert("สำเร็จ", "เพิ่มรายการ Material เรียบร้อย", "success");
      }
      setIsModalOpen(false);
      setFormData(emptyForm);
      setEditingId(null);
    };

    const handleDelete = (id) => {
      openConfirm("ยืนยันการลบ", "คุณต้องการลบรายการ Material นี้ใช่หรือไม่?", async () => {
        await deleteData("materials", id);
      }, "danger");
    };

    const handleDownloadTemplate = () => {
      const bom = "\uFEFF";
      const headers = "Material No.,Name,Unit,Price\n";
      const sample = "MAT-001,ปูนซีเมนต์,ถุง,250\nMAT-002,เหล็กเส้น 12mm,เส้น,180\nMAT-003,ทราย,คิว,350";
      const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(bom + headers + sample);
      const a = document.createElement("a");
      a.setAttribute("href", uri);
      a.setAttribute("download", "material_template.csv");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };

    const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (fileInputRef.current) fileInputRef.current.value = "";
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const rows = text.split(/\r?\n/).slice(1).filter((r) => r.trim());
        const parsed = rows.map((row) => {
          const cols = [];
          let inQ = false, cur = "";
          for (const ch of row) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { cols.push(cur); cur = ""; }
            else { cur += ch; }
          }
          cols.push(cur);
          const clean = (s) => (s || "").trim().replace(/^"|"$/g, "").replace(/""/g, '"').trim();
          return {
            materialNo: clean(cols[0]),
            name: clean(cols[1]),
            unit: clean(cols[2]),
            price: Number((clean(cols[3]) || "0").replace(/,/g, "")) || 0,
          };
        }).filter((r) => r.name);
        setImportPreview(parsed);
        setIsImportOpen(true);
      };
      reader.readAsText(file, "UTF-8");
    };

    const handleConfirmImport = async () => {
      if (!importPreview.length) return;
      let count = 0;
      for (const item of importPreview) {
        const ok = await addData("materials", { ...item, createdAt: new Date().toISOString() });
        if (ok !== false) count++;
      }
      setIsImportOpen(false);
      setImportPreview([]);
      showAlert("นำเข้าสำเร็จ", `นำเข้า ${count} รายการเรียบร้อย`, "success");
    };

    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Package size={20} className="text-slate-600" /> Material
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2 text-slate-400" />
              <input
                type="text"
                placeholder="ค้นหา..."
                className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-100 w-44"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <Button variant="outline" className="text-xs h-8" onClick={handleDownloadTemplate}>
              <Download size={13} /> Template
            </Button>
            <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium text-xs shadow-sm bg-green-600 text-white hover:bg-green-700 cursor-pointer h-8 transition-colors">
              <FileSpreadsheet size={13} /> Import CSV
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
            <Button onClick={handleOpenAdd} className="h-8 text-xs">
              <Plus size={13} /> New Material
            </Button>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-800 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2 px-3 w-12 text-center">No.</th>
                <th className="py-2 px-3 w-32">Material No.</th>
                <th className="py-2 px-3">Name</th>
                <th className="py-2 px-3 w-20 text-center">Unit</th>
                <th className="py-2 px-3 w-28 text-right">Price</th>
                <th className="py-2 px-3 w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-30" />
                    ยังไม่มีรายการ Material
                  </td>
                </tr>
              ) : (
                filtered.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/40">
                    <td className="py-1.5 px-3 text-center text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                    <td className="py-1.5 px-3 font-medium text-slate-700" title={m.materialNo}><span className="cell-text">{m.materialNo || "-"}</span></td>
                    <td className="py-1.5 px-3" title={m.name}><span className="cell-text">{m.name}</span></td>
                    <td className="py-1.5 px-3 text-center text-slate-500" title={m.unit}><span className="cell-text">{m.unit || "-"}</span></td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-700">{formatCurrency(m.price || 0)}</td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded" onClick={() => handleOpenEdit(m)} title="แก้ไข">
                          <Edit size={13} />
                        </button>
                        <button className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded" onClick={() => handleDelete(m.id)} title="ลบ">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {filtered.length > 0 && (
            <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-400">
              ทั้งหมด {filtered.length} รายการ{searchText ? ` (กรอง จาก ${materials.length})` : ""}
            </div>
          )}
        </Card>

        {/* Add/Edit Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-md p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Package size={18} /> {editingId ? "แก้ไข Material" : "เพิ่ม Material"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <InputGroup label="Material No.">
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                    value={formData.materialNo}
                    onChange={(e) => setFormData({ ...formData, materialNo: e.target.value })}
                    placeholder="MAT-001"
                  />
                </InputGroup>
                <InputGroup label="Unit">
                  <input
                    type="text"
                    className="w-full border rounded-lg p-2 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="ชิ้น, ถุง, คิว..."
                  />
                </InputGroup>
                <div className="col-span-2">
                  <InputGroup label="Name *">
                    <input
                      type="text"
                      className="w-full border rounded-lg p-2 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-100"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="ชื่อสินค้า / วัสดุ"
                    />
                  </InputGroup>
                </div>
                <div className="col-span-2">
                  <InputGroup label="Price (ราคา/หน่วย)">
                    <input
                      type="number"
                      className="w-full border rounded-lg p-2 text-sm focus:border-slate-400 focus:ring-1 focus:ring-slate-100 text-right"
                      value={formData.price}
                      onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                      placeholder="0.00"
                      min="0"
                    />
                  </InputGroup>
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => { setIsModalOpen(false); setFormData(emptyForm); setEditingId(null); }}>
                  ยกเลิก
                </Button>
                <Button onClick={handleSave}>
                  {editingId ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
                </Button>
              </div>
            </Card>
          </div>
        )}

        {/* Import Preview Modal */}
        {isImportOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-2xl p-6">
              <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                <FileSpreadsheet size={18} /> ตรวจสอบข้อมูลก่อน Import ({importPreview.length} รายการ)
              </h3>
              <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg mb-4">
                <table className="w-full text-xs text-left text-slate-600">
                  <thead className="bg-slate-100 text-slate-800 font-semibold sticky top-0">
                    <tr>
                      <th className="py-1.5 px-3 w-8 text-center">#</th>
                      <th className="py-1.5 px-3 w-28">Material No.</th>
                      <th className="py-1.5 px-3">Name</th>
                      <th className="py-1.5 px-3 w-16 text-center">Unit</th>
                      <th className="py-1.5 px-3 w-24 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {importPreview.map((row, i) => (
                      <tr key={i} className="odd:bg-white even:bg-slate-50/40">
                        <td className="py-1 px-3 text-center text-slate-400">{i + 1}</td>
                        <td className="py-1 px-3 font-medium">{row.materialNo || "-"}</td>
                        <td className="py-1 px-3">{row.name}</td>
                        <td className="py-1 px-3 text-center">{row.unit || "-"}</td>
                        <td className="py-1 px-3 text-right">{formatCurrency(row.price)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => { setIsImportOpen(false); setImportPreview([]); }}>ยกเลิก</Button>
                <Button onClick={handleConfirmImport}>
                  <FileSpreadsheet size={13} /> ยืนยัน Import ({importPreview.length} รายการ)
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const InvoiceView = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
      invNo: "",
      poRef: "",
      description: "",
      amount: 0,
      receiveDate: "",
    });
    const projectPOs = pos.filter((po) => po.projectId === selectedProjectId);
    const handleAdd = async () => {
      const refPO = pos.find((po) => po.poNo === formData.poRef);
      if (!refPO)
        return showAlert("ไม่พบ PO", "ไม่พบเลขที่ PO ที่ระบุ", "error");

      const existingInvSum = invoices
        .filter((inv) => inv.poRef === formData.poRef)
        .reduce((sum, inv) => sum + Number(inv.amount), 0);
      if (existingInvSum + formData.amount > refPO.amount) {
        return showAlert(
          "ยอดเกิน",
          `ยอด Invoice เกินยอด PO! คงเหลือ: ${formatCurrency(
            refPO.amount - existingInvSum
          )}`,
          "error"
        );
      }

      const success = await addData("invoices", {
        ...formData,
        projectId: selectedProjectId,
        status: "Pending PM",
      });

      if (success) {
        setIsModalOpen(false);
        setFormData({
          invNo: "",
          poRef: "",
          description: "",
          amount: 0,
          receiveDate: "",
        });
        showAlert("สำเร็จ", "บันทึกรับ Invoice เรียบร้อย", "success");
      }
    };
    const handleAction = async (id, action) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv) return;

      let newStatus = inv.status;
      if (inv.status === "Pending PM" && userRole === "PM")
        newStatus = "Pending GM";
      if (inv.status === "Pending GM" && userRole === "GM") newStatus = "Paid";

      if (newStatus !== inv.status) {
        await updateData("invoices", id, { status: newStatus });
      }
    };
    return (
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800">
            F. รับวางบิล (Invoice Receive)
          </h2>
          <ProjectSelect
            projects={visibleProjects}
            selectedId={selectedProjectId}
            onChange={(e) => handleProjectChange(e.target.value)}
          />
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={14} /> รับ Invoice
          </Button>
        </div>
        <div className="bg-purple-50 p-3 rounded-md border border-purple-100 text-xs text-purple-800 mb-4 flex items-center gap-2">
          <Info size={16} />
          <strong>Flow การวางบิล:</strong> Pending PM (ตรวจหน้างาน) → Pending GM
          (อนุมัติจ่าย) → Paid
        </div>
        <Card>
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
              <tr>
                <th className="py-2 px-3">INV No.</th>
                <th className="py-2 px-3">Ref. PO</th>
                <th className="py-2 px-3">รายละเอียด</th>
                <th className="py-2 px-3 text-right">จำนวนเงิน</th>
                <th className="py-2 px-3 text-center">สถานะ</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices
                .filter((inv) => inv.projectId === selectedProjectId)
                .map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-medium" title={inv.invNo}><span className="cell-text">{inv.invNo}</span></td>
                    <td className="py-2 px-3 text-blue-600" title={inv.poRef}><span className="cell-text">{inv.poRef}</span></td>
                    <td className="py-2 px-3" title={inv.description}><span className="cell-text">{inv.description}</span></td>
                    <td className="py-2 px-3 text-right font-semibold">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <Badge status={inv.status} />
                    </td>
                    <td className="py-2 px-3 text-right flex justify-end gap-1">
                      {userRole === "PM" && inv.status === "Pending PM" && (
                        <Button
                          variant="success"
                          size="sm"
                          className="px-2 py-0.5 text-[10px]"
                          onClick={() => handleAction(inv.id, "approve")}
                        >
                          PM เห็นชอบ
                        </Button>
                      )}
                      {userRole === "GM" && inv.status === "Pending GM" && (
                        <Button
                          variant="success"
                          size="sm"
                          className="px-2 py-0.5 text-[10px]"
                          onClick={() => handleAction(inv.id, "approve")}
                        >
                          GM อนุมัติจ่าย
                        </Button>
                      )}
                      <button
                        className="text-red-500 hover:text-red-700"
                        onClick={() => deleteData("invoices", inv.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </Card>
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <Card className="w-full max-w-lg p-6">
              <h3 className="text-lg font-bold mb-4">บันทึกรับ Invoice</h3>
              <div className="space-y-4">
                <InputGroup label="Ref. PO No.">
                  <select
                    className="w-full border rounded p-2 bg-white text-sm"
                    value={formData.poRef}
                    onChange={(e) =>
                      setFormData({ ...formData, poRef: e.target.value })
                    }
                  >
                    <option value="">-- เลือก PO ที่จะวางบิล --</option>
                    {projectPOs.map((po) => (
                      <option key={po.id} value={po.poNo}>
                        {po.poNo} : {po.description} (
                        {formatCurrency(po.amount)})
                      </option>
                    ))}
                  </select>
                </InputGroup>
                <InputGroup label="Invoice No.">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.invNo}
                    onChange={(e) =>
                      setFormData({ ...formData, invNo: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="รายละเอียด">
                  <input
                    type="text"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                  />
                </InputGroup>
                <InputGroup label="จำนวนเงินตาม Invoice">
                  <input
                    type="number"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.amount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        amount: Number(e.target.value),
                      })
                    }
                  />
                </InputGroup>
                <InputGroup label="วันที่นัดรับเงิน">
                  <input
                    type="date"
                    className="w-full border rounded p-2 text-sm"
                    value={formData.receiveDate}
                    onChange={(e) =>
                      setFormData({ ...formData, receiveDate: e.target.value })
                    }
                  />
                </InputGroup>
              </div>
              <div className="flex justify-end gap-2 mt-6 border-t pt-4">
                <Button
                  variant="secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  ยกเลิก
                </Button>
                <Button onClick={handleAdd}>บันทึก</Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  };

  const Dashboard = () => (
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

  return (
    <div className="flex h-screen bg-slate-100 font-sans">
      {!isFullScreenModalOpen && (
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-xl z-20">
        <div className="p-6 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center font-bold shadow-lg shadow-blue-900/50 text-lg">
              C
            </div>
            <div>
              <span className="text-lg font-bold tracking-wide">
                CMG Budget
              </span>
              <p className="text-[10px] text-slate-400 uppercase tracking-widest">
                Control
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <SidebarItem
            icon={<LayoutDashboard size={20} />}
            label="ภาพรวม"
            active={activeMenu === "dashboard"}
            onClick={() => handleMenuChange("dashboard")}
          />
          <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            Modules
          </div>
          <SidebarItem
            icon={<Briefcase size={20} />}
            label="จัดการโครงการ"
            active={activeMenu === "projects"}
            onClick={() => handleMenuChange("projects")}
          />
          <SidebarItem
            icon={<Wallet size={20} />}
            label="Project Budget"
            active={activeMenu === "budget"}
            onClick={() => handleMenuChange("budget")}
          />
          {/* PR/PO Sub-menu group */}
          <SidebarGroup
            icon={<FileText size={20} />}
            label="Purchase Request (PR)"
            isActive={activeMenu === "pr" || activeMenu === "pr-table"}
          >
            <SidebarSubItem
              label="ระบบ PR"
              active={activeMenu === "pr"}
              onClick={() => handleMenuChange("pr")}
            />
            <SidebarSubItem
              label="ตารางข้อมูล PR"
              active={activeMenu === "pr-table"}
              onClick={() => handleMenuChange("pr-table")}
            />
          </SidebarGroup>
          <SidebarGroup
            icon={<ShoppingCart size={20} />}
            label="Purchase Order (PO)"
            isActive={activeMenu === "po" || activeMenu === "po-table" || activeMenu === "vendor" || activeMenu === "material"}
          >
            <SidebarSubItem
              label="ระบบ PO"
              active={activeMenu === "po"}
              onClick={() => handleMenuChange("po")}
            />
            <SidebarSubItem
              label="ตารางข้อมูล PO"
              active={activeMenu === "po-table"}
              onClick={() => handleMenuChange("po-table")}
            />
            <SidebarSubItem
              label="Vendor Management"
              active={activeMenu === "vendor"}
              onClick={() => handleMenuChange("vendor")}
            />
            <SidebarSubItem
              label="Material"
              active={activeMenu === "material"}
              onClick={() => handleMenuChange("material")}
            />
          </SidebarGroup>
          <SidebarItem
            icon={<FileInput size={20} />}
            label="Invoice Receive"
            active={activeMenu === "invoice"}
            onClick={() => handleMenuChange("invoice")}
          />

          <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
            System
          </div>
          <SidebarItem
            icon={<User size={20} />}
            label="ข้อมูลส่วนตัว (Profile)"
            active={activeMenu === "profile"}
            onClick={() => handleMenuChange("profile")}
          />
          {userRole === "Administrator" && (
            <SidebarItem
              icon={<Shield size={20} />}
              label="ผู้ดูแลระบบ (Admin)"
              active={activeMenu === "admin"}
              onClick={() => handleMenuChange("admin")}
            />
          )}
        </nav>
        <div className="p-4 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          CMG Budget Control V.20
        </div>
      </aside>
      )}

      <main className="flex-1 overflow-y-auto bg-slate-50/50">
        <header className="bg-white/80 backdrop-blur-md shadow-sm px-8 py-4 flex justify-between items-center sticky top-0 z-20 border-b border-slate-100">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            {activeMenu === "dashboard"
              ? "Dashboard"
              : activeMenu === "projects"
                ? "จัดการโครงการ"
                : activeMenu === "budget"
                  ? "Project Budget"
                  : activeMenu === "pr"
                    ? "ระบบ Purchase Request (PR)"
                    : activeMenu === "pr-table"
                      ? "ตารางข้อมูล PR"
                      : activeMenu === "po"
                        ? "ระบบ Purchase Order (PO)"
                        : activeMenu === "po-table"
                          ? "ตารางข้อมูล PO"
                          : activeMenu === "vendor"
                            ? "Vendor Management"
                            : activeMenu === "material"
                              ? "Material"
                              : activeMenu === "invoice"
                              ? "Invoice Receive"
                              : activeMenu === "profile"
                                ? "User Profile"
                                : activeMenu === "admin"
                                  ? "Admin Dashboard"
                                  : "Module View"}
          </h1>
          <div className="flex items-center gap-4">
            {/* Bell notification button */}
            <div className="relative">
              <button
                onClick={() => setIsBellOpen(!isBellOpen)}
                className="relative p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                title="รายการรออนุมัติ"
              >
                <Bell size={20} />
                {totalPendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 shadow-md animate-pulse">
                    {totalPendingCount > 99 ? "99+" : totalPendingCount}
                  </span>
                )}
              </button>
              <AnimatePresence>
              {isBellOpen && (
                <motion.div
                  className="absolute right-0 top-12 w-80 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                  <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
                    <span className="text-sm font-bold flex items-center gap-2">
                      <Bell size={14} /> รายการรออนุมัติ
                    </span>
                    <span className="bg-red-500 text-[10px] font-bold rounded-full px-2 py-0.5">
                      {totalPendingCount} รายการ
                    </span>
                  </div>
                  {pendingByProject.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 text-sm">
                      ไม่มีรายการรออนุมัติ
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {pendingByProject.map((item) => (
                        <button
                          key={item.projectId}
                          className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
                          onClick={() => {
                            setSelectedProjectId(item.projectId);
                            setActiveMenu("budget");
                            setBudgetCategory("OVERVIEW");
                            setScrollToPendingAfterRender(true);
                            setIsBellOpen(false);
                          }}
                        >
                          <div className="text-xs font-bold text-slate-800 truncate">
                            {item.projectName}
                          </div>
                          <div className="flex gap-2 mt-1">
                            {item.budgets > 0 && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                Budget: {item.budgets}
                              </span>
                            )}
                            {item.prs > 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                PR: {item.prs}
                              </span>
                            )}
                            {item.pos > 0 && (
                              <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                                PO: {item.pos}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
              </AnimatePresence>
            </div>
            <div className="flex items-center gap-3 px-4 py-1.5 bg-slate-100 rounded-full border border-slate-200">
              <div className="flex flex-col text-right">
                <span className="text-xs font-bold text-slate-700">
                  {userData?.firstName} {userData?.lastName}
                </span>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">
                  {userRole}
                </span>
              </div>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">
                {userData?.firstName?.charAt(0)}
              </div>
            </div>
            <button
              onClick={logout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
              title="ออกจากระบบ"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>
        <div className="p-8 max-w-[1600px] mx-auto">
          <motion.div
            key={activeMenu}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div data-menu-page="dashboard" style={{ display: activeMenu === "dashboard" ? undefined : "none" }}>
              {Dashboard()}
            </div>
            <div data-menu-page="projects" style={{ display: activeMenu === "projects" ? undefined : "none" }}>
              {ProjectsView()}
            </div>
            <div data-menu-page="budget" style={{ display: activeMenu === "budget" ? undefined : "none" }}>
              {BudgetView()}
            </div>
            <div data-menu-page="pr" style={{ display: activeMenu === "pr" ? undefined : "none" }}>
              {PRView()}
            </div>
            <div data-menu-page="po" style={{ display: activeMenu === "po" ? undefined : "none" }}>
              {POView()}
            </div>
            <div data-menu-page="vendor" style={{ display: activeMenu === "vendor" ? undefined : "none" }}>
              {VendorView()}
            </div>
            <div data-menu-page="material" style={{ display: activeMenu === "material" ? undefined : "none" }}>
              {MaterialView()}
            </div>
            <div data-menu-page="invoice" style={{ display: activeMenu === "invoice" ? undefined : "none" }}>
              {InvoiceView()}
            </div>
            {activeMenu === "profile" && (
              <div data-menu-page="profile">
                <UserProfile />
              </div>
            )}
            {activeMenu === "admin" && userRole === "Administrator" && (
              <div data-menu-page="admin">
                <AdminDashboard />
              </div>
            )}
            {(activeMenu === "pr-table" || activeMenu === "po-table") && (
              <div data-menu-page="pr-po-table">
                <PRPOTableView
                  mode={activeMenu === "pr-table" ? "pr" : "po"}
                  prs={prs}
                  pos={pos}
                  budgets={budgets}
                  projects={projects}
                />
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </div>
  );
};

// --- Sidebar Group (expandable sub-menu) ---
const SidebarGroup = ({ icon, label, isActive, children }) => {
  const [open, setOpen] = React.useState(isActive);
  React.useEffect(() => { if (isActive) setOpen(true); }, [isActive]);
  return (
    <div>
      <motion.button
        onClick={() => setOpen((p) => !p)}
        className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg group ${isActive ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {isActive && (
          <motion.div
            layoutId="sidebarGroupActive"
            className="absolute inset-0 rounded-lg bg-slate-700 -z-10"
            transition={{ type: "spring", stiffness: 350, damping: 30 }}
          />
        )}
        <span className="relative z-10">{icon}</span>
        <span className="font-medium text-sm flex-1 text-left relative z-10">{label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 24 }}
          className="relative z-10"
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SidebarSubItem = ({ label, active, onClick }) => (
  <motion.button
    onClick={onClick}
    className={`relative w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium overflow-hidden text-left ${active ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-700/60"}`}
    whileHover={{ x: 4 }}
    whileTap={{ scale: 0.97 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
  >
    {active && (
      <motion.div
        layoutId="sidebarSubActive"
        className="absolute inset-0 bg-blue-600/90 rounded-md shadow-md"
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      />
    )}
    <span className="relative z-10 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current opacity-80" />
    <span className="relative z-10">{label}</span>
  </motion.button>
);

// --- PR / PO Combined Table View ---
const PRPOTableView = ({ mode, prs, pos, budgets, projects }: {
  mode: "pr" | "po";
  prs: any[];
  pos: any[];
  budgets: any[];
  projects: any[];
}) => {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [filterProject, setFilterProject] = React.useState("all");

  const isPR = mode === "pr";

  const statusColors: Record<string, string> = {
    "Approved": "bg-emerald-50 text-emerald-700 border-emerald-200",
    "Pending MD": "bg-purple-50 text-purple-700 border-purple-200",
    "Pending GM": "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Pending PM": "bg-blue-50 text-blue-700 border-blue-200",
    "Pending CM": "bg-cyan-50 text-cyan-700 border-cyan-200",
    "Pending PCM": "bg-orange-50 text-orange-700 border-orange-200",
    "Rejected": "bg-red-50 text-red-700 border-red-200",
    "Draft": "bg-slate-50 text-slate-500 border-slate-200",
    "Paid": "bg-teal-50 text-teal-700 border-teal-200",
    "Partial": "bg-yellow-50 text-yellow-700 border-yellow-200",
  };

  const getBudgetDesc = (costCode: string, projectId: string) =>
    budgets.find((b) => b.code === costCode && b.projectId === projectId)?.description || "-";

  const getProjectName = (projectId: string) =>
    projects.find((p) => p.id === projectId)?.name || projectId;

  const allStatuses = isPR
    ? ["Approved", "Pending MD", "Pending GM", "Pending PM", "Pending CM", "Rejected"]
    : ["Approved", "Pending PCM", "Pending GM", "Rejected", "Paid", "Partial", "Draft"];

  const rows = isPR ? prs : pos;

  const filtered = rows.filter((r: any) => {
    const noField = isPR ? r.prNo : r.poNo;
    const matchSearch =
      !searchTerm ||
      (noField || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.costCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.requestor || r.vendor || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const matchProject = filterProject === "all" || r.projectId === filterProject;
    return matchSearch && matchStatus && matchProject;
  });

  const allProjects = Array.from(new Set(rows.map((r: any) => r.projectId))).filter(Boolean);

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${isPR ? "bg-slate-700" : "bg-red-600"}`}>
            {isPR ? <FileText size={18} className="text-white" /> : <ShoppingCart size={18} className="text-white" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {isPR ? "ตารางข้อมูล Purchase Request" : "ตารางข้อมูล Purchase Order"}
            </h2>
            <p className="text-xs text-slate-500">
              {filtered.length} รายการ {filterStatus !== "all" ? `(${filterStatus})` : "ทั้งหมด"}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isPR ? "ค้นหา PR No., Cost Code..." : "ค้นหา PO No., Vendor..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
            />
          </div>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">ทุกโครงการ</option>
            {allProjects.map((pid: string) => (
              <option key={pid} value={pid}>{getProjectName(pid)}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">ทุกสถานะ</option>
            {allStatuses.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Table Card */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="px-3 py-3 font-semibold w-6">#</th>
                <th className="px-3 py-3 font-semibold">{isPR ? "PR No." : "PO No."}</th>
                <th className="px-3 py-3 font-semibold">โครงการ</th>
                {isPR && <th className="px-3 py-3 font-semibold">Cost Code</th>}
                {isPR && <th className="px-3 py-3 font-semibold">รายการงบ</th>}
                {!isPR && <th className="px-3 py-3 font-semibold">Vendor</th>}
                {!isPR && <th className="px-3 py-3 font-semibold">PR อ้างอิง</th>}
                <th className="px-3 py-3 font-semibold">วันที่</th>
                {isPR && <th className="px-3 py-3 font-semibold">ผู้ขอ</th>}
                {isPR && <th className="px-3 py-3 font-semibold">ประเภท</th>}
                <th className="px-3 py-3 font-semibold text-right">จำนวนรายการ</th>
                <th className="px-3 py-3 font-semibold text-right">ยอดรวม</th>
                <th className="px-3 py-3 font-semibold text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-16 text-center text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={32} className="opacity-30" />
                      <span>ไม่พบข้อมูล</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((r: any, idx: number) => {
                  const noField = isPR ? r.prNo : r.poNo;
                  const dateField = isPR ? r.requestDate : r.poDate;
                  const amount = isPR ? r.totalAmount : r.grandTotal;
                  const itemCount = isPR
                    ? (r.items?.length || 0)
                    : (r.items?.length || (r.selectedPrIds?.length || 0));
                  const statusClass = statusColors[r.status] || "bg-slate-50 text-slate-500 border-slate-200";
                  const isEven = idx % 2 === 0;

                  return (
                    <tr key={r.id} className={`hover:bg-blue-50/40 transition-colors ${isEven ? "bg-white" : "bg-slate-50/40"}`}>
                      <td className="px-3 py-2.5 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Hash size={10} className={isPR ? "text-slate-500" : "text-red-500"} />
                          {noField || "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-slate-600 max-w-[140px] truncate" title={getProjectName(r.projectId)}>
                        {getProjectName(r.projectId)}
                      </td>
                      {isPR && (
                        <td className="px-3 py-2.5 font-mono text-slate-700">{r.costCode || "-"}</td>
                      )}
                      {isPR && (
                        <td className="px-3 py-2.5 text-slate-600 max-w-[180px] truncate" title={getBudgetDesc(r.costCode, r.projectId)}>
                          {getBudgetDesc(r.costCode, r.projectId)}
                        </td>
                      )}
                      {!isPR && (
                        <td className="px-3 py-2.5 text-slate-700 font-medium">{r.vendor || "-"}</td>
                      )}
                      {!isPR && (
                        <td className="px-3 py-2.5 text-slate-500 text-[11px]">
                          {(r.selectedPrIds || []).length > 0
                            ? prs.filter((p: any) => (r.selectedPrIds || []).includes(p.id)).map((p: any) => p.prNo).join(", ")
                            : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{dateField || "-"}</td>
                      {isPR && <td className="px-3 py-2.5 text-slate-600">{r.requestor || "-"}</td>}
                      {isPR && (
                        <td className="px-3 py-2.5">
                          {r.purchaseType ? (
                            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]">{r.purchaseType}</span>
                          ) : "-"}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right text-slate-600">{itemCount} รายการ</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800">
                        ฿{Number(amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${statusClass}`}>
                          {r.status || "Draft"}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        {filtered.length > 0 && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
            <span>แสดง {filtered.length} รายการ</span>
            <span className="font-bold text-slate-700">
              ยอดรวมทั้งหมด: ฿{filtered.reduce((s: number, r: any) => s + Number(isPR ? r.totalAmount : r.grandTotal || 0), 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}
      </Card>
    </div>
  );
};

const SidebarItem = ({ icon, label, active, onClick }) => (
  <motion.button
    onClick={onClick}
    className={`relative w-full flex items-center gap-3 px-4 py-3 rounded-lg overflow-hidden group ${active ? "text-white" : "text-slate-400 hover:text-white hover:bg-slate-800/80"}`}
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
  >
    {active && (
      <motion.div
        layoutId="sidebarActive"
        className="absolute inset-0 bg-blue-600 rounded-lg shadow-lg shadow-blue-900/30"
        style={{ originX: 0, originY: 0.5 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
      />
    )}
    <span className="relative z-10 flex items-center gap-3">
      <motion.span animate={{ rotate: active ? 0 : 0 }}>{icon}</motion.span>
      <span className="font-medium text-sm">{label}</span>
    </span>
  </motion.button>
);

// --- Root App ---
export default function App() {
  return (
    <AuthProvider>
      <AuthWrapper />
    </AuthProvider>
  );
}

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

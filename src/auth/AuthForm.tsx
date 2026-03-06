// @ts-nocheck
import React, { useState, useCallback, useContext } from "react";
import {
  LogOut, Shield, User, Settings, Key, Lock, Unlock, RefreshCw,
  UserCheck, Users, AtSign, Mail, CheckCircle, CheckSquare, Square,
  Trash2, Edit, Plus, AlertCircle, XCircle, Info, History, FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, updateProfile
} from "firebase/auth";
import {
  doc, setDoc, getDoc, getDocs, collection, query, where,
  updateDoc, deleteDoc, addDoc, onSnapshot
} from "firebase/firestore";
import { auth, db, appId } from "../lib/firebase";
import { AuthContext } from "./AuthContext";
import { Card, Button, InputGroup, Badge } from "../components/ui";
import { USER_ROLES } from "../lib/constants";
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
                <ResizableTh tableId="users" colKey="name" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.name}>Name</ResizableTh>
                <ResizableTh tableId="users" colKey="role" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.role}>Role</ResizableTh>
                <ResizableTh tableId="users" colKey="status" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.status}>Status</ResizableTh>
                <ResizableTh tableId="users" colKey="projects" className="p-4" isAdmin={userRole==="Administrator"} onResize={handleColumnResize} currentWidth={columnWidths.users?.projects}>Projects</ResizableTh>
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

// Thin wrapper: sets up AppDataContext + UIContext, renders AppShell

export default AuthForm;
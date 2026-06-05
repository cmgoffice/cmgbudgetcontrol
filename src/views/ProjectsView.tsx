// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { Plus, Trash2, Edit, Upload, Download, Lock, Unlock, Users, UserCheck, History } from "lucide-react";
import { addDoc, collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { useAppData } from "../contexts/AppDataContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
import { uploadAttachment } from "../lib/uploadAttachment";
import { COST_CATEGORIES } from "../lib/constants";
const ProjectsView = React.memo(() => {
  const { visibleProjects, budgets, addData, updateData, deleteData, showAlert, openConfirm, userRole, userRoles = [], userData, columnWidths, handleColumnResize, logAction, canUseFunction, isColumnVisible, db, appId } = useAppData();
  const projectTableRef = useRef(null);
  const projectTableLayout = useProportionalTableLayout({
    tableId: "project",
    defaultWeights: TABLE_LAYOUT_DEFAULTS.project,
    savedWidths: columnWidths.project,
    containerRef: projectTableRef,
    enabled: true,
    driftKey: "name",
    handleColumnResize,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [budgetAttachmentFiles, setBudgetAttachmentFiles] = useState([]);
  const [contractAttachmentFiles, setContractAttachmentFiles] = useState([]);
  const [budgetRevisionNote, setBudgetRevisionNote] = useState("");
  const [budgetActioning, setBudgetActioning] = useState(false);
  const [detailTab, setDetailTab] = useState("detail");
  const [budgetRevisions, setBudgetRevisions] = useState([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const PROJECT_STATUSES = ["Active", "Prepare Budget", "Complete", "Cancel", "Close"];
  const PROJECT_TYPES = ["Profit Project", "Spent Project"];

  const EMPTY_FORM = {
    jobNo: "",
    name: "",
    location: "",
    contractValue: 0,
    startDate: "",
    endDate: "",
    pmName: "",
    cmName: "",
    status: "",
    projectType: "",
    contractInfo: "",
    contractName: "",
    clientName: "",
    mainContractor: "",
    subContractor: "",
    poNo: "",
    contractAttachments: [],
  };

  const [formData, setFormData] = useState(EMPTY_FORM);
  const hasRole = (role) => userRole === role || userRoles.includes(role);
  const canApproveRevBudget = hasRole("MD") || hasRole("Administrator");
  const canDeleteBudgetRevision = hasRole("Administrator");
  const canRequestRevBudget = hasRole("PM") || hasRole("MD") || hasRole("Administrator");
  const canEditProjectStatus = hasRole("MD") || hasRole("Administrator");

  // visibleProjects จาก AppDataContext เป็น realtime (onSnapshot) แล้ว — ใช้ตรงๆ
  const projectRows = useMemo(() => visibleProjects, [visibleProjects]);

  const getProjectBudgetTotal = useCallback((projectId) => {
    if (!projectId) return 0;
    return budgets
      .filter((b) => b.projectId === projectId)
      .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  }, [budgets]);

  const buildBudgetSummaryRows = useCallback((projectId) => {
    return Object.entries(COST_CATEGORIES).map(([code, name]) => {
      const total = budgets
        .filter((b) => b.projectId === projectId && b.category === code)
        .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
      return { code, name, budgetTotal: total };
    });
  }, [budgets]);

  const loadBudgetRevisions = useCallback(async (projectId) => {
    if (!projectId) {
      setBudgetRevisions([]);
      return;
    }
    setRevisionsLoading(true);
    try {
      const q = query(
        collection(db, "artifacts", appId, "public", "data", "budgetRevisions"),
        where("projectId", "==", projectId)
      );
      const snap = await getDocs(q);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => Number(b.revNo || 0) - Number(a.revNo || 0));
      setBudgetRevisions(rows);
    } catch (err) {
      console.error("[Budget Revision] load error:", err);
      showAlert("Error", "โหลดข้อมูล Revision Budget ไม่สำเร็จ", "error");
    } finally {
      setRevisionsLoading(false);
    }
  }, [db, appId, showAlert]);

  useEffect(() => {
    if (selectedProject?.id) loadBudgetRevisions(selectedProject.id);
  }, [selectedProject?.id, loadBudgetRevisions]);

  // sync selectedProject เมื่อ visibleProjects อัปเดต (realtime จาก AppDataContext)
  useEffect(() => {
    if (!selectedProject?.id) return;
    const latest = visibleProjects.find((p) => p.id === selectedProject.id);
    if (latest) setSelectedProject(latest);
  }, [visibleProjects, selectedProject?.id]);

  useEffect(() => {
    setBudgetRevisionNote(selectedProject?.budgetRevisionRequest?.note || "");
    setBudgetAttachmentFiles([]);
    setContractAttachmentFiles([]);
  }, [selectedProject?.id]);

  const currentModalProjectId = editingProjectId || formData.id || formData.jobNo;
  const currentModalBudgetTotal = getProjectBudgetTotal(currentModalProjectId);

  const uploadProjectBudgetAttachments = async (projectId, files, existing = []) => {
    if (!projectId || !files?.length) return existing || [];
    const uploaded = [];
    for (const f of files) {
      const up = await uploadAttachment(f, {
        type: "project-budget",
        projectId,
        docId: projectId,
      });
      uploaded.push({
        ...up,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.name || userData?.email || userRole || "",
      });
    }
    return [...(existing || []), ...uploaded];
  };

  const uploadProjectContractAttachments = async (projectId, files, existing = []) => {
    if (!projectId || !files?.length) return existing || [];
    const uploaded = [];
    for (const f of files) {
      const up = await uploadAttachment(f, {
        type: "project-contract",
        projectId,
        docId: projectId,
      });
      uploaded.push({
        ...up,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.name || userData?.email || userRole || "",
      });
    }
    return [...(existing || []), ...uploaded];
  };

  const uploadBudgetRevisionRequestAttachments = async (projectId, files) => {
    if (!projectId || !files?.length) return [];
    const uploaded = [];
    for (const f of files) {
      const up = await uploadAttachment(f, {
        type: "budget-revision-request",
        projectId,
        docId: projectId,
      });
      uploaded.push({
        ...up,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userData?.name || userData?.email || userRole || "",
      });
    }
    return uploaded;
  };

  const handleSave = async () => {
    if (!formData.jobNo || !formData.name) return;
    setBudgetActioning(true);

    try {
      if (editingProjectId) {
        const currentProject = projectRows.find((p) => p.id === editingProjectId);
        const nextAttachments = await uploadProjectBudgetAttachments(
          editingProjectId,
          budgetAttachmentFiles,
          formData.budgetAttachments || []
        );
        const nextContractAttachments = await uploadProjectContractAttachments(
          editingProjectId,
          contractAttachmentFiles,
          formData.contractAttachments || []
        );
        const success = await updateData("projects", editingProjectId, {
          ...formData,
          status: canEditProjectStatus ? formData.status : currentProject?.status || formData.status,
          budgetTotal: currentModalBudgetTotal,
          budgetAttachments: nextAttachments,
          contractAttachments: nextContractAttachments,
        });
        if (success) {
          setIsModalOpen(false);
          setFormData(EMPTY_FORM);
          setEditingProjectId(null);
          setBudgetAttachmentFiles([]);
          setContractAttachmentFiles([]);
          setBudgetRevisionNote("");
          showAlert("สำเร็จ", "แก้ไขข้อมูลโครงการเรียบร้อย", "success");
        }
      } else {
        const projectId = formData.jobNo;
        const success = await addData("projects", {
          ...formData,
          budgetTotal: currentModalBudgetTotal,
          budgetAttachments: [],
          contractAttachments: [],
        }, projectId);
        if (success) {
          const nextAttachments = await uploadProjectBudgetAttachments(projectId, budgetAttachmentFiles, []);
          const nextContractAttachments = await uploadProjectContractAttachments(projectId, contractAttachmentFiles, []);
          if (nextAttachments.length > 0 || nextContractAttachments.length > 0) {
            await updateData("projects", projectId, { 
              budgetAttachments: nextAttachments, 
              budgetTotal: currentModalBudgetTotal,
              contractAttachments: nextContractAttachments
            }, { skipLog: true });
          }
          setIsModalOpen(false);
          setFormData(EMPTY_FORM);
          setBudgetAttachmentFiles([]);
          setContractAttachmentFiles([]);
          setBudgetRevisionNote("");
          showAlert("สำเร็จ", "เพิ่มโครงการใหม่เรียบร้อยแล้ว", "success");
        }
      }
    } finally {
      setBudgetActioning(false);
    }
  };

  const handleEdit = (project) => {
    setFormData(project);
    setEditingProjectId(project.id);
    setBudgetAttachmentFiles([]);
    setContractAttachmentFiles([]);
    setBudgetRevisionNote(project?.budgetRevisionRequest?.note || "");
    setSelectedProject(null);
    setIsModalOpen(true);
  };

  const handleApproveRevBudget = async (project) => {
    if (!project?.id) return;
    openConfirm(
      "Approve & Rev. Budget",
      "ยืนยันบันทึก Budget Summary และ Attachment ปัจจุบันเป็น Revision ใหม่ของโครงการนี้?",
      async () => {
        setBudgetActioning(true);
        try {
          const total = getProjectBudgetTotal(project.id);
          const rows = buildBudgetSummaryRows(project.id);
          const latestRevisionSnap = await getDocs(query(
            collection(db, "artifacts", appId, "public", "data", "budgetRevisions"),
            where("projectId", "==", project.id)
          ));
          const existingRevisions = latestRevisionSnap.docs.map((d) => d.data());
          const nextRevNo = existingRevisions.length > 0
            ? Math.max(...existingRevisions.map((r) => Number(r.revNo || 0))) + 1
            : 0;
          const attachments = await uploadProjectBudgetAttachments(
            project.id,
            budgetAttachmentFiles,
            project.budgetAttachments || formData.budgetAttachments || []
          );
          const requestNote = project.budgetRevisionRequest?.note || "";
          const requestAttachments = project.budgetRevisionRequest?.attachments || [];
          const currentRevNo = Number.isFinite(Number(project.currentBudgetRevision))
            ? Number(project.currentBudgetRevision)
            : -1;
          const newBudgetItems = budgets
            .filter((b) => b.projectId === project.id && Number(b.createdAfterRevision) === currentRevNo)
            .map((b) => ({
              id: b.id,
              category: b.category || "",
              code: b.code || "",
              description: b.description || "",
              amount: Number(b.amount || 0),
              createdAfterRevision: b.createdAfterRevision,
            }));
          const revisionData = {
            projectId: project.id,
            projectJobNo: project.jobNo || "",
            projectName: project.name || "",
            revNo: nextRevNo,
            rows,
            grandTotal: total,
            attachments,
            requestNote,
            requestAttachments,
            budgetRevisionRequest: project.budgetRevisionRequest || null,
            newBudgetItems,
            approvedBy: userData?.name || userData?.email || userRole || "",
            approvedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          };
          const revRef = await addDoc(
            collection(db, "artifacts", appId, "public", "data", "budgetRevisions"),
            revisionData
          );
          const ok = await updateData("projects", project.id, {
            budgetTotal: total,
            currentBudgetRevision: nextRevNo,
            budgetAttachments: attachments,
            status: "Active",
            budgetRevisionRequest: project.budgetRevisionRequest
              ? {
                  ...project.budgetRevisionRequest,
                  status: "Completed",
                  completedBy: userData?.name || userData?.email || userRole || "",
                  completedAt: new Date().toISOString(),
                }
              : null,
            budgetRevApprovedAt: new Date().toISOString(),
            budgetRevApprovedBy: userData?.name || userData?.email || userRole || "",
          });
          if (ok) {
            const newRevision = { id: revRef.id, ...revisionData };
            setBudgetRevisions((prev) => [newRevision, ...prev].sort((a, b) => Number(b.revNo || 0) - Number(a.revNo || 0)));
            setBudgetAttachmentFiles([]);
            showAlert("สำเร็จ", `บันทึก Revision Budget Rev.${nextRevNo} (${formatCurrency(total)}) เรียบร้อย`, "success");
            setSelectedProject((prev) => prev?.id === project.id ? {
              ...prev,
              budgetTotal: total,
              currentBudgetRevision: nextRevNo,
              budgetAttachments: attachments,
              status: "Active",
              budgetRevisionRequest: prev.budgetRevisionRequest ? {
                ...prev.budgetRevisionRequest,
                status: "Completed",
                completedBy: userData?.name || userData?.email || userRole || "",
                completedAt: new Date().toISOString(),
              } : null,
            } : prev);
          }
        } finally {
          setBudgetActioning(false);
        }
      }
    );
  };

  const handleRequestRevBudget = (project) => {
    if (!project?.id || !canRequestRevBudget) return;
    if (!String(budgetRevisionNote || "").trim()) {
      showAlert("กรุณากรอก Note Reason", "ต้องระบุ Note Reason ก่อนส่งคำขอ Rev Budget", "warning");
      return;
    }
    openConfirm(
      "Request Rev Budget",
      "ยืนยันส่งคำขอแก้ไข Budget ไปยัง MD?",
      async () => {
        setBudgetActioning(true);
        try {
          const requestAttachments = await uploadBudgetRevisionRequestAttachments(project.id, budgetAttachmentFiles);
          const requestData = {
            status: "Pending MD",
            note: String(budgetRevisionNote || "").trim(),
            attachments: requestAttachments,
            requestedBy: userData?.name || userData?.email || userRole || "",
            requestedAt: new Date().toISOString(),
            approvedBy: "",
            approvedAt: "",
            rejectedBy: "",
            rejectedAt: "",
          };
          const ok = await updateData("projects", project.id, {
            budgetRevisionRequest: requestData,
          });
          if (ok) {
            setSelectedProject((prev) => prev?.id === project.id ? { ...prev, budgetRevisionRequest: requestData } : prev);
            setBudgetAttachmentFiles([]);
            showAlert("สำเร็จ", "ส่งคำขอ Rev Budget ไปยัง MD เรียบร้อย", "success");
          }
        } finally {
          setBudgetActioning(false);
        }
      }
    );
  };

  const handleBudgetRevisionRequestAction = (project, action) => {
    if (!project?.id || !canApproveRevBudget) return;
    const isApprove = action === "approve";
    openConfirm(
      isApprove ? "Approve Request Rev Budget" : "Reject Request Rev Budget",
      isApprove
        ? "ยืนยันอนุมัติคำขอแก้ไข Budget และเปลี่ยนสถานะโครงการเป็น Prepare Budget?"
        : "ยืนยันปฏิเสธคำขอแก้ไข Budget?",
      async () => {
        setBudgetActioning(true);
        try {
          const nextRequest = {
            ...(project.budgetRevisionRequest || {}),
            status: isApprove ? "Approved" : "Rejected",
            approvedBy: isApprove ? (userData?.name || userData?.email || userRole || "") : "",
            approvedAt: isApprove ? new Date().toISOString() : "",
            rejectedBy: !isApprove ? (userData?.name || userData?.email || userRole || "") : "",
            rejectedAt: !isApprove ? new Date().toISOString() : "",
          };
          const payload = {
            budgetRevisionRequest: nextRequest,
            ...(isApprove ? { status: "Prepare Budget" } : {}),
          };
          const ok = await updateData("projects", project.id, payload);
          if (ok) {
            setSelectedProject((prev) => prev?.id === project.id ? { ...prev, ...payload } : prev);
            showAlert(
              "สำเร็จ",
              isApprove ? "อนุมัติคำขอ Rev Budget เรียบร้อย" : "ปฏิเสธคำขอ Rev Budget เรียบร้อย",
              "success"
            );
          }
        } finally {
          setBudgetActioning(false);
        }
      },
      isApprove ? "default" : "danger"
    );
  };

  const renderManageBudgetSection = (project, readonly = false) => {
    const projectId = project?.id || editingProjectId || formData.jobNo;
    const total = getProjectBudgetTotal(projectId);
    const attachments = project?.budgetAttachments || formData.budgetAttachments || [];
    const revisionRequest = project?.budgetRevisionRequest || formData.budgetRevisionRequest || null;
    const hasPendingRevisionRequest = revisionRequest?.status === "Pending MD";
    const canEditManageBudgetFields = Boolean(project?.id && canRequestRevBudget && !hasPendingRevisionRequest);
    const requestAttachments = revisionRequest?.attachments || [];
    return (
      <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h4 className="text-sm font-bold text-slate-800">Section 2: Manage Budget</h4>
            <p className="text-xs text-slate-500">Budget Total อ่านจาก Grand Total ของ Budget Dashboard</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {canRequestRevBudget && project?.id && !hasPendingRevisionRequest && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 disabled:opacity-50"
                disabled={budgetActioning}
                onClick={() => handleRequestRevBudget(project)}
              >
                Request Rev Budget
              </button>
            )}
            {canApproveRevBudget && project?.status !== "Active" && (
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
                disabled={!projectId || budgetActioning}
                onClick={() => handleApproveRevBudget(project || { ...formData, id: projectId })}
              >
                Approve & Rev. Budget
              </button>
            )}
          </div>
        </div>
        {revisionRequest?.status && (
          <div className={`mb-4 rounded-xl border p-3 text-xs ${
            hasPendingRevisionRequest
              ? "bg-amber-50 border-amber-200 text-amber-800"
              : revisionRequest.status === "Approved"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-bold">Request Rev Budget: {revisionRequest.status}</div>
                <div className="mt-0.5">
                  Requested by {revisionRequest.requestedBy || "-"}
                  {revisionRequest.requestedAt ? ` • ${new Date(revisionRequest.requestedAt).toLocaleString()}` : ""}
                </div>
                {revisionRequest.note && (
                  <div className="mt-2 whitespace-pre-wrap">
                    <span className="font-bold">Note Reason:</span> {revisionRequest.note}
                  </div>
                )}
              </div>
              {hasPendingRevisionRequest && canApproveRevBudget && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-[11px] font-bold hover:bg-green-700 disabled:opacity-50"
                    disabled={budgetActioning}
                    onClick={() => handleBudgetRevisionRequestAction(project, "approve")}
                  >
                    Approve Request
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 disabled:opacity-50"
                    disabled={budgetActioning}
                    onClick={() => handleBudgetRevisionRequestAction(project, "reject")}
                  >
                    Reject Request
                  </button>
                </div>
              )}
            </div>
            {requestAttachments.length > 0 && (
              <div className="mt-3 pt-3 border-t border-current/10">
                <div className="font-bold mb-1">Request Attachments</div>
                <div className="flex flex-wrap gap-2">
                  {requestAttachments.map((att, i) => (
                    <a
                      key={`${att.url || att.name}-${i}`}
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2 py-1 rounded bg-white border text-[11px] text-blue-700 hover:bg-blue-50"
                    >
                      {att.name || `Attachment ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InputGroup label="Budget Total">
            <input
              type="text"
              className="w-full border rounded p-2 text-sm bg-slate-100 text-blue-700 font-bold"
              value={formatCurrency(total)}
              readOnly
            />
          </InputGroup>
          <InputGroup label="Note Reason">
            <textarea
              className="w-full border rounded p-2 text-sm bg-white min-h-[82px] disabled:bg-slate-100 disabled:text-slate-500"
              value={hasPendingRevisionRequest || !canEditManageBudgetFields ? (revisionRequest?.note || budgetRevisionNote) : budgetRevisionNote}
              disabled={!canEditManageBudgetFields || budgetActioning}
              onChange={(e) => setBudgetRevisionNote(e.target.value)}
              placeholder="ระบุเหตุผลที่ต้องการแก้ไข Budget"
            />
          </InputGroup>
          <InputGroup label="Attachment">
            <input
              type="file"
              multiple
              className="w-full border rounded p-2 text-sm bg-white"
              disabled={!canEditManageBudgetFields || budgetActioning}
              onChange={(e) => setBudgetAttachmentFiles(Array.from(e.target.files || []))}
            />
          </InputGroup>
        </div>
        {budgetAttachmentFiles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {budgetAttachmentFiles.map((f, i) => (
              <span key={`${f.name}-${i}`} className="px-2 py-1 rounded bg-white border text-[11px] text-slate-600">
                {f.name}
              </span>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="mt-3">
            <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Uploaded Attachments</div>
            <div className="flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <a
                  key={`${att.url || att.name}-${i}`}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded bg-white border text-[11px] text-blue-700 hover:bg-blue-50"
                >
                  {att.name || `Attachment ${i + 1}`}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const handleDelete = (id) => {
    openConfirm(
      "ยืนยันการลบโครงการ",
      "ข้อมูลที่เกี่ยวข้องอาจค้างอยู่ในระบบ คุณแน่ใจหรือไม่?",
      async () => {
        const ok = await deleteData("projects", id);
        if (ok) setSelectedProject(null);
      },
      "danger"
    );
  };

  const handleDeleteBudgetRevision = (revision) => {
    if (!canDeleteBudgetRevision || !revision?.id) return;
    openConfirm(
      `ยืนยันการลบ Rev.${revision.revNo}`,
      "Revision Budget นี้จะถูกลบออกจากระบบ คุณแน่ใจหรือไม่?",
      async () => {
        try {
          await deleteDoc(doc(db, "artifacts", appId, "public", "data", "budgetRevisions", revision.id));
          const remaining = budgetRevisions.filter((r) => r.id !== revision.id);
          setBudgetRevisions(remaining);
          const nextCurrentRev = remaining.length > 0
            ? Math.max(...remaining.map((r) => Number(r.revNo || 0)))
            : null;
          if (selectedProject?.id) {
            await updateData("projects", selectedProject.id, { currentBudgetRevision: nextCurrentRev }, { skipLog: true });
            setSelectedProject((prev) => prev ? { ...prev, currentBudgetRevision: nextCurrentRev } : prev);
          }
          await logAction?.("Delete", `Deleted Budget Revision Rev.${revision.revNo} (${revision.projectJobNo || revision.projectId})`, revision.projectId);
          showAlert("สำเร็จ", `ลบ Revision Budget Rev.${revision.revNo} เรียบร้อย`, "success");
        } catch (err) {
          console.error("[Budget Revision] delete error:", err);
          showAlert("Error", "ลบ Revision Budget ไม่สำเร็จ", "error");
        }
      },
      "danger"
    );
  };

  const renderProjectStatusBadge = (status) => (
    status ? (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        status === "Active" ? "bg-green-100 text-green-700" :
        status === "Prepare Budget" ? "bg-purple-100 text-purple-700" :
        status === "Complete" ? "bg-blue-100 text-blue-700" :
        status === "Cancel" ? "bg-red-100 text-red-700" :
        status === "Close" ? "bg-slate-100 text-slate-600" :
        "bg-gray-100 text-gray-600"
      }`}>{status}</span>
    ) : "-"
  );

  const renderProjectTypeBadge = (projectType) => (
    projectType ? (
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
        projectType === "Profit Project" ? "bg-indigo-100 text-indigo-700" :
        projectType === "Spent Project" ? "bg-orange-100 text-orange-700" :
        "bg-gray-100 text-gray-600"
      }`}>{projectType}</span>
    ) : "-"
  );

  const DetailItem = ({ label, value, className = "" }) => (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-sm font-semibold text-slate-800 ${className}`}>{value || "-"}</div>
    </div>
  );

  const RevisionBudgetTable = ({ revision }) => (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      <div className="px-4 py-3 bg-slate-50 border-b flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-800">Revision Budget Rev.{revision.revNo}</div>
          <div className="text-[11px] text-slate-500">
            Approved by {revision.approvedBy || "-"} • {revision.approvedAt ? new Date(revision.approvedAt).toLocaleString() : "-"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase font-bold text-slate-400">Grand Total</div>
            <div className="text-sm font-bold text-blue-700">{formatCurrency(revision.grandTotal)}</div>
          </div>
          {canDeleteBudgetRevision && (
            <button
              type="button"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 text-white text-[11px] font-bold hover:bg-red-700"
              onClick={() => handleDeleteBudgetRevision(revision)}
            >
              <Trash2 size={12} /> Delete Rev
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-slate-700">
          <thead>
            <tr className="bg-slate-200 text-slate-800 uppercase">
              <th className="px-4 py-2 text-left w-20">Code</th>
              <th className="px-4 py-2 text-left">หมวดงาน</th>
              <th className="px-4 py-2 text-right w-40 bg-blue-100">Budget Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(revision.rows || []).map((row) => (
              <tr key={`${revision.id}-${row.code}`}>
                <td className="px-4 py-2 font-bold text-slate-600">{row.code}</td>
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.budgetTotal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-900 text-white font-bold">
              <td className="px-4 py-2 text-right" colSpan={2}>Grand Total</td>
              <td className="px-4 py-2 text-right">{formatCurrency(revision.grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {(revision.requestNote || (revision.requestAttachments || []).length > 0) && (
        <div className="px-4 py-3 border-t bg-amber-50">
          <div className="text-[10px] font-bold uppercase text-amber-700 mb-2">Request Rev Budget</div>
          {revision.requestNote && (
            <div className="text-xs text-slate-700 whitespace-pre-wrap mb-2">
              <span className="font-bold">Note Reason:</span> {revision.requestNote}
            </div>
          )}
          {(revision.requestAttachments || []).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {(revision.requestAttachments || []).map((att, i) => (
                <a
                  key={`${revision.id}-request-${att.url || att.name}-${i}`}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2 py-1 rounded bg-white border text-[11px] text-blue-700 hover:bg-blue-50"
                >
                  {att.name || `Request Attachment ${i + 1}`}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
      {(revision.newBudgetItems || []).length > 0 && (
        <div className="px-4 py-3 border-t bg-emerald-50">
          <div className="text-[10px] font-bold uppercase text-emerald-700 mb-2">New Budget Items in this Rev</div>
          <div className="space-y-1">
            {(revision.newBudgetItems || []).map((item) => (
              <div key={`${revision.id}-new-${item.id}`} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-emerald-100 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-bold text-emerald-700 mr-2">{item.code}</span>
                  <span className="text-slate-700">{item.description || "-"}</span>
                </div>
                <div className="font-bold text-slate-800 whitespace-nowrap">{formatCurrency(item.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {(revision.attachments || []).length > 0 && (
        <div className="px-4 py-3 border-t bg-slate-50">
          <div className="text-[10px] font-bold uppercase text-slate-400 mb-2">Attachments</div>
          <div className="flex flex-wrap gap-2">
            {(revision.attachments || []).map((att, i) => (
              <a
                key={`${revision.id}-${att.url || att.name}-${i}`}
                href={att.url}
                target="_blank"
                rel="noreferrer"
                className="px-2 py-1 rounded bg-white border text-[11px] text-blue-700 hover:bg-blue-50"
              >
                {att.name || `Attachment ${i + 1}`}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4 w-full min-w-0">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-800">
            A. จัดการโครงการ (Projects)
          </h2>
          <ColumnVisibilityToggle tableId="project" />
        </div>
        <div className="flex items-center gap-2">
        {canUseFunction("projects", "add") && (
          <Button
            onClick={() => {
              setEditingProjectId(null);
              setFormData(EMPTY_FORM);
              setIsModalOpen(true);
            }}
          >
            <Plus size={14} /> เพิ่มโครงการใหม่
          </Button>
        )}
        </div>
      </div>
      <Card className="overflow-hidden w-full min-w-0">
        <div ref={projectTableRef} className="w-full min-w-0">
        <table className="w-full text-left text-xs text-slate-600 table-fixed">
          <thead className="bg-slate-50 text-slate-900 uppercase font-semibold">
            <tr>
              {isColumnVisible("project", "jobNo") && <ResizableTh tableId="project" colKey="jobNo" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.jobNo}>Job No.</ResizableTh>}
              {isColumnVisible("project", "name") && <ResizableTh tableId="project" colKey="name" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.name}>Project Name</ResizableTh>}
              {isColumnVisible("project", "location") && <ResizableTh tableId="project" colKey="location" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.location}>Location</ResizableTh>}
              {isColumnVisible("project", "projectStatus") && <ResizableTh tableId="project" colKey="projectStatus" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.projectStatus}>Project Status</ResizableTh>}
              {isColumnVisible("project", "contractValue") && <ResizableTh tableId="project" colKey="contractValue" className="py-2 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.contractValue}>Contract Value</ResizableTh>}
              {isColumnVisible("project", "start") && <ResizableTh tableId="project" colKey="start" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.start}>Start</ResizableTh>}
              {isColumnVisible("project", "finish") && <ResizableTh tableId="project" colKey="finish" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.finish}>Finish</ResizableTh>}
              {isColumnVisible("project", "pm") && <ResizableTh tableId="project" colKey="pm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.pm}>PM</ResizableTh>}
              {isColumnVisible("project", "cm") && <ResizableTh tableId="project" colKey="cm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.cm}>CM</ResizableTh>}
              {isColumnVisible("project", "projectType") && <ResizableTh tableId="project" colKey="projectType" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.projectType}>Project Type</ResizableTh>}
              {isColumnVisible("project", "actions") && <th className="py-2 px-3 text-right" style={{ width: projectTableLayout.scaled.actions }}>Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projectRows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedProject(p)}>
                {isColumnVisible("project", "jobNo") && (
                <td className="py-2 px-3 font-medium text-slate-900" title={p.jobNo}>
                  <span className="cell-text">{p.jobNo}</span>
                </td>
                )}
                {isColumnVisible("project", "name") && (
                <td className="py-2 px-3 font-medium" title={p.name}><span className="cell-text">{p.name}</span></td>
                )}
                {isColumnVisible("project", "location") && (
                <td className="py-2 px-3 text-slate-500" title={p.location}><span className="cell-text">{p.location}</span></td>
                )}
                {isColumnVisible("project", "projectStatus") && (
                <td className="py-2 px-3">
                  {p.status ? (
                    renderProjectStatusBadge(p.status)
                  ) : "-"}
                </td>
                )}
                {isColumnVisible("project", "contractValue") && (
                <td className="py-2 px-3 text-right font-semibold text-blue-700">
                  {formatCurrency(p.contractValue)}
                </td>
                )}
                {isColumnVisible("project", "start") && (
                <td className="py-2 px-3 text-xs" title={p.startDate}><span className="cell-text">{p.startDate}</span></td>
                )}
                {isColumnVisible("project", "finish") && (
                <td className="py-2 px-3 text-xs" title={p.endDate}><span className="cell-text">{p.endDate}</span></td>
                )}
                {isColumnVisible("project", "pm") && (
                <td className="py-2 px-3 text-blue-600 font-medium" title={p.pmName}>
                  <span className="cell-text">{p.pmName}</span>
                </td>
                )}
                {isColumnVisible("project", "cm") && (
                <td className="py-2 px-3 text-green-600 font-medium" title={p.cmName}>
                  <span className="cell-text">{p.cmName}</span>
                </td>
                )}
                {isColumnVisible("project", "projectType") && (
                <td className="py-2 px-3">
                  {p.projectType ? (
                    renderProjectTypeBadge(p.projectType)
                  ) : "-"}
                </td>
                )}
                {isColumnVisible("project", "actions") && (
                <td className="py-2 px-3 text-right flex justify-end gap-1">
                  {p.budgetRevisionRequest?.status === "Pending MD" && canApproveRevBudget && (
                    <>
                      <span className="inline-flex items-center px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                        Rev Pending
                      </span>
                      <button
                        className="px-2 py-1 rounded bg-green-600 text-white text-[10px] font-bold hover:bg-green-700 disabled:opacity-50"
                        disabled={budgetActioning}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBudgetRevisionRequestAction(p, "approve");
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="px-2 py-1 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700 disabled:opacity-50"
                        disabled={budgetActioning}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBudgetRevisionRequestAction(p, "reject");
                        }}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {canUseFunction("projects", "edit") && (
                    <button
                      className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(p);
                      }}
                    >
                      <Edit size={14} />
                    </button>
                  )}
                  {canUseFunction("projects", "delete") && (
                    <button
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </Card>
      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10010] animate-in fade-in duration-200" onClick={() => setSelectedProject(null)}>
          <Card className="w-full max-w-3xl p-0 max-h-[90vh] overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold bg-white/15 border border-white/20 px-2 py-0.5 rounded-full">
                      {selectedProject.jobNo || "-"}
                    </span>
                    {renderProjectStatusBadge(selectedProject.status)}
                    {renderProjectTypeBadge(selectedProject.projectType)}
                  </div>
                  <h3 className="text-xl font-bold leading-tight">{selectedProject.name || "-"}</h3>
                  <p className="text-sm text-slate-300 mt-1">{selectedProject.location || "-"}</p>
                </div>
                <button
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                  onClick={() => {
                    setSelectedProject(null);
                    setDetailTab("detail");
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto max-h-[calc(90vh-160px)]">
              <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${detailTab === "detail" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  onClick={() => setDetailTab("detail")}
                >
                  Detail
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${detailTab === "revision-budget" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  onClick={() => setDetailTab("revision-budget")}
                >
                  Revision Budget
                </button>
              </div>
              {detailTab === "detail" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <DetailItem label="Job No." value={selectedProject.jobNo} />
                    <DetailItem label="Contract Value" value={formatCurrency(selectedProject.contractValue)} className="text-blue-700" />
                    <DetailItem label="Project Name" value={selectedProject.name} />
                    <DetailItem label="Location" value={selectedProject.location} />
                    <DetailItem label="Start Date" value={selectedProject.startDate} />
                    <DetailItem label="Finish Date" value={selectedProject.endDate} />
                    <DetailItem label="PM" value={selectedProject.pmName} className="text-blue-600" />
                    <DetailItem label="CM" value={selectedProject.cmName} className="text-green-600" />
                    <DetailItem label="Project Status" value={renderProjectStatusBadge(selectedProject.status)} />
                    <DetailItem label="Project Type" value={renderProjectTypeBadge(selectedProject.projectType)} />
                    <DetailItem label="Contract Info" value={selectedProject.contractInfo} />
                    <DetailItem label="Contract Name" value={selectedProject.contractName} />
                    <DetailItem label="Client Name" value={selectedProject.clientName} />
                    <DetailItem label="Main Contractor" value={selectedProject.mainContractor} />
                    <DetailItem label="Sub-Contractor" value={selectedProject.subContractor} />
                    <DetailItem label="PO No." value={selectedProject.poNo} />
                  </div>
                  {selectedProject.contractAttachments?.length > 0 && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Contract Attachments</div>
                      <div className="flex flex-wrap gap-2">
                        {selectedProject.contractAttachments.map((att, i) => (
                          <a
                            key={`${att.url || att.name}-${i}`}
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-1 rounded bg-white border text-[11px] text-blue-700 hover:bg-blue-50"
                          >
                            {att.name || `Attachment ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    {renderManageBudgetSection(selectedProject, true)}
                  </div>
                </>
              )}
              {detailTab === "revision-budget" && (
                <div className="space-y-4">
                  {revisionsLoading ? (
                    <div className="text-sm text-slate-500 p-6 text-center border rounded-xl bg-slate-50">Loading revisions...</div>
                  ) : budgetRevisions.length === 0 ? (
                    <div className="text-sm text-slate-500 p-6 text-center border rounded-xl bg-slate-50">
                      ยังไม่มี Revision Budget สำหรับโครงการนี้
                    </div>
                  ) : (
                    budgetRevisions.map((revision) => (
                      <RevisionBudgetTable key={revision.id} revision={revision} />
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-between items-center gap-2 p-4 border-t bg-white">
              <Button variant="secondary" onClick={() => {
                setSelectedProject(null);
                setDetailTab("detail");
              }}>
                ปิด
              </Button>
              <div className="flex gap-2">
                {canUseFunction("projects", "edit") && (
                  <Button onClick={() => handleEdit(selectedProject)}>
                    <Edit size={14} /> Edit
                  </Button>
                )}
                {canUseFunction("projects", "delete") && (
                  <button
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all"
                    onClick={() => handleDelete(selectedProject.id)}
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10010] animate-in fade-in duration-200">
          <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">
              {editingProjectId ? "แก้ไขข้อมูลโครงการ" : "เพิ่มโครงการใหม่"}
            </h3>
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-bold text-slate-800 mb-3">Section 1: Project Detail</h4>
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
              <InputGroup label="Project Status">
                <select
                  className="w-full border rounded p-2 text-sm bg-white disabled:bg-slate-100 disabled:text-slate-500"
                  value={formData.status || ""}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  disabled={!canEditProjectStatus}
                >
                  <option value="">-- เลือก Status --</option>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </InputGroup>
              <InputGroup label="Project Type">
                <select
                  className="w-full border rounded p-2 text-sm bg-white"
                  value={formData.projectType || ""}
                  onChange={(e) => setFormData({ ...formData, projectType: e.target.value })}
                >
                  <option value="">-- เลือก Type --</option>
                  {PROJECT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </InputGroup>
              <InputGroup label="Contract Info">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.contractInfo || ""}
                  onChange={(e) => setFormData({ ...formData, contractInfo: e.target.value })}
                />
              </InputGroup>
              <InputGroup label="Contract Name">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.contractName || ""}
                  onChange={(e) => setFormData({ ...formData, contractName: e.target.value })}
                />
              </InputGroup>
              <InputGroup label="Client Name">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.clientName || ""}
                  onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                />
              </InputGroup>
              <InputGroup label="Main Contractor">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.mainContractor || ""}
                  onChange={(e) => setFormData({ ...formData, mainContractor: e.target.value })}
                />
              </InputGroup>
              <InputGroup label="Sub-Contractor">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.subContractor || ""}
                  onChange={(e) => setFormData({ ...formData, subContractor: e.target.value })}
                />
              </InputGroup>
              <InputGroup label="PO No.">
                <input
                  type="text"
                  className="w-full border rounded p-2 text-sm"
                  value={formData.poNo || ""}
                  onChange={(e) => setFormData({ ...formData, poNo: e.target.value })}
                />
              </InputGroup>
              <div className="col-span-2">
                <InputGroup label="Contract Attachment">
                  <input
                    type="file"
                    multiple
                    className="w-full border rounded p-2 text-sm bg-white"
                    disabled={budgetActioning}
                    onChange={(e) => setContractAttachmentFiles(Array.from(e.target.files || []))}
                  />
                  {contractAttachmentFiles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contractAttachmentFiles.map((f, i) => (
                        <span key={`${f.name}-${i}`} className="px-2 py-1 rounded bg-white border text-[11px] text-slate-600">
                          {f.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {formData.contractAttachments?.length > 0 && (
                    <div className="mt-2">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">Uploaded Contract Attachments</div>
                      <div className="flex flex-wrap gap-2">
                        {formData.contractAttachments.map((att, i) => (
                          <div key={`${att.url || att.name}-${i}`} className="flex items-center gap-1 bg-white border rounded px-2 py-1">
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-blue-700 hover:text-blue-900"
                            >
                              {att.name || `Attachment ${i + 1}`}
                            </a>
                            <button
                              type="button"
                              className="text-red-500 hover:text-red-700 ml-1"
                              onClick={() => {
                                const newAtts = formData.contractAttachments.filter((_, idx) => idx !== i);
                                setFormData({ ...formData, contractAttachments: newAtts });
                              }}
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </InputGroup>
              </div>
            </div>
            </div>
            {renderManageBudgetSection(formData, false)}
            <div className="flex justify-end gap-2 mt-6 border-t pt-4">
              <Button
                variant="secondary"
                onClick={() => setIsModalOpen(false)}
              >
                ยกเลิก
              </Button>
              <Button onClick={handleSave} disabled={budgetActioning}>บันทึก</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});


export default ProjectsView;

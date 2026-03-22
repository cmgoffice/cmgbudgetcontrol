// @ts-nocheck
import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from "react";
import { Plus, Trash2, Edit, Upload, Download, Lock, Unlock, Users, UserCheck, History } from "lucide-react";
import { useAppData } from "../contexts/AppDataContext";
import { Card, Button, InputGroup, Badge, formatCurrency } from "../components/ui";
import ResizableTh from "../components/ResizableTh";
import ColumnVisibilityToggle from "../components/ColumnVisibilityToggle";
import { useProportionalTableLayout } from "../hooks/useProportionalTableLayout";
import { TABLE_LAYOUT_DEFAULTS } from "../lib/tableLayoutDefaults";
const ProjectsView = React.memo(() => {
  const { visibleProjects, updateData, deleteData, showAlert, openConfirm, userRole, userData, columnWidths, handleColumnResize, logAction, canUseFunction, isColumnVisible } = useAppData();
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
              {isColumnVisible("project", "contractValue") && <ResizableTh tableId="project" colKey="contractValue" className="py-2 px-3 text-right" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.contractValue}>Contract Value</ResizableTh>}
              {isColumnVisible("project", "start") && <ResizableTh tableId="project" colKey="start" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.start}>Start</ResizableTh>}
              {isColumnVisible("project", "finish") && <ResizableTh tableId="project" colKey="finish" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.finish}>Finish</ResizableTh>}
              {isColumnVisible("project", "pm") && <ResizableTh tableId="project" colKey="pm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.pm}>PM</ResizableTh>}
              {isColumnVisible("project", "cm") && <ResizableTh tableId="project" colKey="cm" className="py-2 px-3" isAdmin={userRole==="Administrator"} onResize={projectTableLayout.handleResize} currentWidth={projectTableLayout.scaled.cm}>CM</ResizableTh>}
              {isColumnVisible("project", "actions") && <th className="py-2 px-3 text-right" style={{ width: projectTableLayout.scaled.actions }}>Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleProjects.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
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
                {isColumnVisible("project", "actions") && (
                <td className="py-2 px-3 text-right flex justify-end gap-1">
                  {canUseFunction("projects", "edit") && (
                    <button
                      className="text-blue-500 hover:text-blue-700 p-1 hover:bg-blue-50 rounded"
                      onClick={() => handleEdit(p)}
                    >
                      <Edit size={14} />
                    </button>
                  )}
                  {canUseFunction("projects", "delete") && (
                    <button
                      className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                      onClick={() => handleDelete(p.id)}
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
});


export default ProjectsView;
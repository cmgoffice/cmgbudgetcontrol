import React from "react";
import { createRoot } from "react-dom/client";
import { act, Simulate } from "react-dom/test-utils";
import MaterialReceivedModal from "./MaterialReceivedModal";
import { confirmMaterialReceive } from "../lib/materialReceiveStore";
import { uploadAttachment, deleteStorageFile } from "../lib/uploadAttachment";

jest.mock("../lib/firebase", () => ({ db: {}, appId: "test-app" }));
jest.mock("../lib/materialReceiveStore", () => ({ confirmMaterialReceive: jest.fn() }));
jest.mock("../lib/uploadAttachment", () => ({ uploadAttachment: jest.fn(), deleteStorageFile: jest.fn() }));
let root;
let container;
let props;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  props = {
    po: { id: "po-1", poNo: "PO-001", projectId: "project-1", poType: "CR", status: "Approved", materialReceiveRequired: true,
      materialApproveRefs: [{ prId: "pr-1", prNo: "PR-001", no: "MA-123" }], items: [{ description: "Steel", quantity: 10, unit: "kg", price: 100, amount: 1000 }] },
    user: { uid: "user-1" }, userName: "Receiver", canConfirm: true, onClose: jest.fn(), onSaved: jest.fn(), showAlert: jest.fn(),
  };
  confirmMaterialReceive.mockResolvedValue(true);
  uploadAttachment.mockImplementation(async (file) => ({ url: `https://example.test/${file.name}`, name: file.name }));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = () => act(() => root.render(<MaterialReceivedModal {...props} />));
const confirmButton = () => Array.from(document.querySelectorAll("button")).find((button) => button.textContent.includes("ยืนยัน Material Received"));

test("shows references and ordered items without a received-quantity or money input", () => {
  render();
  expect(document.querySelector('[role="dialog"]').textContent).toContain("MA-123");
  expect(document.body.textContent).toContain("Steel");
  expect(document.querySelector('input[type="number"]')).toBeNull();
  expect(document.body.textContent).not.toContain("1000");
});
test("uploads multiple certificates and note before confirmation; double click commits once", async () => {
  render();
  const files = [new File(["pdf"], "a.pdf", { type: "application/pdf" }), new File(["img"], "b.jpg", { type: "image/jpeg" })];
  act(() => Simulate.change(document.querySelector('input[type="file"]'), { target: { files, value: "" } }));
  act(() => Simulate.change(document.querySelector("textarea"), { target: { value: "ตรวจ Certificate แล้ว" } }));
  await act(async () => { const button = confirmButton(); button.click(); button.click(); });
  expect(uploadAttachment).toHaveBeenCalledTimes(2);
  expect(confirmMaterialReceive).toHaveBeenCalledTimes(1);
  expect(confirmMaterialReceive.mock.calls[0][0]).toMatchObject({ note: "ตรวจ Certificate แล้ว", poId: "po-1", certificates: [{ name: "a.pdf" }, { name: "b.jpg" }] });
  expect(props.onSaved).toHaveBeenCalledTimes(1);
});
test("upload failure does not confirm or close the form", async () => {
  uploadAttachment.mockRejectedValue(new Error("Upload failed"));
  render();
  act(() => Simulate.change(document.querySelector('input[type="file"]'), { target: { files: [new File(["pdf"], "a.pdf", { type: "application/pdf" })], value: "" } }));
  await act(async () => confirmButton().click());
  expect(confirmMaterialReceive).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.showAlert).toHaveBeenCalledWith("บันทึกไม่สำเร็จ", expect.stringContaining("Upload failed"), "error");
});
test("permission and passed history render without an editable confirmation action", () => {
  props.canConfirm = false;
  render();
  expect(confirmButton()).toBeUndefined();
  props.po = { ...props.po, materialReceive: { status: "passed", note: "Checked", certificates: [{ name: "cert.pdf", url: "https://example.test/cert.pdf" }], confirmedByName: "First receiver" } };
  props.canConfirm = true;
  render();
  expect(confirmButton()).toBeUndefined();
  expect(document.querySelector('a').href).toBe("https://example.test/cert.pdf");
  expect(document.body.textContent).toContain("First receiver");
});
test("a transaction already completed elsewhere does not overwrite history", async () => {
  confirmMaterialReceive.mockResolvedValue(false);
  render();
  await act(async () => confirmButton().click());
  expect(props.onSaved).not.toHaveBeenCalled();
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(deleteStorageFile).not.toHaveBeenCalled();
});

test("removes selected existing certificates only after confirmation commits", async () => {
  const existing = { name: "old.pdf", url: "https://example.test/old.pdf" };
  props.po.materialReceive = { status: "pending", certificates: [existing] };
  deleteStorageFile.mockResolvedValue(undefined);
  render();
  act(() => document.querySelector('[aria-label="ลบ old.pdf"]').click());
  expect(deleteStorageFile).not.toHaveBeenCalled();
  await act(async () => confirmButton().click());
  expect(confirmMaterialReceive.mock.calls[0][0].removedCertificateUrls).toEqual([existing.url]);
  expect(deleteStorageFile).toHaveBeenCalledWith(existing.url, { strict: true });
});

test("failed confirmation never deletes an existing Storage file", async () => {
  props.po.materialReceive = { status: "pending", certificates: [{ name: "old.pdf", url: "https://example.test/old.pdf" }] };
  confirmMaterialReceive.mockRejectedValue(new Error("Permission denied"));
  render();
  act(() => document.querySelector('[aria-label="ลบ old.pdf"]').click());
  await act(async () => confirmButton().click());
  expect(deleteStorageFile).not.toHaveBeenCalled();
});

test("Storage failure leaves a retry action without confirming twice", async () => {
  props.po.materialReceive = { status: "pending", certificates: [{ name: "old.pdf", url: "https://example.test/old.pdf" }] };
  deleteStorageFile.mockRejectedValueOnce(new Error("Storage denied")).mockResolvedValue(undefined);
  render();
  act(() => document.querySelector('[aria-label="ลบ old.pdf"]').click());
  await act(async () => confirmButton().click());
  expect(props.onClose).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]').textContent).toContain("old.pdf");
  await act(async () => Array.from(document.querySelectorAll("button")).find((button) => button.textContent === "ลองลบอีกครั้ง").click());
  expect(confirmMaterialReceive).toHaveBeenCalledTimes(1);
  expect(props.onClose).toHaveBeenCalledTimes(1);
});

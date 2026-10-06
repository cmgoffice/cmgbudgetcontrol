import { buildCmgStoreReceiveRequest } from "./cmgStoreSync";

jest.mock("firebase/app", () => ({ initializeApp: jest.fn(), getApps: jest.fn() }));
jest.mock("firebase/firestore", () => ({ getFirestore: jest.fn(), doc: jest.fn(), setDoc: jest.fn() }));

const receive = {
  receiveNo: "RP26J03-0001",
  poNo: "PO26J03-0001",
  items: [{ materialNo: "MAT-01", description: "Material", receivedQty: 2 }],
};

describe("manual Receive sending to CMG Store", () => {
  it.each(["Inventory", "none inventory", "Non-Inventory", "", undefined])("allows manual sending with inventory status %s", (inventoryType) => {
    const payload = buildCmgStoreReceiveRequest({ receive, po: { inventoryType }, manual: true });
    expect(payload.header.inventoryType).toBe(inventoryType || "");
    expect(payload.projectId).toBe("J-03");
    expect(payload.items[0].receivedQty).toBe(2);
  });

  it("keeps automatic sending restricted to Inventory", () => {
    expect(buildCmgStoreReceiveRequest({ receive, po: { inventoryType: "Non-Inventory" } })).toBeNull();
    expect(buildCmgStoreReceiveRequest({ receive, po: { inventoryType: "Inventory" } })).not.toBeNull();
  });

  it("uses Receive data when the linked PO is unavailable", () => {
    expect(buildCmgStoreReceiveRequest({ receive, po: {}, manual: true }).header.poNo).toBe(receive.poNo);
  });

  it("still rejects missing project codes and empty received quantities", () => {
    expect(() => buildCmgStoreReceiveRequest({ receive: { ...receive, poNo: "" }, po: {}, manual: true })).toThrow("ไม่พบรหัสโครงการ");
    expect(() => buildCmgStoreReceiveRequest({ receive: { ...receive, items: [] }, po: {}, manual: true })).toThrow("ไม่มีรายการ receive");
  });
});

// In-memory Firestore stand-in: supports collection/doc/query/where("in")/getDocs/writeBatch
// over the "artifacts/{appId}/public/data/{collection}" layout this app uses.
const mockStore = {};

jest.mock("firebase/firestore", () => {
  const collection = (_db, ...segments) => ({ name: segments[segments.length - 1] });
  const doc = (colRef, id) => ({ col: colRef.name, id });
  const where = (field, op, values) => ({ field, op, values });
  const query = (colRef, clause) => ({ name: colRef.name, clause });
  const getDocs = async (q) => {
    const rows = Object.entries(mockStore[q.name] || {});
    const docs = rows
      .filter(([, data]) => q.clause.values.includes(data[q.clause.field]))
      .map(([id, data]) => ({ id, data: () => data }));
    return { docs };
  };
  const writeBatch = () => {
    const ops = [];
    return {
      update: (ref, patch) => ops.push({ ref, patch }),
      commit: async () => {
        ops.forEach(({ ref, patch }) => {
          Object.assign(mockStore[ref.col][ref.id], patch);
        });
      },
    };
  };
  return { collection, doc, where, query, getDocs, writeBatch };
});

const {
  buildMasterFillPatch,
  countVendorReferences,
  mergeVendors,
  pickMasterVendor,
} = require("./vendorMerge");

const resetStore = (data) => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  Object.entries(data).forEach(([k, v]) => {
    mockStore[k] = JSON.parse(JSON.stringify(v));
  });
};

const seed = () => ({
  vendors: {
    A: { code: "V001", name: "บริษัท เอ", address: "", tel: "02-111", creditTerm: "" },
    B: { code: "V001", name: "บริษัท เอ (ซ้ำ)", address: "กรุงเทพ", tel: "", creditTerm: "30" },
  },
  pos: {
    po1: { vendorId: "A", vendorName: "บริษัท เอ", vendorCode: "V001" },
    po2: { vendorId: "B", vendorName: "บริษัท เอ (ซ้ำ)", vendorCode: "V001" },
    po3: { vendorId: "B", vendorName: "บริษัท เอ (ซ้ำ)", vendorCode: "V001" },
  },
  payments: {
    pm1: { contractorId: "B", contractorName: "บริษัท เอ (ซ้ำ)" },
  },
  invoices: {
    inv1: { vendorId: "B", vendorName: "บริษัท เอ (ซ้ำ)" },
  },
  receives: {},
  billings: {},
  pays: {
    pay1: { vendorId: "B", vendorName: "บริษัท เอ (ซ้ำ)" },
  },
  vendorEvaluations: {
    ev1: { vendorId: "B", vendorName: "บริษัท เอ (ซ้ำ)", scores: { q1: 5 } },
    ev2: { contractorId: "B", vendorId: "B", scores: { q1: 3 } },
    ev3: { vendorId: "A", scores: { q1: 4 } },
  },
});

const vendorList = () => Object.entries(mockStore.vendors).map(([id, v]) => ({ id, ...v }));

const updateVendor = async (id, patch) => {
  Object.assign(mockStore.vendors[id], patch);
  return true;
};

describe("countVendorReferences", () => {
  beforeEach(() => resetStore(seed()));

  it("counts each referencing document once per vendor, grouped by menu", async () => {
    const counts = await countVendorReferences({}, "app", ["A", "B"]);
    expect(counts.A.total).toBe(2);
    expect(counts.B.total).toBe(7);
    expect(counts.B.byLabel).toEqual({ PO: 2, Payment: 1, INV: 1, Pay: 1, "ใบประเมิน": 2 });
  });
});

describe("pickMasterVendor", () => {
  it("prefers the vendor with the most linked documents", () => {
    const group = [{ id: "A", name: "x" }, { id: "B", name: "y" }];
    const { master, duplicates, reason } = pickMasterVendor(group, { A: { total: 1 }, B: { total: 5 } });
    expect(master.id).toBe("B");
    expect(duplicates.map((d) => d.id)).toEqual(["A"]);
    expect(reason).toContain("5");
  });

  it("falls back to more filled fields, then lowest id, so the choice is stable", () => {
    const full = { id: "Z", name: "n", address: "a", tel: "t", creditTerm: "30" };
    const thin = { id: "A", name: "n" };
    expect(pickMasterVendor([thin, full], {}).master.id).toBe("Z");
    const same1 = { id: "B", name: "n" };
    const same2 = { id: "A", name: "n" };
    expect(pickMasterVendor([same1, same2], {}).master.id).toBe("A");
    expect(pickMasterVendor([same2, same1], {}).master.id).toBe("A");
  });
});

describe("buildMasterFillPatch", () => {
  it("fills only blank master fields and never overwrites existing values", () => {
    const master = { id: "A", name: "เอ", address: "", tel: "02-111", creditTerm: "" };
    const dup = { id: "B", name: "อื่น", address: "กรุงเทพ", tel: "09-999", creditTerm: "30" };
    expect(buildMasterFillPatch(master, [dup])).toEqual({ address: "กรุงเทพ", creditTerm: "30" });
  });
});

describe("mergeVendors", () => {
  beforeEach(() => resetStore(seed()));

  it("repoints every reference to the master, keeps stored names, and closes the duplicate", async () => {
    const counts = await countVendorReferences({}, "app", ["A", "B"]);
    const { master, duplicates } = pickMasterVendor(vendorList(), counts);
    expect(master.id).toBe("B");

    const result = await mergeVendors({}, "app", { master, duplicates, actorName: "Admin", updateVendor });

    const after = await countVendorReferences({}, "app", ["A"]);
    expect(after.A.total).toBe(0);

    expect(mockStore.pos.po1.vendorId).toBe("B");
    expect(mockStore.pos.po1.vendorName).toBe("บริษัท เอ");
    expect(mockStore.pos.po1.vendorCode).toBe("V001");
    expect(mockStore.vendorEvaluations.ev3.vendorId).toBe("B");

    expect(mockStore.vendors.A).toMatchObject({ status: "merged", mergedInto: "B", mergedBy: "Admin" });
    expect(mockStore.vendors.B.status).toBeUndefined();
    expect(mockStore.vendors.B.tel).toBe("02-111");
    expect(mockStore.vendors.B.name).toBe("บริษัท เอ (ซ้ำ)");

    expect(result.updatedRefs).toEqual({
      pos: [{ id: "po1", fields: ["vendorId"] }],
      vendorEvaluations: [{ id: "ev3", fields: ["vendorId"] }],
    });
  });

  it("updates both id fields on a document that carries vendorId and contractorId", async () => {
    const vendors = vendorList();
    const master = vendors.find((v) => v.id === "A");
    const duplicates = vendors.filter((v) => v.id === "B");
    await mergeVendors({}, "app", { master, duplicates, actorName: "", updateVendor });
    expect(mockStore.vendorEvaluations.ev2).toMatchObject({ vendorId: "A", contractorId: "A" });
    expect(mockStore.payments.pm1.contractorId).toBe("A");
    expect(mockStore.payments.pm1.contractorName).toBe("บริษัท เอ (ซ้ำ)");
  });

  it("can be run again after a partial failure and finishes the remaining work", async () => {
    const vendors = vendorList();
    const master = vendors.find((v) => v.id === "A");
    const duplicates = vendors.filter((v) => v.id === "B");
    const failing = async () => false;
    await expect(
      mergeVendors({}, "app", { master, duplicates, actorName: "", updateVendor: failing })
    ).rejects.toThrow();
    expect(mockStore.vendors.B.status).toBeUndefined();

    await mergeVendors({}, "app", { master, duplicates, actorName: "", updateVendor });
    const after = await countVendorReferences({}, "app", ["B"]);
    expect(after.B.total).toBe(0);
    expect(mockStore.vendors.B.status).toBe("merged");
  });
});

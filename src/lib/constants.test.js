import { mergeFunctionPermissionsWithDefaults, MODULE_ACCESS, MODULE_FUNCTIONS } from "./constants";

describe("Admin Site Receive access", () => {
  it("can read Receive and history without gaining write defaults", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({});

    expect(MODULE_ACCESS.receive).toContain("Admin Site");
    expect(permissions.receive.viewHistory).toContain("Admin Site");
    expect(permissions.receive.receive).not.toContain("Admin Site");
    expect(permissions.receive.delete).not.toContain("Admin Site");
  });
});

describe("Log Payment return Budget permission", () => {
  it("is configurable under Payment Subcontract", () => {
    expect(MODULE_FUNCTIONS["payment-subcontract"]).toContainEqual({
      key: "returnBudget",
      label: "คืน Budget (หน้า Log Payment)",
    });
  });

  it("uses the explicit Payment permission when configured", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({
      "payment-subcontract": { returnBudget: ["Staff"] },
      "po-table": { returnBudget: ["PCM"] },
    });

    expect(permissions["payment-subcontract"].returnBudget).toEqual(["Staff"]);
  });

  it("migrates the previous PO-table roles when the Payment key is absent", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({
      "po-table": { returnBudget: ["PCM", "Custom Approver"] },
    });

    expect(permissions["payment-subcontract"].returnBudget).toEqual(["PCM", "Custom Approver"]);
  });

  it("uses safe defaults for a fresh configuration", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({});

    expect(permissions["payment-subcontract"].returnBudget).toEqual(["PCM", "GM", "MD"]);
  });
});

describe("Budget return acceptance permission", () => {
  it("allows PM to accept a pending Budget return by default", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({});

    expect(MODULE_FUNCTIONS.budget).toContainEqual({
      key: "acceptBudgetReturn",
      label: "รับยอดคืนเข้า Budget",
    });
    expect(permissions.budget.acceptBudgetReturn).toContain("PM");
  });

  it("keeps an explicitly configured acceptance role list", () => {
    const permissions = mergeFunctionPermissionsWithDefaults({
      budget: { acceptBudgetReturn: ["MD"] },
    });

    expect(permissions.budget.acceptBudgetReturn).toEqual(["MD"]);
  });
});

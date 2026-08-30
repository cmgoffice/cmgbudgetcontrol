import { mergeFunctionPermissionsWithDefaults, MODULE_FUNCTIONS } from "./constants";

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

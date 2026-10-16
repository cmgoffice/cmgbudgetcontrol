import { mergeFunctionPermissionsWithDefaults, MODULE_TABS, MODULE_FUNCTIONS, USER_ROLES } from "./constants";

test("QC is available and every tab is persisted as a permission", () => {
  expect(USER_ROLES).toContain("QC");
  Object.entries(MODULE_TABS).forEach(([module, tabs]) => {
    tabs.forEach(tab => expect(MODULE_FUNCTIONS[module].filter(f => f.key === tab.key)).toHaveLength(1));
  });
});
test("legacy Invoice entry preserves the union of configured actions", () => {
  const permissions = mergeFunctionPermissionsWithDefaults({ invoice: { add: ["QC"], edit: [], approve: [], delete: ["PM"] } });
  expect(permissions.invoice.viewEntry).toEqual(["QC", "PM"]);
});
test("explicit tab denials survive reload independently of write access", () => {
  const raw = { invoice: { viewEntry: [], viewHistory: ["QC"], add: ["QC"] }, receive: { viewEntry: [], viewMaterialReceived: ["QC"], viewHistory: [], receive: [] } };
  const result = mergeFunctionPermissionsWithDefaults(raw);
  expect(result.invoice.viewEntry).toEqual([]);
  expect(result.invoice.add).toEqual(["QC"]);
  expect(result.receive.viewMaterialReceived).toEqual(["QC"]);
  expect(result.receive.receive).toEqual([]);
  expect(mergeFunctionPermissionsWithDefaults(result)).toEqual(result);
});

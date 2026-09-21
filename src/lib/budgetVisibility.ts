/**
 * Main Budget visibility is controlled from Firestore via the `Hide` field.
 * Accept the string form as well as a boolean because the value may be edited
 * manually in the backend.
 */
export function isMainBudgetHidden(budget: any): boolean {
  const value = budget?.Hide;
  return value === true || (
    typeof value === "string" && value.trim().toLowerCase() === "true"
  );
}


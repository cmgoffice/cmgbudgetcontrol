import {
  canCompletePaymentGroup,
  isPaidPaymentStatus,
  isPaymentJobCompleted,
} from "./paymentGroupCompletion";

test("shows job completion only when every payment period is paid", () => {
  expect(canCompletePaymentGroup([{ status: "Paid" }, { status: "paid" }])).toBe(true);
  expect(canCompletePaymentGroup([{ status: "Paid" }, { status: "Wait Pay" }])).toBe(false);
  expect(canCompletePaymentGroup([])).toBe(false);
});

test("hides job completion after the payment group is completed", () => {
  expect(canCompletePaymentGroup([
    { status: "Paid" },
    { status: "Paid", jobCompleted: true },
  ])).toBe(false);
  expect(isPaymentJobCompleted({ status: "Paid", jobStatus: "จบงาน" })).toBe(true);
});

test("normalizes paid status safely", () => {
  expect(isPaidPaymentStatus(" Paid ")).toBe(true);
  expect(isPaidPaymentStatus(null)).toBe(false);
});

import { toSatang, approvalNext, canApproveAdvance, getAdvancePoBalance } from "./advancePayment";

test.each([null, undefined, true, false, {}, [], "", " ", "1,000", "12oops", "0xff", "Infinity", NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])("rejects invalid money %p", value => {
  expect(() => toSatang(value)).toThrow();
});
test.each([[0, 0], [" 123.45 ", 12345], [1.005, 101], [100000, 10000000], [100000.01, 10000001]])("converts baht %p", (value, expected) => {
  expect(toSatang(value)).toBe(expected);
});
test("checks safe cents at the upper boundary", () => {
  expect(Number.isSafeInteger(toSatang(90071992547409.9))).toBe(true);
  expect(() => toSatang(90071992547409.92)).toThrow();
});
test.each([10000000, 10000001])("approval sequence and exact threshold %p", amount => {
  expect(approvalNext("Pending PD", amount)).toBe("Pending PCM");
  expect(approvalNext("Pending PCM", amount)).toBe("Pending GM");
  expect(approvalNext("Pending GM", amount)).toBe(amount > 10000000 ? "Pending MD" : "Approved");
  expect(approvalNext("Pending MD", amount)).toBe("Approved");
});
test("terminal states cannot approve even for Administrator; roles match exactly", () => {
  ["Approved", "Paid", "Rejected", "Pending CEO", "toString"].forEach(status => {
    expect(canApproveAdvance(status, ["Administrator"])).toBe(false);
    expect(() => approvalNext(status, 100)).toThrow();
  });
  ["PD", "PCM", "GM", "MD"].forEach(role => {
    expect(canApproveAdvance(`Pending ${role}`, [role])).toBe(true);
    expect(canApproveAdvance(`Pending ${role}`, ["Administrator"])).toBe(true);
    expect(canApproveAdvance(`Pending ${role}`, ["CM", "PM", role.toLowerCase()])).toBe(false);
  });
  expect(canApproveAdvance("Pending PD", ["MD"])).toBe(false);
  expect(() => approvalNext("Pending PD", 1.5)).toThrow();
});
test("balance uses latest cumulative discounted payment, revised PO links and clamps overpayment", () => {
  const po = { id: "po", poNo: "PO_R.1", originalPoNo: "PO", items: [{ amount: 1000 }], discount: 100 };
  const payments = [
    { paymentNo: "PO-001", items: [{ thisPeriodAmount: 200 }] },
    { paymentNo: "PO-002", items: [{ prevAccumAmount: 200, thisPeriodAmount: 300 }], discountAllocationVersion: 1, discountAppliedAmount: 50 },
    { paymentNo: "PO-003", status: "Rejected", items: [{ thisPeriodAmount: 1000 }] },
  ];
  expect(getAdvancePoBalance(po, [])).toBe(900);
  expect(getAdvancePoBalance(po, payments)).toBe(450);
  expect(getAdvancePoBalance(po, [{ poId: "po", items: [{ thisPeriodAmount: 2000 }] }])).toBe(0);
});
test("an unsubmitted latest Draft does not reduce balance", () => {
  const po = { id: "po", amountExVat: 1000 };
  expect(getAdvancePoBalance(po, [
    { poId: "po", periodNo: 1, status: "Paid", items: [{ thisPeriodAmount: 200 }] },
    { poId: "po", periodNo: 2, status: "Draft", items: [{ prevAccumAmount: 200, thisPeriodAmount: 300 }] },
  ])).toBe(800);
});

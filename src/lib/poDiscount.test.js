import {
  applyDiscountToPrAllocations,
  calculateNetPeriodAmount,
  calculatePeriodDiscount,
  getPoAmountExVat,
} from "./poDiscount";

test("calculates the table PO amount after discount and before VAT", () => {
  expect(getPoAmountExVat({
    items: [{ quantity: 1, price: 1000, amount: 1000 }],
    discount: 100,
    vatType: "ex-vat",
    grandTotal: 963,
  })).toBe(900);

  expect(getPoAmountExVat({
    items: [{ quantity: 1, price: 1000, amount: 1000 }],
    discount: 100,
    vatType: "inc-vat",
    grandTotal: 900,
  })).toBe(900);
});

test("supports legacy and incomplete PO amount data without showing VAT", () => {
  expect(getPoAmountExVat({ vatType: "ex-vat", grandTotal: 963 })).toBe(900);
  expect(getPoAmountExVat({ vatType: "ex-vat", grandTotal: 955, manualVat: 55 })).toBe(900);
  expect(getPoAmountExVat({ amountExVat: 900, grandTotal: 963 })).toBe(900);
  expect(getPoAmountExVat({
    items: [{ quantity: 2, price: 500, amount: "" }],
    discount: 100,
  })).toBe(900);
});

test("calculates proportional discount for a payment period", () => {
  expect(calculatePeriodDiscount({
    grossPeriodAmount: 200,
    poGrossAmount: 1000,
    poDiscountAmount: 50,
  })).toBe(10);
  expect(calculateNetPeriodAmount(200, 10)).toBe(190);
});

test("uses the remaining discount in the final period", () => {
  expect(calculatePeriodDiscount({
    grossPeriodAmount: 300,
    poGrossAmount: 1000,
    poDiscountAmount: 50,
    previousDiscountAmount: 35,
    cumulativeGrossAmount: 1000,
    contractGrossAmount: 1000,
  })).toBe(15);
});

test("never returns more discount than the PO discount", () => {
  expect(calculatePeriodDiscount({
    grossPeriodAmount: 100,
    poGrossAmount: 1000,
    poDiscountAmount: 50,
    previousDiscountAmount: 50,
  })).toBe(0);
});

test("applies the header discount only to the selected PR allocation", () => {
  const result = applyDiscountToPrAllocations([
    {
      disPrAllocations: [
        { prId: "pr-a", prNo: "PR-A", amount: 400 },
        { prId: "pr-b", prNo: "PR-B", amount: 600 },
      ],
    },
  ], "pr-b", 150);

  expect(result.appliedAmount).toBe(150);
  expect(result.remainingAmount).toBe(0);
  expect(result.items[0].disPrAllocations).toEqual([
    { prId: "pr-a", prNo: "PR-A", amount: 400 },
    { prId: "pr-b", prNo: "PR-B", amount: 450 },
  ]);
});

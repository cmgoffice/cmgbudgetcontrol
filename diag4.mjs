const prs = [
  { prNo: "J01-INW-039", amount: 291740 },
  { prNo: "J01-INW-070", amount: 321000 },
  { prNo: "J01-INW-077", amount: 291740 },
  { prNo: "J01-INW-082", amount: 86650.71 },
  { prNo: "J01-INW-083", amount: 153148.06 },
  { prNo: "J01-INW-084", amount: 100746.57 },
  { prNo: "J01-INW-087", amount: 49069.17 },
  { prNo: "J01-INW-090", amount: 29100 },
  { prNo: "J01-INW-091", amount: 142627.36 },
  { prNo: "J01-INW-092", amount: 178851.94 },
  { prNo: "J01-INW-093", amount: 9073.97 },
  { prNo: "J01-INW-094", amount: 81665.75 },
  { prNo: "J01-INW-095", amount: 181400 },
  { prNo: "J01-INW-096", amount: 403100 },
  { prNo: "J01-INW-097", amount: 209400 },
  { prNo: "J01-INW-099", amount: 291740 },
  { prNo: "J01-INW-101", amount: 63600 },
  { prNo: "J01-INW-104", amount: 46509.76 }
];

const target = 360000;

function findCombination(arr, target) {
  function subsetSum(index, currentSum, currentSubset) {
    if (Math.abs(currentSum - target) < 0.01) {
      console.log("Found:", currentSubset.map(p => `${p.prNo} (${p.amount})`).join(', '));
      return true;
    }
    if (index >= arr.length || currentSum > target + 0.01) {
      return false;
    }
    // Include current
    if (subsetSum(index + 1, currentSum + arr[index].amount, [...currentSubset, arr[index]])) return true;
    // Exclude current
    if (subsetSum(index + 1, currentSum, currentSubset)) return true;
    return false;
  }
  subsetSum(0, 0, []);
}

findCombination(prs, target);

// Evaluation-only weights. Never used for document amounts or budget calculations.
export const RECEIVE_WEIGHTS = [40, 30];
export const PAYMENT_WEIGHTS = [20, 15, 5, 15, 20];
export const isMaterialEvaluation = (poType: string) => ["CR", "SP", "SE", "RE"].includes(poType);
export const poEvaluationWeights = (poType: string) => isMaterialEvaluation(poType) ? [10, 10, 10] : [10, 5, 10];

export function evaluationRate(value: any): number | null {
  const rate = typeof value === "number" ? value
    : value?.rateValue ?? (value?.maxScore > 0 ? value.score / value.maxScore : value?.score);
  return [1, 0.75, 0.5].includes(rate) ? rate : null;
}

export function evaluationTotal(scores: any, weights: number[]): number {
  return weights.reduce((sum, weight, i) => sum + (evaluationRate(scores?.[`q${i + 1}`]) ?? 0) * weight, 0);
}

export function summarizeVendorEvaluations(evaluations: any[] = [], vendors: any[] = []) {
  const payment = new Map<string, any>();
  const receive = new Map<string, any>();
  for (const ev of evaluations) {
    const id = ev.vendorId || ev.contractorId;
    if (!id) continue;
    const isPO = ev.evaluationStage === "PO Creation";
    const isReceive = ev.evaluationStage === "Receive";
    if (!isPO && !isReceive && ev.evaluationStage && ev.evaluationStage !== "Payment") continue;
    const material = isReceive || (isPO && isMaterialEvaluation(ev.poType || ""));
    const map = material ? receive : payment;
    const weights = material ? [10, 10, 10, ...RECEIVE_WEIGHTS] : [10, 5, 10, ...PAYMENT_WEIGHTS];
    if (!map.has(id)) {
      const vendor = vendors.find(v => v.id === id);
      map.set(id, { vendorId: id, vendorCode: vendor?.code || ev.vendorNo || ev.vendorCode || "-",
        vendorName: vendor?.name || ev.vendorName || "Unknown", po_count: 0, other_count: 0,
        sums: weights.map(() => 0), counts: weights.map(() => 0), weights, legacyCriteria: false });
    }
    const row = map.get(id);
    row[isPO ? "po_count" : "other_count"]++;
    if (!material && !isPO && !ev.scoringVersion) row.legacyCriteria = true;
    const size = isPO ? 3 : material ? 2 : 5;
    for (let i = 0; i < size; i++) {
      const rate = evaluationRate(ev.scores?.[`q${i + 1}`]);
      if (rate === null) continue;
      const index = isPO ? i : i + 3;
      row.sums[index] += rate;
      row.counts[index]++;
    }
  }
  const format = (map: Map<string, any>) => Array.from(map.values()).map(row => {
    let total = 0, maxScore = 0;
    const result: any = { ...row };
    row.weights.forEach((weight: number, i: number) => {
      const score = row.counts[i] ? row.sums[i] / row.counts[i] * weight : null;
      result[`q${i + 1}`] = score === null ? "-" : score.toFixed(2);
      if (score !== null) { total += score; maxScore += weight; }
    });
    return { ...result, totalScore: total.toFixed(2), maxScore, complete: maxScore === 100 };
  }).sort((a, b) => Number(b.complete) - Number(a.complete) || Number(b.totalScore) - Number(a.totalScore));
  return { paymentScores: format(payment), receiveScores: format(receive) };
}

import { evaluationTotal, evaluationRate, poEvaluationWeights, RECEIVE_WEIGHTS, PAYMENT_WEIGHTS, summarizeVendorEvaluations } from './vendorScoring';

const scores = (n, rate) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i + 1}`, rate]));
const po = (type, rate = 1) => ({ vendorId: 'v', evaluationStage: 'PO Creation', poType: type, scores: scores(3, rate) });
const receive = (rate = 1) => ({ vendorId: 'v', evaluationStage: 'Receive', scores: scores(2, rate) });
const payment = (rate = 1) => ({ vendorId: 'v', scores: scores(5, rate) });

test('supplier and contractor weights total 100 at all three levels', () => {
  for (const rate of [1, .75, .5]) {
    expect(evaluationTotal(scores(3, rate), poEvaluationWeights('CR')) + evaluationTotal(scores(2, rate), RECEIVE_WEIGHTS)).toBe(rate * 100);
    expect(evaluationTotal(scores(3, rate), poEvaluationWeights('SC')) + evaluationTotal(scores(5, rate), PAYMENT_WEIGHTS)).toBe(rate * 100);
  }
});
test('mixed supplier score respects quality and delivery weights', () => {
  expect(evaluationTotal({ q1: 1, q2: .75, q3: 1 }, poEvaluationWeights('CR')) + evaluationTotal({ q1: .75, q2: 1 }, RECEIVE_WEIGHTS)).toBe(87.5);
});
test('averages per question with unequal stage counts, excluding missing answers', () => {
  const result = summarizeVendorEvaluations([po('CR'), receive(1), receive(.75)]).receiveScores[0];
  expect(result.q4).toBe('35.00');
  expect(result.totalScore).toBe('91.25');
  expect(result.maxScore).toBe(100);
  expect(result.po_count).toBe(1);
  expect(result.other_count).toBe(2);
  const partial = summarizeVendorEvaluations([po('CR'), { ...receive(), scores: { q1: 1 } }]).receiveScores[0];
  expect(partial.q5).toBe('-');
  expect(partial.maxScore).toBe(70);
  expect(partial.complete).toBe(false);
});
test('legacy and weighted payment data normalize to identical rates without mutation', () => {
  const legacy = payment(.75);
  const current = { ...payment(), scoringVersion: 2, evaluationStage: 'Payment', scores: Object.fromEntries(PAYMENT_WEIGHTS.map((w, i) => [`q${i+1}`, { rateValue: .75, maxScore: w, score: w * .75 }])) };
  const input = [po('SC'), legacy, current];
  const before = JSON.stringify(input);
  const result = summarizeVendorEvaluations(input).paymentScores[0];
  expect(result.totalScore).toBe('81.25');
  expect(result.legacyCriteria).toBe(true);
  expect(JSON.stringify(input)).toBe(before);
  expect(evaluationRate({ score: 15, maxScore: 20 })).toBe(.75);
  expect(evaluationRate({ score: .75, maxScore: 1 })).toBe(.75);
  expect(evaluationRate(undefined)).toBeNull();
});
test('supplier and contractor groups stay separate and incomplete stages are not zero-filled', () => {
  const result = summarizeVendorEvaluations([po('CR'), po('SC'), payment()]);
  expect(result.receiveScores[0].totalScore).toBe('30.00');
  expect(result.receiveScores[0].maxScore).toBe(30);
  expect(result.receiveScores[0].q4).toBe('-');
  expect(result.paymentScores[0].totalScore).toBe('100.00');
  expect(result.paymentScores[0].complete).toBe(true);
});

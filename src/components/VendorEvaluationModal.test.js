import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import { VendorEvaluationModal } from './VendorEvaluationModal';
import { ReceiveEvaluationModal } from './ReceiveEvaluationModal';

let root, container;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

test.each([['CR', '30'], ['SC', '25']])('PO %s displays weighted total but submits original rates', (poType, maximum) => {
  const submit = jest.fn();
  act(() => root.render(<VendorEvaluationModal isOpen onClose={() => {}} onSubmit={submit} vendorName="Test" poType={poType} />));
  for (const name of ['q1', 'q2', 'q3']) {
    act(() => Simulate.change(container.querySelector(`input[name="${name}"][value="1"]`)));
  }
  expect(container.textContent).toContain(`${maximum}.00 / ${maximum}`);
  act(() => Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('บันทึกประเมิน')).click());
  expect(submit).toHaveBeenCalledWith({ q1: 1, q2: 1, q3: 1 }, '');
});

test('Receive shows weighted options and 70-point total', () => {
  act(() => root.render(<ReceiveEvaluationModal isOpen onClose={() => {}} onSubmit={() => {}} vendorName="Test" />));
  expect(container.textContent).toContain('พอใช้ (30.00 คะแนน)');
  expect(container.textContent).toContain('พอใช้ (22.50 คะแนน)');
  expect(container.textContent).toContain('/ 70');
});

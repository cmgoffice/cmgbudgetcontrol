import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AdvanceRecoveryPanel from './AdvanceRecoveryPanel';
import { useAppData } from '../contexts/AppDataContext';
import { useAdvances } from '../hooks/useAdvances';
import { saveAdvanceRecovery } from '../lib/advanceRecoveryStore';

jest.mock('../contexts/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../hooks/useAdvances', () => ({ useAdvances: jest.fn() }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), onSnapshot: jest.fn(() => jest.fn()) }));
jest.mock('../lib/advanceRecoveryStore', () => ({ ...jest.requireActual('../lib/advanceRecoveryStore'), saveAdvanceRecovery: jest.fn() }));
// Avoid animation/browser layout dependencies; preserve native disabled-button semantics.
jest.mock('./ui', () => ({ Button: ({ children, variant, ...props }) => <button {...props}>{children}</button>, formatCurrency: value => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }));

let host, root, context, result;
const advance = { id: 'adv-1', projectId: 'project-1', poId: 'po-1', poNo: 'PO-001', vendorId: 'vendor-1', status: 'Paid', amountSatang: 1000000, paidSatang: 1000000, recoveredSatang: 200000 };
const payment = { id: 'payment-1', projectId: 'project-1', poId: 'po-1', contractorId: 'vendor-1', status: 'Active', amount: 5000 };
const render = (record = payment, type = 'payments') => act(() => root.render(<AdvanceRecoveryPanel documentType={type} document={record} />));
const buttons = () => [...host.querySelectorAll('button')].map(node => node.textContent);
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true; jest.clearAllMocks();
  context = { db: {}, appId: 'test', user: { uid: 'user-1' }, canAccessModule: jest.fn(() => true), canUseFunction: jest.fn(() => true), paymentsReady: true, payments: [payment], pos: [{ id: 'po-1', projectId: 'project-1', vendorId: 'vendor-1' }] };
  result = { advances: [advance], loading: false, error: null };
  useAppData.mockImplementation(() => context); useAdvances.mockImplementation(() => result);
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

test('inherited invoice resolves its Payment ID to the real PO, reports totals, and cannot deduct twice', () => {
  result.advances.push({ ...advance, id: 'wrong-vendor', vendorId: 'vendor-2' }, { ...advance, id: 'wrong-project', projectId: 'project-2' });
  render({ id: 'invoice-1', projectId: 'project-1', poId: payment.id, sourceType: 'payment', status: 'Draft', amount: 5000, inheritedAdvanceRecovery: { paymentId: payment.id, advanceId: advance.id, amountSatang: 200000 } }, 'invoices');
  expect(host.textContent).toContain('อนุมัติแล้ว: 10,000.00');
  expect(host.textContent).toContain('จ่ายแล้ว: 10,000.00');
  expect(host.textContent).toContain('หักคืนแล้ว: 2,000.00');
  expect(host.textContent).toContain('คงเหลือหักคืน: 8,000.00');
  expect(host.textContent).toContain('ไม่ตัดยอด Advance ซ้ำ');
  expect(buttons()).toEqual([]); expect(saveAdvanceRecovery).not.toHaveBeenCalled();
});
test('invoice summary falls back to vendor on the actual PO and avoids false zero while loading', () => {
  context.payments = [{ ...payment, contractorId: undefined }];
  const invoice = { id: 'invoice-1', projectId: payment.projectId, poId: payment.id, sourceType: 'payment', status: 'Draft', amount: 5000 };
  context.paymentsReady = false; render(invoice, 'invoices');
  expect(host.textContent).toContain('กำลังโหลด Payment ต้นทาง'); expect(host.textContent).not.toContain('จ่ายแล้ว: 0');
  context.paymentsReady = true; render(invoice, 'invoices'); expect(host.textContent).toContain('จ่ายแล้ว: 10,000.00');
});
test.each(['advance-payment', 'payment-subcontract', 'applyRecovery'])('missing %s permission hides all write controls but keeps totals', missing => {
  context.canAccessModule.mockImplementation(module => module !== missing);
  context.canUseFunction.mockReturnValue(missing !== 'applyRecovery');
  render({ ...payment, advanceRecovery: { advanceId: advance.id, amountSatang: 200000 } });
  expect(buttons()).toEqual([]); expect(host.querySelector('select')).toBeNull();
  expect(host.textContent).toContain('จ่ายแล้ว: 10,000.00'); expect(saveAdvanceRecovery).not.toHaveBeenCalled();
});
test('invoice module access is required independently of Payment access', () => {
  context.canAccessModule.mockImplementation(module => module !== 'invoice');
  render({ ...payment, id: 'invoice-1', vendorId: 'vendor-1', status: 'Draft' }, 'invoices');
  expect(buttons()).toEqual([]);
});
test('authorized recovery is selectable, while read errors and loading prevent editing', () => {
  render(); expect(host.querySelector('select')).not.toBeNull();
  expect(host.querySelector('button').disabled).toBe(true);
  result.error = 'Permission denied'; render();
  expect(host.querySelector('[role=alert]').textContent).toBe('Permission denied'); expect(host.querySelector('select')).toBeNull();
  result.error = null; result.loading = true; render(); expect(host.querySelector('select')).toBeNull();
});

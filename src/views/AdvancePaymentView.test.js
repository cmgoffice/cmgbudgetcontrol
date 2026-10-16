import React from 'react';
import { createRoot } from 'react-dom/client';
import { act, Simulate } from 'react-dom/test-utils';
import AdvancePaymentView from './AdvancePaymentView';
import { useAppData } from '../contexts/AppDataContext';
import { useUI } from '../contexts/UIContext';
import { onSnapshot } from 'firebase/firestore';
import { createAdvance, advanceAction } from '../lib/advancePaymentStore';

jest.mock('../contexts/AppDataContext', () => ({ useAppData: jest.fn() }));
jest.mock('../contexts/UIContext', () => ({ useUI: jest.fn() }));
jest.mock('../lib/firebase', () => ({ db: {}, appId: 'test' }));
jest.mock('../lib/advancePaymentStore', () => ({ createAdvance: jest.fn(), advanceAction: jest.fn() }));
jest.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => path.join('/'),
  where: (field, operator, value) => ({ field, operator, value }),
  query: (path, filter) => ({ path, filter }), onSnapshot: jest.fn(),
}));

let host, root, context, project, listeners;
const base = { id: 'advance-1', projectId: 'project-1', poId: 'po-1', poNo: 'PO-001', vendorId: 'vendor-1', vendorName: 'Supplier', amountSatang: 10000000, paidSatang: 0, recoveredSatang: 0, status: 'Pending PD', history: [] };
const button = text => [...host.querySelectorAll('button')].find(node => node.textContent.trim() === text);
const render = () => act(() => root.render(<AdvancePaymentView />));
const click = text => act(() => Simulate.click(button(text)));
const change = (node, value) => act(() => Simulate.change(node, { target: { value } }));
const emit = (rows, listener = listeners.findLast ? listeners.findLast(item => item.query.path.endsWith('/advances')) : [...listeners].reverse().find(item => item.query.path.endsWith('/advances'))) => act(() => listener.next({ docs: rows.map(row => ({ id: row.id, data: () => row })) }));
const submit = async () => { await act(async () => { Simulate.submit(host.querySelector('form')); }); };

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks(); listeners = []; project = 'project-1';
  context = { pos: [{ id: 'po-1', projectId: project, poNo: 'PO-001', poType: 'SP', vendorId: 'vendor-1', vendorName: 'Supplier', status: 'Approved', items: [] }], payments: [], paymentsReady: true, user: { uid: 'user-1' }, userData: {}, userRoles: ['CM'], canUseFunction: jest.fn(() => false), showAlert: jest.fn() };
  useAppData.mockImplementation(() => context);
  useUI.mockImplementation(() => ({ selectedProjectId: project }));
  onSnapshot.mockImplementation((query, next, error) => { const unsubscribe = jest.fn(); listeners.push({ query, next, error, unsubscribe }); return unsubscribe; });
  createAdvance.mockResolvedValue('new-id'); advanceAction.mockResolvedValue('advance-1');
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

test.each(['CM', 'PM', 'Administrator'])('%s can start a request after Payment data is ready', role => {
  context.userRoles = [role]; context.paymentsReady = false; render(); emit([]);
  expect(button('+ สร้างคำขอ').disabled).toBe(true);
  context.paymentsReady = true; render(); click('+ สร้างคำขอ');
  expect(host.querySelector('select')).not.toBeNull();
});
test.each(['Staff', 'PD', 'PCM', 'GM', 'MD'])('%s cannot create requests', role => {
  context.userRoles = [role]; render(); emit([]); expect(button('+ สร้างคำขอ')).toBeUndefined();
});
test('creation dropdown only includes approved Advance PO types SP and DL', () => {
  context.pos = [
    { id: 'sp', projectId: project, poNo: 'PO-SP', poType: 'SP', status: 'Approved', vendorId: 'v1', vendorName: 'SP vendor', items: [] },
    { id: 'dl', projectId: project, poNo: 'PO-DL', poType: 'dl', status: 'Approve', vendorId: 'v2', vendorName: 'DL vendor', items: [] },
    { id: 'cr', projectId: project, poNo: 'PO-CR', poType: 'CR', status: 'Approved', vendorId: 'v3', vendorName: 'CR vendor', items: [] },
    { id: 'draft-sp', projectId: project, poNo: 'PO-DRAFT', poType: 'SP', status: 'Draft', vendorId: 'v4', vendorName: 'Draft vendor', items: [] },
  ];
  render(); emit([]); click('+ สร้างคำขอ');
  expect([...host.querySelectorAll('select option')].map(option => option.value)).toEqual(['', 'sp', 'dl']);
});
test.each(['PD', 'PCM', 'GM', 'MD'])('only the matching approver or Administrator can approve Pending %s', role => {
  context.userRoles = [role]; render(); emit([{ ...base, status: `Pending ${role}` }]); click('ดูรายละเอียด');
  expect(button('อนุมัติ')).toBeDefined(); expect(button('ปฏิเสธ')).toBeDefined();
  context.userRoles = ['CM']; render(); expect(button('อนุมัติ')).toBeUndefined(); expect(button('ปฏิเสธ')).toBeUndefined();
  context.userRoles = ['Administrator']; render(); expect(button('อนุมัติ')).toBeDefined();
});
test('payment requires date and reference and submits only to the mocked store', async () => {
  context.canUseFunction.mockReturnValue(true); render(); emit([{ ...base, status: 'Approved' }]); click('ดูรายละเอียด'); click('ยืนยันจ่าย');
  const date = host.querySelector('input[type=date]'); const reference = host.querySelector('input:not([type=date])');
  expect(date.required).toBe(true); expect(reference.required).toBe(true);
  await submit(); expect(advanceAction).not.toHaveBeenCalled();
  change(date, '2026-10-16'); await submit(); expect(advanceAction).not.toHaveBeenCalled();
  change(reference, ' BANK-123 '); await submit();
  expect(advanceAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'pay', paidDate: '2026-10-16', paymentReference: 'BANK-123' }));
});
test('payment permission and rejection reason are enforced', async () => {
  context.userRoles = ['PD']; render(); emit([{ ...base, status: 'Approved' }]); click('ดูรายละเอียด');
  expect(button('ยืนยันจ่าย')).toBeUndefined();
  emit([base]); click('ปฏิเสธ'); await submit(); expect(advanceAction).not.toHaveBeenCalled();
  change(host.querySelector('textarea'), 'Missing supporting evidence'); await submit();
  expect(advanceAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'reject', note: 'Missing supporting evidence' }));
});
test('read errors disable creation and show a useful error', () => {
  render(); act(() => listeners[0].error(new Error('Permission denied')));
  expect(host.querySelector('[role=alert]').textContent).toContain('Permission denied');
  expect(button('+ สร้างคำขอ').disabled).toBe(true); expect(createAdvance).not.toHaveBeenCalled();
});
test('switching projects clears details and ignores a late snapshot from the previous project', () => {
  render(); emit([base]); const previous = listeners[0]; click('ดูรายละเอียด');
  project = 'project-2'; render();
  expect(previous.unsubscribe).toHaveBeenCalled(); expect(host.textContent).not.toContain('PO-001');
  emit([base], previous); expect(host.textContent).not.toContain('PO-001');
  const current = [...listeners].reverse().find(item => item.query.path.endsWith('/advances'));
  expect(current.query.filter).toEqual({ field: 'projectId', operator: '==', value: 'project-2' });
  emit([{ ...base, id: 'advance-2', projectId: project, poNo: 'PO-002' }], current);
  expect(host.textContent).toContain('PO-002'); expect(host.querySelector('section')).toBeNull();
});
test('fully recovered payment shows completion and separate immutable recovery/reversal history', () => {
  render(); emit([{ ...base, status: 'Paid', paidSatang: 10000000, recoveredSatang: 10000000 }]); click('ดูรายละเอียด');
  expect(host.textContent).toContain('หักคืนครบแล้ว');
  const audit = listeners.find(item => item.query.path.endsWith('/advanceTransactions'));
  emit([{ id: 'tx-1', advanceId: base.id, type: 'recovery', amountSatang: 123400, documentType: 'payments', documentId: 'PAY-42' }, { id: 'tx-2', advanceId: base.id, type: 'reversal', amountSatang: 20000, documentType: 'invoices', documentId: 'INV-43' }, { id: 'tx-other', advanceId: 'other', type: 'recovery', documentId: 'HIDDEN' }], audit);
  expect(host.textContent).toContain('PAY-42'); expect(host.textContent).toContain('INV-43'); expect(host.textContent).toContain('1,234.00'); expect(host.textContent).not.toContain('HIDDEN');
});

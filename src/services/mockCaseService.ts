/**
 * Mock Case Service
 *
 * Manages cases in-memory for demo mode.
 * Replace with Supabase queries when real backend is connected.
 */

import type { Case, BulkUploadResult } from '@/types';
import { getCasesForOrg } from '@/data/sampleData';
import { generateId } from '@/lib/utils';

// In-memory store per org (seeded with sample data)
const caseStore: Map<string, Case[]> = new Map();

function getStore(orgId: string): Case[] {
  if (!caseStore.has(orgId)) {
    caseStore.set(orgId, [...getCasesForOrg(orgId)]);
  }
  return caseStore.get(orgId)!;
}

export async function fetchCases(orgId: string): Promise<Case[]> {
  await new Promise(r => setTimeout(r, 300));
  return getStore(orgId);
}

export async function createCase(orgId: string, data: Omit<Case, 'id' | 'organization_id' | 'created_at' | 'updated_at'>): Promise<Case> {
  await new Promise(r => setTimeout(r, 400));
  const cases = getStore(orgId);

  // Prevent duplicate case_number
  const existing = cases.find(c => c.case_number === data.case_number && c.active);
  if (existing) throw new Error(`Case number "${data.case_number}" already exists.`);

  const newCase: Case = {
    ...data,
    id: `case-${generateId()}`,
    organization_id: orgId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  cases.unshift(newCase);
  return newCase;
}

export async function updateCase(orgId: string, id: string, data: Partial<Case>): Promise<Case> {
  await new Promise(r => setTimeout(r, 400));
  const cases = getStore(orgId);
  const idx = cases.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Case not found');
  cases[idx] = { ...cases[idx], ...data, updated_at: new Date().toISOString() };
  return cases[idx];
}

export async function deleteCase(orgId: string, id: string): Promise<void> {
  await new Promise(r => setTimeout(r, 300));
  const cases = getStore(orgId);
  const idx = cases.findIndex(c => c.id === id);
  if (idx !== -1) cases[idx] = { ...cases[idx], active: false, updated_at: new Date().toISOString() };
}

// ─── Bulk Upload Processing ───────────────────────────────────────────────────

const CNR_REGEX = /^[A-Z]{4}[0-9]{6}[0-9]{4}$/;
const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function processBulkUpload(
  orgId: string,
  rows: Record<string, string>[],
): Promise<BulkUploadResult> {
  await new Promise(r => setTimeout(r, 800));
  const cases = getStore(orgId);
  const result: BulkUploadResult = { total: rows.length, success: 0, failed: 0, duplicates: 0, rows: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];
    const rowNum = i + 2; // 1-indexed + header row

    if (!row.case_number?.trim()) errors.push('Case Number is required');
    if (row.cnr_number && !CNR_REGEX.test(row.cnr_number.trim())) errors.push('Invalid CNR format (e.g. TNHC0010002024)');
    if (row.advocate_mobile && !MOBILE_REGEX.test(row.advocate_mobile.trim())) errors.push('Invalid advocate mobile (10 digits)');
    if (row.client_mobile && !MOBILE_REGEX.test(row.client_mobile.trim())) errors.push('Invalid client mobile (10 digits)');
    if (row.advocate_email && !EMAIL_REGEX.test(row.advocate_email.trim())) errors.push('Invalid advocate email');
    if (row.client_email && !EMAIL_REGEX.test(row.client_email.trim())) errors.push('Invalid client email');

    const isDuplicate = cases.some(c => c.case_number === row.case_number?.trim() && c.active);

    if (isDuplicate) {
      result.duplicates++;
      result.rows.push({ rowNumber: rowNum, data: row as Partial<Case>, errors: ['Duplicate: case number already exists'], status: 'duplicate' });
      continue;
    }

    if (errors.length > 0) {
      result.failed++;
      result.rows.push({ rowNumber: rowNum, data: row as Partial<Case>, errors, status: 'error' });
      continue;
    }

    const newCase: Case = {
      id: `case-${generateId()}`,
      organization_id: orgId,
      cnr_number: row.cnr_number?.trim() ?? '',
      case_number: row.case_number!.trim(),
      court_name: row.court_name?.trim() ?? '',
      bench: row.bench?.trim() ?? '',
      petitioner: row.petitioner?.trim() ?? '',
      respondent: row.respondent?.trim() ?? '',
      advocate_name: row.advocate_name?.trim() ?? '',
      advocate_mobile: row.advocate_mobile?.trim() ?? '',
      advocate_email: row.advocate_email?.trim() ?? '',
      client_name: row.client_name?.trim() ?? '',
      client_mobile: row.client_mobile?.trim() ?? '',
      client_whatsapp: row.client_whatsapp?.trim() ?? row.client_mobile?.trim() ?? '',
      client_email: row.client_email?.trim() ?? '',
      active: row.active?.toLowerCase() !== 'false',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    cases.unshift(newCase);
    result.success++;
    result.rows.push({ rowNumber: rowNum, data: newCase, errors: [], status: 'success' });
  }

  return result;
}

export function resetCaseStore() {
  caseStore.clear();
}

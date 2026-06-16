import * as real from './caseService';
import * as mock from './mockCaseService';
import type { Case, BulkUploadResult } from '@/types';

export async function fetchCases(orgId: string, demo: boolean): Promise<Case[]> {
  return demo ? mock.fetchCases(orgId) : real.fetchCases(orgId);
}

export async function createCase(
  orgId: string,
  demo: boolean,
  data: Omit<Case, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
): Promise<Case> {
  return demo ? mock.createCase(orgId, data) : real.createCase(orgId, data);
}

export async function updateCase(
  orgId: string,
  demo: boolean,
  id: string,
  data: Partial<Case>,
): Promise<Case> {
  return demo ? mock.updateCase(orgId, id, data) : real.updateCase(orgId, id, data);
}

export async function deleteCase(orgId: string, demo: boolean, id: string): Promise<void> {
  return demo ? mock.deleteCase(orgId, id) : real.deleteCase(orgId, id);
}

export async function processBulkUpload(
  orgId: string,
  demo: boolean,
  fileName: string,
  uploadedBy: string,
  rows: Record<string, string>[],
): Promise<BulkUploadResult> {
  return demo
    ? mock.processBulkUpload(orgId, rows)
    : real.processBulkUpload(orgId, fileName, uploadedBy, rows);
}

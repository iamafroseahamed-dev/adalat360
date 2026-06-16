import { supabase } from '@/lib/supabase';
import type { Case, BulkUploadResult, BulkUploadRow } from '@/types';

export async function fetchCases(orgId: string): Promise<Case[]> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCase(
  orgId: string,
  data: Omit<Case, 'id' | 'organization_id' | 'created_at' | 'updated_at'>,
): Promise<Case> {
  const { data: created, error } = await supabase
    .from('cases')
    .insert({ ...data, organization_id: orgId })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error(`Case number "${data.case_number}" already exists.`);
    throw new Error(error.message);
  }
  return created;
}

export async function updateCase(orgId: string, id: string, data: Partial<Case>): Promise<Case> {
  const { data: updated, error } = await supabase
    .from('cases')
    .update(data)
    .eq('id', id)
    .eq('organization_id', orgId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return updated;
}

export async function deleteCase(orgId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('cases')
    .update({ active: false })
    .eq('id', id)
    .eq('organization_id', orgId);

  if (error) throw new Error(error.message);
}

const CNR_REGEX = /^[A-Z]{4}[0-9]{10}$/;
const MOBILE_REGEX = /^[6-9][0-9]{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function processBulkUpload(
  orgId: string,
  fileName: string,
  uploadedBy: string,
  rows: Record<string, string>[],
): Promise<BulkUploadResult> {
  const existingCases = await fetchCases(orgId);
  const existingNumbers = new Set(existingCases.map(c => c.case_number));

  const result: BulkUploadResult = {
    total: rows.length,
    success: 0,
    failed: 0,
    duplicates: 0,
    rows: [],
  };

  const toInsert: Omit<Case, 'id' | 'created_at' | 'updated_at'>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const errors: string[] = [];
    const rowNum = i + 2;

    const caseNum = row.case_number?.trim();
    if (!caseNum) errors.push('Case Number is required');
    if (row.cnr_number?.trim() && !CNR_REGEX.test(row.cnr_number.trim())) {
      errors.push('Invalid CNR format (e.g. TNHC0010002024)');
    }
    if (row.advocate_mobile?.trim() && !MOBILE_REGEX.test(row.advocate_mobile.trim())) {
      errors.push('Invalid advocate mobile (10 digits starting 6–9)');
    }
    if (row.client_mobile?.trim() && !MOBILE_REGEX.test(row.client_mobile.trim())) {
      errors.push('Invalid client mobile (10 digits starting 6–9)');
    }
    if (row.advocate_email?.trim() && !EMAIL_REGEX.test(row.advocate_email.trim())) {
      errors.push('Invalid advocate email');
    }
    if (row.client_email?.trim() && !EMAIL_REGEX.test(row.client_email.trim())) {
      errors.push('Invalid client email');
    }

    const isDuplicate = caseNum ? existingNumbers.has(caseNum) : false;

    const uploadRow: BulkUploadRow = {
      rowNumber: rowNum,
      data: row as Partial<Case>,
      errors,
      status: isDuplicate ? 'duplicate' : errors.length > 0 ? 'error' : 'success',
    };

    result.rows.push(uploadRow);

    if (uploadRow.status === 'success' && caseNum) {
      existingNumbers.add(caseNum);
      toInsert.push({
        organization_id: orgId,
        cnr_number: row.cnr_number?.trim() || null,
        case_number: caseNum,
        court_name: row.court_name?.trim() || null,
        bench: row.bench?.trim() || null,
        petitioner: row.petitioner?.trim() || null,
        respondent: row.respondent?.trim() || null,
        advocate_name: row.advocate_name?.trim() || null,
        advocate_mobile: row.advocate_mobile?.trim() || null,
        advocate_email: row.advocate_email?.trim() || null,
        client_name: row.client_name?.trim() || null,
        client_mobile: row.client_mobile?.trim() || null,
        client_whatsapp: row.client_whatsapp?.trim() || null,
        client_email: row.client_email?.trim() || null,
        active: row.active?.toLowerCase() !== 'false',
      } as Omit<Case, 'id' | 'created_at' | 'updated_at'>);
      result.success++;
    } else if (isDuplicate) {
      result.duplicates++;
    } else {
      result.failed++;
    }
  }

  if (toInsert.length > 0) {
    const BATCH = 50;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const { error } = await supabase.from('cases').insert(toInsert.slice(i, i + BATCH));
      if (error) throw new Error(`Database insert failed: ${error.message}`);
    }
  }

  await supabase.from('uploaded_files').insert({
    organization_id: orgId,
    file_name: fileName,
    uploaded_by: uploadedBy,
    total_records: result.total,
    success_count: result.success,
    failed_count: result.failed + result.duplicates,
    status: 'completed',
  });

  return result;
}

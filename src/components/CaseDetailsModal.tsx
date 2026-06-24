import { useCallback, useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { getEcourtsCaseType } from '@/config/ecourtsCaseTypes';

// ── eCourts response shape ──────────────────────────────────────────────────────

export interface EcourtsCaseData {
  registrationNumber?: string | null;
  registrationDate?: string | null;
  filingNumber?: string | null;
  filingDate?: string | null;
  caseStatus?: string | null;
  courtName?: string | null;
  courtCode?: string | null;
  judicialSection?: string | null;
  caseCategory?: string | null;
  benchType?: string | null;
  stateCode?: string | null;
  districtCode?: string | null;

  petitioners?: string[] | null;
  petitionerAdvocates?: string[] | null;
  respondents?: string[] | null;
  respondentAdvocates?: string[] | null;
  judges?: string[] | null;

  firstHearingDate?: string | null;
  lastHearingDate?: string | null;
  nextHearingDate?: string | null;
  hearingCount?: number | null;
  orderCount?: number | null;
  interimOrderCount?: number | null;
  judgmentCount?: number | null;
  iaCount?: number | null;
}

interface SearchResponse {
  success: boolean;
  totalHits?: number;
  caseData?: EcourtsCaseData | null;
  usedFallback?: boolean;
  message?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtDate(value: string | null | undefined) {
  if (!value) return '\u2014';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function val(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '\u2014';
  const s = String(value).trim();
  return s ? s : '\u2014';
}

function num(value: number | null | undefined) {
  return typeof value === 'number' ? value : 0;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function PartyList({ items }: { items: Array<string | number> | null | undefined }) {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">\u2014</p>;
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={`${String(item)}-${i}`} className="text-sm font-medium">{String(item)}</li>
      ))}
    </ul>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="px-3 py-3 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

// ── Modal ────────────────────────────────────────────────────────────────────────

interface CaseDetailsModalProps {
  caseNumber: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CaseDetailsModal({ caseNumber, open, onOpenChange }: CaseDetailsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<EcourtsCaseData | null>(null);

  const fetchDetails = useCallback(async (rawCaseNumber: string) => {
    setLoading(true);
    setError(null);
    setCaseData(null);

    // WP/4232/2024 → caseType="WP", caseNo="4232", caseYear="2024"
    const [caseType = '', caseNo = '', caseYear = ''] = String(rawCaseNumber ?? '').split('/');
    const ecourtsCaseType = getEcourtsCaseType(caseType);

    if (import.meta.env.DEV) {
      console.log({ caseType, ecourtsCaseType, caseNo, caseYear });
    }

    if (!caseNo || !caseYear) {
      setError('Case details not found.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/case-details/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseNo, caseYear, caseTypes: ecourtsCaseType }),
      });

      const result: SearchResponse = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Failed to fetch case details.');
      }

      if (!result.totalHits || !result.caseData) {
        setError('Case details not found.');
        return;
      }

      if (import.meta.env.DEV) {
        console.log('Case Details');
        console.log(result.caseData);
      }

      setCaseData(result.caseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch case details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && caseNumber) {
      fetchDetails(caseNumber);
    }
  }, [open, caseNumber, fetchDetails]);

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        onOpenChange(o);
        if (!o) { setCaseData(null); setError(null); }
      }}
    >
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{val(caseData?.registrationNumber) === '\u2014' ? caseNumber : caseData?.registrationNumber}</span>
            {caseData?.caseStatus && (
              <Badge variant={String(caseData.caseStatus).toLowerCase() === 'pending' ? 'warning' : 'secondary'}>
                {caseData.caseStatus}
              </Badge>
            )}
            {caseData?.courtName && (
              <span className="text-sm font-normal text-muted-foreground">{caseData.courtName}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading case details...
          </div>
        )}

        {!loading && error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && caseData && (
          <div className="space-y-6">
            {/* Basic Information */}
            <section>
              <SectionTitle>Basic Information</SectionTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                <Detail label="Registration Number" value={val(caseData.registrationNumber)} />
                <Detail label="Registration Date" value={fmtDate(caseData.registrationDate)} />
                <Detail label="Filing Number" value={val(caseData.filingNumber)} />
                <Detail label="Filing Date" value={fmtDate(caseData.filingDate)} />
                <Detail label="Case Status" value={val(caseData.caseStatus)} />
                <Detail label="Court Name" value={val(caseData.courtName)} />
                <Detail label="Court Code" value={val(caseData.courtCode)} />
                <Detail label="Judicial Section" value={val(caseData.judicialSection)} />
                <Detail label="Case Category" value={val(caseData.caseCategory)} />
                <Detail label="Bench Type" value={val(caseData.benchType)} />
              </dl>
            </section>

            {/* Parties */}
            <section>
              <SectionTitle>Parties</SectionTitle>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Petitioners</p>
                  <PartyList items={caseData.petitioners} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Petitioner Advocates</p>
                  <PartyList items={caseData.petitionerAdvocates} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Respondents</p>
                  <PartyList items={caseData.respondents} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Respondent Advocates</p>
                  <PartyList items={caseData.respondentAdvocates} />
                </div>
              </div>
            </section>

            {/* Judge Information */}
            <section>
              <SectionTitle>Judge Information</SectionTitle>
              <PartyList items={caseData.judges} />
            </section>

            {/* Hearing Information */}
            <section>
              <SectionTitle>Hearing Information</SectionTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Detail label="First Hearing Date" value={fmtDate(caseData.firstHearingDate)} />
                <Detail label="Last Hearing Date" value={fmtDate(caseData.lastHearingDate)} />
                <Detail label="Next Hearing Date" value={fmtDate(caseData.nextHearingDate)} />
                <Detail label="Hearing Count" value={String(num(caseData.hearingCount))} />
              </dl>
            </section>

            {/* Statistics */}
            <section>
              <SectionTitle>Statistics</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <StatCard label="Hearing Count" value={num(caseData.hearingCount)} />
                <StatCard label="Order Count" value={num(caseData.orderCount)} />
                <StatCard label="Interim Order Count" value={num(caseData.interimOrderCount)} />
                <StatCard label="Judgment Count" value={num(caseData.judgmentCount)} />
                <StatCard label="IA Count" value={num(caseData.iaCount)} />
              </div>
            </section>

            {/* Court Information */}
            <section>
              <SectionTitle>Court Information</SectionTitle>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                <Detail label="Court Code" value={val(caseData.courtCode)} />
                <Detail label="Court Name" value={val(caseData.courtName)} />
                <Detail label="State Code" value={val(caseData.stateCode)} />
                <Detail label="District Code" value={val(caseData.districtCode)} />
              </dl>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

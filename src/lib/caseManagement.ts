import type { TaskStatus, TaskPriority } from '@/types';

export const TASK_STATUSES: TaskStatus[] = ['Open', 'In Progress', 'Waiting', 'Completed', 'Cancelled'];
export const TASK_PRIORITIES: TaskPriority[] = ['Low', 'Medium', 'High', 'Critical'];
// Quick-create templates offered when a hearing is within 7 days
export const HEARING_TASK_TEMPLATES = [
  'Prepare Counter',
  'Prepare Brief',
  'Collect Documents',
  'Review Order',
  'Client Discussion',
] as const;

// Tailwind badge classes per task status
export function taskStatusClasses(status: string | null | undefined): string {
  switch (status) {
    case 'Completed':   return 'bg-emerald-100 text-emerald-700';
    case 'In Progress': return 'bg-blue-100 text-blue-700';
    case 'Waiting':     return 'bg-amber-100 text-amber-700';
    case 'Cancelled':   return 'bg-gray-100 text-gray-500 line-through';
    case 'Open':
    default:            return 'bg-slate-100 text-slate-700';
  }
}

// Tailwind badge classes per priority
export function taskPriorityClasses(priority: string | null | undefined): string {
  switch (priority) {
    case 'Critical': return 'bg-red-100 text-red-700';
    case 'High':     return 'bg-orange-100 text-orange-700';
    case 'Medium':   return 'bg-blue-100 text-blue-700';
    case 'Low':
    default:         return 'bg-gray-100 text-gray-600';
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Email notification ───────────────────────────────────────────────────────
// Practical RFC-5322-ish check: local@domain.tld with a real TLD segment.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_RE.test(email.trim());
}

export type EmailStatusLabel = 'Pending' | 'Sent' | 'Failed' | 'Skipped';
export const EMAIL_STATUSES: EmailStatusLabel[] = ['Pending', 'Sent', 'Failed', 'Skipped'];

// Tailwind badge classes per email-notification status
export function emailStatusClasses(status: string | null | undefined): string {
  switch (status) {
    case 'Sent':    return 'bg-emerald-100 text-emerald-700';
    case 'Failed':  return 'bg-red-100 text-red-700';
    case 'Skipped': return 'bg-gray-100 text-gray-500';
    case 'Pending':
    default:        return 'bg-amber-100 text-amber-700';
  }
}

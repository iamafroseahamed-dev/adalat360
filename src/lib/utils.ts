import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Session-scoped cache (cleared when browser tab closes) ───────────────────
// TTL is in milliseconds. Default: 15 minutes.

const DEFAULT_TTL = 15 * 60 * 1000;

interface CacheEntry<T> { data: T; expires: number }

export const sessionCache = {
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry<T>;
      if (Date.now() > entry.expires) {
        sessionStorage.removeItem(key);
        return null;
      }
      return entry.data;
    } catch { return null; }
  },

  set<T>(key: string, data: T, ttl = DEFAULT_TTL): void {
    try {
      const entry: CacheEntry<T> = { data, expires: Date.now() + ttl };
      sessionStorage.setItem(key, JSON.stringify(entry));
    } catch { /* quota exceeded – ignore */ }
  },

  del(key: string): void {
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  },
};


export function truncate(str: string, length: number): string {
  return str.length > length ? str.slice(0, length) + '...' : str;
}

export function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

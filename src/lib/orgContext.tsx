import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchOrganizations } from '@/lib/organizations';
import type { Organization } from '@/types';

/**
 * Global current-organization context. Resolved once at startup from the logged
 * in user's profile.organization_id (falling back to the first active org so the
 * app stays usable), then reused across every page via useOrg(). Holds the
 * organization, its plan and available credits in global state.
 */

interface OrgState {
  org: Organization | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgState | null>(null);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(s: string | null | undefined): boolean {
  return !!s && UUID_RE.test(s);
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const profileOrgId = user?.profile?.organization_id;
  const [org, setOrg] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const orgs = await fetchOrganizations();
      let resolved: Organization | null = null;
      if (isUuid(profileOrgId)) resolved = orgs.find(o => o.id === profileOrgId) ?? null;
      // Fallback so the credit widget / filtering stay usable in dev / local sessions.
      if (!resolved) resolved = orgs.find(o => o.active !== false) ?? orgs[0] ?? null;
      if (!resolved) console.warn('[Org] No organization could be resolved for the current user.');
      setOrg(resolved);
    } catch (e) {
      console.warn('[Org] Failed to load organization', e);
      setOrg(null);
    } finally {
      setLoading(false);
    }
  }, [profileOrgId]);

  useEffect(() => { refresh(); }, [refresh]);

  return <OrgContext.Provider value={{ org, loading, refresh }}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgState {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}

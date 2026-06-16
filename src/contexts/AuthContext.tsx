import type { ReactNode } from 'react';
import { createContext, useState, useEffect, useCallback } from 'react';
import type { AuthUser, LoginCredentials } from '@/types';
import { supabase } from '@/lib/supabase';
import { DEMO_ACCOUNTS, ORGANIZATIONS } from '@/data/sampleData';

const DEMO_SESSION_KEY = 'litigo_demo_session';

interface AuthContextValue {
  user: AuthUser | null;
  isDemo: boolean;
  loading: boolean;
  login: (creds: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

async function loadUserProfile(userId: string, email: string): Promise<AuthUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, organization:organizations(*)')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;

  const { organization, ...profile } = data;
  return { id: userId, email, profile, organization };
}

function loginWithDemoAccount(email: string, password: string): AuthUser {
  const account = DEMO_ACCOUNTS[email.toLowerCase()];
  if (!account || account.password !== password) {
    throw new Error('Invalid email or password');
  }
  const organization = ORGANIZATIONS.find(o => o.id === account.orgId);
  if (!organization) throw new Error('Organization not found');
  return { id: account.profile.user_id, email, profile: account.profile, organization };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(DEMO_SESSION_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored) as AuthUser;
      const validOrg = ORGANIZATIONS.find(o => o.id === parsed.organization?.id);
      if (!validOrg || validOrg.organization_name !== parsed.organization?.organization_name) {
        localStorage.removeItem(DEMO_SESSION_KEY);
        return null;
      }
      return parsed;
    } catch {
      localStorage.removeItem(DEMO_SESSION_KEY);
      return null;
    }
  });
  const [isDemo, setIsDemo] = useState<boolean>(() => !!localStorage.getItem(DEMO_SESSION_KEY));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const authUser = await loadUserProfile(session.user.id, session.user.email!);
        if (authUser) {
          localStorage.removeItem(DEMO_SESSION_KEY);
          setIsDemo(false);
          setUser(authUser);
        }
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const authUser = await loadUserProfile(session.user.id, session.user.email!);
        if (authUser) {
          localStorage.removeItem(DEMO_SESSION_KEY);
          setIsDemo(false);
          setUser(authUser);
        }
      } else if (event === 'SIGNED_OUT') {
        if (!localStorage.getItem(DEMO_SESSION_KEY)) {
          setIsDemo(false);
          setUser(null);
        }
      } else if (event === 'TOKEN_REFRESHED' && session?.user && !user) {
        const authUser = await loadUserProfile(session.user.id, session.user.email!);
        if (authUser) setUser(authUser);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const login = useCallback(async ({ email, password }: LoginCredentials) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      if (
        error.message.toLowerCase().includes('invalid') ||
        error.message.toLowerCase().includes('credentials') ||
        error.message.toLowerCase().includes('not found')
      ) {
        const demoUser = loginWithDemoAccount(email, password);
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(demoUser));
        setIsDemo(true);
        setUser(demoUser);
        return;
      }
      throw new Error(error.message);
    }
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(DEMO_SESSION_KEY);
    setIsDemo(false);
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isDemo, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

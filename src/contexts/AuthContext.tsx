import type { ReactNode } from 'react';
import { createContext, useState, useCallback } from 'react';
import type { AuthUser, LoginCredentials } from '@/types';
import { DEMO_ACCOUNTS, ORGANIZATIONS } from '@/data/sampleData';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (creds: LoginCredentials) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'lca_demo_session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      return stored ? (JSON.parse(stored) as AuthUser) : null;
    } catch {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  });
  const loading = false;

  const login = useCallback(async ({ email, password }: LoginCredentials) => {
    await new Promise(r => setTimeout(r, 600));

    const account = DEMO_ACCOUNTS[email.toLowerCase()];
    if (!account || account.password !== password) {
      throw new Error('Invalid email or password');
    }

    const organization = ORGANIZATIONS.find(o => o.id === account.orgId);
    if (!organization) throw new Error('Organization not found');

    const authUser: AuthUser = {
      id: account.profile.user_id,
      email,
      profile: account.profile,
      organization,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

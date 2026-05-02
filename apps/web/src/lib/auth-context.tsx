'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, bootstrapSession, setAccessToken, setOnUnauthorized } from './api';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  role: string;
  tenant: { id: string; slug: string; name: string };
};

type LoginInput = { tenantSlug: string; email: string; password: string };

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setOnUnauthorized(() => {
      setAccessToken(null);
      setUser(null);
    });

    (async () => {
      const refreshed = await bootstrapSession();
      if (refreshed) {
        try {
          const me = await api<AuthUser>('/users/me');
          setUser(me);
        } catch {
          setAccessToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
      skipAuth: true,
    });
    setAccessToken(accessToken);
    const me = await api<AuthUser>('/users/me');
    setUser(me);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

'use client';

import { createContext, useContext } from 'react';

export interface AuthState {
  jwtToken: string | null;
  isAuthenticated: boolean;
  body: Record<string, unknown>;
  userName?: string;
  userId?: string | number | null;
}

const defaultAuthState: AuthState = {
  jwtToken: null,
  isAuthenticated: false,
  body: {},
  userId: null,
};

const AuthContext = createContext<AuthState>(defaultAuthState);

export function AuthProvider({ serverAuthData, children }: { serverAuthData: AuthState; children: React.ReactNode }) {
  return <AuthContext.Provider value={serverAuthData}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
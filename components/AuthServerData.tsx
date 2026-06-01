import { headers } from 'next/headers';

import { AuthProvider } from '@/contexts/AuthContext';
import { getPostBody } from '@/lib/body-cache';

function getNestedRecord(value: unknown, key: string): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const nested = (value as Record<string, unknown>)[key];
  return nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : {};
}

export async function AuthServerData({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const bodyId = headersList.get('x-body-id');
  const body = bodyId ? ((await getPostBody(bodyId)) as Record<string, unknown> | null) : null;
  const context = getNestedRecord(body, '__context');
  const user = getNestedRecord(context, 'user');
  const jwtToken = typeof user.jwt === 'string' ? user.jwt : null;

  return (
    <AuthProvider
      serverAuthData={{
        jwtToken,
        isAuthenticated: jwtToken != null,
        body: body ?? {},
        userName: typeof user.shadowName === 'string' ? user.shadowName : undefined,
        userId: typeof user.id === 'string' || typeof user.id === 'number' ? user.id : null,
      }}
    >
      {children}
    </AuthProvider>
  );
}
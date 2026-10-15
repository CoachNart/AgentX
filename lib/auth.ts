import { cookies } from 'next/headers';
import { decrypt, encrypt } from './crypto';

const SESSION = 'agentx_session';
export type LocalAccount = {
  userId: string;
  xUserId: string;
  username: string;
  name?: string;
  avatarUrl?: string;
  accessTokenEnc: string;
  refreshTokenEnc?: string | null;
  accessTokenExpires?: number | null;
  scope?: string;
};
export type SessionPayload = { userId: string; account: LocalAccount };

export async function setSession(payload: SessionPayload) {
  const c = await cookies();
  c.set(SESSION, encrypt(JSON.stringify(payload)), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
  });
}
export async function clearSession() { (await cookies()).delete(SESSION); }
export async function getSession(): Promise<SessionPayload | null> {
  const value = (await cookies()).get(SESSION)?.value;
  if (!value) return null;
  try {
    const payload = JSON.parse(decrypt(value)) as SessionPayload;
    if (!payload?.userId || !payload.account?.accessTokenEnc || payload.account.userId !== payload.userId) return null;
    return payload;
  } catch { return null; }
}
export async function getSessionUserId() { return (await getSession())?.userId ?? null; }
export async function requireUser() {
  const id = await getSessionUserId();
  if (!id) throw new Error('AUTH_REQUIRED');
  return id;
}

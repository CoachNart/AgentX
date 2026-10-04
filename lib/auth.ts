import { cookies } from 'next/headers';
import { decrypt, encrypt } from './crypto';
import { db } from './db';
const SESSION = 'agentx_session';
export async function setSession(userId: string) {
  const c = await cookies();
  c.set(SESSION, encrypt(JSON.stringify({ userId })), { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
}
export async function clearSession() { (await cookies()).delete(SESSION); }
export async function getSessionUserId() {
  const value = (await cookies()).get(SESSION)?.value;
  if (!value) return null;
  try {
    const payload = JSON.parse(decrypt(value)) as { userId?: string };
    if (!payload.userId) return null;
    const user = await db.user.findUnique({ where: { id: payload.userId }, select: { id: true } });
    return user?.id ?? null;
  } catch { return null; }
}
export async function requireUser() {
  const id = await getSessionUserId();
  if (!id) throw new Error('AUTH_REQUIRED');
  return id;
}
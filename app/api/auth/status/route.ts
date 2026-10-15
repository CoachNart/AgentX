import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false });
  const { account } = session;
  return NextResponse.json({
    connected: true,
    account: { username: account.username, name: account.name ?? null, avatarUrl: account.avatarUrl ?? null },
    settings: null,
    voiceProfile: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { encrypt } from '../../../../../lib/crypto';
import { setSession } from '../../../../../lib/auth';
import { exchangeXCode, getXMeWithToken } from '../../../../../lib/x';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  if (error) return NextResponse.redirect(new URL('/?error=' + encodeURIComponent(error), req.url));

  const jar = await cookies();
  const expected = jar.get('agentx_oauth_state')?.value;
  const verifier = jar.get('agentx_oauth_verifier')?.value;
  if (!code || !state || state !== expected || !verifier) {
    return NextResponse.redirect(new URL('/?error=oauth_state_invalid', req.url));
  }

  try {
    const token = await exchangeXCode(code, verifier);
    const me = await getXMeWithToken(token.access_token);
    const userId = 'x:' + me.id;
    await setSession({
      userId,
      account: {
        userId,
        xUserId: me.id,
        username: me.username,
        name: me.name,
        avatarUrl: me.profile_image_url,
        accessTokenEnc: encrypt(token.access_token),
        refreshTokenEnc: token.refresh_token ? encrypt(token.refresh_token) : null,
        accessTokenExpires: token.expires_in ? Date.now() + token.expires_in * 1000 : null,
        scope: token.scope,
      },
    });
    jar.delete('agentx_oauth_state');
    jar.delete('agentx_oauth_verifier');
    return NextResponse.redirect(new URL('/?connected=1', req.url));
  } catch (e) {
    console.error('[AgentX OAuth] callback failed:', e instanceof Error ? e.message : 'unknown error');
    return NextResponse.redirect(new URL('/?error=' + encodeURIComponent(e instanceof Error ? e.message : 'oauth_failed'), req.url));
  }
}

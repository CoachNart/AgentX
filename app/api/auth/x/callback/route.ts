import {NextResponse} from 'next/server';import {cookies} from 'next/headers';import {db} from '../../../../../lib/db';import {encrypt} from '../../../../../lib/crypto';import {setSession} from '../../../../../lib/auth';import {exchangeXCode,getXMeWithToken} from '../../../../../lib/x';

export async function GET(req:Request){
  const u=new URL(req.url),code=u.searchParams.get('code'),state=u.searchParams.get('state'),error=u.searchParams.get('error');
  if(error)return NextResponse.redirect(new URL('/?error='+encodeURIComponent(error),req.url));
  const c=await cookies(),expected=c.get('agentx_oauth_state')?.value,verifier=c.get('agentx_oauth_verifier')?.value;
  if(!code||!state||state!==expected||!verifier)return NextResponse.redirect(new URL('/?error=oauth_state_invalid',req.url));
  try{
    console.log('[AgentX OAuth] callback:start');
    const token=await exchangeXCode(code,verifier);
    const me=await getXMeWithToken(token.access_token);
    console.log('[AgentX OAuth] x-profile:ok', {xUserId:me.id, username:me.username});
    const existing=await db.xAccount.findUnique({where:{xUserId:me.id}});
    const userId=existing?.userId??(await db.user.create({data:{}})).id;
    console.log('[AgentX OAuth] user:resolved', {userId, existingAccount:!!existing});
    const account=await db.xAccount.upsert({
      where:{xUserId:me.id},
      create:{userId,xUserId:me.id,username:me.username,name:me.name,avatarUrl:me.profile_image_url,accessTokenEnc:encrypt(token.access_token),refreshTokenEnc:token.refresh_token?encrypt(token.refresh_token):null,accessTokenExpires:token.expires_in?new Date(Date.now()+token.expires_in*1000):null,scope:token.scope},
      update:{userId,username:me.username,name:me.name,avatarUrl:me.profile_image_url,accessTokenEnc:encrypt(token.access_token),refreshTokenEnc:token.refresh_token?encrypt(token.refresh_token):undefined,accessTokenExpires:token.expires_in?new Date(Date.now()+token.expires_in*1000):null,scope:token.scope}
    });
    console.log('[AgentX OAuth] x-account:saved', {accountId:account.id,userId:account.userId});
    await db.voiceProfile.upsert({where:{userId:account.userId},create:{userId:account.userId},update:{}});
    await db.settings.upsert({where:{userId:account.userId},create:{userId:account.userId},update:{}});
    await setSession(account.userId);
    console.log('[AgentX OAuth] session:set', {userId:account.userId});
    c.delete('agentx_oauth_state');c.delete('agentx_oauth_verifier');
    return NextResponse.redirect(new URL('/?connected=1',req.url));
  }catch(e){
    console.error('[AgentX OAuth] callback:failed', e instanceof Error ? e.message : e);
    return NextResponse.redirect(new URL('/?error='+encodeURIComponent(e instanceof Error?e.message:'oauth_failed'),req.url));
  }
}
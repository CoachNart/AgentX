import {NextResponse} from 'next/server';import {getSessionUserId} from '../../../../lib/auth';import {db} from '../../../../lib/db';

export async function GET(){
  const userId=await getSessionUserId();
  if(!userId)return NextResponse.json({connected:false});
  const [account,settings,voiceProfile]=await Promise.all([
    db.xAccount.findUnique({where:{userId},select:{username:true,name:true,avatarUrl:true}}),
    db.settings.findUnique({where:{userId}}),
    db.voiceProfile.findUnique({where:{userId}})
  ]);
  if(!account)return NextResponse.json({connected:false});
  return NextResponse.json({connected:true,account,settings,voiceProfile});
}
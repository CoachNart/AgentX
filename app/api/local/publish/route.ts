import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUserId } from '../../../../lib/auth';
import { publishReply } from '../../../../lib/x';

const schema = z.object({ xPostId: z.string().min(1), reply: z.string().min(1).max(280) });

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
    const body = schema.parse(await req.json());
    const published = await publishReply(userId, body.xPostId, body.reply);
    return NextResponse.json({ ok: true, id: published.id, text: published.text, publishedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to publish reply.' }, { status: 400 });
  }
}

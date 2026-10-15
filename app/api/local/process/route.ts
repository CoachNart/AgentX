import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUserId } from '../../../../lib/auth';
import { fetchXPosts } from '../../../../lib/x';
import { analyzePost, generateReply, evaluateReply, evaluateRepetition } from '../../../../lib/ai';

const schema = z.object({
  xPostId: z.string().min(1),
  voice: z.record(z.string(), z.unknown()).optional(),
  settings: z.object({ qualityThreshold: z.number().min(0).max(100).optional() }).optional(),
  previousReplies: z.array(z.string()).max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return NextResponse.json({ error: 'AUTH_REQUIRED' }, { status: 401 });
    const body = schema.parse(await req.json());
    const posts = await fetchXPosts(userId, [body.xPostId]);
    if (!posts.length) return NextResponse.json({ error: 'This X post is unavailable or cannot be accessed.' }, { status: 404 });
    const post = posts[0];
    const analysis = await analyzePost(post);
    const previousReplies = body.previousReplies ?? [];
    const reply = await generateReply({ post, analysis, voice: body.voice ?? {}, previousReplies });
    const quality = await evaluateReply({ post, analysis, reply: reply.reply, voice: body.voice ?? {}, previousReplies });
    const repetition = await evaluateRepetition(reply.reply, previousReplies);
    const score = Math.round((quality.relevance + quality.specificity + quality.naturalness + quality.value + (100 - quality.repetitionRisk)) / 5);
    const threshold = body.settings?.qualityThreshold ?? 80;
    const approvedByQuality = quality.approved && score >= threshold && !repetition.similar && repetition.risk < 75;
    return NextResponse.json({
      post: {
        xPostId: post.id, authorName: post.author, authorUsername: post.username,
        postText: post.text, postUrl: 'https://x.com/i/status/' + post.id,
        analysis, generatedReply: reply.reply, generationReason: reply.reason,
        confidence: reply.confidence, qualityScore: score, quality,
        status: approvedByQuality ? 'READY' : 'FAILED',
        approvalStatus: 'PENDING',
        errorMessage: approvedByQuality ? null : 'Reply did not pass the configured quality or repetition checks.',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      },
      ok: approvedByQuality,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to process this post.' }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "../../../../lib/auth";
import { db } from "../../../../lib/db";
import { parseXUrls } from "../../../../lib/url-parser";

const schema = z.object({
  input: z.string().min(1).max(200000),
  label: z.string().max(100).optional(),
});

export async function POST(req: Request) {
  try {
    const userId = await requireUser();
    const body = schema.parse(await req.json());
    const parsed = parseXUrls(body.input);

    if (!parsed.valid.length) {
      return NextResponse.json(
        { error: "No valid X post links were found.", parsed },
        { status: 400 },
      );
    }

    const existing = await db.post.findMany({
      where: {
        userId,
        xPostId: { in: parsed.valid.map((x) => x.postId) },
      },
      select: { xPostId: true },
    });

    const ids = new Set(existing.map((x: { xPostId: string }) => x.xPostId));
    const fresh = parsed.valid.filter((x) => !ids.has(x.postId));

    const batch = await db.batch.create({
      data: {
        userId,
        label: body.label || "New batch",
        imported: parsed.imported,
        valid: fresh.length,
        duplicates: parsed.duplicates.length + existing.length,
        invalid: parsed.invalid.length,
      },
    });

    if (fresh.length) {
      await db.post.createMany({
        data: fresh.map((x) => ({
          userId,
          batchId: batch.id,
          xPostId: x.postId,
          postUrl: x.url,
        })),
      });
    }

    await db.auditLog.create({
      data: {
        userId,
        action: "batch.created",
        entity: "batch",
        entityId: batch.id,
        metadata: {
          imported: parsed.imported,
          valid: fresh.length,
        },
      },
    });

    return NextResponse.json({
      batchId: batch.id,
      parsed,
      accepted: fresh.length,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Unable to create batch.",
      },
      {
        status: e instanceof Error && e.message === "AUTH_REQUIRED" ? 401 : 400,
      },
    );
  }
}

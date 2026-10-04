import { z } from "zod";

export const xUrlSchema = z.string().url();

export type ParsedUrl = {
  url: string;
  postId: string;
};

export function parseXUrls(input: string) {
  const candidates = input
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  const valid: ParsedUrl[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];

  for (const raw of candidates) {
    try {
      const u = new URL(raw);
      const host = u.hostname.toLowerCase().replace(/^www\./, "");

      if (!["x.com", "twitter.com"].includes(host)) {
        throw new Error("Unsupported X host");
      }

      const match = u.pathname.match(/^\/[^\/]+\/status\/(\d+)/);

      if (!match) {
        throw new Error("Invalid X status URL");
      }

      const username = u.pathname.split("/")[1];
      const url = `https://x.com/${username}/status/${match[1]}`;

      if (seen.has(match[1])) {
        duplicates.push(raw);
        continue;
      }

      seen.add(match[1]);
      valid.push({ url, postId: match[1] });
    } catch {
      invalid.push(raw);
    }
  }

  return {
    valid,
    duplicates,
    invalid,
    imported: candidates.length,
  };
}

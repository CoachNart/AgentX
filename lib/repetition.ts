function tokens(value: string) {
  return new Set((value.toLowerCase().match(/[a-z0-9']+/g) || []).filter(x => x.length > 2));
}
export function lexicalSimilarity(a: string, b: string) {
  const A = tokens(a); const B = tokens(b);
  if (!A.size || !B.size) return 0;
  let intersection = 0;
  for (const token of A) if (B.has(token)) intersection++;
  return intersection / (A.size + B.size - intersection);
}
export function tooSimilar(reply: string, previousReplies: string[], threshold = 0.72) {
  return previousReplies.some(previous => lexicalSimilarity(reply, previous) >= threshold);
}
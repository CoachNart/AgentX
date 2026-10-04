import { describe, expect, it } from 'vitest';
import { lexicalSimilarity, tooSimilar } from '../lib/repetition';
describe('repetition guard', () => {
  it('detects exact repetition', () => expect(lexicalSimilarity('Great point about AI agents', 'Great point about AI agents')).toBe(1));
  it('rejects close repeats', () => expect(tooSimilar('Great point about AI agents', ['Great point about AI agents'])).toBe(true));
});
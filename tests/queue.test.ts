import { describe, expect, it } from 'vitest';
import { canTransition } from '../lib/queue';
describe('queue transitions', () => {
  it('allows ready to approved', () => expect(canTransition('ready', 'approved')).toBe(true));
  it('blocks published to processing', () => expect(canTransition('published', 'processing')).toBe(false));
});
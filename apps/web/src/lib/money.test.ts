import { describe, expect, it } from 'vitest';
import { formatTaka } from './money';

describe('formatTaka', () => {
  it('formats whole and fractional taka from paisa', () => {
    expect(formatTaka(9000)).toBe('৳90.00');
    expect(formatTaka(10250)).toBe('৳102.50');
  });

  it('formats zero and negative amounts', () => {
    expect(formatTaka(0)).toBe('৳0.00');
    expect(formatTaka(-150)).toBe('-৳1.50');
  });
});

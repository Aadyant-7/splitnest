import { describe, expect, it } from 'vitest';
import { decimalAmount, money, moneySign } from './format';

describe('monetary presentation', () => {
  it('keeps the final paise in large decimal strings and exponent notation', () => {
    expect(decimalAmount('99999999999999.99')).toBe('99999999999999.99');
    expect(money('99999999999999.99')).toMatch(/999\.99$/);
    expect(decimalAmount('1.0000000000000001e14')).toBe('100000000000000.01');
  });
  it('formats negative balances and identifies zero without monetary Number arithmetic', () => {
    expect(decimalAmount('-99999999999999.99')).toBe('-99999999999999.99');
    expect(moneySign('-99999999999999.99')).toBe(-1);
    expect(moneySign('0.00')).toBe(0);
    expect(moneySign('-0.00')).toBe(0);
    expect(moneySign('0.01')).toBe(1);
  });
  it('provides exact two-decimal input text for budget edits', () => {
    expect(decimalAmount('500')).toBe('500.00');
    expect(decimalAmount('500.10')).toBe('500.10');
    expect(money(33.34)).toMatch(/33\.34$/);
  });
  it('refuses to hide precision already lost in an unsafe numeric input', () => {
    expect(() => money(99999999999999.98)).toThrow('cannot be displayed exactly');
  });
});

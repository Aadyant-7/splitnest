import { describe, expect, it, vi } from 'vitest';
import { parseApiJson } from './json';

describe('exact monetary API parsing', () => {
  it('preserves large positive and negative decimal tokens before binary rounding', () => {
    const text = '{"totalPaid":99999999999999.99,"netBalance":-99999999999999.99,"totalShare":0.00}';
    expect(parseApiJson(text)).toEqual({ totalPaid: '99999999999999.99', netBalance: '-99999999999999.99', totalShare: '0.00' });
  });
  it('handles nested shares and keeps counts, IDs and strings unchanged', () => {
    const result = parseApiJson('{"amount":100.00,"splits":[{"shareAmount":33.34}],"totalRows":3,"expiresIn":900,"description":"amount:100.00","monthlyLimit":"500.00"}');
    expect(result).toEqual({ amount: '100.00', splits: [{ shareAmount: '33.34' }], totalRows: 3, expiresIn: 900, description: 'amount:100.00', monthlyLimit: '500.00' });
  });
  it('retains exponent source tokens and rejects invalid JSON', () => {
    expect(parseApiJson('{"spent":1.0000000000000001e14}')).toEqual({ spent: '1.0000000000000001e14' });
    expect(() => parseApiJson('{"amount":')).toThrow(SyntaxError);
  });
  it('rejects unsafe large values when an older parser cannot expose original source text', () => {
    const native = JSON.parse;
    const spy = vi.spyOn(JSON, 'parse').mockImplementation((text, reviver) =>
      native(text, (key, value) => reviver ? reviver(key, value) : value));
    try {
      expect(parseApiJson('{"amount":33.34}')).toEqual({ amount: '33.34' });
      expect(() => parseApiJson('{"netBalance":99999999999999.99}')).toThrow('current browser');
      expect(() => parseApiJson('{"netBalance":70368744177664.01}')).toThrow('current browser');
    } finally { spy.mockRestore(); }
  });
});

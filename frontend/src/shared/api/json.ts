import { LEGACY_MONEY_LIMIT } from './types';

const monetaryFields = new Set(['amount', 'shareAmount', 'totalPaid', 'totalShare', 'netBalance', 'monthlyLimit', 'spent']);

export function parseApiJson(text: string): unknown {
  return JSON.parse(text, (key, value: unknown, context?: { source?: string }) => {
    if (!monetaryFields.has(key) || typeof value !== 'number') return value;
    // BigDecimal is JSON numeric on the existing API. Preserve its original decimal before Number rounding.
    if (context?.source) return context.source;
    if (Math.abs(value) >= LEGACY_MONEY_LIMIT) {
      throw new Error('Use a current browser to display this large monetary amount without rounding.');
    }
    return String(value);
  });
}

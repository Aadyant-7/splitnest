import { LEGACY_MONEY_LIMIT, type Money } from '../api/types';

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
const decimal = new Intl.NumberFormat('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Modern Intl accepts exact decimal strings. ES2022's TS declarations predate that overload.
const exactCurrency = rupees.format as (value: Money) => string;
const exactDecimal = decimal.format as (value: Money) => string;
const supportsExactStrings = exactDecimal('99999999999999.99') === '99999999999999.99';
function checked(value: Money): Money {
  if (Math.abs(Number(value)) >= LEGACY_MONEY_LIMIT && (typeof value === 'number' || !supportsExactStrings)) {
    throw new Error('This monetary amount cannot be displayed exactly in this browser.');
  }
  return value;
}
export function money(value: Money) { return exactCurrency(checked(value)); }
export function decimalAmount(value: Money) { return exactDecimal(checked(value)); }
export function moneySign(value: Money): -1 | 0 | 1 {
  const text = decimalAmount(value);
  return /^-?0\.00$/.test(text) ? 0 : text.startsWith('-') ? -1 : 1;
}
export function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}
export function categoryLabel(value: string) { return value.charAt(0) + value.slice(1).toLowerCase(); }

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
export function money(value: number | string) { return rupees.format(Number(value)); }
export function shortDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value));
}
export function categoryLabel(value: string) { return value.charAt(0) + value.slice(1).toLowerCase(); }

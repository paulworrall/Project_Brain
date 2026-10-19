const AMOUNT_FORMAT = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The one formatter for every money total in the UI (estimate cards, SOW
 * cards, approval dialog and panel): grouped thousands, two decimals, ISO
 * currency code after — "45,675.00 USD".
 */
export function formatMoney(amount: number | string, currency: string): string {
  return `${AMOUNT_FORMAT.format(Number(amount))} ${currency}`;
}

/**
 * Global defaults for converting estimate quantities to hours. Never read
 * these directly in a calculation — always resolve them through
 * getConversionFactors() (src/services/pricing/unit-conversion.ts), which
 * is where a per-client value from the client's MSA will later take
 * precedence over these.
 */
export const HOURS_PER_DAY = 7.5;
export const DAYS_PER_WEEK = 5;

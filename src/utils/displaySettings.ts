// Shared decimal-places setting. formatNumber (numberFormat.ts) and the decimal display of
// symbolic terms (decimalText in symbolic.ts) must follow the same user setting. Keeping it in
// numberFormat.ts would make symbolic.ts depend on it and create a circular import
// (numberFormat.ts already imports symbolic.ts), so it lives in this dependency-free module.
// Source: useAppStore.setDecimalPlaces (Settings -> Decimal places).

let DECIMAL_PLACES = 6;

/** Ayarlar ekranından çağrılır; 0-12 arasına sıkıştırılır. */
export function setDecimalPlaces(n: number): void {
  DECIMAL_PLACES = Math.min(12, Math.max(0, Math.round(n)));
}

export function getDecimalPlaces(): number {
  return DECIMAL_PLACES;
}

/** Format integer paisa as a BDT display string using integer math only. */
export function formatTaka(paisa: number): string {
  const sign = paisa < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(paisa));
  const taka = Math.trunc(abs / 100);
  const fraction = abs % 100;
  return `${sign}৳${String(taka)}.${String(fraction).padStart(2, '0')}`;
}

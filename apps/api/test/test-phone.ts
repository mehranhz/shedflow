/** Stable test phone derived from a label. Sign-in and claim fixtures use this, never an email address. */
export function testPhone(label: string): string {
  let hash = 2166136261;
  for (let index = 0; index < label.length; index += 1) {
    hash ^= label.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const digits = (hash >>> 0).toString().padStart(10, '0').slice(0, 10);
  return `+1${digits}`;
}

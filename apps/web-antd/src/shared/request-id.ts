/** UUID v4 uses browser entropy and remains available on local HTTP installations. */
export function requestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const view = new DataView(bytes.buffer);
  view.setUint8(6, (view.getUint8(6) & 15) | 64);
  view.setUint8(8, (view.getUint8(8) & 63) | 128);
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

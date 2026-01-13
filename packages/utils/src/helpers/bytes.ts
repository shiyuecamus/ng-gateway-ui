export function formatBytes(size?: null | number): string {
  const value = Number(size ?? 0);
  if (!value) return '-';
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (value < MB) return `${(value / KB).toFixed(2)}KB`;
  if (value < GB) return `${(value / MB).toFixed(2)}MB`;
  return `${(value / GB).toFixed(2)}GB`;
}

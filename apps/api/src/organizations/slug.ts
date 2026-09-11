const MAX_SLUG_LENGTH = 48;

export function slugifyName(name: string): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  const trimmed = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '');
  return trimmed.length > 0 ? trimmed : 'org';
}

export function withSlugSuffix(base: string, suffix: string): string {
  const room = MAX_SLUG_LENGTH - suffix.length - 1;
  const head = base.slice(0, Math.max(1, room)).replace(/-+$/g, '');
  return `${head}-${suffix}`;
}

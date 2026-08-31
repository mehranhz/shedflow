export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export type SortDirection = 'asc' | 'desc';

export type Sort<TEntity> = {
  field: Extract<keyof TEntity, string>;
  direction: SortDirection;
};

export type PageRequest<TEntity> = {
  /** 1-based page number. Defaults to 1. */
  page?: number;
  /** Defaults to {@link DEFAULT_PAGE_LIMIT}, capped at {@link MAX_PAGE_LIMIT}. */
  limit?: number;
  sort?: Sort<TEntity>[];
};

export type Page<TEntity> = {
  items: TEntity[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
};

/** Clamps caller-supplied paging into a safe range. Shared by every implementation. */
export function resolvePageRequest<TEntity>(
  request: PageRequest<TEntity> = {},
): { page: number; limit: number; skip: number; sort: Sort<TEntity>[] } {
  const page = Math.max(1, Math.trunc(request.page ?? 1));
  const limit = Math.min(
    Math.max(1, Math.trunc(request.limit ?? DEFAULT_PAGE_LIMIT)),
    MAX_PAGE_LIMIT,
  );

  return { page, limit, skip: (page - 1) * limit, sort: request.sort ?? [] };
}

export function buildPage<TEntity>(
  items: TEntity[],
  total: number,
  page: number,
  limit: number,
): Page<TEntity> {
  return { items, total, page, limit, pageCount: Math.ceil(total / limit) };
}

export const DEFAULT_PAGE_LIMIT = 25;
export const MAX_PAGE_LIMIT = 100;

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
};

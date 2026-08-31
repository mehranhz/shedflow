import {
  EntityNotFoundError,
  InMemoryRepository,
  MAX_PAGE_LIMIT,
  UniqueConstraintError,
} from './index';

type Widget = { id: string; name: string; sku: string };
type CreateWidgetData = { name: string; sku: string };

class WidgetRepository extends InMemoryRepository<Widget, CreateWidgetData> {
  constructor() {
    super('Widget', ['sku']);
  }

  protected buildEntity(id: string, data: CreateWidgetData): Widget {
    return { id, name: data.name, sku: data.sku };
  }
}

// Pins the semantics of the shared Repository contract. Any other
// implementation (Prisma or otherwise) is expected to behave the same way.
describe('Repository contract', () => {
  let widgets: WidgetRepository;

  beforeEach(async () => {
    widgets = new WidgetRepository();
    for (const name of ['delta', 'alpha', 'charlie', 'bravo']) {
      await widgets.create({ name, sku: `sku-${name}` });
    }
  });

  it('paginates with 1-based pages and reports the total', async () => {
    const page = await widgets.findAll({
      page: 2,
      limit: 3,
      sort: [{ field: 'name', direction: 'asc' }],
    });

    expect(page.items.map((widget) => widget.name)).toEqual(['delta']);
    expect(page).toMatchObject({ total: 4, page: 2, limit: 3, pageCount: 2 });
  });

  it('sorts descending and clamps an out-of-range limit', async () => {
    const page = await widgets.findAll({
      limit: 10_000,
      sort: [{ field: 'name', direction: 'desc' }],
    });

    expect(page.items.map((widget) => widget.name)).toEqual([
      'delta',
      'charlie',
      'bravo',
      'alpha',
    ]);
    expect(page.limit).toBe(MAX_PAGE_LIMIT);
  });

  it('reports which field violated a uniqueness constraint', async () => {
    const failure = widgets.create({ name: 'echo', sku: 'sku-alpha' });

    await expect(failure).rejects.toBeInstanceOf(UniqueConstraintError);
    await expect(failure).rejects.toMatchObject({
      entityName: 'Widget',
      fields: ['sku'],
    });
  });

  it('updates by id and rejects a missing id', async () => {
    const { items } = await widgets.findAll({
      sort: [{ field: 'name', direction: 'asc' }],
    });
    const updated = await widgets.update(items[0].id, { name: 'renamed' });

    expect(updated.name).toBe('renamed');
    expect(updated.sku).toBe('sku-alpha');
    await expect(
      widgets.update('missing', { name: 'nope' }),
    ).rejects.toBeInstanceOf(EntityNotFoundError);
  });

  it('deletes by id and rejects a missing id', async () => {
    const { items } = await widgets.findAll();

    await widgets.delete(items[0].id);

    expect(await widgets.count()).toBe(3);
    expect(await widgets.exists(items[0].id)).toBe(false);
    await expect(widgets.delete(items[0].id)).rejects.toBeInstanceOf(
      EntityNotFoundError,
    );
  });
});

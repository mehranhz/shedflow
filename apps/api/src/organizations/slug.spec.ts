import { slugifyName, withSlugSuffix } from './slug';

describe('slugifyName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyName("Ada's Workspace")).toBe('adas-workspace');
  });

  it('falls back to org when empty', () => {
    expect(slugifyName('!!!')).toBe('org');
  });
});

describe('withSlugSuffix', () => {
  it('appends a 4-character suffix', () => {
    expect(withSlugSuffix('acme', 'ab12')).toBe('acme-ab12');
  });
});

import { join } from 'node:path';
import { loadAllDatasets, loadDataset } from './dataset.loader';

const DATASETS_DIR = join(__dirname, '..', '..', 'eval', 'datasets');

describe('dataset.loader', () => {
  it('loads the shipped example dataset', () => {
    const ds = loadDataset(join(DATASETS_DIR, 'example.json'));
    expect(ds.name).toBe('example');
    expect(ds.cases.length).toBeGreaterThan(0);
    expect(ds.cases[0].expectedFiles.length).toBeGreaterThan(0);
  });

  it('loads all datasets in the directory', () => {
    const all = loadAllDatasets(DATASETS_DIR);
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  it('returns an empty array for a missing directory', () => {
    expect(loadAllDatasets(join(DATASETS_DIR, 'does-not-exist'))).toEqual([]);
  });
});

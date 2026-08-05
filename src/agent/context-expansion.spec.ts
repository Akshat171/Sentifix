import {
  collectSignalPaths,
  matchesSignal,
  planNeighborFetch,
  prioritizeBySignals,
} from './context-expansion';

describe('context-expansion', () => {
  describe('matchesSignal', () => {
    it('matches a component name against its file path across punctuation', () => {
      expect(matchesSignal('src/auth/auth.service.ts', 'AuthService')).toBe(true);
    });

    it('matches a stack-trace path against the indexed path', () => {
      expect(matchesSignal('src/auth/oauth.strategy.ts', 'auth/oauth.strategy.ts')).toBe(true);
    });

    it('ignores very short / trivial signals', () => {
      expect(matchesSignal('src/auth/auth.service.ts', 'a')).toBe(false);
      expect(matchesSignal('src/auth/auth.service.ts', '')).toBe(false);
    });

    it('does not match unrelated files', () => {
      expect(matchesSignal('src/billing/invoice.ts', 'AuthService')).toBe(false);
    });
  });

  describe('collectSignalPaths', () => {
    it('combines trace files and affected components, trimming empties', () => {
      expect(collectSignalPaths(['UserService', '  '], ['src/a.ts'])).toEqual([
        'src/a.ts',
        'UserService',
      ]);
    });

    it('tolerates undefined components', () => {
      expect(collectSignalPaths(undefined, ['src/a.ts'])).toEqual(['src/a.ts']);
    });
  });

  describe('prioritizeBySignals', () => {
    const chunks = [
      { filePath: 'src/util/log.ts', similarity: 0.9 },
      { filePath: 'src/auth/auth.service.ts', similarity: 0.4 },
      { filePath: 'src/billing/invoice.ts', similarity: 0.8 },
    ];

    it('moves signal-matched chunks to the front, preserving relative order', () => {
      const out = prioritizeBySignals(chunks, ['AuthService']);
      expect(out.map((c) => c.filePath)).toEqual([
        'src/auth/auth.service.ts',
        'src/util/log.ts',
        'src/billing/invoice.ts',
      ]);
    });

    it('is a no-op when there are no signals', () => {
      expect(prioritizeBySignals(chunks, [])).toBe(chunks);
    });
  });

  describe('planNeighborFetch', () => {
    it('proposes adjacent indices not already present', () => {
      const present = new Set(['a.ts#5']);
      const reqs = planNeighborFetch([{ filePath: 'a.ts', chunkIndex: 5 }], present, 1);
      expect(reqs).toEqual([
        { filePath: 'a.ts', index: 4 },
        { filePath: 'a.ts', index: 6 },
      ]);
    });

    it('drops negative indices and dedupes overlapping requests', () => {
      const reqs = planNeighborFetch(
        [
          { filePath: 'a.ts', chunkIndex: 0 },
          { filePath: 'a.ts', chunkIndex: 1 },
        ],
        new Set(),
        1,
      );
      // idx0 → {1}; idx1 → {0,2}; index 1 is a hit-center so not re-added by itself,
      // but 0/1/2 must be unique across the plan.
      const keys = reqs.map((r) => `${r.filePath}#${r.index}`);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain('a.ts#-1');
    });

    it('skips hits without a chunk index', () => {
      expect(planNeighborFetch([{ filePath: 'a.ts' }], new Set())).toEqual([]);
    });
  });
});

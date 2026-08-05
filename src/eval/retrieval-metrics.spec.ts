import {
  aggregateRetrieval,
  isSameFile,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from './retrieval-metrics';

describe('retrieval-metrics', () => {
  describe('isSameFile', () => {
    it('matches identical paths', () => {
      expect(isSameFile('src/auth/auth.service.ts', 'src/auth/auth.service.ts')).toBe(true);
    });

    it('matches on a leading ./ normalisation', () => {
      expect(isSameFile('./src/a.ts', 'src/a.ts')).toBe(true);
    });

    it('matches when one path is a suffix of the other', () => {
      expect(isSameFile('packages/api/src/auth/auth.service.ts', 'auth/auth.service.ts')).toBe(
        true,
      );
    });

    it('does not match unrelated files sharing a basename fragment', () => {
      expect(isSameFile('src/user.service.ts', 'src/auth.service.ts')).toBe(false);
    });

    it('does not match on empty input', () => {
      expect(isSameFile('', 'src/a.ts')).toBe(false);
    });
  });

  describe('recallAtK', () => {
    const expected = ['src/auth/auth.service.ts', 'src/auth/oauth.strategy.ts'];

    it('is 1 when all expected files are in the top-k', () => {
      const retrieved = ['src/auth/oauth.strategy.ts', 'x.ts', 'src/auth/auth.service.ts'];
      expect(recallAtK(retrieved, expected, 5)).toBe(1);
    });

    it('is 0.5 when half the expected files are retrieved', () => {
      const retrieved = ['src/auth/auth.service.ts', 'unrelated.ts'];
      expect(recallAtK(retrieved, expected, 5)).toBe(0.5);
    });

    it('respects the k cutoff', () => {
      const retrieved = ['a.ts', 'b.ts', 'src/auth/auth.service.ts'];
      expect(recallAtK(retrieved, expected, 2)).toBe(0);
    });

    it('is 1 for an empty expected set (nothing to miss)', () => {
      expect(recallAtK(['a.ts'], [], 5)).toBe(1);
    });
  });

  describe('precisionAtK', () => {
    it('counts relevant hits within the top-k window', () => {
      const retrieved = ['src/auth/auth.service.ts', 'noise1.ts', 'noise2.ts', 'noise3.ts'];
      // 1 relevant out of 4 retrieved
      expect(precisionAtK(retrieved, ['src/auth/auth.service.ts'], 4)).toBe(0.25);
    });

    it('is 0 when nothing is retrieved', () => {
      expect(precisionAtK([], ['a.ts'], 5)).toBe(0);
    });

    it('dedupes retrieved paths before computing the window', () => {
      const retrieved = ['a.ts', 'a.ts', 'src/auth/auth.service.ts'];
      // after dedupe: [a.ts, auth.service.ts] → 1/2
      expect(precisionAtK(retrieved, ['src/auth/auth.service.ts'], 5)).toBe(0.5);
    });
  });

  describe('reciprocalRank', () => {
    it('rewards an early first hit', () => {
      const retrieved = ['noise.ts', 'src/auth/auth.service.ts', 'more.ts'];
      expect(reciprocalRank(retrieved, ['src/auth/auth.service.ts'])).toBe(1 / 2);
    });

    it('is 0 when no expected file is retrieved', () => {
      expect(reciprocalRank(['a.ts', 'b.ts'], ['src/auth/auth.service.ts'])).toBe(0);
    });
  });

  describe('aggregateRetrieval', () => {
    it('averages each metric across cases', () => {
      const agg = aggregateRetrieval([
        { recallAtK: 1, precisionAtK: 0.5, reciprocalRank: 1 },
        { recallAtK: 0, precisionAtK: 0.5, reciprocalRank: 0 },
      ]);
      expect(agg.recallAtK).toBe(0.5);
      expect(agg.precisionAtK).toBe(0.5);
      expect(agg.reciprocalRank).toBe(0.5);
    });

    it('returns zeros for an empty set', () => {
      expect(aggregateRetrieval([])).toEqual({
        recallAtK: 0,
        precisionAtK: 0,
        reciprocalRank: 0,
      });
    });
  });
});

import { cosineSimilarity, topKByCosine } from './vector-math';

describe('vector-math', () => {
  describe('cosineSimilarity', () => {
    it('is 1 for identical direction vectors', () => {
      expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    it('is 0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it('is -1 for opposite vectors', () => {
      expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
    });

    it('is 0 on dimension mismatch or empty input', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('is 0 when a vector has no magnitude', () => {
      expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });
  });

  describe('topKByCosine', () => {
    const docs = [
      { item: 'far', vector: [0, 1] },
      { item: 'near', vector: [1, 0.1] },
      { item: 'nearest', vector: [1, 0] },
    ];

    it('ranks by similarity to the query and truncates to k', () => {
      const out = topKByCosine([1, 0], docs, 2);
      expect(out.map((r) => r.doc)).toEqual(['nearest', 'near']);
    });

    it('returns all docs when k exceeds the count', () => {
      expect(topKByCosine([1, 0], docs, 10)).toHaveLength(3);
    });
  });
});

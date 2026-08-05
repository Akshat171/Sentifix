import { chunkCode, separatorsForPath } from './code-chunker';

describe('code-chunker', () => {
  describe('separatorsForPath', () => {
    it('selects language-specific separators by extension', () => {
      expect(separatorsForPath('src/a.ts')).toContain('\nfunction ');
      expect(separatorsForPath('app/main.py')).toContain('\ndef ');
      expect(separatorsForPath('cmd/main.go')).toContain('\nfunc ');
    });

    it('falls back to a generic separator set for unknown extensions', () => {
      const sep = separatorsForPath('data.xyz');
      expect(sep).toEqual(['\n\n', '\n', ' ', '']);
    });
  });

  describe('chunkCode', () => {
    it('keeps small functions intact on their own boundary', () => {
      const src = [
        'const x = 1;',
        '',
        'function alpha() {',
        '  return doAlpha();',
        '}',
        '',
        'function beta() {',
        '  return doBeta();',
        '}',
        '',
        'function gamma() {',
        '  return doGamma();',
        '}',
      ].join('\n');

      // Budget fits one ~42-char function but not two, forcing per-function boundaries.
      const chunks = chunkCode(src, 'src/thing.ts', { maxSize: 60, overlap: 0 });

      const alpha = chunks.find((c) => c.includes('function alpha'))!;
      // The chunk that owns alpha must contain its whole body, not a mid-function cut.
      expect(alpha).toContain('return doAlpha();');
      expect(alpha).toContain('}');
      // A chunk boundary should start at a function keyword, not split one.
      expect(chunks.some((c) => c.trimStart().startsWith('function beta'))).toBe(true);
    });

    it('splits a function larger than maxSize into multiple chunks', () => {
      const body = Array.from({ length: 50 }, (_, i) => `  const v${i} = compute(${i});`).join(
        '\n',
      );
      const src = `function huge() {\n${body}\n}`;
      const chunks = chunkCode(src, 'src/huge.ts', { maxSize: 200, overlap: 20 });
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('carries an overlap tail between merged chunks', () => {
      const src = Array.from({ length: 30 }, (_, i) => `line number ${i} of the file`).join('\n');
      const chunks = chunkCode(src, 'notes.txt', { maxSize: 120, overlap: 30 });
      expect(chunks.length).toBeGreaterThan(1);
      // The start of chunk[1] should re-include the tail of chunk[0].
      const tail = chunks[0].slice(-30).trim();
      expect(chunks[1]).toContain(tail.split('\n').pop()!.trim());
    });

    it('returns nothing for empty or whitespace-only input', () => {
      expect(chunkCode('', 'a.ts')).toEqual([]);
      expect(chunkCode('   \n  \t', 'a.ts')).toEqual([]);
    });

    it('never emits a chunk wildly larger than maxSize for splittable text', () => {
      const src = Array.from({ length: 200 }, (_, i) => `token${i}`).join(' ');
      const chunks = chunkCode(src, 'x.py', { maxSize: 100, overlap: 10 });
      // Allow overlap slack, but no runaway chunk.
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(100 + 10 + 20);
    });
  });
});

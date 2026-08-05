import { parseModelSpecs } from './embedder';

describe('parseModelSpecs', () => {
  it('defaults to two OpenAI models when unset', () => {
    const specs = parseModelSpecs(undefined);
    expect(specs.map((s) => s.model)).toEqual(['text-embedding-3-small', 'text-embedding-3-large']);
  });

  it('parses "label=model" pairs', () => {
    const specs = parseModelSpecs('small=text-embedding-3-small, code=voyage-code-3');
    expect(specs).toEqual([
      { label: 'small', model: 'text-embedding-3-small' },
      { label: 'code', model: 'voyage-code-3' },
    ]);
  });

  it('treats a bare entry as both label and model', () => {
    const specs = parseModelSpecs('text-embedding-3-large');
    expect(specs).toEqual([{ label: 'text-embedding-3-large', model: 'text-embedding-3-large' }]);
  });
});

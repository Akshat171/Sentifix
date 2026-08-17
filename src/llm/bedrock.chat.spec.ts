import { extractJson } from './bedrock.chat';

describe('extractJson', () => {
  const parsed = (raw: string) => JSON.parse(extractJson(raw));

  it('passes through a bare object', () => {
    expect(parsed('{"severity":"high"}')).toEqual({ severity: 'high' });
  });

  it('passes through a bare array', () => {
    expect(parsed('[1, 2]')).toEqual([1, 2]);
  });

  it('unwraps a ```json fence', () => {
    expect(parsed('```json\n{"severity":"high"}\n```')).toEqual({ severity: 'high' });
  });

  it('unwraps an unlabelled fence', () => {
    expect(parsed('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parsed('\n\n  {"a":1}  \n')).toEqual({ a: 1 });
  });

  it('carves the object out of a lead-in sentence', () => {
    expect(parsed('Here is the classification:\n{"a":1}')).toEqual({ a: 1 });
  });

  it('carves the object out when prose follows it too', () => {
    expect(parsed('Sure!\n{"a":1}\nLet me know if you need more.')).toEqual({ a: 1 });
  });

  it('keeps nested braces intact', () => {
    expect(parsed('{"outer":{"inner":[1,2]}}')).toEqual({ outer: { inner: [1, 2] } });
  });

  it('returns the input unchanged when there is no JSON to find', () => {
    // The caller's JSON.parse still throws — but on the model's actual words,
    // which is a far more debuggable failure than on a silently mangled slice.
    expect(extractJson('I cannot help with that.')).toBe('I cannot help with that.');
  });
});

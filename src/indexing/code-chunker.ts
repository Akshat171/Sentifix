/**
 * Structure-aware code chunking.
 *
 * The previous approach sliced every file into blind fixed-width windows, which
 * routinely cut functions in half — the retrieved chunk would contain the middle
 * of a function with no signature and no closing brace, hurting both embedding
 * quality and what the LLM sees. Both Sourcegraph posts stress splitting on code
 * structure instead.
 *
 * This is a recursive character splitter (the well-known LangChain algorithm)
 * with language-specific separators ordered from most-semantic (class/function
 * boundaries) to least (blank line, newline, space). A separator is kept attached
 * to the text that FOLLOWS it, so a chunk starts at `function foo(` rather than
 * ending on it. Anything whose language we don't recognise falls back to a
 * blank-line/newline split — still strictly better than a blind slice.
 *
 * Pure and dependency-free so it is unit-testable without any infra.
 */

export interface ChunkOptions {
  maxSize?: number;
  overlap?: number;
}

const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

// Most-semantic first. The recursive splitter picks the first separator present
// in the text, then restricts to the separators after it when a piece is still
// too large — so a giant function eventually splits on '\n\n' → '\n' → ' '.
const TS_JS = [
  '\nexport class ',
  '\nexport function ',
  '\nexport default ',
  '\nexport const ',
  '\nclass ',
  '\nasync function ',
  '\nfunction ',
  '\ninterface ',
  '\ntype ',
  '\nenum ',
  '\nconst ',
  '\nlet ',
  '\nvar ',
  '\n\n',
  '\n',
  ' ',
  '',
];

const PYTHON = ['\nclass ', '\ndef ', '\n    def ', '\n\tdef ', '\n\n', '\n', ' ', ''];
const GO = ['\nfunc ', '\ntype ', '\nvar ', '\nconst ', '\n\n', '\n', ' ', ''];
const JAVA_KT = [
  '\nclass ',
  '\npublic ',
  '\nprivate ',
  '\nprotected ',
  '\nfun ',
  '\nvoid ',
  '\n\n',
  '\n',
  ' ',
  '',
];
const RUST = [
  '\npub fn ',
  '\nfn ',
  '\nimpl ',
  '\nstruct ',
  '\nenum ',
  '\ntrait ',
  '\n\n',
  '\n',
  ' ',
  '',
];
const RUBY = ['\nclass ', '\nmodule ', '\ndef ', '\n\n', '\n', ' ', ''];
const MARKDOWN = ['\n# ', '\n## ', '\n### ', '\n#### ', '\n\n', '\n', ' ', ''];
const DEFAULT_SEPARATORS = ['\n\n', '\n', ' ', ''];

const SEPARATORS_BY_EXT: Record<string, string[]> = {
  '.ts': TS_JS,
  '.tsx': TS_JS,
  '.js': TS_JS,
  '.jsx': TS_JS,
  '.mjs': TS_JS,
  '.cjs': TS_JS,
  '.py': PYTHON,
  '.go': GO,
  '.java': JAVA_KT,
  '.kt': JAVA_KT,
  '.rs': RUST,
  '.rb': RUBY,
  '.md': MARKDOWN,
  '.mdx': MARKDOWN,
};

export function separatorsForPath(filePath: string): string[] {
  const dot = filePath.lastIndexOf('.');
  const ext = dot === -1 ? '' : filePath.slice(dot).toLowerCase();
  return SEPARATORS_BY_EXT[ext] ?? DEFAULT_SEPARATORS;
}

/** Split on `sep`, re-attaching it to the following piece. '' splits per-character. */
function splitKeepSeparator(text: string, sep: string): string[] {
  if (sep === '') return text.split('');
  const raw = text.split(sep);
  const parts: string[] = [];
  raw.forEach((p, i) => {
    const piece = i === 0 ? p : sep + p;
    if (piece.length > 0) parts.push(piece);
  });
  return parts;
}

/** Recursively break text into atomic pieces, each ≤ maxSize where possible. */
function recursiveSplit(text: string, separators: string[], maxSize: number): string[] {
  if (text.length <= maxSize) return text.length ? [text] : [];

  // Pick the first separator that occurs; keep the rest for deeper recursion.
  let sepIndex = separators.length - 1;
  for (let i = 0; i < separators.length; i++) {
    if (separators[i] === '' || text.includes(separators[i])) {
      sepIndex = i;
      break;
    }
  }
  const sep = separators[sepIndex];
  const remaining = separators.slice(sepIndex + 1);

  const out: string[] = [];
  for (const piece of splitKeepSeparator(text, sep)) {
    if (piece.length <= maxSize) {
      out.push(piece);
    } else if (remaining.length > 0) {
      out.push(...recursiveSplit(piece, remaining, maxSize));
    } else {
      // No separator can split this further — hard-slice as a last resort.
      for (let s = 0; s < piece.length; s += maxSize) out.push(piece.slice(s, s + maxSize));
    }
  }
  return out;
}

/** Greedily merge adjacent pieces up to maxSize, seeding each new chunk with the previous chunk's overlap tail. */
function mergeWithOverlap(pieces: string[], maxSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current === '') {
      current = piece;
    } else if (current.length + piece.length <= maxSize) {
      current += piece;
    } else {
      chunks.push(current);
      const tail = overlap > 0 ? current.slice(-overlap) : '';
      current = tail + piece;
    }
  }
  if (current.trim().length > 0) chunks.push(current);
  return chunks;
}

export function chunkCode(text: string, filePath: string, opts: ChunkOptions = {}): string[] {
  const maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
  const overlap = opts.overlap ?? DEFAULT_OVERLAP;
  if (!text.trim()) return [];

  const separators = separatorsForPath(filePath);
  const pieces = recursiveSplit(text, separators, maxSize);
  return mergeWithOverlap(pieces, maxSize, overlap).filter((c) => c.trim().length > 0);
}

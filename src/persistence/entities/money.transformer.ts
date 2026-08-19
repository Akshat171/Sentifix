import { ValueTransformer } from 'typeorm';

/**
 * Postgres bigint arrives as a string in node-postgres, because a 64-bit integer
 * does not always fit a JS number. Every amount here is micro-credits and stays
 * far inside Number.MAX_SAFE_INTEGER (a 9-billion-credit balance is ~9e15), so
 * the conversion is safe — but it is asserted rather than assumed, because
 * silently truncating a balance is the worst failure this system could have.
 */
export const microTransformer: ValueTransformer = {
  to: (value?: number | null) => value ?? null,
  from: (value?: string | number | null): number => {
    if (value === null || value === undefined) return 0;
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isSafeInteger(n)) {
      throw new Error(`Micro-credit amount ${value} exceeds safe integer range`);
    }
    return n;
  },
};

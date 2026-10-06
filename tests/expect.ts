// Minimal expect() over node:assert, so tests need no third-party runner.
import assert from 'node:assert/strict';
export { describe, it } from 'node:test';

export function expect<T>(actual: T) {
  return {
    toBe: (expected: T) => assert.strictEqual(actual, expected),
    toEqual: (expected: unknown) => assert.deepStrictEqual(actual, expected),
    toBeNull: () => assert.strictEqual(actual, null),
    toContain: (item: unknown) => assert.ok((actual as unknown[]).includes(item), `expected to contain ${String(item)}`),
    toBeGreaterThan: (n: number) => assert.ok((actual as number) > n, `${String(actual)} is not > ${n}`),
    toThrow: (re?: RegExp) => assert.throws(actual as () => unknown, re),
  };
}

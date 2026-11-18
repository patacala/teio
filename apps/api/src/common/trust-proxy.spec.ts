import { DEFAULT_TRUST_PROXY, parseTrustProxy } from './trust-proxy';

describe('parseTrustProxy', () => {
  it.each([
    [undefined, DEFAULT_TRUST_PROXY],
    ['', DEFAULT_TRUST_PROXY],
    ['true', true],
    ['false', false],
    ['2', 2],
    ['10.0.0.0/8, 173.245.48.0/20', '10.0.0.0/8, 173.245.48.0/20'],
  ])('%p -> %p', (input, expected) => {
    expect(parseTrustProxy(input as string | undefined)).toEqual(expected);
  });
});

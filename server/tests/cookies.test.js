import test from 'node:test';
import assert from 'node:assert/strict';
import { getCookieOptions } from '../src/utils/cookies.js';

test('production cookies use Secure and SameSite=None for cross-site auth', () => {
  const options = getCookieOptions('production');

  assert.equal(options.secure, true);
  assert.equal(options.sameSite, 'none');
});

test('development cookies stay lax and non-secure', () => {
  const options = getCookieOptions('development');

  assert.equal(options.secure, false);
  assert.equal(options.sameSite, 'lax');
});

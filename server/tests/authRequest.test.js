import test from 'node:test';
import assert from 'node:assert/strict';
import { getRefreshTokenFromRequest } from '../src/utils/authRequest.js';

test('reads refresh token from Authorization header', () => {
  const req = { headers: { authorization: 'Bearer refresh-token-from-header' } };
  assert.equal(getRefreshTokenFromRequest(req), 'refresh-token-from-header');
});

test('reads refresh token from x-refresh-token header', () => {
  const req = { headers: { 'x-refresh-token': 'refresh-token-from-header' } };
  assert.equal(getRefreshTokenFromRequest(req), 'refresh-token-from-header');
});

test('reads refresh token from body', () => {
  const req = { body: { refreshToken: 'refresh-token-from-body' } };
  assert.equal(getRefreshTokenFromRequest(req), 'refresh-token-from-body');
});

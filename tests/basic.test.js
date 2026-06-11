/**
 * @zerodb/functions-js — Test suite.
 *
 * Uses Node.js built-in test runner (node --test). Zero dependencies.
 *
 * Refs #4005
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ZeroDBFunctions, FunctionsError, FunctionsHttpError, FunctionsFetchError } from '../index.js';

// ---------------------------------------------------------------------------
// Mock fetch helper
// ---------------------------------------------------------------------------

function mockFetch(responses = []) {
  let callIndex = 0;
  const calls = [];

  const fn = async (url, opts) => {
    calls.push({ url, ...opts });
    const response = responses[callIndex] || responses[responses.length - 1] || { status: 200, body: {} };
    callIndex++;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText || 'OK',
      json: async () => response.body,
    };
  };

  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe('ZeroDBFunctions constructor', () => {
  it('throws if apiKey is missing', () => {
    assert.throws(() => new ZeroDBFunctions({}), /apiKey is required/);
  });

  it('throws if apiKey is empty string', () => {
    assert.throws(() => new ZeroDBFunctions({ apiKey: '' }), /apiKey is required/);
  });

  it('creates client with valid apiKey', () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'test-key', fetch: fn });
    assert.ok(client);
  });

  it('uses default base URL', () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    assert.equal(client.baseUrl, 'https://api.ainative.studio');
  });

  it('accepts custom base URL and strips trailing slash', () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', baseUrl: 'https://custom.dev/', fetch: fn });
    assert.equal(client.baseUrl, 'https://custom.dev');
  });

  it('accepts custom projectId', () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', projectId: 'proj-1', fetch: fn });
    assert.equal(client.projectId, 'proj-1');
  });

  it('throws if fetch is not available and not provided', () => {
    const origFetch = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
      assert.throws(
        () => new ZeroDBFunctions({ apiKey: 'k' }),
        /fetch is not available/
      );
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe('create()', () => {
  it('sends correct POST request', async () => {
    const hookResponse = {
      id: 'hook-1',
      user_id: 'u1',
      event_type: 'zerodb.vector.stored',
      hook_name: 'auto-embed',
      hook_type: 'first_party',
      hook_config: {},
      is_active: true,
      project_id: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: null,
    };
    const fn = mockFetch([{ status: 201, body: hookResponse }]);
    const client = new ZeroDBFunctions({ apiKey: 'test-key', fetch: fn });

    const { data, error } = await client.create('auto-embed', {
      trigger: 'zerodb.vector.stored',
    });

    assert.equal(error, null);
    assert.equal(data.hook_name, 'auto-embed');
    assert.equal(fn.calls.length, 1);
    assert.equal(fn.calls[0].method, 'POST');
    assert.ok(fn.calls[0].url.endsWith('/api/v1/hooks'));

    const sentBody = JSON.parse(fn.calls[0].body);
    assert.equal(sentBody.event_type, 'zerodb.vector.stored');
    assert.equal(sentBody.hook_name, 'auto-embed');
  });

  it('returns error if name is missing', async () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    const { error } = await client.create('', { trigger: 'x' });
    assert.ok(error);
    assert.match(error.message, /name is required/);
  });

  it('returns error if trigger is missing', async () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    const { error } = await client.create('my-fn', {});
    assert.ok(error);
    assert.match(error.message, /trigger is required/);
  });

  it('includes projectId from config', async () => {
    const fn = mockFetch([{ status: 201, body: { id: 'h1' } }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    await client.create('fn1', {
      trigger: 'zerodb.vector.stored',
      projectId: 'proj-abc',
    });

    const sentBody = JSON.parse(fn.calls[0].body);
    assert.equal(sentBody.project_id, 'proj-abc');
  });

  it('falls back to client-level projectId', async () => {
    const fn = mockFetch([{ status: 201, body: { id: 'h1' } }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', projectId: 'default-proj', fetch: fn });

    await client.create('fn1', { trigger: 'zerodb.vector.stored' });

    const sentBody = JSON.parse(fn.calls[0].body);
    assert.equal(sentBody.project_id, 'default-proj');
  });
});

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------

describe('list()', () => {
  it('sends GET request to hooks endpoint', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.list();

    assert.equal(error, null);
    assert.deepEqual(data, []);
    assert.equal(fn.calls[0].method, 'GET');
  });

  it('passes event_type filter', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    await client.list({ eventType: 'zerodb.vector.stored' });

    assert.ok(fn.calls[0].url.includes('event_type=zerodb.vector.stored'));
  });

  it('passes active_only filter', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    await client.list({ activeOnly: false });

    assert.ok(fn.calls[0].url.includes('active_only=false'));
  });
});

// ---------------------------------------------------------------------------
// get()
// ---------------------------------------------------------------------------

describe('get()', () => {
  it('sends GET request with hook ID', async () => {
    const hook = { id: 'hook-1', hook_name: 'fn1' };
    const fn = mockFetch([{ status: 200, body: hook }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.get('hook-1');

    assert.equal(error, null);
    assert.equal(data.id, 'hook-1');
    assert.ok(fn.calls[0].url.endsWith('/api/v1/hooks/hook-1'));
  });

  it('returns error if ID is missing', async () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    const { error } = await client.get('');
    assert.ok(error);
    assert.match(error.message, /ID is required/);
  });
});

// ---------------------------------------------------------------------------
// invoke()
// ---------------------------------------------------------------------------

describe('invoke()', () => {
  it('resolves hook by name then invokes', async () => {
    const hooks = [
      { id: 'h-123', hook_name: 'my-fn', event_type: 'zerodb.vector.stored' },
    ];
    const invokeResult = { result: 'ok' };
    const fn = mockFetch([
      { status: 200, body: hooks },      // list call
      { status: 200, body: invokeResult }, // invoke call
    ]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.invoke('my-fn', {
      body: { name: 'World' },
    });

    assert.equal(error, null);
    assert.equal(data.result, 'ok');
    assert.equal(fn.calls.length, 2);
    assert.ok(fn.calls[1].url.endsWith('/api/v1/hooks/h-123/invoke'));
    const invokeBody = JSON.parse(fn.calls[1].body);
    assert.deepEqual(invokeBody.payload, { name: 'World' });
  });

  it('returns error if function not found', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.invoke('nonexistent');

    assert.equal(data, null);
    assert.ok(error);
    assert.equal(error.status, 404);
    assert.match(error.message, /not found/);
  });

  it('returns error if name is empty', async () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    const { error } = await client.invoke('');
    assert.ok(error);
    assert.match(error.message, /name is required/);
  });

  it('merges per-call headers', async () => {
    const hooks = [{ id: 'h-1', hook_name: 'fn1' }];
    const fn = mockFetch([
      { status: 200, body: hooks },
      { status: 200, body: {} },
    ]);
    const client = new ZeroDBFunctions({
      apiKey: 'k',
      fetch: fn,
      headers: { 'X-Base': 'yes' },
    });

    await client.invoke('fn1', { headers: { 'X-Extra': 'val' } });

    const invokeHeaders = fn.calls[1].headers;
    assert.equal(invokeHeaders['X-Base'], 'yes');
    assert.equal(invokeHeaders['X-Extra'], 'val');
  });
});

// ---------------------------------------------------------------------------
// update()
// ---------------------------------------------------------------------------

describe('update()', () => {
  it('updates by UUID directly', async () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const fn = mockFetch([{ status: 200, body: { id: uuid, is_active: false } }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.update(uuid, { isActive: false });

    assert.equal(error, null);
    assert.equal(fn.calls.length, 1);
    assert.equal(fn.calls[0].method, 'PATCH');
    assert.ok(fn.calls[0].url.endsWith(`/api/v1/hooks/${uuid}`));
    const body = JSON.parse(fn.calls[0].body);
    assert.equal(body.is_active, false);
  });

  it('resolves name to ID then updates', async () => {
    const hooks = [{ id: 'h-abc', hook_name: 'my-fn' }];
    const fn = mockFetch([
      { status: 200, body: hooks },
      { status: 200, body: { id: 'h-abc', hook_config: { url: 'new' } } },
    ]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.update('my-fn', {
      hookConfig: { url: 'new' },
    });

    assert.equal(error, null);
    assert.equal(fn.calls.length, 2);
    assert.ok(fn.calls[1].url.endsWith('/api/v1/hooks/h-abc'));
  });

  it('returns 404 if name not found', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { error } = await client.update('missing', { isActive: false });
    assert.ok(error);
    assert.equal(error.status, 404);
  });
});

// ---------------------------------------------------------------------------
// delete()
// ---------------------------------------------------------------------------

describe('delete()', () => {
  it('deletes by UUID directly', async () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    const fn = mockFetch([{ status: 204, body: null }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.delete(uuid);

    assert.equal(error, null);
    assert.deepEqual(data, { success: true });
    assert.equal(fn.calls[0].method, 'DELETE');
  });

  it('resolves name to ID then deletes', async () => {
    const hooks = [{ id: 'h-del', hook_name: 'old-fn' }];
    const fn = mockFetch([
      { status: 200, body: hooks },
      { status: 204, body: null },
    ]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.delete('old-fn');

    assert.equal(error, null);
    assert.equal(fn.calls.length, 2);
    assert.ok(fn.calls[1].url.endsWith('/api/v1/hooks/h-del'));
  });

  it('returns 404 if name not found', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { error } = await client.delete('ghost');
    assert.ok(error);
    assert.equal(error.status, 404);
  });

  it('returns error if name is empty', async () => {
    const fn = mockFetch();
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });
    const { error } = await client.delete('');
    assert.ok(error);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('Error handling', () => {
  it('wraps HTTP errors with status and context', async () => {
    const fn = mockFetch([{
      status: 401,
      statusText: 'Unauthorized',
      body: { detail: 'Invalid API key' },
    }]);
    const client = new ZeroDBFunctions({ apiKey: 'bad-key', fetch: fn });

    const { data, error } = await client.list();

    assert.equal(data, null);
    assert.ok(error instanceof FunctionsHttpError);
    assert.equal(error.status, 401);
    assert.equal(error.message, 'Invalid API key');
  });

  it('wraps network errors as FunctionsFetchError', async () => {
    const fn = async () => { throw new Error('ECONNREFUSED'); };
    fn.calls = [];
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { data, error } = await client.list();

    assert.equal(data, null);
    assert.ok(error instanceof FunctionsFetchError);
    assert.match(error.message, /ECONNREFUSED/);
  });

  it('handles 409 conflict on create', async () => {
    const fn = mockFetch([{
      status: 409,
      body: { detail: 'Hook already exists for this event_type + hook_name combination' },
    }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { error } = await client.create('dup', { trigger: 'zerodb.vector.stored' });

    assert.ok(error);
    assert.equal(error.status, 409);
    assert.match(error.message, /already exists/);
  });

  it('handles non-JSON error responses gracefully', async () => {
    const fn = async (url, opts) => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('not json'); },
    });
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    const { error } = await client.list();

    assert.ok(error);
    assert.equal(error.status, 500);
    assert.equal(error.message, 'Internal Server Error');
  });
});

// ---------------------------------------------------------------------------
// Auth headers
// ---------------------------------------------------------------------------

describe('Auth headers', () => {
  it('sends Authorization Bearer header', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'my-secret-key', fetch: fn });

    await client.list();

    assert.equal(fn.calls[0].headers['Authorization'], 'Bearer my-secret-key');
  });

  it('sends X-Client header', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({ apiKey: 'k', fetch: fn });

    await client.list();

    assert.equal(fn.calls[0].headers['X-Client'], '@zerodb/functions-js/1.0.0');
  });

  it('merges custom headers', async () => {
    const fn = mockFetch([{ status: 200, body: [] }]);
    const client = new ZeroDBFunctions({
      apiKey: 'k',
      fetch: fn,
      headers: { 'X-Custom': 'hello' },
    });

    await client.list();

    assert.equal(fn.calls[0].headers['X-Custom'], 'hello');
  });
});

// ---------------------------------------------------------------------------
// Error class hierarchy
// ---------------------------------------------------------------------------

describe('Error classes', () => {
  it('FunctionsError is base class', () => {
    const e = new FunctionsError('test');
    assert.ok(e instanceof Error);
    assert.equal(e.name, 'FunctionsError');
  });

  it('FunctionsHttpError extends FunctionsError', () => {
    const e = new FunctionsHttpError('bad', 400);
    assert.ok(e instanceof FunctionsError);
    assert.ok(e instanceof Error);
    assert.equal(e.status, 400);
  });

  it('FunctionsFetchError extends FunctionsError', () => {
    const e = new FunctionsFetchError('network');
    assert.ok(e instanceof FunctionsError);
    assert.equal(e.name, 'FunctionsFetchError');
  });
});

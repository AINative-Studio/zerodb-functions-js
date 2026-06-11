/**
 * @zerodb/functions-js — Serverless functions triggered by ZeroDB database events.
 *
 * Drop-in replacement for @supabase/functions-js with ZeroDB as the event source.
 * Zero dependencies — uses native fetch (Node 18+, Deno, Bun, Cloudflare Workers).
 *
 * Refs #4005
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class FunctionsError extends Error {
  constructor(message, status = null, context = null) {
    super(message);
    this.name = 'FunctionsError';
    this.status = status;
    this.context = context;
  }
}

class FunctionsHttpError extends FunctionsError {
  constructor(message, status, context) {
    super(message, status, context);
    this.name = 'FunctionsHttpError';
  }
}

class FunctionsRelayError extends FunctionsError {
  constructor(message, context) {
    super(message, null, context);
    this.name = 'FunctionsRelayError';
  }
}

class FunctionsFetchError extends FunctionsError {
  constructor(message, context) {
    super(message, null, context);
    this.name = 'FunctionsFetchError';
  }
}

/**
 * Wrap a response into `{ data, error }` — matches Supabase conventions.
 */
function wrapResponse(data, error) {
  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.ainative.studio';
const HOOKS_PATH = '/api/v1/hooks';

export class ZeroDBFunctions {
  /**
   * @param {object} options
   * @param {string} options.apiKey       — ZeroDB API key (required)
   * @param {string} [options.baseUrl]    — API base URL (default: https://api.ainative.studio)
   * @param {string} [options.projectId]  — Default project to scope hooks to
   * @param {object} [options.headers]    — Extra headers merged into every request
   * @param {typeof fetch} [options.fetch] — Custom fetch implementation
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new FunctionsError('apiKey is required');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.projectId = options.projectId || null;
    this.extraHeaders = options.headers || {};
    this._fetch = options.fetch || globalThis.fetch;

    if (!this._fetch) {
      throw new FunctionsError(
        'fetch is not available — pass a custom fetch or use Node >= 18'
      );
    }
  }

  // -----------------------------------------------------------------------
  // Internal request helper
  // -----------------------------------------------------------------------

  /** @private */
  async _request(method, path, body = undefined) {
    const url = `${this.baseUrl}${path}`;
    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Client': '@zerodb/functions-js/1.0.0',
      ...this.extraHeaders,
    };

    let res;
    try {
      res = await this._fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      return wrapResponse(null, new FunctionsFetchError(
        `Network error: ${err.message}`,
        { url, method }
      ));
    }

    // 204 No Content (delete)
    if (res.status === 204) {
      return wrapResponse({ success: true }, null);
    }

    let json;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!res.ok) {
      const msg = json?.detail || json?.message || res.statusText || 'Request failed';
      return wrapResponse(null, new FunctionsHttpError(
        msg,
        res.status,
        { url, method, body: json }
      ));
    }

    return wrapResponse(json, null);
  }

  // -----------------------------------------------------------------------
  // Public API — mirrors @supabase/functions-js where possible
  // -----------------------------------------------------------------------

  /**
   * Invoke a function by name.
   *
   * @param {string} name — Function (hook) name
   * @param {object} [options]
   * @param {object} [options.body]    — JSON body sent to the function
   * @param {object} [options.headers] — Extra headers for this call
   * @param {string} [options.method]  — HTTP method (default POST)
   * @returns {Promise<{data: any, error: FunctionsError|null}>}
   */
  async invoke(name, options = {}) {
    if (!name || typeof name !== 'string') {
      return wrapResponse(null, new FunctionsError('Function name is required'));
    }

    // First resolve the hook ID by listing hooks filtered by name
    const { data: hooks, error: listError } = await this.list({ hookName: name });
    if (listError) return wrapResponse(null, listError);

    const hook = Array.isArray(hooks) ? hooks.find(h => h.hook_name === name) : null;
    if (!hook) {
      return wrapResponse(null, new FunctionsHttpError(
        `Function "${name}" not found`,
        404,
        { name }
      ));
    }

    // Invoke via the hook invoke endpoint
    const invokeBody = {
      payload: options.body || {},
    };

    const mergedHeaders = { ...this.extraHeaders, ...(options.headers || {}) };
    const prevHeaders = this.extraHeaders;
    this.extraHeaders = mergedHeaders;

    const result = await this._request(
      options.method || 'POST',
      `${HOOKS_PATH}/${hook.id}/invoke`,
      invokeBody
    );

    this.extraHeaders = prevHeaders;
    return result;
  }

  /**
   * Create (register) a function triggered by a ZeroDB event.
   *
   * @param {string} name — Unique function name
   * @param {object} config
   * @param {string} config.trigger     — Event type (e.g. 'zerodb.vector.stored')
   * @param {object} [config.hookConfig] — Extra configuration for the handler
   * @param {string} [config.projectId]  — Scope to a specific project
   * @returns {Promise<{data: object|null, error: FunctionsError|null}>}
   */
  async create(name, config = {}) {
    if (!name || typeof name !== 'string') {
      return wrapResponse(null, new FunctionsError('Function name is required'));
    }
    if (!config.trigger) {
      return wrapResponse(null, new FunctionsError('trigger is required in config'));
    }

    const body = {
      event_type: config.trigger,
      hook_name: name,
      project_id: config.projectId || this.projectId || undefined,
      hook_config: config.hookConfig || config.hook_config || {},
    };

    return this._request('POST', HOOKS_PATH, body);
  }

  /**
   * List registered functions.
   *
   * @param {object} [options]
   * @param {string} [options.eventType]  — Filter by event type
   * @param {string} [options.projectId]  — Filter by project
   * @param {boolean} [options.activeOnly] — Only active hooks (default true)
   * @param {string} [options.hookName]   — Filter by hook name (client-side, for invoke lookup)
   * @returns {Promise<{data: object[]|null, error: FunctionsError|null}>}
   */
  async list(options = {}) {
    const params = new URLSearchParams();
    if (options.eventType) params.set('event_type', options.eventType);
    if (options.projectId || this.projectId) {
      params.set('project_id', options.projectId || this.projectId);
    }
    if (options.activeOnly !== undefined) {
      params.set('active_only', String(options.activeOnly));
    }

    const qs = params.toString();
    const path = qs ? `${HOOKS_PATH}?${qs}` : HOOKS_PATH;
    return this._request('GET', path);
  }

  /**
   * Get a single function by ID.
   *
   * @param {string} id — Hook UUID
   * @returns {Promise<{data: object|null, error: FunctionsError|null}>}
   */
  async get(id) {
    if (!id) return wrapResponse(null, new FunctionsError('Function ID is required'));
    return this._request('GET', `${HOOKS_PATH}/${id}`);
  }

  /**
   * Update a function's configuration.
   *
   * @param {string} nameOrId — Hook name or UUID
   * @param {object} config
   * @param {object} [config.hookConfig] — New configuration
   * @param {boolean} [config.isActive]  — Enable/disable the function
   * @returns {Promise<{data: object|null, error: FunctionsError|null}>}
   */
  async update(nameOrId, config = {}) {
    if (!nameOrId) {
      return wrapResponse(null, new FunctionsError('Function name or ID is required'));
    }

    // If it looks like a UUID, use directly; otherwise resolve by name
    const id = await this._resolveId(nameOrId);
    if (!id) {
      return wrapResponse(null, new FunctionsHttpError(
        `Function "${nameOrId}" not found`,
        404,
        { nameOrId }
      ));
    }

    const body = {};
    if (config.hookConfig !== undefined || config.hook_config !== undefined) {
      body.hook_config = config.hookConfig || config.hook_config;
    }
    if (config.isActive !== undefined || config.is_active !== undefined) {
      body.is_active = config.isActive ?? config.is_active;
    }

    return this._request('PATCH', `${HOOKS_PATH}/${id}`, body);
  }

  /**
   * Delete a function by name or ID.
   *
   * @param {string} nameOrId — Hook name or UUID
   * @returns {Promise<{data: {success: boolean}|null, error: FunctionsError|null}>}
   */
  async delete(nameOrId) {
    if (!nameOrId) {
      return wrapResponse(null, new FunctionsError('Function name or ID is required'));
    }

    const id = await this._resolveId(nameOrId);
    if (!id) {
      return wrapResponse(null, new FunctionsHttpError(
        `Function "${nameOrId}" not found`,
        404,
        { nameOrId }
      ));
    }

    return this._request('DELETE', `${HOOKS_PATH}/${id}`);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve a name-or-UUID to a UUID. If input looks like a UUID, return it directly.
   * @private
   */
  async _resolveId(nameOrId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(nameOrId)) return nameOrId;

    const { data: hooks } = await this.list();
    if (!Array.isArray(hooks)) return null;
    const match = hooks.find(h => h.hook_name === nameOrId);
    return match?.id || null;
  }
}

// ---------------------------------------------------------------------------
// Named exports for error classes (useful for instanceof checks)
// ---------------------------------------------------------------------------

export { FunctionsError, FunctionsHttpError, FunctionsRelayError, FunctionsFetchError };

// Default export for convenience
export default ZeroDBFunctions;

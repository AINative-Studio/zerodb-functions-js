/**
 * @zerodb/functions-js — CommonJS entry point.
 *
 * Refs #4005
 */

'use strict';

// ---------------------------------------------------------------------------
// Error classes
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

function wrapResponse(data, error) {
  return { data: data ?? null, error: error ?? null };
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = 'https://api.ainative.studio';
const HOOKS_PATH = '/api/v1/hooks';

class ZeroDBFunctions {
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

  async invoke(name, options = {}) {
    if (!name || typeof name !== 'string') {
      return wrapResponse(null, new FunctionsError('Function name is required'));
    }

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

    const invokeBody = { payload: options.body || {} };
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

  async get(id) {
    if (!id) return wrapResponse(null, new FunctionsError('Function ID is required'));
    return this._request('GET', `${HOOKS_PATH}/${id}`);
  }

  async update(nameOrId, config = {}) {
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

    const body = {};
    if (config.hookConfig !== undefined || config.hook_config !== undefined) {
      body.hook_config = config.hookConfig || config.hook_config;
    }
    if (config.isActive !== undefined || config.is_active !== undefined) {
      body.is_active = config.isActive ?? config.is_active;
    }

    return this._request('PATCH', `${HOOKS_PATH}/${id}`, body);
  }

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

  async _resolveId(nameOrId) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(nameOrId)) return nameOrId;

    const { data: hooks } = await this.list();
    if (!Array.isArray(hooks)) return null;
    const match = hooks.find(h => h.hook_name === nameOrId);
    return match?.id || null;
  }
}

module.exports = { ZeroDBFunctions, FunctionsError, FunctionsHttpError, FunctionsRelayError, FunctionsFetchError };
module.exports.default = ZeroDBFunctions;

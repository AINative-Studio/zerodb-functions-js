/**
 * @zerodb/functions-js — TypeScript declarations.
 *
 * Refs #4005
 */

export interface FunctionsClientOptions {
  /** ZeroDB API key (required) */
  apiKey: string;
  /** API base URL (default: https://api.ainative.studio) */
  baseUrl?: string;
  /** Default project to scope hooks to */
  projectId?: string;
  /** Extra headers merged into every request */
  headers?: Record<string, string>;
  /** Custom fetch implementation */
  fetch?: typeof globalThis.fetch;
}

export interface FunctionsResponse<T = any> {
  data: T | null;
  error: FunctionsError | null;
}

export interface InvokeOptions {
  /** JSON body sent to the function */
  body?: Record<string, any>;
  /** Extra headers for this call */
  headers?: Record<string, string>;
  /** HTTP method (default POST) */
  method?: string;
}

export interface CreateConfig {
  /** Event type to trigger on (e.g. 'zerodb.vector.stored') */
  trigger: string;
  /** Extra configuration for the handler */
  hookConfig?: Record<string, any>;
  /** Scope to a specific project */
  projectId?: string;
}

export interface UpdateConfig {
  /** New configuration */
  hookConfig?: Record<string, any>;
  hook_config?: Record<string, any>;
  /** Enable/disable the function */
  isActive?: boolean;
  is_active?: boolean;
}

export interface ListOptions {
  /** Filter by event type */
  eventType?: string;
  /** Filter by project */
  projectId?: string;
  /** Only active hooks (default true) */
  activeOnly?: boolean;
  /** Filter by hook name (client-side) */
  hookName?: string;
}

export interface HookRecord {
  id: string;
  user_id: string;
  project_id: string | null;
  event_type: string;
  hook_type: string;
  hook_name: string;
  hook_config: any;
  is_active: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export declare class FunctionsError extends Error {
  name: 'FunctionsError';
  status: number | null;
  context: any;
  constructor(message: string, status?: number | null, context?: any);
}

export declare class FunctionsHttpError extends FunctionsError {
  name: 'FunctionsHttpError';
  constructor(message: string, status: number, context?: any);
}

export declare class FunctionsRelayError extends FunctionsError {
  name: 'FunctionsRelayError';
  constructor(message: string, context?: any);
}

export declare class FunctionsFetchError extends FunctionsError {
  name: 'FunctionsFetchError';
  constructor(message: string, context?: any);
}

export declare class ZeroDBFunctions {
  constructor(options: FunctionsClientOptions);

  /** Invoke a function by name */
  invoke(name: string, options?: InvokeOptions): Promise<FunctionsResponse>;

  /** Register a function triggered by a ZeroDB event */
  create(name: string, config: CreateConfig): Promise<FunctionsResponse<HookRecord>>;

  /** List registered functions */
  list(options?: ListOptions): Promise<FunctionsResponse<HookRecord[]>>;

  /** Get a single function by ID */
  get(id: string): Promise<FunctionsResponse<HookRecord>>;

  /** Update a function's configuration */
  update(nameOrId: string, config: UpdateConfig): Promise<FunctionsResponse<HookRecord>>;

  /** Delete a function by name or ID */
  delete(nameOrId: string): Promise<FunctionsResponse<{ success: boolean }>>;
}

export default ZeroDBFunctions;

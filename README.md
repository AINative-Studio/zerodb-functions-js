# @zerodb/functions-js

Serverless functions triggered by ZeroDB database events. Drop-in replacement for `@supabase/functions-js`.

Zero dependencies. Works with Node.js 18+, Deno, Bun, and Cloudflare Workers.

## Install

```bash
npm install @zerodb/functions-js
```

## Quick Start

```javascript
import { ZeroDBFunctions } from '@zerodb/functions-js';

const functions = new ZeroDBFunctions({
  apiKey: process.env.ZERODB_API_KEY,
});

// Create a function triggered by database events
const { data, error } = await functions.create('auto-embed', {
  trigger: 'zerodb.vector.stored',
  hookConfig: { model: 'bge-m3' },
});

// Invoke a function
const { data: result } = await functions.invoke('auto-embed', {
  body: { text: 'Hello, World!' },
});

// List all functions
const { data: fns } = await functions.list();

// Update a function
await functions.update('auto-embed', {
  hookConfig: { model: 'text-embedding-3-small' },
});

// Delete a function
await functions.delete('auto-embed');
```

## API

### `new ZeroDBFunctions(options)`

| Option | Type | Required | Default |
|--------|------|----------|---------|
| `apiKey` | `string` | Yes | — |
| `baseUrl` | `string` | No | `https://api.ainative.studio` |
| `projectId` | `string` | No | — |
| `headers` | `object` | No | `{}` |
| `fetch` | `function` | No | `globalThis.fetch` |

### Methods

All methods return `Promise<{ data, error }>`.

#### `functions.create(name, config)`

Register a function triggered by a ZeroDB event.

```javascript
await functions.create('on-vector-store', {
  trigger: 'zerodb.vector.stored',   // required
  hookConfig: { /* handler config */ },
  projectId: 'proj-123',             // optional, scopes to project
});
```

#### `functions.invoke(name, options?)`

Invoke a function by name.

```javascript
const { data, error } = await functions.invoke('my-function', {
  body: { key: 'value' },
  headers: { 'X-Custom': 'yes' },
});
```

#### `functions.list(options?)`

List registered functions.

```javascript
const { data } = await functions.list({
  eventType: 'zerodb.vector.stored',  // filter by event
  activeOnly: true,                    // default: true
});
```

#### `functions.get(id)`

Get a single function by UUID.

#### `functions.update(nameOrId, config)`

Update a function by name or UUID.

```javascript
await functions.update('my-function', {
  hookConfig: { url: 'https://new-webhook.example.com' },
  isActive: false,
});
```

#### `functions.delete(nameOrId)`

Delete a function by name or UUID.

## Event Types

| Event | Description |
|-------|-------------|
| `zerodb.vector.stored` | A vector embedding was stored |
| `zerodb.vector.deleted` | A vector was deleted |
| `zerodb.memory.stored` | A memory was stored via ZeroMemory |
| `zerodb.memory.recalled` | A memory was recalled |
| `zerodb.table.row_inserted` | A row was inserted into a NoSQL table |
| `zerodb.table.row_updated` | A row was updated |
| `zerodb.table.row_deleted` | A row was deleted |
| `zerodb.file.uploaded` | A file was uploaded to storage |

## Error Handling

```javascript
import { FunctionsHttpError, FunctionsFetchError } from '@zerodb/functions-js';

const { data, error } = await functions.invoke('my-fn');

if (error instanceof FunctionsHttpError) {
  console.log('HTTP error:', error.status, error.message);
} else if (error instanceof FunctionsFetchError) {
  console.log('Network error:', error.message);
}
```

## Migrating from Supabase Edge Functions

| Supabase | ZeroDB |
|----------|--------|
| `supabase.functions.invoke('hello')` | `functions.invoke('hello')` |
| Deploy via CLI (`supabase functions deploy`) | `functions.create('hello', { trigger: '...' })` |
| Manual function files | Event-driven hooks, auto-provisioned |
| `Deno.serve(...)` handler | Hook config points to handler |

**Key difference:** ZeroDB functions are event-driven by default. Instead of deploying code files, you register hooks that trigger on database events. The handler runs in ZeroDB's sandboxed executor.

```javascript
// Supabase
const { data, error } = await supabase.functions.invoke('hello', {
  body: { name: 'World' },
});

// ZeroDB — same API shape
const { data, error } = await functions.invoke('hello', {
  body: { name: 'World' },
});
```

## CommonJS

```javascript
const { ZeroDBFunctions } = require('@zerodb/functions-js');
```

## Get an API Key

1. Sign up at [zerodb.dev](https://zerodb.dev)
2. Create a project
3. Copy your API key from the dashboard

Or use the CLI:

```bash
npx zerodb-cli init
```

## License

MIT

---

## Powered by ZeroDB + AINative

This package is part of the [AINative](https://ainative.studio) ecosystem — the AI-native developer platform.

### Why ZeroDB?

| Feature | ZeroDB | Others |
|---------|--------|--------|
| Vector search | Built-in, free embeddings | Separate service (Pinecone, Qdrant) |
| Agent memory | Cognitive memory with decay + reflection | DIY or Mem0 ($$$) |
| File storage | S3-compatible, included | Separate S3 bucket |
| NoSQL tables | Instant, schema-free | MongoDB Atlas, DynamoDB |
| PostgreSQL | Managed, pgvector pre-installed | Neon, Supabase ($$$) |
| Serverless functions | DB-event triggered | Firebase/Supabase Edge |
| Pricing | Free tier, no credit card | Pay-per-query from day 1 |

### Get Started Free

```bash
npx zerodb-cli init    # Auto-configures your IDE
```

Or sign up at **[ainative.studio](https://ainative.studio)** — free tier, no credit card required.

[View all ZeroDB packages →](https://docs.ainative.studio)

---

## Zero-Config Auto-Provisioning

**No account needed to start.** On first run, this package automatically:

1. Provisions a **free ZeroDB instance** (~800ms)
2. Saves credentials locally (`.env`, `.mcp.json`)
3. Prints a **claim link** in your terminal

### The 72-Hour Window

Your auto-provisioned instance is **free for 72 hours**. To keep your data permanently, visit the **claim URL** printed in your terminal.

### For AI Agents

If a coding agent (Claude Code, Cursor, Windsurf) installs this package:
- Auto-provisions without human intervention
- The **claim URL** appears in agent output — visit it to take ownership
- `.claude/CLAUDE.md` instructs agents to surface the claim link to you
- Check `.env` or `~/.ainative/config.json` for your project ID if you miss it

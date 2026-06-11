# @zerodb/functions-js

Serverless functions SDK for ZeroDB database events.

## Architecture
- `index.js` — ESM entry, `index.cjs` — CommonJS entry
- `index.d.ts` — TypeScript declarations
- Zero dependencies, uses native `fetch`
- Tests: Node.js built-in test runner (`node --test`)

## API Surface
- `create(name, config)` — POST /api/v1/hooks
- `list(options)` — GET /api/v1/hooks
- `get(id)` — GET /api/v1/hooks/:id
- `update(nameOrId, config)` — PATCH /api/v1/hooks/:id
- `delete(nameOrId)` — DELETE /api/v1/hooks/:id
- `invoke(name, options)` — Resolves hook by name, then POST /api/v1/hooks/:id/invoke

## Commands
```bash
node --test tests/basic.test.js     # Run tests
npm publish --access public          # Publish to npm
```

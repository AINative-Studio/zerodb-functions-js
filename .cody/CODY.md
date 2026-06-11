# Cody Rules — @zerodb/functions-js

- Zero dependencies. Native fetch only.
- All methods return `{ data, error }` — Supabase convention.
- Error classes: FunctionsError > FunctionsHttpError, FunctionsFetchError, FunctionsRelayError
- Name resolution: if input looks like UUID, skip list call.
- Tests use Node built-in test runner. No jest, no vitest.

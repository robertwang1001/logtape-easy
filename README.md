<h1 align="center">Welcome to logtape-easy 👋</h1>

![GitHub License](https://img.shields.io/github/license/robertwang1001/logtape-easy)
![GitHub commit activity](https://img.shields.io/github/commit-activity/w/robertwang1001/logtape-easy)
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/robertwang1001/logtape-easy/release.yaml)
![GitHub Release](https://img.shields.io/github/v/release/robertwang1001/logtape-easy)
![GitHub Release Date](https://img.shields.io/github/release-date/robertwang1001/logtape-easy)
![GitHub Issues or Pull Requests](https://img.shields.io/github/issues/robertwang1001/logtape-easy)
![GitHub watchers](https://img.shields.io/github/watchers/robertwang1001/logtape-easy)
![GitHub forks](https://img.shields.io/github/forks/robertwang1001/logtape-easy)
![GitHub Repo stars](https://img.shields.io/github/stars/robertwang1001/logtape-easy)
![Node Current](https://img.shields.io/node/v/logtape-easy)
![NPM Version](https://img.shields.io/npm/v/logtape-easy)
![NPM Type Definitions](https://img.shields.io/npm/types/logtape-easy)
![NPM Downloads](https://img.shields.io/npm/dw/logtape-easy)

A small helper around [`@logtape/logtape`](https://www.npmjs.com/package/@logtape/logtape) for **applications** that want logging to work out of the box with minimal setup. It comes with a built-in **console sink** as the default app-friendly sink, so in the common case you only need to set `LOG_LEVEL` to enable logging. (You can still add additional sinks when necessary.)

It follows one simple rule:

- if `LOG_LEVEL` is a valid log level, console logging is enabled at that level
- if `LOG_LEVEL` is missing or empty, console logging is disabled
- if `LOG_LEVEL` is invalid, console logging is disabled and a warning is emitted

`logtape-easy` also re-exports everything from `@logtape/logtape`, so you do **not** need to install `@logtape/logtape` separately.

> This package is mainly intended for **apps**. If you are building a **library**, you usually do not need this package. You can install `@logtape/logtape` directly and call `getLogger()` in your library code.

## Installation

```bash
npm install logtape-easy
# or
pnpm add logtape-easy
# or
yarn add logtape-easy
# or
bun add logtape-easy
# or
deno add npm:logtape-easy
```

## Quick start

### Synchronous setup

Use this when your environment does not support top-level `await` or when you want logging configured immediately at startup.

```ts
import { getLogger, setupLoggerSync } from 'logtape-easy'

setupLoggerSync()

const logger = getLogger(['app'])
logger.info('Hello')
```

### Asynchronous setup

If your application already supports async startup, you can also use the async API:

```ts
import { getLogger, setupLogger } from 'logtape-easy'

await setupLogger()

const logger = getLogger(['app'])
logger.info('Hello')
```

## How configuration is resolved

By default, `logtape-easy` reads the log level in this order:

1. `localStorage.getItem('LOG_LEVEL')`
2. `process.env.LOG_LEVEL`

This makes browser-side overrides easy while still working naturally in server-side runtimes.

### Behavior summary

| Value | Result |
|---|---|
| missing | console logging disabled |
| `""` or whitespace | console logging disabled |
| valid log level like `info` | console logging enabled |
| uppercase like `DEBUG` | console logging enabled |
| invalid value | console logging disabled + warning |

## Browser usage

Enable logging from DevTools:

```js
localStorage.setItem('LOG_LEVEL', 'debug')
```

Disable it:

```js
localStorage.removeItem('LOG_LEVEL')
```

Reload the page after changing the value.

## Server-side usage

Set `LOG_LEVEL` in the environment:

```bash
LOG_LEVEL=info node dist/index.js
```

If the runtime does not provide `localStorage` or `process.env`, the library safely falls back.

## API

### `setupLogger(options?)`

Under the hood, it builds the LogTape config and applies it with `configure({ reset: true, ... })`.

```ts
import { setupLogger } from 'logtape-easy'

await setupLogger()
```

### `setupLoggerSync(options?)`

Synchronous version of `setupLogger()`.

> **Caution**: `setupLoggerSync()` can only be used with sinks and filters that do not require asynchronous disposal.setupLoggerSync() can only be used with sinks and filters that do not require asynchronous disposal. Reference the [LogTape docs](https://logtape.org/manual/config#synchronous-configuration) for more details.

### `buildLoggerConfig(options?)`

Returns the LogTape config without applying it.

```ts
import { buildLoggerConfig, configure } from 'logtape-easy'

const config = buildLoggerConfig()

await configure({
  reset: true,
  ...config,
})
```

## Options

```ts
interface SetupLoggerOptions {
  sinks?: Record<string, Sink>
  storage?: StorageLike
  env?: EnvLike
  preferenceKey?: string
  rootLevel?: LogLevel | null
  metaConsoleLevel?: LogLevel | null
  onWarn?: (message: string) => void
}
```

### `sinks`

Attach additional sinks beside the built-in console sink.

```ts
await setupLogger({
  sinks: {
    audit: myAuditSink,
  },
})
```

### `storage`

Override storage access, mainly for tests or unusual runtimes.

```ts
await setupLogger({
  storage: {
    getItem: key => (key === 'LOG_LEVEL' ? 'debug' : null),
  },
})
```

### `env`

Override environment access.

```ts
await setupLogger({
  env: {
    LOG_LEVEL: 'info',
  },
})
```

### `preferenceKey`

Use a different configuration key.

```ts
await setupLogger({
  preferenceKey: 'APP_LOG_LEVEL',
  env: {
    APP_LOG_LEVEL: 'debug',
  },
})
```

### `rootLevel`

Sets the root logger minimum level when at least one sink is attached.

Default: `trace`

### `metaConsoleLevel`

Sets the LogTape meta logger level for the built-in console sink.

Default: `warning`

### `onWarn`

Called when the configured log level is invalid.

Default: `console.warn`

## Built-in console sink

The built-in console sink is intended to cover the most common logging setup with minimal configuration.

- set `LOG_LEVEL` to enable it
- leave `LOG_LEVEL` unset to disable it
- add `sinks` only when you need extra destinations beyond the console

## Re-exports

`logtape-easy` re-exports LogTape:

```ts
export * from '@logtape/logtape'
```

So this works:

```ts
import { getConsoleSink, getLogger, setupLogger } from 'logtape-easy'
```

You do **not** need to install `@logtape/logtape` separately.

## Example with a custom sink

```ts
import type { Sink } from 'logtape-easy'
import { getLogger, setupLogger } from 'logtape-easy'

const records: unknown[] = []

const memorySink: Sink = {
  write(record) {
    records.push(record)
  },
}

await setupLogger({
  env: { LOG_LEVEL: 'debug' },
  sinks: {
    memory: memorySink,
  },
})

const logger = getLogger(['example'])
logger.info('hello')
```

## Contributing

Contributions are welcome! If you have ideas, bug fixes, or improvements, please open an issue or submit a pull request on the
[GitHub repository](https://github.com/robertwang1001/tmpl-base).

Give a ⭐️ if this project helped you!

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for more details.

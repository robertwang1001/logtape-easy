import type { Config, ConsoleSinkOptions, FilterLike, LoggerConfig, LogLevel, Sink } from '@logtape/logtape'
import {
  configure,
  configureSync,
  getConsoleSink,
  getLogLevels,
  isLogLevel,
  withFilter,
} from '@logtape/logtape'

export * from '@logtape/logtape'

export const LOG_LEVEL_KEY = 'LOG_LEVEL'

export interface StorageLike {
  getItem: (key: string) => string | null
}

export type EnvLike = Record<string, string | undefined>

export interface SetupLoggerOptions {
  /**
   * Attach additional sinks beside the built-in console sink, such as Sentry, OTEL, file sinks, etc.
   *
   * @example
   * ```ts
   * import { getSentrySink } from '@logtape/sentry'
   *
   * await setupLogger({
   *  sinks: {
   *   sentry: getSentrySink()
   *  },
   * })
   * ```
   */
  sinks?: Record<string, Sink>

  /**
   * The additional loggers to configure.
   * They will not overwrite the built-in loggers, i.e. root and meta loggers.
   */
  loggers?: LoggerConfig<string, string>[]

  /**
   * The filters to use.
   */
  filters?: Record<string, FilterLike>

  /**
   * Options passed to the built-in console sink. Reference [`ConsoleSinkOptions`](https://jsr.io/@logtape/logtape@2.1.1/doc/~/ConsoleSinkOptions) for the options details.
   */
  consoleSinkOptions?: ConsoleSinkOptions

  /**
   * Override storage access
   * @default `localStorage`
   *
   * @example
   * ```ts
   * await setupLogger({
   *  storage: {
   *    getItem: key => (key === 'LOG_LEVEL' && import.meta.dev ? 'debug' : null)
   *  },
   * })
   * ```
   */
  storage?: StorageLike

  /**
   * Override environment access.
   * @default `process.env`
   *
   * @example
   * ```ts
   * await setupLogger({
   *  env: {
   *    LOG_LEVEL: process.env.NODE === 'producation' ? 'info' : 'debug',
   *  },
   * })
   * ```
   */
  env?: EnvLike

  /**
   * @default `LOG_LEVEL`
   *
   * @example
   * ```ts
   * await setupLogger({
   *  preferenceKey: 'APP_LOG_LEVEL',
   *  env: {
   *   APP_LOG_LEVEL: 'debug',
   *  },
   * })
   * ```
   */
  preferenceKey?: string

  /**
   * Root logger minimum level when at least one sink is attached.
   * I default this to "trace" so sink-level filtering controls console verbosity.
   * @default `trace`
   */
  rootLevel?: LogLevel | null

  /**
   * LogTape meta logger level for the built-in console sink.
   * Defaults to "warning" to avoid startup noise.
   * @default `warning`
   */
  metaConsoleLevel?: LogLevel | null

  /**
   * Warning hook for invalid preferences.
   * @default `console.warn`.
   */
  onWarn?: (message: string) => void
}

type ResolvedConsolePreference
  = | { enabled: false, warning?: string }
    | { enabled: true, level: LogLevel, warning?: string }

const VALID_LOG_LEVELS = getLogLevels()

export function buildLoggerConfig(
  options: SetupLoggerOptions = {},
): Config<string, string> {
  const preference = resolveConsolePreference(options)

  if (preference.warning) {
    (options.onWarn ?? defaultWarn)(preference.warning)
  }

  const sinks: Record<string, Sink> = {}
  const rootSinkNames: string[] = []

  if (preference.enabled) {
    sinks.console = withFilter(getConsoleSink(options.consoleSinkOptions), preference.level)
    rootSinkNames.push('console')
  }

  const { sinks: extraSinks } = options
  if (extraSinks) {
    for (const [name, sink] of Object.entries(extraSinks)) {
      if (name === 'console') {
        ;(options.onWarn ?? defaultWarn)(
          '[logger] `sinks.console` is reserved for the built-in console sink. Please use another sink name.',
        )
        continue
      }

      sinks[name] = sink
      rootSinkNames.push(name)
    }
  }

  return {
    sinks,
    filters: options.filters,
    loggers: [
      {
        category: [],
        sinks: rootSinkNames,
        lowestLevel:
          rootSinkNames.length > 0
            ? (options.rootLevel ?? 'trace')
            : null,
      },
      {
        category: ['logtape', 'meta'],
        sinks: preference.enabled ? ['console'] : [],
        lowestLevel: options.metaConsoleLevel ?? 'warning',
        parentSinks: 'override',
      },
      ...(options.loggers ?? []),
    ],
  }
}

export async function setupLogger(
  options: SetupLoggerOptions = {},
): Promise<void> {
  await configure({
    reset: true,
    ...buildLoggerConfig(options),
  })
}

export function setupLoggerSync(
  options: SetupLoggerOptions = {},
): void {
  configureSync({
    reset: true,
    ...buildLoggerConfig(options),
  })
}

function resolveConsolePreference(
  options: SetupLoggerOptions = {},
): ResolvedConsolePreference {
  const key = options.preferenceKey ?? LOG_LEVEL_KEY

  const raw = readPreferenceValue({
    key,
    storage: options.storage ?? getDefaultStorage(),
    env: options.env ?? getDefaultEnv(),
  })

  // No value = disabled
  if (!raw) {
    return { enabled: false }
  }

  // Be a bit forgiving about casing
  const normalized = raw.toLowerCase()

  if (!isLogLevel(normalized)) {
    return {
      enabled: false,
      warning:
        `[logger] Ignoring invalid ${key}="${raw}". `
        + `Expected one of: ${VALID_LOG_LEVELS.join(', ')}. `
        + `Console logger is disabled.`,
    }
  }

  return { enabled: true, level: normalized }
}

function readPreferenceValue({ key, storage, env }: {
  key: string
  storage?: StorageLike
  env?: EnvLike
}): string | null {
  // I prefer localStorage first so browser users can override easily
  const fromStorage = readFromStorage(storage, key)
  if (fromStorage !== null)
    return fromStorage

  return normalizeRawPreference(env?.[key])
}

function readFromStorage(
  storage: StorageLike | undefined,
  key: string,
): string | null {
  if (!storage)
    return null

  try {
    return normalizeRawPreference(storage.getItem(key))
  }
  catch {
    return null
  }
}

function normalizeRawPreference(
  value: string | null | undefined,
): string | null {
  if (!value)
    return null

  return value.trim() || null
}

function getDefaultStorage(): StorageLike | undefined {
  try {
    const storage = (globalThis as { localStorage?: StorageLike }).localStorage
    return storage && typeof storage.getItem === 'function'
      ? storage
      : undefined
  }
  catch {
    return undefined
  }
}

function getDefaultEnv(): EnvLike | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: EnvLike }
  }

  return maybeProcess.process?.env
}

function defaultWarn(message: string): void {
  try {
    // @ts-expect-error ignore
    console.warn(message)
  }
  catch {
    // no-op
  }
}

import type { Config, Sink } from '@logtape/logtape'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLoggerConfig, LOG_LEVEL_KEY, setupLogger, setupLoggerSync } from '../src/index.js'

const configureMock = vi.hoisted(() => {
  return vi.fn<(args: any) => Promise<void>>().mockResolvedValue(undefined)
})

const configureSyncMock = vi.hoisted(() => {
  return vi.fn<(args: any) => void>()
})

const getConsoleSinkMock = vi.hoisted(() => {
  return vi.fn<(args: any) => any>()
})

vi.mock('@logtape/logtape', async () => {
  const actual = await vi.importActual<typeof import('@logtape/logtape')>('@logtape/logtape')
  return {
    ...actual,
    configure: configureMock,
    configureSync: configureSyncMock,
    getConsoleSink: getConsoleSinkMock,
  }
})

function findLogger(
  config: Config<string, string>,
  category: readonly string[],
) {
  return config.loggers.find((logger) => {
    if (!Array.isArray(logger.category))
      return false

    if (logger.category.length !== category.length)
      return false

    return logger.category.every((part, index) => part === category[index])
  })
}

describe('buildLoggerConfig', () => {
  beforeEach(() => {
    configureMock.mockReset()
    configureMock.mockResolvedValue(undefined)
    configureSyncMock.mockReset()
    getConsoleSinkMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('disables console logging when no preference exists', () => {
    const config = buildLoggerConfig({
      storage: { getItem: () => null },
      env: {},
    })

    expect(Object.keys(config.sinks)).toEqual([])

    const rootLogger = findLogger(config, [])
    expect(rootLogger).toBeDefined()
    expect(rootLogger?.sinks).toEqual([])
    expect(rootLogger?.lowestLevel).toBeNull()

    const metaLogger = findLogger(config, ['logtape', 'meta'])
    expect(metaLogger).toBeDefined()
    expect(metaLogger?.sinks).toEqual([])
    expect(metaLogger?.lowestLevel).toBe('warning')
    expect(metaLogger?.parentSinks).toBe('override')
  })

  it('enables console logging when env contains a valid level', () => {
    const config = buildLoggerConfig({
      storage: { getItem: () => null },
      env: { [LOG_LEVEL_KEY]: 'info' },
    })

    expect(Object.keys(config.sinks)).toContain('console')

    const rootLogger = findLogger(config, [])
    expect(rootLogger?.sinks).toEqual(['console'])
    expect(rootLogger?.lowestLevel).toBe('trace')

    const metaLogger = findLogger(config, ['logtape', 'meta'])
    expect(metaLogger?.sinks).toEqual(['console'])
    expect(metaLogger?.lowestLevel).toBe('warning')
  })

  it('accepts uppercase log levels', () => {
    const config = buildLoggerConfig({
      storage: { getItem: () => 'ERROR' },
      env: {},
    })

    expect(Object.keys(config.sinks)).toContain('console')

    const rootLogger = findLogger(config, [])
    expect(rootLogger?.sinks).toEqual(['console'])
    expect(rootLogger?.lowestLevel).toBe('trace')
  })

  it('disables console logging and warns on invalid preference', () => {
    const onWarn = vi.fn()

    const config = buildLoggerConfig({
      storage: { getItem: () => 'loud' },
      env: {},
      onWarn,
    })

    expect(Object.keys(config.sinks)).toEqual([])
    expect(onWarn).toHaveBeenCalledOnce()
    expect(onWarn.mock.calls[0][0]).toContain('Ignoring invalid')
    expect(onWarn.mock.calls[0][0]).toContain('loud')
    expect(onWarn.mock.calls[0][0]).toContain(LOG_LEVEL_KEY)
  })

  it('treats blank values as disabled without warning', () => {
    const onWarn = vi.fn()

    const config = buildLoggerConfig({
      storage: { getItem: () => '   ' },
      env: {},
      onWarn,
    })

    expect(Object.keys(config.sinks)).toEqual([])
    expect(onWarn).not.toHaveBeenCalled()
  })

  it('prefers storage over env', () => {
    const onWarn = vi.fn()

    const config = buildLoggerConfig({
      storage: { getItem: () => 'invalid-level' },
      env: { [LOG_LEVEL_KEY]: 'debug' },
      onWarn,
    })

    expect(Object.keys(config.sinks)).toEqual([])
    expect(onWarn).toHaveBeenCalledOnce()
  })

  it('includes extra sinks in the root logger', () => {
    const fileSink = {} as Sink
    const auditSink = {} as Sink

    const config = buildLoggerConfig({
      storage: { getItem: () => null },
      env: {},
      sinks: {
        file: fileSink,
        audit: auditSink,
      },
    })

    expect(config.sinks.file).toBe(fileSink)
    expect(config.sinks.audit).toBe(auditSink)

    const rootLogger = findLogger(config, [])
    expect(rootLogger?.sinks).toEqual(['file', 'audit'])
    expect(rootLogger?.lowestLevel).toBe('trace')
  })

  it('uses custom preferenceKey', () => {
    const config = buildLoggerConfig({
      storage: { getItem: () => null },
      env: { CUSTOM_LEVEL: 'debug' },
      preferenceKey: 'CUSTOM_LEVEL',
    })

    expect(Object.keys(config.sinks)).toContain('console')
  })

  it('uses custom rootLevel and metaConsoleLevel', () => {
    const config = buildLoggerConfig({
      storage: { getItem: () => 'debug' },
      env: {},
      rootLevel: 'info',
      metaConsoleLevel: 'error',
    })

    const rootLogger = findLogger(config, [])
    expect(rootLogger?.lowestLevel).toBe('info')

    const metaLogger = findLogger(config, ['logtape', 'meta'])
    expect(metaLogger?.lowestLevel).toBe('error')
  })
})

describe('setupLogger', () => {
  beforeEach(() => {
    configureMock.mockReset()
    configureMock.mockResolvedValue(undefined)
    configureSyncMock.mockReset()
    getConsoleSinkMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls configure with reset: true', async () => {
    await setupLogger({
      storage: { getItem: () => 'info' },
      env: {},
    })

    expect(configureMock).toHaveBeenCalledOnce()

    const arg = configureMock.mock.lastCall?.[0]
    expect(arg?.reset).toBe(true)
    expect(arg?.sinks).toBeDefined()
    expect(arg?.loggers).toBeDefined()
  })

  it('passes through extra sinks', async () => {
    const fileSink = {} as Sink

    await setupLogger({
      storage: { getItem: () => null },
      env: {},
      sinks: {
        file: fileSink,
      },
    })

    expect(configureMock).toHaveBeenCalledOnce()

    const arg = configureMock.mock.lastCall?.[0]
    expect(arg?.reset).toBe(true)
    expect(arg?.sinks.file).toBe(fileSink)
    expect(arg?.loggers).toBeDefined()
  })
})

describe('setupLoggerSync', () => {
  beforeEach(() => {
    configureMock.mockReset()
    configureMock.mockReset()
    configureSyncMock.mockReset()
    getConsoleSinkMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls configureSync with reset: true', () => {
    setupLoggerSync({
      storage: { getItem: () => 'info' },
      env: {},
    })

    expect(configureSyncMock).toHaveBeenCalledOnce()
    expect(configureMock).not.toHaveBeenCalled()

    const arg = configureSyncMock.mock.lastCall?.[0]
    expect(arg?.reset).toBe(true)
    expect(arg?.sinks).toBeDefined()
    expect(arg?.loggers).toBeDefined()
  })

  it('passes through extra sinks', () => {
    const fileSink = {} as Sink

    setupLoggerSync({
      storage: { getItem: () => null },
      env: {},
      sinks: {
        file: fileSink,
      },
    })

    expect(configureSyncMock).toHaveBeenCalledOnce()

    const arg = configureSyncMock.mock.lastCall?.[0]
    expect(arg?.reset).toBe(true)
    expect(arg?.sinks.file).toBe(fileSink)
    expect(arg?.loggers).toBeDefined()
  })

  it('does not require await', () => {
    expect(() => {
      setupLoggerSync({
        storage: { getItem: () => 'debug' },
        env: {},
      })
    }).not.toThrow()

    expect(configureSyncMock).toHaveBeenCalledOnce()
  })
})

describe('getConsoleSink', () => {
  beforeEach(() => {
    configureMock.mockReset()
    configureMock.mockReset()
    configureSyncMock.mockReset()
    getConsoleSinkMock.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pass console sink options', () => {
    const consoleSinkOptions = {
      formatter: () => [],
    }

    setupLoggerSync({
      consoleSinkOptions,
      env: {
        LOG_LEVEL: 'debug',
      },
    })

    expect(getConsoleSinkMock).toHaveBeenCalledExactlyOnceWith(consoleSinkOptions)
  })
})

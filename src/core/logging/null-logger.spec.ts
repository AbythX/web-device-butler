import { describe, expect, test } from 'vitest'

import type { Logger } from './logger.ts'
import { NullLogger } from './null-logger.ts'

const levels = ['debug', 'info', 'warn', 'error'] as const

describe('null-logger', () => {
  test.each(levels)('should accept a %s message and do nothing', async (level) => {
    const sut: Logger = new NullLogger()

    expect(() => sut[level]('message', { detail: 1 })).not.toThrow()
  })
})

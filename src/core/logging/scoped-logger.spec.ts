import { describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import type { Logger } from './logger.ts'
import { ScopedLogger } from './scoped-logger.ts'

const levels = ['debug', 'info', 'warn', 'error'] as const

describe('scoped-logger', () => {
  test.each(levels)('should prefix a %s message with the scope and pass the data on', async (level) => {
    const target = mock<Logger>()
    const sut = new ScopedLogger('CameraManager', target)

    sut[level]('message', { detail: 1 }, 2)

    expect(target[level]).toHaveBeenCalledExactlyOnceWith('[CameraManager] message', { detail: 1 }, 2)
  })
})

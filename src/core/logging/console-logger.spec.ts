import { describe, expect, test, vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { ConsoleLogger } from './console-logger.ts'

const levels = ['debug', 'info', 'warn', 'error'] as const

describe('console-logger', () => {
  test.each(levels)('should write a %s message with its data to the console', async (level) => {
    const target = mock<Console>()
    const sut = new ConsoleLogger(target)

    sut[level]('message', { detail: 1 }, 2)

    expect(target[level]).toHaveBeenCalledExactlyOnceWith('message', { detail: 1 }, 2)
  })

  test.each(levels)('should write a %s message to the global console by default', async (level) => {
    const write = vi.spyOn(globalThis.console, level).mockImplementation(() => {})

    new ConsoleLogger()[level]('message')

    expect(write).toHaveBeenCalledExactlyOnceWith('message')
    write.mockRestore()
  })
})

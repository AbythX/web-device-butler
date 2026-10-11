import { beforeEach, describe, expect, test, vi } from 'vitest'

import { FrameLoop } from './frame-loop.ts'
import { FakeDisplay } from './testing/fake-display.ts'

describe('frame-loop', () => {
  let display!: FakeDisplay
  let task!: () => void
  let sut!: FrameLoop

  beforeEach(() => {
    display = new FakeDisplay()
    task = vi.fn()
    sut = new FrameLoop(task, 30, display)
  })

  test('should not run before it was started', async () => {
    expect(sut.isRunning).toBe(false)
    expect(display.waiting).toBe(0)
  })

  test('should run the task once per frame', async () => {
    sut.start()

    display.frame(0)
    display.frame(40)
    display.frame(80)

    expect(task).toHaveBeenCalledTimes(3)
    expect(sut.isRunning).toBe(true)
  })

  test('should not run more often than the frame rate allows', async () => {
    sut.start()

    // a display with 120 frames per second
    for (let time = 0; time <= 1000; time += 1000 / 120) {
      display.frame(time)
    }

    // thirty in a second, give or take the one at the edge
    expect(vi.mocked(task).mock.calls.length).toBeGreaterThanOrEqual(30)
    expect(vi.mocked(task).mock.calls.length).toBeLessThanOrEqual(31)
  })

  test('should stop', async () => {
    sut.start()
    display.frame(0)

    sut.stop()
    display.frame(100)

    expect(task).toHaveBeenCalledTimes(1)
    expect(sut.isRunning).toBe(false)
    expect(display.waiting).toBe(0)
  })

  test('should not run twice when it is started twice', async () => {
    sut.start()
    sut.start()

    display.frame(0)

    expect(task).toHaveBeenCalledTimes(1)
    expect(display.waiting).toBe(1)
  })

  test('should stop when the task stops it', async () => {
    sut = new FrameLoop(() => sut.stop(), 30, display)
    sut.start()

    display.frame(0)

    expect(display.waiting).toBe(0)
  })

  test('should be stopped at the end of a using block', async () => {
    {
      using loop = new FrameLoop(task, 30, display)
      loop.start()
    }

    expect(display.waiting).toBe(0)
  })
})

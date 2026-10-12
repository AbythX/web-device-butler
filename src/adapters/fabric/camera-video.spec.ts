import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { CameraTestBench } from '../../media/camera/testing/camera-test-bench.ts'
import { FakeMediaBrowser } from '../../media/testing/fake-media-browser.ts'
import { CameraVideo } from './camera-video.ts'
import { FakeVideoElement } from './testing/fake-video-element.ts'

describe('camera-video', () => {
  let browser!: FakeMediaBrowser

  let manager!: CameraManager

  let session!: CameraSession

  let element!: FakeVideoElement

  beforeEach(async () => {
    browser = new FakeMediaBrowser({ inputs: CameraTestBench.phone(), oneCameraAtATime: true })
    manager = CameraTestBench.load(browser)
    session = await manager.open({ require: { facing: 'back', torch: true } })
    element = new FakeVideoElement()
  })

  afterEach(async () => {
    manager.dispose()
    await new Promise((resolve) => setTimeout(resolve))
    browser.close()
  })

  const createSut = (resized?: () => void) => new CameraVideo(session, element as unknown as HTMLVideoElement, resized)

  test('should prepare the element for a camera: playing by itself, silent and inside the page', async () => {
    createSut()

    expect(element).toMatchObject({ autoplay: true, muted: true, playsInline: true })
  })

  test('should play the stream of the session', async () => {
    await createSut().play()

    expect(element.srcObject).toBe(session.stream)
    expect(element.isPlaying).toBe(true)
  })

  test('should follow the size of the picture and tell when it changed', async () => {
    const resized = vi.fn()
    const sut = createSut(resized)

    element.deliver(1920, 1080)
    element.deliver(1920, 1080)

    expect(sut.dimensions).toEqual({ width: 1920, height: 1080 })
    expect(resized).toHaveBeenCalledTimes(1)

    // the phone was turned
    element.deliver(1080, 1920, 'resize')

    expect(sut.dimensions).toEqual({ width: 1080, height: 1920 })
    expect(resized).toHaveBeenCalledTimes(2)
  })

  test('should play the new stream when the camera was switched', async () => {
    await createSut().play()
    const previous = session.stream

    await session.switchTo({ require: { facing: 'front' } })

    expect(element.srcObject).toBe(session.stream)
    expect(element.srcObject).not.toBe(previous)
  })

  test('should let go of the element and the session when it is disposed', async () => {
    const sut = createSut()
    await sut.play()

    sut.dispose()
    await session.switchTo({ require: { facing: 'front' } })

    expect(element).toMatchObject({ srcObject: null, isPlaying: false, isRemoved: true })
    expect(element.listenerCount()).toBe(0)
  })
})

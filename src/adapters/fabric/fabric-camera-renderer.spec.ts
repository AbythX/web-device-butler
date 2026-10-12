import type { FabricObject, StaticCanvas } from 'fabric'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mock, type MockProxy } from 'vitest-mock-extended'

import type { Logger } from '../../core/logging/logger.ts'
import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { CameraTestBench } from '../../media/camera/testing/camera-test-bench.ts'
import { FakeMediaBrowser } from '../../media/testing/fake-media-browser.ts'
import { CameraVideo } from './camera-video.ts'
import { FabricCameraRenderer } from './fabric-camera-renderer.ts'
import { FrameLoop } from './frame-loop.ts'
import { FakeDisplay } from './testing/fake-display.ts'
import { FakeVideoElement } from './testing/fake-video-element.ts'

describe('fabric-camera-renderer', () => {
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

  let canvas!: MockProxy<StaticCanvas>
  let picture!: MockProxy<FabricObject>
  let display!: FakeDisplay
  let loop!: FrameLoop
  let logger!: MockProxy<Logger>
  let sut!: FabricCameraRenderer

  beforeEach(() => {
    canvas = mock<StaticCanvas>()
    canvas.getObjects.mockReturnValue([])
    canvas.dispose.mockResolvedValue(true)
    picture = mock<FabricObject>()
    // the picture as the camera delivers it, before it is fitted
    picture.getScaledWidth.mockImplementation(() => element.width)
    picture.getScaledHeight.mockImplementation(() => element.height)

    display = new FakeDisplay()
    loop = new FrameLoop(() => canvas.renderAll(), 30, display)
    logger = mock<Logger>()

    const video = new CameraVideo(session, element as unknown as HTMLVideoElement, () => sut.layout())
    sut = new FabricCameraRenderer(session, canvas, video, picture, loop, logger)
  })

  test('should put the picture of the camera on the canvas', async () => {
    expect(canvas.add).toHaveBeenCalledWith(picture)
    expect(sut.output).toBe(canvas)
    expect(sut.session).toBe(session)
  })

  test('should play the camera and draw the canvas once it is started', async () => {
    await sut.start()
    display.frame(0)
    display.frame(40)

    expect(element.srcObject).toBe(session.stream)
    expect(canvas.renderAll).toHaveBeenCalledTimes(2)
  })

  test('should fit the canvas to the display', async () => {
    await sut.start()
    element.deliver(1920, 1080)

    sut.resize(960, 540)

    expect(canvas.setDimensions).toHaveBeenCalledWith(
      { width: 1920, height: 1080 },
      { backstoreOnly: true, cssOnly: false }
    )
    expect(canvas.setDimensions).toHaveBeenLastCalledWith(
      { width: 960, height: 540 },
      { backstoreOnly: false, cssOnly: true }
    )
    expect(picture.set).toHaveBeenLastCalledWith({ width: 1920, height: 1080 })
    expect(canvas.centerObject).toHaveBeenLastCalledWith(picture)
  })

  test('should wait for the first picture before it fits anything', async () => {
    await sut.start()

    sut.resize(960, 540)
    expect(canvas.setDimensions).not.toHaveBeenCalled()

    element.deliver(1920, 1080)
    expect(canvas.setDimensions).toHaveBeenCalledTimes(2)
  })

  test('should fit again when the size of the picture changes', async () => {
    await sut.start()
    element.deliver(1920, 1080)
    sut.resize(360, 640)
    canvas.setDimensions.mockClear()

    element.deliver(1080, 1920)

    expect(canvas.setDimensions).toHaveBeenCalledWith(
      { width: 1080, height: 1920 },
      { backstoreOnly: true, cssOnly: false }
    )
  })

  test('should show the picture at the resolution of the camera and crop it, not scale it', async () => {
    await sut.start()
    element.deliver(640, 480)

    sut.resize(300, 600)

    expect(canvas.setDimensions).toHaveBeenCalledWith(
      { width: 240, height: 480 },
      { backstoreOnly: true, cssOnly: false }
    )
    expect(picture.scale).toHaveBeenLastCalledWith(1)
    expect(picture.scaleToHeight).not.toHaveBeenCalled()
    expect(picture.scaleToWidth).not.toHaveBeenCalled()
  })

  test('should scale a picture up that rounding left smaller than the surface', async () => {
    picture.getScaledWidth.mockReturnValue(1919)
    picture.getScaledHeight.mockReturnValue(1079)
    await sut.start()
    element.deliver(1920, 1080)

    sut.resize(960, 540)

    expect(picture.scaleToHeight).toHaveBeenLastCalledWith(1080)
    expect(picture.scaleToWidth).toHaveBeenLastCalledWith(1920)
  })

  test('should scale what the application put on top, so it keeps its size on the display', async () => {
    const overlay = mock<FabricObject>()
    canvas.getObjects.mockImplementation((type) => (type === 'group' ? [overlay] : []))
    await sut.start()
    element.deliver(1920, 1080)
    sut.resize(960, 540)

    sut.add(overlay)

    expect(canvas.add).toHaveBeenLastCalledWith(overlay)
    expect(overlay.scale).toHaveBeenLastCalledWith(2)
  })

  test('should stop drawing when the session ends', async () => {
    await sut.start()

    await session.close()
    display.frame(0)

    expect(canvas.renderAll).not.toHaveBeenCalled()
    expect(loop.isRunning).toBe(false)
  })

  test('should stop drawing and dispose the canvas, but leave the session open', async () => {
    await sut.start()

    sut.dispose()
    sut.dispose()
    sut.resize(100, 100)

    expect(loop.isRunning).toBe(false)
    expect(canvas.dispose).toHaveBeenCalledTimes(1)
    expect(element.isRemoved).toBe(true)
    expect(session.state).toBe('live')
    expect(canvas.setDimensions).not.toHaveBeenCalled()
  })

  test('should log a canvas that could not be disposed', async () => {
    const failure = new Error('still drawing')
    canvas.dispose.mockRejectedValue(failure)

    sut.dispose()
    await new Promise((resolve) => setTimeout(resolve))

    expect(logger.error).toHaveBeenCalledWith('Could not dispose the canvas of the camera', failure)
  })
})

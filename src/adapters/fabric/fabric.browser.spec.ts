import { Group, Rect } from 'fabric'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultCameraManager } from '../../media/camera/default-camera-manager.ts'
import type { CameraManager } from '../../media/camera/camera-manager.ts'
import type { CameraSession } from '../../media/camera/session/camera-session.ts'
import { FabricCameraFactory } from './fabric-camera-factory.ts'
import type { FabricCameraRenderer } from './fabric-camera-renderer.ts'

/**
 * These specs run in real browsers, with the real fabric and the camera that the browser fakes.
 */
const hasCamera = await (navigator.mediaDevices?.getUserMedia({ video: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 300 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe.skipIf(!hasCamera)('the fabric renderer in a real browser', () => {
  let manager!: CameraManager
  let session!: CameraSession
  let sut!: FabricCameraRenderer

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    manager = DefaultCameraManager.create({ prefer: { width: 640, height: 480 } })
    session = await manager.open()
    sut = await new FabricCameraFactory().create(session)
  })

  afterEach(async () => {
    sut.dispose()
    manager.dispose()
    await waitFor(() => session.state === 'ended')
  })

  test('should draw the camera into a canvas of the size of the display, at the resolution of the camera', async () => {
    sut.resize(320, 240)
    await waitFor(() => sut.output.getWidth() > 0 && sut.output.getObjects('image').length === 1)

    const picture = session.settings.resolution
    const element = sut.output.getElement()

    expect(sut.output.getObjects('image')).toHaveLength(1)
    expect({ width: sut.output.getWidth(), height: sut.output.getHeight() }).toEqual({
      width: picture?.width,
      height: picture?.height,
    })
    expect(element.style.width).toBe('320px')
    expect(element.style.height).toBe('240px')
  })

  test('should crop the picture to the shape of the display', async () => {
    sut.resize(240, 480)
    await waitFor(() => sut.output.getWidth() > 0)

    const { width = 0, height = 0 } = session.settings.resolution ?? {}

    // an upright display: the full height of the picture and the middle of its width
    expect(sut.output.getHeight()).toBe(height)
    expect(sut.output.getWidth()).toBe(Math.round((240 * height) / 480))
    expect(sut.output.getWidth()).toBeLessThan(width)
  })

  test('should really draw the picture of the camera', async () => {
    sut.resize(320, 240)
    await waitFor(() => sut.output.getWidth() > 0)
    // a few frames
    await new Promise((resolve) => setTimeout(resolve, 300))

    const context = sut.output.getElement().getContext('2d')
    const { data } = context?.getImageData(0, 0, sut.output.getWidth(), sut.output.getHeight()) ?? { data: [] }

    // the fake cameras deliver a coloured picture, an empty canvas is transparent black
    expect(data.some((value) => value > 0)).toBe(true)
  })

  test('should scale what the application puts on top with the canvas', async () => {
    const overlay = new Group([new Rect({ width: 10, height: 10 })])
    sut.add(overlay)

    sut.resize(320, 240)
    await waitFor(() => sut.output.getWidth() > 0)

    expect(sut.output.getObjects('group')).toEqual([overlay])
    expect(overlay.scaleX).toBe(sut.output.getWidth() / 320)
  })

  test('should leave the session running when it is disposed', async () => {
    sut.dispose()

    expect(session.state).toBe('live')
    expect(session.track.readyState).toBe('live')
  })
})

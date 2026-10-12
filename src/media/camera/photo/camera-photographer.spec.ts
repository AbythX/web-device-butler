import { beforeEach, describe, expect, test } from 'vitest'
import { mock } from 'vitest-mock-extended'

import { BrowserEnvironment, type BrowserGlobals } from '../../../core/environment/browser-environment.ts'
import { UnsupportedError } from '../../../core/errors/unsupported-error.ts'
import type { Logger } from '../../../core/logging/logger.ts'
import { MediaError } from '../../errors/media-error.ts'
import { FakeMediaStream } from '../../testing/fake-media-stream.ts'
import { FakeMediaStreamTrack } from '../../testing/fake-media-stream-track.ts'
import { FakeImageCapture, FakePhotoPage } from '../testing/fake-photo-page.ts'
import { CameraPhotographer } from './camera-photographer.ts'

describe('camera-photographer', () => {
  let page!: FakePhotoPage
  let track!: FakeMediaStreamTrack
  let stream!: MediaStream
  let logger!: Logger

  const photographerOf = (globals: object) => new CameraPhotographer(BrowserEnvironment.of(globals), logger)

  const withStills = (): Partial<BrowserGlobals> => ({
    window: {} as Window,
    document: page as unknown as Document,
    ImageCapture: FakeImageCapture as unknown as BrowserGlobals['ImageCapture'],
  })

  const withoutStills = () => ({ window: {}, document: page })

  beforeEach(() => {
    FakeImageCapture.failure = undefined
    page = new FakePhotoPage()
    track = new FakeMediaStreamTrack({ kind: 'video', deviceId: 'back-0', label: 'Back camera' })
    stream = new FakeMediaStream([track]) as unknown as MediaStream
    logger = mock<Logger>()
  })

  describe('#take', () => {
    test('should ask the camera for a still picture where the browser can', async () => {
      const photo = await photographerOf(withStills()).take(stream)

      expect(photo).toMatchObject({ kind: 'photo', track })
      expect(page.videos).toHaveLength(0)
    })

    test('should take the picture of the stream where the browser cannot ask the camera', async () => {
      const photo = await photographerOf(withoutStills()).take(stream)

      expect(photo).toMatchObject({ kind: 'frame', type: 'image/jpeg', quality: 0.92, width: 640, height: 480 })
      expect(photo).toHaveProperty('source', page.videos[0])
    })

    test('should take the picture of the stream when it is asked for', async () => {
      const photo = await photographerOf(withStills()).take(stream, {
        source: 'frame',
        type: 'image/png',
        quality: 0.5,
      })

      expect(photo).toMatchObject({ kind: 'frame', type: 'image/png', quality: 0.5 })
    })

    test('should take the picture of the stream when the camera takes no still picture', async () => {
      FakeImageCapture.failure = new Error('not now')

      const photo = await photographerOf(withStills()).take(stream)

      expect(photo).toMatchObject({ kind: 'frame' })
      expect(logger.debug).toHaveBeenCalledOnce()
    })

    test('should play the stream without sound and without the player of a phone', async () => {
      await photographerOf(withoutStills()).take(stream)

      const [video] = page.videos
      expect(video?.muted).toBe(true)
      expect(video?.playsInline).toBe(true)
    })

    test('should leave nothing playing afterwards', async () => {
      await photographerOf(withoutStills()).take(stream)

      expect(page.videos[0]?.isPlaying).toBe(false)
      expect(page.videos[0]?.srcObject).toBeNull()
      expect(track.readyState).toBe('live')
    })

    test('should wait for a video that does not know its size at once', async () => {
      page.isSlow = true
      page.pictureSize = { width: 1920, height: 1080 }

      const photo = await photographerOf(withoutStills()).take(stream)

      expect(photo).toMatchObject({ width: 1920, height: 1080 })
    })

    test('should say where there is no page to draw on', async () => {
      await expect(photographerOf({}).take(stream)).rejects.toThrow(UnsupportedError)
    })

    test('should report a camera that delivers no picture', async () => {
      page.pictureSize = { width: 0, height: 0 }
      page.isSlow = true

      await expect(photographerOf(withoutStills()).take(stream)).rejects.toThrow(MediaError)
      expect(page.videos[0]?.isPlaying).toBe(false)
    })

    test('should report a stream that cannot be played', async () => {
      page.playError = new Error('not allowed')

      const failure = await photographerOf(withoutStills())
        .take(stream)
        .catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(MediaError)
      expect(failure).toHaveProperty('cause', page.playError)
    })

    test('should report a format the browser cannot write', async () => {
      page.cannotEncode = true

      await expect(photographerOf(withoutStills()).take(stream, { type: 'image/unknown' })).rejects.toThrow(
        "The browser could not write the photo as 'image/unknown'"
      )
    })
  })
})

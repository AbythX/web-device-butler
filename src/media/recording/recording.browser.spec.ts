import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { commands } from 'vitest/browser'

import { DefaultDeviceButler } from '../../core/default-device-butler.ts'
import type { DeviceButler } from '../../core/device-butler.ts'

/**
 * These specs run in real browsers, against a camera and a microphone that the browser fakes and the recorder the
 * browser really has. They cover what the fake recorder of the other specs only assumes: that a browser hands over
 * data, ends a file when it is told to, and can be asked for a photo.
 */
const hasCamera = await (navigator.mediaDevices?.getUserMedia({ video: true }) ?? Promise.reject()).then(
  (stream) => {
    stream.getTracks().forEach((track) => track.stop())

    return true
  },
  () => false
)

const recorded = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

describe.skipIf(!hasCamera)('recording in a real browser', () => {
  let butler!: DeviceButler

  beforeEach(async () => {
    // Firefox only starts a camera in the tab that is in the foreground
    await commands.showFirstTab()
    butler = DefaultDeviceButler.create()
  })

  afterEach(async () => {
    await butler.dispose()
  })

  test('should name formats the browser can write', async () => {
    expect(butler.recorder.isSupported).toBe(true)
    expect(butler.recorder.formats('video').length).toBeGreaterThan(0)
    expect(butler.recorder.formats('audio').length).toBeGreaterThan(0)
  })

  test('should record a camera into memory', async () => {
    const session = await butler.camera.open()
    const recording = await butler.recorder.record(session, { interval: 100 })

    await recorded(600)
    const result = await recording.stop()

    expect(result.segments).toHaveLength(1)
    expect(result.blob?.size).toBeGreaterThan(0)
    expect(result.blob?.type).toBe(result.mimeType)
    expect(result.mimeType).toMatch(/^video\//)
    expect(session.allowTakeover).toBe(true)
  })

  test('should record a microphone into a stream', async () => {
    const session = await butler.microphone.open()
    let written = 0

    const recording = await butler.recorder.record(session, {
      interval: 100,
      into: async () =>
        new WritableStream<Uint8Array>({
          write: (chunk) => {
            written += chunk.byteLength
          },
        }),
    })

    await recorded(600)
    const result = await recording.stop()

    expect(result.mimeType).toMatch(/^audio\//)
    expect(written).toBeGreaterThan(0)
    expect(written).toBe(result.bytes)
  })

  test('should continue in a new segment when the microphone is started again', async () => {
    const session = await butler.microphone.open({ prefer: { echoCancellation: true } })
    let restarts = 0
    session.on('trackchange', () => restarts++)
    const recording = await butler.recorder.record(session, { interval: 100 })
    await recorded(400)

    // a browser that cannot change the processing in place starts the microphone again
    await session.processing.set({ echoCancellation: false })
    await recorded(400)
    const result = await recording.stop()

    expect(result.segments).toHaveLength(restarts + 1)
    expect(result.segments.every((segment) => segment.bytes > 0 && segment.blob !== undefined)).toBe(true)
    expect(result.blob === undefined).toBe(restarts > 0)
  })

  test.each(['video', 'audio'] as const)('should write a WebM %s file a player knows the length of', async (kind) => {
    const session = await (kind === 'video' ? butler.camera.open() : butler.microphone.open())
    const recording = await butler.recorder.record(session, { format: `${kind}/webm`, interval: 100 })
    await recorded(1000)
    const { blob, duration } = await recording.stop()
    await session.close()

    const player = document.createElement(kind)
    player.muted = true

    const loaded = new Promise((resolve, reject) => {
      player.addEventListener('loadedmetadata', resolve, { once: true })
      player.addEventListener('error', () => reject(player.error), { once: true })
    })

    player.src = URL.createObjectURL(blob ?? new Blob())
    await loaded

    // without the length in the file, a player reports an infinite one and cannot jump to a position
    expect(Number.isFinite(player.duration)).toBe(true)
    expect(Math.abs(player.duration * 1000 - duration)).toBeLessThan(1000)

    const jumped = new Promise((resolve) => player.addEventListener('seeked', resolve, { once: true }))
    player.currentTime = player.duration / 2
    await jumped

    expect(player.currentTime).toBeGreaterThan(0)
    URL.revokeObjectURL(player.src)
  })

  test('should record a camera and a microphone together', async () => {
    const session = await butler.media.open()
    const recording = await butler.recorder.record(session, { interval: 100 })

    await recorded(600)
    const result = await recording.stop()

    expect(result.blob?.size).toBeGreaterThan(0)
  })

  test('should end and keep the recording when its session is closed', async () => {
    const session = await butler.camera.open()
    const recording = await butler.recorder.record(session, { interval: 100 })
    await recorded(400)

    await session.close()
    const result = await recording.finished

    expect(recording.state).toBe('stopped')
    expect(result.bytes).toBeGreaterThan(0)
  })

  test('should take a photo of the stream', async () => {
    const session = await butler.camera.open()

    const photo = await session.takePhoto({ source: 'frame', type: 'image/png' })

    expect(photo.type).toBe('image/png')
    expect(photo.size).toBeGreaterThan(0)
    expect(session.state).toBe('live')
  })

  test('should take a photo the way the browser offers', async () => {
    const session = await butler.camera.open()

    const photo = await session.takePhoto()

    expect(photo.type).toMatch(/^image\//)
    expect(photo.size).toBeGreaterThan(0)
  })

  describe('kept in the storage', () => {
    /**
     * Whether a player of the browser can read the file: it knows how long it is once it has its metadata.
     */
    const durationOf = async (blob: Blob): Promise<number> => {
      const player = document.createElement('audio')
      const url = URL.createObjectURL(blob)

      try {
        const loaded = new Promise<void>((resolve, reject) => {
          player.addEventListener('loadedmetadata', () => resolve(), { once: true })
          player.addEventListener('error', () => reject(player.error ?? new Error('The player cannot read it')))
        })

        player.src = url
        await loaded

        return player.duration
      } finally {
        URL.revokeObjectURL(url)
      }
    }

    afterEach(async () => {
      await commands.closeSecondTab()
    })

    test('should find a recording whose page was thrown away, and play what was kept', async () => {
      const namespace = `memos-${Date.now()}`
      const mimeType = await commands.recordKeptInSecondTab({ namespace, id: 'monday', milliseconds: 1500 })
      await commands.showFirstTab()

      expect((await butler.recorder.kept(namespace).get('monday'))?.state).toBe('recording')

      await commands.closeSecondTab()

      // the browser frees the locks of a closed tab a moment later
      let kept = await butler.recorder.kept(namespace).get('monday')

      for (let attempt = 0; attempt < 100 && kept?.state === 'recording'; attempt++) {
        await recorded(20)
        kept = await butler.recorder.kept(namespace).get('monday')
      }

      expect(kept?.state).toBe('interrupted')
      expect(kept?.mimeType).toBe(mimeType)
      expect(kept?.bytes).toBeGreaterThan(0)

      const result = await kept?.read()
      const blob = result?.blob ?? new Blob()
      expect(blob.size).toBe(kept?.bytes)
      expect(await durationOf(blob)).toBeGreaterThan(0)

      await kept?.delete()
      expect(await butler.recorder.kept(namespace).list()).toEqual([])
    })
  })
})

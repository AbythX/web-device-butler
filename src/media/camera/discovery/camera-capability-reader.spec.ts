import { describe, expect, test } from 'vitest'

import { PlatformQuirk } from '../../quirks/platform-quirk.ts'
import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { FakeMediaStreamTrack } from '../../testing/fake-media-stream-track.ts'
import { CameraFeatures } from '../model/camera-features.ts'
import { CameraCapabilityReader } from './camera-capability-reader.ts'

class NoZoomQuirk extends PlatformQuirk {
  public readonly name = 'no-zoom'

  public override readCapabilities(_track: MediaStreamTrack, capabilities: TrackCapabilities): TrackCapabilities {
    return { ...capabilities, zoom: undefined }
  }
}

describe('camera-capability-reader', () => {
  const lateTorch = (afterReads: number) =>
    new FakeMediaStreamTrack({
      kind: 'video',
      deviceId: 'back',
      label: 'back',
      capabilities: { torch: true, zoom: { min: 1, max: 4 } },
      lateCapabilities: { names: ['torch'], afterReads },
    }) as unknown as MediaStreamTrack

  const plain = () =>
    new FakeMediaStreamTrack({ kind: 'video', deviceId: 'front', label: 'front' }) as unknown as MediaStreamTrack

  const timing = { capabilityInterval: 1, capabilitySettleTime: 40, capabilityTimeout: 400 }

  describe('#read', () => {
    test('should read what the track reports right now', async () => {
      const sut = new CameraCapabilityReader(() => [], timing)

      expect(sut.read(lateTorch(1)).torch).toBeUndefined()
    })

    test('should let the quirks of the platform correct the answer', async () => {
      const sut = new CameraCapabilityReader(() => [new NoZoomQuirk()], timing)

      expect(sut.read(lateTorch(0))).toMatchObject({ torch: true, zoom: undefined })
    })

    test('should read nothing from a track that cannot tell', async () => {
      const sut = new CameraCapabilityReader(() => [], timing)

      expect(sut.read({ readyState: 'live' } as MediaStreamTrack)).toEqual({})
    })
  })

  describe('#settle', () => {
    test('should wait for a torch that is not reported right away', async () => {
      const sut = new CameraCapabilityReader(() => [], timing)

      expect((await sut.settle(lateTorch(2))).torch).toBe(true)
    })

    test('should not wait once the torch is reported', async () => {
      const sut = new CameraCapabilityReader(() => [], { ...timing, capabilitySettleTime: 60_000 })
      const startedAt = Date.now()

      await sut.settle(lateTorch(0))

      expect(Date.now() - startedAt).toBeLessThan(200)
    })

    test('should take the answer of a camera without a torch once it stopped changing', async () => {
      const sut = new CameraCapabilityReader(() => [], timing)
      const startedAt = Date.now()

      const capabilities = await sut.settle(plain())

      expect(capabilities.torch).toBeUndefined()
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(35)
      expect(Date.now() - startedAt).toBeLessThan(400)
    })

    test('should stop waiting after the timeout and take what is there', async () => {
      const sut = new CameraCapabilityReader(() => [], {
        capabilityInterval: 1,
        capabilitySettleTime: 60_000,
        capabilityTimeout: 30,
      })

      expect((await sut.settle(lateTorch(1_000_000))).torch).toBeUndefined()
    })

    test('should stop waiting for a track that ended', async () => {
      const sut = new CameraCapabilityReader(() => [], {
        ...timing,
        capabilitySettleTime: 60_000,
        capabilityTimeout: 60_000,
      })

      const track = plain()
      setTimeout(() => track.stop(), 5)

      await expect(sut.settle(track)).resolves.toBeDefined()
    })

    describe('for a camera that is known', () => {
      const known = CameraFeatures.fromCapabilities({ torch: true, zoom: { min: 1, max: 4 } })

      test('should wait until the track reports everything the camera has', async () => {
        const sut = new CameraCapabilityReader(() => [], { ...timing, capabilitySettleTime: 0 })

        expect((await sut.settle(lateTorch(3), known)).torch).toBe(true)
      })

      test('should not wait if the track reports it at once', async () => {
        const sut = new CameraCapabilityReader(() => [], { ...timing, capabilityInterval: 60_000 })

        await expect(sut.settle(lateTorch(0), known)).resolves.toMatchObject({ torch: true })
      })

      test('should not wait for a camera that is known to have nothing', async () => {
        const sut = new CameraCapabilityReader(() => [], { ...timing, capabilityInterval: 60_000 })

        await expect(sut.settle(plain(), CameraFeatures.none)).resolves.toBeDefined()
      })
    })
  })
})

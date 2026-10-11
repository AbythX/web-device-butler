import { beforeEach, describe, expect, test } from 'vitest'

import { NullLogger } from '../../core/logging/null-logger.ts'
import { MediaRequirementsError } from '../errors/media-requirements-error.ts'
import { SessionClosedError } from '../errors/session-closed-error.ts'
import { PlatformQuirk, type ConstraintChange } from '../quirks/platform-quirk.ts'
import { FakeMediaStreamTrack } from '../testing/fake-media-stream-track.ts'
import { ConstraintQueue } from './constraint-queue.ts'
import type { TrackCapabilities } from './track-constraints.ts'

class RecordingQuirk extends PlatformQuirk {
  public constructor(
    public readonly name: string,
    private readonly events: string[]
  ) {
    super()
  }

  public override beforeApply(): void {
    this.events.push(`before ${this.name}`)
  }

  public override afterApply(): void {
    this.events.push(`after ${this.name}`)
  }
}

/**
 * What iOS needs: the torch goes out when the zoom changes, so it is switched off before and on again after.
 */
class TorchResetsOnZoomQuirk extends PlatformQuirk {
  public readonly name = 'torch-resets-on-zoom'
  private wasOn = false

  public override async beforeApply({ change, before, apply }: ConstraintChange): Promise<void> {
    this.wasOn = change.advanced?.[0]?.zoom !== undefined && before.advanced?.[0]?.torch === true

    if (this.wasOn) {
      await apply({ advanced: [{ torch: false }] })
    }
  }

  public override async afterApply({ apply }: ConstraintChange): Promise<void> {
    if (this.wasOn) {
      await apply({ advanced: [{ torch: true }] })
    }
  }
}

class NoTorchQuirk extends PlatformQuirk {
  public readonly name = 'no-torch'

  public override readCapabilities(_track: MediaStreamTrack, capabilities: TrackCapabilities): TrackCapabilities {
    return { ...capabilities, torch: false }
  }
}

describe('constraint-queue', () => {
  let track!: FakeMediaStreamTrack

  const createTrack = () =>
    new FakeMediaStreamTrack({
      kind: 'video',
      deviceId: 'back-0',
      label: 'back',
      capabilities: { torch: true, zoom: { min: 1, max: 4, step: 1 } },
    })

  const createSut = (quirks: PlatformQuirk[] = [], target = track) =>
    new ConstraintQueue(target as unknown as MediaStreamTrack, 'camera', quirks, new NullLogger())

  beforeEach(() => {
    track = createTrack()
  })

  describe('#apply', () => {
    test('should apply the change to the track', async () => {
      const sut = createSut()

      await sut.apply({ advanced: [{ torch: true }] })

      expect(track.applied).toEqual([{ advanced: [{ torch: true }] }])
      expect(sut.settings.torch).toBe(true)
    })

    test('should never run two changes at the same time', async () => {
      const sut = createSut()

      await Promise.all([
        sut.apply({ advanced: [{ torch: true }] }),
        sut.apply({ advanced: [{ zoom: 2 }] }),
        sut.apply({ advanced: [{ zoom: 3 }] }),
      ])

      expect(track.overlappingChanges).toBe(1)
      expect(track.applied).toHaveLength(3)
    })

    test('should keep what was changed before', async () => {
      const sut = createSut()

      await sut.apply({ advanced: [{ torch: true }] })
      await sut.apply({ advanced: [{ zoom: 2 }] })

      expect(track.applied.at(-1)).toEqual({ advanced: [{ torch: true, zoom: 2 }] })
    })

    test('should base a change on the result of the one before it, also if both were made at once', async () => {
      const sut = createSut()

      await Promise.all([sut.apply({ advanced: [{ torch: true }] }), sut.apply({ advanced: [{ zoom: 2 }] })])

      expect(sut.settings).toMatchObject({ torch: true, zoom: 2 })
    })

    test('should keep the constraints the track was opened with', async () => {
      const sut = createSut()
      await track.applyConstraints({ width: { ideal: 1920 }, deviceId: { exact: 'back-0' } })

      await sut.apply({ frameRate: { ideal: 30 } })
      await sut.apply({ advanced: [{ torch: true }] })

      expect(track.applied.at(-1)).toEqual({
        width: { ideal: 1920 },
        deviceId: { exact: 'back-0' },
        frameRate: { ideal: 30 },
        advanced: [{ torch: true }],
      })
    })

    test('should turn the errors of the browser into errors of the library', async () => {
      const sut = createSut()
      track.applyError = Object.assign(new Error('zoom'), { name: 'OverconstrainedError', constraint: 'zoom' })

      const error = await sut.apply({ advanced: [{ zoom: 99 }] }).catch((reason: unknown) => reason)

      expect(error).toBeInstanceOf(MediaRequirementsError)
      expect((error as MediaRequirementsError).constraint).toBe('zoom')
    })

    test('should carry on after a change that failed', async () => {
      const sut = createSut()
      track.applyError = new Error('failed')
      const failing = sut.apply({ advanced: [{ zoom: 99 }] })

      const following = failing.catch(() => {
        track.applyError = undefined

        return sut.apply({ advanced: [{ torch: true }] })
      })

      await expect(failing).rejects.toThrow('Could not change the camera')
      await expect(following).resolves.toBeUndefined()
      expect(sut.settings.torch).toBe(true)
    })
  })

  describe('quirks', () => {
    test('should run the quirks around a change, the last one closest to it', async () => {
      const events: string[] = []
      const sut = createSut([new RecordingQuirk('first', events), new RecordingQuirk('second', events)])

      await sut.apply({ advanced: [{ torch: true }] })

      expect(events).toEqual(['before first', 'before second', 'after second', 'after first'])
    })

    test('should run the quirks after a change that failed as well', async () => {
      const events: string[] = []
      const sut = createSut([new RecordingQuirk('quirk', events)])
      track.applyError = new Error('failed')

      await expect(sut.apply({ advanced: [{ torch: true }] })).rejects.toThrow('Could not change the camera')

      expect(events).toEqual(['before quirk', 'after quirk'])
    })

    test('should let a quirk change the track around a change', async () => {
      const sut = createSut([new TorchResetsOnZoomQuirk()])
      await sut.apply({ advanced: [{ torch: true }] })

      await sut.apply({ advanced: [{ zoom: 2 }] })

      expect(track.applied.slice(1).map((constraints) => constraints.advanced?.[0])).toEqual([
        { torch: false },
        { torch: false, zoom: 2 },
        { torch: true, zoom: 2 },
      ])
      expect(track.overlappingChanges).toBe(1)
      expect(sut.settings).toMatchObject({ torch: true, zoom: 2 })
    })

    test('should leave a change alone that a quirk is not about', async () => {
      const sut = createSut([new TorchResetsOnZoomQuirk()])

      await sut.apply({ advanced: [{ zoom: 2 }] })

      expect(track.applied).toEqual([{ advanced: [{ zoom: 2 }] }])
    })
  })

  describe('#capabilities', () => {
    test('should report what the track can do', async () => {
      expect(createSut().capabilities.torch).toBe(true)
    })

    test('should let the quirks correct what the track reports', async () => {
      expect(createSut([new NoTorchQuirk()]).capabilities.torch).toBe(false)
    })

    test('should be empty where the browser cannot tell', async () => {
      const withoutCapabilities = { getSettings: () => ({}) } as unknown as MediaStreamTrack
      const sut = new ConstraintQueue(withoutCapabilities, 'camera', [], new NullLogger())

      expect(sut.capabilities).toEqual({})
    })
  })

  describe('#attach', () => {
    test('should apply the changes that follow to the new track', async () => {
      const sut = createSut()
      const next = createTrack()

      sut.attach(next as unknown as MediaStreamTrack)
      await sut.apply({ advanced: [{ torch: true }] })

      expect(sut.track).toBe(next)
      expect(track.applied).toEqual([])
      expect(next.applied).toHaveLength(1)
    })
  })

  describe('#close', () => {
    test('should refuse changes', async () => {
      const sut = createSut()

      sut.close()

      await expect(sut.apply({ advanced: [{ torch: true }] })).rejects.toBeInstanceOf(SessionClosedError)
      expect(track.applied).toEqual([])
    })

    test('should fail the changes that were still waiting', async () => {
      const sut = createSut()

      const running = sut.apply({ advanced: [{ torch: true }] })
      const waiting = sut.apply({ advanced: [{ zoom: 2 }] })
      sut.close()

      await expect(running).rejects.toBeInstanceOf(SessionClosedError)
      await expect(waiting).rejects.toBeInstanceOf(SessionClosedError)
    })
  })
})

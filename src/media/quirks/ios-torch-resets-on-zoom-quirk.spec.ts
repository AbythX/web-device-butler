import { beforeEach, describe, expect, test } from 'vitest'

import { NullLogger } from '../../core/logging/null-logger.ts'
import { MediaError } from '../errors/media-error.ts'
import { ConstraintQueue } from '../session/constraint-queue.ts'
import { FakeMediaStreamTrack } from '../testing/fake-media-stream-track.ts'
import { IosTorchResetsOnZoomQuirk } from './ios-torch-resets-on-zoom-quirk.ts'

describe('ios-torch-resets-on-zoom-quirk', () => {
  let track!: FakeMediaStreamTrack
  let queue!: ConstraintQueue

  const applied = () => track.applied.map((constraints) => constraints.advanced?.[0])

  beforeEach(() => {
    track = new FakeMediaStreamTrack({
      kind: 'video',
      deviceId: 'back',
      label: 'back',
      capabilities: { torch: true, zoom: { min: 1, max: 4 } },
    })
    queue = new ConstraintQueue(
      track as unknown as MediaStreamTrack,
      'camera',
      [new IosTorchResetsOnZoomQuirk()],
      new NullLogger()
    )
  })

  test('should switch the torch off before the zoom changes and on again afterwards', async () => {
    await queue.apply({ advanced: [{ torch: true }] })

    await queue.apply({ advanced: [{ zoom: 2 }] })

    expect(applied()).toEqual([{ torch: true }, { torch: false }, { torch: false, zoom: 2 }, { torch: true, zoom: 2 }])
    expect(queue.settings.torch).toBe(true)
  })

  test('should leave a torch that is off alone', async () => {
    await queue.apply({ advanced: [{ zoom: 2 }] })

    expect(applied()).toEqual([{ zoom: 2 }])
  })

  test('should not interrupt the torch for a change that does not zoom', async () => {
    await queue.apply({ advanced: [{ torch: true }] })

    await queue.apply({ advanced: [{ focusMode: 'manual' }] })

    expect(applied()).toEqual([{ torch: true }, { torch: true, focusMode: 'manual' }])
  })

  test('should switch the torch on again if zooming failed', async () => {
    await queue.apply({ advanced: [{ torch: true }] })
    const failure = new Error('zoom failed')
    const apply = track.applyConstraints.bind(track)
    track.applyConstraints = async (constraints) => {
      if ((constraints?.advanced?.[0] as { zoom?: number } | undefined)?.zoom !== undefined) {
        throw failure
      }

      return apply(constraints)
    }

    await expect(queue.apply({ advanced: [{ zoom: 2 }] })).rejects.toThrow(MediaError)

    expect(applied()).toEqual([{ torch: true }, { torch: false }, { torch: true }])
    expect(queue.settings.torch).toBe(true)
  })

  test('should handle a zoom change while another one is waiting', async () => {
    await queue.apply({ advanced: [{ torch: true }] })

    await Promise.all([queue.apply({ advanced: [{ zoom: 2 }] }), queue.apply({ advanced: [{ zoom: 3 }] })])

    expect(track.overlappingChanges).toBe(1)
    expect(queue.settings).toMatchObject({ torch: true, zoom: 3 })
  })
})

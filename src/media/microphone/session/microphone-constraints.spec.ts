import { describe, expect, test } from 'vitest'

import { MicrophoneConstraints } from './microphone-constraints.ts'

describe('microphone-constraints', () => {
  test('should ask for nothing if nothing is required', async () => {
    expect(MicrophoneConstraints.for({})).toEqual({})
  })

  test('should turn the requirements into constraints of the browser', async () => {
    const constraints = MicrophoneConstraints.for({
      prefer: { echoCancellation: true, noiseSuppression: false, channelCount: 2, sampleRate: 48_000 },
    })

    expect(constraints).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48_000 },
    })
  })

  test('should take a processing from what is required where both name it', async () => {
    const constraints = MicrophoneConstraints.for({
      require: { echoCancellation: true },
      prefer: { echoCancellation: false, noiseSuppression: false },
    })

    expect(constraints).toEqual({ echoCancellation: true, noiseSuppression: false })
  })

  test('should ask for what is required where nothing is preferred, and for what is preferred otherwise', async () => {
    const constraints = MicrophoneConstraints.for({
      require: { channelCount: 1, sampleRate: 44_100 },
      prefer: { channelCount: 2 },
    })

    expect(constraints).toEqual({ channelCount: { ideal: 2 }, sampleRate: { ideal: 44_100 } })
  })

  test('should let a field of the library win over the same raw constraint', async () => {
    const constraints = MicrophoneConstraints.for({
      constraints: { echoCancellation: true, sampleSize: 16 },
      prefer: { echoCancellation: false },
    })

    expect(constraints).toEqual({ echoCancellation: false, sampleSize: 16 })
  })
})

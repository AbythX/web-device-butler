import { describe, expect, test } from 'vitest'

import { MicrophoneConstraints } from './microphone-constraints.ts'

describe('microphone-constraints', () => {
  test('should ask for nothing if nothing is required', async () => {
    expect(MicrophoneConstraints.for({})).toEqual({})
  })

  test('should turn the requirements into constraints of the browser', async () => {
    const constraints = MicrophoneConstraints.for({
      processing: { echoCancellation: true, noiseSuppression: false },
      channelCount: 2,
      sampleRate: 48_000,
    })

    expect(constraints).toEqual({
      echoCancellation: true,
      noiseSuppression: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48_000 },
    })
  })

  test('should let a field of the library win over the same raw constraint', async () => {
    const constraints = MicrophoneConstraints.for({
      constraints: { echoCancellation: true, sampleSize: 16 },
      processing: { echoCancellation: false },
    })

    expect(constraints).toEqual({ echoCancellation: false, sampleSize: 16 })
  })
})

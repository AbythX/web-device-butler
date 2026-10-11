import { describe, expect, test } from 'vitest'

import { MicrophoneSettings } from './microphone-settings.ts'

describe('microphone-settings', () => {
  test('should read what the track delivers', async () => {
    const sut = MicrophoneSettings.fromTrack({
      echoCancellation: true,
      noiseSuppression: false,
      channelCount: 1,
      sampleRate: 48_000,
    })

    expect(sut).toEqual(new MicrophoneSettings(true, false, false, 1, 48_000))
  })

  test('should compare by value', async () => {
    const sut = new MicrophoneSettings(true, true, true, 1, 48_000)

    expect(sut.equals(new MicrophoneSettings(true, true, true, 1, 48_000))).toBe(true)
    expect(sut.equals(new MicrophoneSettings(true, false, true, 1, 48_000))).toBe(false)
    expect(sut.equals(new MicrophoneSettings(true, true, true, 2, 48_000))).toBe(false)
  })
})

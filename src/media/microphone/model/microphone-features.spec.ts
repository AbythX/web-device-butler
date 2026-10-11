import { describe, expect, test } from 'vitest'

import { MicrophoneFeatures } from './microphone-features.ts'

describe('microphone-features', () => {
  describe('.fromCapabilities', () => {
    test('should read what a microphone reports', async () => {
      const sut = MicrophoneFeatures.fromCapabilities({
        echoCancellation: [true, false],
        noiseSuppression: [true, false],
        autoGainControl: [false],
        channelCount: { min: 1, max: 2 },
        sampleRate: { min: 8000, max: 48_000 },
      })

      expect(sut.toJSON()).toEqual({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
        maxChannelCount: 2,
        maxSampleRate: 48_000,
      })
    })

    test('should report nothing for a microphone that reports nothing', async () => {
      expect(MicrophoneFeatures.fromCapabilities({})).toEqual(MicrophoneFeatures.none)
    })

    test('should understand browsers that name the kind of echo cancellation', async () => {
      expect(MicrophoneFeatures.fromCapabilities({ echoCancellation: ['all', 'remote-only'] }).echoCancellation).toBe(
        true
      )
    })

    test('should count a processing that is on as available, also if the browser does not list it', async () => {
      const sut = MicrophoneFeatures.fromCapabilities({}, { echoCancellation: true, noiseSuppression: false })

      expect(sut.echoCancellation).toBe(true)
      expect(sut.noiseSuppression).toBe(false)
    })

    test('should fall back to what the running microphone delivers for channels and sample rate', async () => {
      const sut = MicrophoneFeatures.fromCapabilities({}, { channelCount: 1, sampleRate: 44_100 })

      expect(sut.maxChannelCount).toBe(1)
      expect(sut.maxSampleRate).toBe(44_100)
    })
  })

  describe('.isOn', () => {
    test.each([
      [true, true],
      ['all', true],
      ['remote-only', true],
      [false, false],
      ['none', false],
      [undefined, false],
    ])('should read %j as %s', async (value, expected) => {
      expect(MicrophoneFeatures.isOn(value)).toBe(expected)
    })
  })

  describe('#includes', () => {
    test('should tell whether a microphone has every processing of another one', async () => {
      const full = new MicrophoneFeatures({ echoCancellation: true, noiseSuppression: true, autoGainControl: true })
      const some = new MicrophoneFeatures({ echoCancellation: true, noiseSuppression: false, autoGainControl: false })

      expect(full.includes(some)).toBe(true)
      expect(some.includes(full)).toBe(false)
    })
  })
})

import { describe, expect, test } from 'vitest'

import type { MediaInputDetail } from '../../input/media-input-descriptor.ts'
import { MicrophoneDescriptor } from './microphone-descriptor.ts'
import { MicrophoneFeatures, type MicrophoneFeatureValues } from './microphone-features.ts'
import { MicrophoneSelector } from './microphone-selector.ts'

const microphone = (
  id: string,
  features: Partial<MicrophoneFeatureValues> = {},
  isDefault = false,
  detail: MediaInputDetail = 'probed'
) =>
  new MicrophoneDescriptor(
    id,
    id,
    id,
    detail,
    isDefault,
    new MicrophoneFeatures({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...features })
  )

describe('microphone-selector', () => {
  const sut = new MicrophoneSelector()

  const microphones = [
    microphone('builtin', { echoCancellation: true, noiseSuppression: true }),
    microphone('headset', { echoCancellation: true }, true),
    microphone('stereo', { maxChannelCount: 2 }),
  ]

  const ids = (ranked: readonly MicrophoneDescriptor[]) => ranked.map((descriptor) => descriptor.id)

  test('should put the default microphone of the system first', async () => {
    expect(ids(sut.select(microphones, {}).ranked)).toEqual(['headset', 'builtin', 'stereo'])
  })

  test('should never return a microphone that lacks what is required', async () => {
    expect(ids(sut.select(microphones, { require: { echoCancellation: true } }).ranked)).toEqual(['headset', 'builtin'])
    expect(sut.select(microphones, { require: { minChannelCount: 2 } }).best?.id).toBe('stereo')
  })

  test('should rank the microphones with the preferred features higher than the default', async () => {
    expect(sut.select(microphones, { prefer: { noiseSuppression: true } }).best?.id).toBe('builtin')
  })

  test('should count the default among the preferences', async () => {
    const selection = sut.select(microphones, { prefer: { noiseSuppression: true, default: true } })

    // each of the first two has one of the two, then the default decides
    expect(ids(selection.ranked)).toEqual(['headset', 'builtin', 'stereo'])
  })

  test('should say which requirement removed which microphone', async () => {
    const selection = sut.select(microphones, { require: { autoGainControl: true, minChannelCount: 2 } })

    expect(selection.best).toBeUndefined()
    expect(selection.explain()).toBe(
      "None of the 3 microphones fits the requirements: 'builtin' lacks autoGainControl, 2 channels; " +
        "'headset' lacks autoGainControl, 2 channels; 'stereo' lacks autoGainControl"
    )
  })

  test('should say that there is nothing to choose from', async () => {
    expect(sut.select([], {}).explain()).toBe('There is no microphone to choose from')
  })
})

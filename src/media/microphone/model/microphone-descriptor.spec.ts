import { describe, expect, test } from 'vitest'

import type { MediaInputDetail } from '../../input/media-input-descriptor.ts'
import { MicrophoneDescriptor } from './microphone-descriptor.ts'
import { MicrophoneFeatures, type MicrophoneFeatureValues } from './microphone-features.ts'

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

const device = (capabilities?: Record<string, unknown>) =>
  ({
    deviceId: 'microphone-0',
    groupId: 'group-0',
    kind: 'audioinput',
    label: 'Microphone',
    ...(capabilities === undefined ? {} : { getCapabilities: () => capabilities }),
  }) as unknown as MediaDeviceInfo

describe('microphone-descriptor', () => {
  describe('.listed', () => {
    test('should know only the label of a microphone the browser says nothing about', async () => {
      const sut = MicrophoneDescriptor.listed(device(), true)

      expect(sut).toMatchObject({ id: 'microphone-0', groupId: 'group-0', label: 'Microphone', detail: 'listed' })
      expect(sut.isDefault).toBe(true)
      expect(sut.features).toBe(MicrophoneFeatures.none)
    })

    test('should read what the browser knows without starting the microphone', async () => {
      const sut = MicrophoneDescriptor.listed(device({ echoCancellation: [true, false] }), false)

      expect(sut.detail).toBe('static')
      expect(sut.features.echoCancellation).toBe(true)
    })

    test('should treat an empty answer as no answer', async () => {
      expect(MicrophoneDescriptor.listed(device({ deviceId: 'microphone-0' }), false).detail).toBe('listed')
    })
  })

  describe('#probedWith', () => {
    test('should describe the same microphone with what its running track reports', async () => {
      const sut = MicrophoneDescriptor.listed(device(), true).probedWith({ noiseSuppression: [true, false] }, {})

      expect(sut).toMatchObject({ id: 'microphone-0', detail: 'probed', isDefault: true })
      expect(sut.features.noiseSuppression).toBe(true)
    })
  })

  describe('#satisfies', () => {
    const plain = microphone('plain', { maxChannelCount: 1 })

    const full = microphone('full', {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      maxChannelCount: 2,
    })

    test('should satisfy requirements that ask for nothing', async () => {
      expect(plain.satisfies({})).toBe(true)
      expect(plain.satisfies({ require: { echoCancellation: false } })).toBe(true)
    })

    test.each([
      [{ echoCancellation: true }, 'echoCancellation'],
      [{ noiseSuppression: true }, 'noiseSuppression'],
      [{ autoGainControl: true }, 'autoGainControl'],
      [{ minChannelCount: 2 }, '2 channels'],
    ])('should tell that %j is missing', async (require, reason) => {
      expect(full.satisfies({ require })).toBe(true)
      expect(plain.unmet({ require })).toEqual([reason])
    })

    test('should take a running microphone that does not report its channels for a mono microphone', async () => {
      const unknown = microphone('unknown')

      expect(unknown.satisfies({ require: { minChannelCount: 1 } })).toBe(true)
      expect(unknown.satisfies({ require: { minChannelCount: 2 } })).toBe(false)
    })

    test('should say that a microphone that was not started cannot tell', async () => {
      const listed = microphone('listed', {}, false, 'listed')

      expect(listed.unmet({ require: { echoCancellation: true, minChannelCount: 1 } })).toEqual([
        'echoCancellation (not known before the microphone was started)',
        '1 channels (not known before the microphone was started)',
      ])
    })
  })
})

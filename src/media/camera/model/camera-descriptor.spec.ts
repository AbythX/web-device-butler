import { describe, expect, test } from 'vitest'

import { CameraDescriptor } from './camera-descriptor.ts'
import { CameraFeatures } from './camera-features.ts'
import type { CameraTraits } from './camera-requirements.ts'
import { Resolution } from './resolution.ts'

const mainCamera = {
  torch: true,
  zoom: { min: 1, max: 8, step: 0.1 },
  focusMode: ['continuous', 'manual'],
  focusDistance: { min: 0.1, max: 10, step: 0.1 },
  width: { min: 1, max: 3840 },
  height: { min: 1, max: 2160 },
  frameRate: { min: 1, max: 60 },
  facingMode: ['environment'],
}

const device = (label: string, capabilities?: Record<string, unknown>) =>
  ({
    deviceId: 'camera-0',
    groupId: 'group-0',
    kind: 'videoinput',
    label,
    ...(capabilities === undefined ? {} : { getCapabilities: () => capabilities }),
  }) as unknown as MediaDeviceInfo

describe('camera-descriptor', () => {
  describe('.listed', () => {
    test('should know only the label of a camera the browser says nothing about', async () => {
      const sut = CameraDescriptor.listed(device('camera2 0, facing back'))

      expect(sut.id).toBe('camera-0')
      expect(sut.groupId).toBe('group-0')
      expect(sut.detail).toBe('listed')
      expect(sut.facing).toBe('back')
      expect(sut.features).toBe(CameraFeatures.none)
    })

    test('should read what the browser knows without starting the camera', async () => {
      const sut = CameraDescriptor.listed(
        device('Camera', { facingMode: ['user'], width: { max: 1280 }, height: { max: 720 } })
      )

      expect(sut.detail).toBe('static')
      expect(sut.facing).toBe('front')
      expect(sut.features.maxResolution).toEqual(new Resolution(1280, 720))
    })

    test('should treat an empty answer as no answer', async () => {
      expect(CameraDescriptor.listed(device('Camera', { deviceId: 'camera-0' })).detail).toBe('listed')
    })

    test('should survive a browser that fails to answer', async () => {
      const broken = {
        ...device('Camera'),
        getCapabilities: () => {
          throw new Error('not now')
        },
      } as unknown as MediaDeviceInfo

      expect(CameraDescriptor.listed(broken).detail).toBe('listed')
    })
  })

  describe('#probedWith', () => {
    test('should describe the same camera with what its running track reports', async () => {
      const listed = CameraDescriptor.listed(device('Camera'))

      const sut = listed.probedWith(mainCamera)

      expect(sut.id).toBe(listed.id)
      expect(sut.label).toBe('Camera')
      expect(sut.detail).toBe('probed')
      expect(sut.facing).toBe('back')
      expect(sut.features.torch).toBe(true)
      expect(listed.detail).toBe('listed')
    })

    test('should keep the facing of the label if the track does not say', async () => {
      expect(CameraDescriptor.listed(device('Front Camera')).probedWith({}).facing).toBe('front')
    })
  })

  describe('#satisfies', () => {
    const probed = CameraDescriptor.listed(device('camera2 0, facing back')).probedWith(mainCamera)

    const plain = CameraDescriptor.listed(device('camera2 2, facing back')).probedWith({
      width: { max: 1280 },
      height: { max: 720 },
      frameRate: { max: 30 },
    })

    test('should satisfy requirements that ask for nothing', async () => {
      expect(plain.satisfies({})).toBe(true)
      expect(plain.satisfies({ require: { torch: false, zoom: false } })).toBe(true)
    })

    test.each([
      [{ torch: true }, 'torch'],
      [{ zoom: true }, 'zoom'],
      [{ focus: true }, 'focus'],
      [{ width: 1920, height: 1080 }, 'resolution of at least 1920x1080'],
      [{ width: 1920 }, 'width of at least 1920'],
      [{ height: 1080 }, 'height of at least 1080'],
      [{ frameRate: 60 }, 'frame rate of at least 60'],
    ])('should tell that %j is missing', async (require: CameraTraits, reason) => {
      expect(probed.satisfies({ require })).toBe(true)
      expect(plain.satisfies({ require })).toBe(false)
      expect(plain.unmet({ require })).toEqual([reason])
    })

    test('should not satisfy the other facing', async () => {
      expect(probed.satisfies({ require: { facing: 'back' } })).toBe(true)
      expect(probed.unmet({ require: { facing: 'front' } })).toEqual(["facing 'front'"])
    })

    test('should not rule out a camera that does not say where it faces', async () => {
      const webcam = CameraDescriptor.listed(device('Integrated Webcam'))

      expect(webcam.satisfies({ require: { facing: 'back' } })).toBe(true)
    })

    test('should only insist on what is required', async () => {
      expect(plain.satisfies({ prefer: { width: 1920, height: 1080, torch: true } })).toBe(true)
    })

    test('should take a width and a height together for one size, whichever way the device is held', async () => {
      expect(plain.satisfies({ require: { width: 720, height: 1280 } })).toBe(true)
      expect(plain.satisfies({ require: { width: 720 } })).toBe(true)
      expect(plain.satisfies({ require: { height: 1280 } })).toBe(false)
    })

    test('should say whether it can deliver a size', async () => {
      expect(plain.canDeliver({ width: 1280, height: 720 })).toBe(true)
      expect(plain.canDeliver({ width: 1920, height: 1080 })).toBe(false)
      expect(plain.canDeliver({})).toBeUndefined()
      expect(CameraDescriptor.listed(device('Camera')).canDeliver({ width: 1280 })).toBeUndefined()
    })

    test('should not rule out a camera whose resolution is not known', async () => {
      const unknown = CameraDescriptor.listed(device('Camera'))

      expect(unknown.satisfies({ require: { width: 3840, height: 2160, frameRate: 120 } })).toBe(true)
    })

    test('should say that a camera that was not started cannot tell about its torch', async () => {
      const listed = CameraDescriptor.listed(device('camera2 0, facing back'))

      expect(listed.unmet({ require: { torch: true } })).toEqual(['torch (not known before the camera was started)'])
    })
  })

  describe('#toJSON', () => {
    test('should survive a round trip as a probed camera', async () => {
      const sut = CameraDescriptor.listed(device('camera2 0, facing back')).probedWith(mainCamera)

      expect(CameraDescriptor.fromJSON(JSON.parse(JSON.stringify(sut)))).toEqual(sut)
    })

    test.each([
      ['nothing', undefined],
      ['a camera without an id', { groupId: '', label: '', facing: 'back', features: { torch: false } }],
      ['a facing that does not exist', { id: 'a', groupId: '', label: '', facing: 'up', features: { torch: false } }],
      ['a camera without features', { id: 'a', groupId: '', label: '', facing: 'back' }],
    ])('should not read %s as a camera', async (_name, value) => {
      expect(CameraDescriptor.fromJSON(value)).toBeUndefined()
    })
  })
})

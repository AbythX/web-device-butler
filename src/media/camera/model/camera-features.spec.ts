import { describe, expect, test } from 'vitest'

import { CameraFeatures } from './camera-features.ts'
import { NumericRange } from './numeric-range.ts'
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

describe('camera-features', () => {
  describe('.fromCapabilities', () => {
    test('should read everything a running camera reports', async () => {
      const sut = CameraFeatures.fromCapabilities(mainCamera)

      expect(sut.torch).toBe(true)
      expect(sut.zoom).toEqual(new NumericRange(1, 8, 0.1))
      expect(sut.focusModes).toEqual(['continuous', 'manual'])
      expect(sut.focusDistance).toEqual(new NumericRange(0.1, 10, 0.1))
      expect(sut.maxResolution).toEqual(new Resolution(3840, 2160))
      expect(sut.maxFrameRate).toBe(60)
      expect(sut.hasFocusControl).toBe(true)
    })

    test('should report nothing for a camera that reports nothing', async () => {
      const sut = CameraFeatures.fromCapabilities({})

      expect(sut).toEqual(CameraFeatures.none)
      expect(sut.torch).toBe(false)
      expect(sut.zoom).toBeUndefined()
      expect(sut.resolutions).toEqual([])
      expect(sut.hasFocusControl).toBe(false)
    })

    test('should understand a torch that is reported as a list of values', async () => {
      expect(CameraFeatures.fromCapabilities({ torch: [false, true] }).torch).toBe(true)
      expect(CameraFeatures.fromCapabilities({ torch: [false] }).torch).toBe(false)
      expect(CameraFeatures.fromCapabilities({ torch: false }).torch).toBe(false)
    })

    test('should not count a zoom without room as zoom', async () => {
      expect(CameraFeatures.fromCapabilities({ zoom: { min: 1, max: 1 } }).zoom).toBeUndefined()
    })

    test('should not count a single focus mode as a focus the application controls', async () => {
      expect(CameraFeatures.fromCapabilities({ focusMode: ['continuous'] }).hasFocusControl).toBe(false)
    })

    test('should list the common resolutions the camera can deliver, largest first', async () => {
      const sut = CameraFeatures.fromCapabilities({ width: { max: 1920 }, height: { max: 1080 } })

      expect(sut.resolutions.map(String)).toEqual(['1920x1080', '1280x720', '960x540', '640x480', '640x360', '320x240'])
    })
  })

  describe('#includes', () => {
    test('should tell when a camera reports everything it is known to have', async () => {
      const known = CameraFeatures.fromCapabilities(mainCamera)
      const withoutTorch = CameraFeatures.fromCapabilities({ ...mainCamera, torch: undefined })

      expect(known.includes(known)).toBe(true)
      expect(withoutTorch.includes(known)).toBe(false)
      expect(known.includes(withoutTorch)).toBe(true)
      expect(CameraFeatures.none.includes(CameraFeatures.none)).toBe(true)
    })
  })

  describe('#toJSON', () => {
    test('should survive a round trip', async () => {
      const sut = CameraFeatures.fromCapabilities(mainCamera)

      expect(CameraFeatures.fromJSON(JSON.parse(JSON.stringify(sut)))).toEqual(sut)
    })

    test.each([
      ['nothing', undefined],
      ['a string', 'torch'],
      ['an object without a torch', { zoom: { min: 1, max: 2 } }],
    ])('should not read %s as features', async (_name, value) => {
      expect(CameraFeatures.fromJSON(value)).toBeUndefined()
    })

    test('should drop what it does not understand', async () => {
      const sut = CameraFeatures.fromJSON({ torch: true, zoom: 'far', focusModes: [1, 'manual'], maxFrameRate: '60' })

      expect(sut).toEqual(new CameraFeatures({ torch: true, focusModes: ['manual'] }))
    })
  })
})

import { describe, expect, test } from 'vitest'

import type { TrackCapabilities } from '../../session/track-constraints.ts'
import { CameraFacingDetector } from './camera-facing.ts'

describe('camera-facing', () => {
  describe('.fromCapabilities', () => {
    test.each([
      [['environment'], 'back'],
      [['user'], 'front'],
      ['environment', 'back'],
      [[], 'unknown'],
      [undefined, 'unknown'],
      [['left'], 'unknown'],
    ])('should read %j as %s', async (facingMode, expected) => {
      expect(CameraFacingDetector.fromCapabilities({ facingMode } as TrackCapabilities)).toBe(expected)
    })

    test('should work without capabilities', async () => {
      expect(CameraFacingDetector.fromCapabilities(undefined)).toBe('unknown')
    })
  })

  describe('.fromLabel', () => {
    test.each([
      ['camera2 0, facing back', 'back'],
      ['camera2 1, facing front', 'front'],
      ['Back Camera', 'back'],
      ['Back Ultra Wide Camera', 'back'],
      ['Front Camera', 'front'],
      ['Rückkamera', 'back'],
      ['Frontkamera', 'front'],
      ['Câmera traseira', 'back'],
      ['Câmera frontal', 'front'],
      ['Camera aan achterzijde', 'back'],
      ['Camera aan voorzijde', 'front'],
      ['Bakre kamera', 'back'],
      ['Främre kamera', 'front'],
      ['Tylny aparat', 'back'],
      ['Przedni aparat', 'front'],
      ['Arka Kamera', 'back'],
      ['Ön Kamera', 'front'],
      ['Задняя камера', 'back'],
      ['Передняя камера', 'front'],
      ['背面カメラ', 'back'],
      ['前面カメラ', 'front'],
      ['后置相机', 'back'],
      ['前置相机', 'front'],
      ['후면 카메라', 'back'],
      ['전면 카메라', 'front'],
      ['Caméra arrière', 'back'],
      ['Rear camera', 'back'],
      ['USB Camera (046d:0825)', 'external'],
      ['Integrated Webcam', 'unknown'],
      ['FaceTime HD Camera', 'unknown'],
      ['', 'unknown'],
    ])('should read "%s" as %s', async (label, expected) => {
      expect(CameraFacingDetector.fromLabel(label)).toBe(expected)
    })
  })

  describe('.detect', () => {
    test('should trust the browser more than the label', async () => {
      const capabilities = { facingMode: ['user'] } as TrackCapabilities

      expect(CameraFacingDetector.detect(capabilities, 'Back Camera')).toBe('front')
    })

    test('should fall back to the label', async () => {
      expect(CameraFacingDetector.detect({}, 'Back Camera')).toBe('back')
    })
  })
})

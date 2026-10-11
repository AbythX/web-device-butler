import { describe, expect, test } from 'vitest'

import { CameraSettings } from './camera-settings.ts'
import { Resolution } from './resolution.ts'

describe('camera-settings', () => {
  test('should read what the track delivers', async () => {
    const sut = CameraSettings.fromTrack({ width: 1920, height: 1080, frameRate: 30, deviceId: 'back' })

    expect(sut).toEqual(new CameraSettings(1920, 1080, 30))
    expect(sut.resolution).toEqual(new Resolution(1920, 1080))
  })

  test('should have no resolution where the browser reports none', async () => {
    expect(CameraSettings.fromTrack({}).resolution).toBeUndefined()
  })

  test('should compare by value', async () => {
    const sut = new CameraSettings(1920, 1080, 30)

    expect(sut.equals(new CameraSettings(1920, 1080, 30))).toBe(true)
    expect(sut.equals(new CameraSettings(1280, 720, 30))).toBe(false)
    expect(sut.equals(new CameraSettings(1920, 1080, 60))).toBe(false)
  })
})

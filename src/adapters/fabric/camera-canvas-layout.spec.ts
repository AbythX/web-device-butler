import { describe, expect, test } from 'vitest'

import { CameraCanvasLayout } from './camera-canvas-layout.ts'

describe('camera-canvas-layout', () => {
  describe('.fit', () => {
    test('should keep the resolution of a picture that has the shape of the display', async () => {
      const layout = CameraCanvasLayout.fit({ width: 1920, height: 1080 }, { width: 960, height: 540 })

      expect(layout?.surface).toEqual({ width: 1920, height: 1080 })
      expect(layout?.display).toEqual({ width: 960, height: 540 })
      expect(layout?.overlayScale).toBe(2)
    })

    test('should crop the sides of a picture that is wider than the display', async () => {
      // a landscape camera on a phone that is held upright
      const layout = CameraCanvasLayout.fit({ width: 1920, height: 1080 }, { width: 360, height: 640 })

      expect(layout?.surface).toEqual({ width: 608, height: 1080 })
      expect(layout?.overlayScale).toBe(1.69)
    })

    test('should crop the top and the bottom of a picture that is taller than the display', async () => {
      const layout = CameraCanvasLayout.fit({ width: 1080, height: 1920 }, { width: 800, height: 600 })

      expect(layout?.surface).toEqual({ width: 1080, height: 810 })
      expect(layout?.overlayScale).toBe(1.35)
    })

    test('should give the surface the shape of the display', async () => {
      const display = { width: 412, height: 915 }

      const layout = CameraCanvasLayout.fit({ width: 1280, height: 720 }, display)

      const surface = layout?.surface ?? { width: 0, height: 1 }
      expect(surface.width / surface.height).toBeCloseTo(display.width / display.height, 2)
    })

    test.each([
      ['the camera has not delivered a picture', { width: 0, height: 0 }, { width: 800, height: 600 }],
      ['the display has no size', { width: 1920, height: 1080 }, { width: 0, height: 600 }],
      ['a size is negative', { width: 1920, height: 1080 }, { width: 800, height: -1 }],
    ])('should have no answer while %s', async (_name, source, display) => {
      expect(CameraCanvasLayout.fit(source, display)).toBeUndefined()
    })
  })
})

import { describe, expect, test } from 'vitest'

import { CameraConstraints } from './camera-constraints.ts'

describe('camera-constraints', () => {
  test('should ask for nothing if nothing is required or preferred', async () => {
    expect(CameraConstraints.for({})).toEqual({})
    expect(CameraConstraints.for({ require: { torch: true, facing: 'back' }, prefer: { zoom: true } })).toEqual({})
  })

  test('should ask for the closest the camera can do to what is preferred', async () => {
    const constraints = CameraConstraints.for({ prefer: { width: 1920, height: 1080, frameRate: 30 } })

    expect(constraints).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } })
  })

  test('should ask for what is required where nothing is preferred', async () => {
    const constraints = CameraConstraints.for({
      require: { width: 1280, height: 720, frameRate: 30 },
      prefer: { width: 1920, height: 1080 },
    })

    expect(constraints).toEqual({ width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } })
  })

  test('should let a field of the library win over the same raw constraint', async () => {
    const constraints = CameraConstraints.for({
      constraints: { width: { exact: 640 }, aspectRatio: 1 },
      prefer: { width: 1920 },
    })

    expect(constraints).toEqual({ width: { ideal: 1920 }, aspectRatio: 1 })
  })

  test('should say what the camera is asked to deliver', async () => {
    expect(CameraConstraints.delivery({ require: { height: 720 }, prefer: { torch: true, frameRate: 60 } })).toEqual({
      height: 720,
      frameRate: 60,
    })
  })
})

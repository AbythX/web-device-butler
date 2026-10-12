import 'reflect-metadata'

import { Container } from 'inversify'
import { describe, expect, test } from 'vitest'

import { DefaultDeviceButler } from '../../core/default-device-butler.ts'
import { BrowserEnvironment } from '../../core/environment/browser-environment.ts'
import { DeviceButlerBindings } from './device-butler-bindings.ts'
import { DeviceButlerContainerModule } from './device-butler-container-module.ts'

describe('device-butler-container-module', () => {
  const load = () => {
    const butler = DefaultDeviceButler.create({ camera: { require: { facing: 'back' } } }, BrowserEnvironment.of({}))
    const container = new Container()
    container.load(new DeviceButlerContainerModule(butler))

    return { butler, container }
  }

  test('should hand out the butler the application created', async () => {
    const { butler, container } = load()

    expect(container.get(DeviceButlerBindings.DeviceButler)).toBe(butler)
    expect(container.get(DeviceButlerBindings.DeviceButler)).toBe(container.get(DeviceButlerBindings.DeviceButler))
  })

  test('should hand out every part of the butler under its own identifier', async () => {
    const { butler, container } = load()

    expect(container.get(DeviceButlerBindings.Storage)).toBe(butler.storage)
    expect(container.get(DeviceButlerBindings.Camera)).toBe(butler.camera)
    expect(container.get(DeviceButlerBindings.Microphone)).toBe(butler.microphone)
    expect(container.get(DeviceButlerBindings.Media)).toBe(butler.media)
    expect(container.get(DeviceButlerBindings.Permission)).toBe(butler.permission)
    expect(container.get(DeviceButlerBindings.Coordination)).toBe(butler.coordination)
    expect(container.get(DeviceButlerBindings.Location)).toBe(butler.location)
    expect(container.get(DeviceButlerBindings.Platform)).toBe(butler.platform)
    expect(container.get(DeviceButlerBindings.Orientation)).toBe(butler.orientation)
  })

  test('should keep the type of what an identifier stands for', async () => {
    const { container } = load()

    // compiles only if the identifier carries the type of the camera manager
    expect(container.get(DeviceButlerBindings.Camera).configuration.require?.facing).toBe('back')
  })

  test('should use identifiers that do not collide with each other', async () => {
    const identifiers = Object.values(DeviceButlerBindings)

    expect(identifiers).toHaveLength(10)
    expect(new Set(identifiers).size).toBe(10)
  })

  test('should be unloadable', async () => {
    const butler = DefaultDeviceButler.create({}, BrowserEnvironment.of({}))
    const container = new Container()
    const module = new DeviceButlerContainerModule(butler)
    container.load(module)

    container.unload(module)

    expect(container.isBound(DeviceButlerBindings.DeviceButler)).toBe(false)
  })
})

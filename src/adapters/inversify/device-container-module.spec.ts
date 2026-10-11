import 'reflect-metadata'

import { Container } from 'inversify'
import { describe, expect, test } from 'vitest'

import { DefaultDevice } from '../../core/default-device.ts'
import { DeviceEnvironment } from '../../core/environment/device-environment.ts'
import { DeviceBindings } from './device-bindings.ts'
import { DeviceContainerModule } from './device-container-module.ts'

describe('device-container-module', () => {
  const load = () => {
    const device = DefaultDevice.create({ camera: { facing: 'back' } }, DeviceEnvironment.of({}))
    const container = new Container()
    container.load(new DeviceContainerModule(device))

    return { device, container }
  }

  test('should hand out the device the application created', async () => {
    const { device, container } = load()

    expect(container.get(DeviceBindings.Device)).toBe(device)
    expect(container.get(DeviceBindings.Device)).toBe(container.get(DeviceBindings.Device))
  })

  test('should hand out every part of the device under its own identifier', async () => {
    const { device, container } = load()

    expect(container.get(DeviceBindings.Storage)).toBe(device.storage)
    expect(container.get(DeviceBindings.Camera)).toBe(device.camera)
    expect(container.get(DeviceBindings.Microphone)).toBe(device.microphone)
    expect(container.get(DeviceBindings.Media)).toBe(device.media)
    expect(container.get(DeviceBindings.Permission)).toBe(device.permission)
    expect(container.get(DeviceBindings.Coordination)).toBe(device.coordination)
    expect(container.get(DeviceBindings.Location)).toBe(device.location)
    expect(container.get(DeviceBindings.Platform)).toBe(device.platform)
    expect(container.get(DeviceBindings.Orientation)).toBe(device.orientation)
  })

  test('should keep the type of what an identifier stands for', async () => {
    const { container } = load()

    // compiles only if the identifier carries the type of the camera manager
    expect(container.get(DeviceBindings.Camera).configuration.facing).toBe('back')
  })

  test('should use identifiers that do not collide with each other', async () => {
    const identifiers = Object.values(DeviceBindings)

    expect(identifiers).toHaveLength(10)
    expect(new Set(identifiers).size).toBe(10)
  })

  test('should be unloadable', async () => {
    const device = DefaultDevice.create({}, DeviceEnvironment.of({}))
    const container = new Container()
    const module = new DeviceContainerModule(device)
    container.load(module)

    container.unload(module)

    expect(container.isBound(DeviceBindings.Device)).toBe(false)
  })
})

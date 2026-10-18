import { describe, expect, test } from 'vitest'

import type { CameraManager } from '../../../media/camera/camera-manager.ts'
import type { MicrophoneManager } from '../../../media/microphone/microphone-manager.ts'
import type { MediaSession } from '../../../media/session/media-session.ts'
import { FakeOpener, FakeSession, flush } from '../testing/fake-session.ts'
import { CameraController } from './camera-controller.ts'
import { MicrophoneController } from './microphone-controller.ts'

const openWith = async (sut: { open(): Promise<unknown> }, opener: FakeOpener, session: FakeSession) => {
  const opening = sut.open()
  await flush()
  opener.succeed(session as unknown as MediaSession)
  await opening
}

describe('camera-controller', () => {
  test('should follow the camera and its settings, and stop following an ended session', async () => {
    const opener = new FakeOpener()
    const sut = new CameraController(() => opener as unknown as CameraManager)
    const session = Object.assign(new FakeSession(), { descriptor: { id: 'back' }, settings: { width: 640 } })

    await openWith(sut, opener, session)
    expect(sut.read()).toMatchObject({ descriptor: { id: 'back' }, settings: { width: 640 } })

    session.announce('devicechange', { id: 'front' })
    session.announce('settingschange', { width: 1280 })
    expect(sut.read()).toMatchObject({ descriptor: { id: 'front' }, settings: { width: 1280 } })

    await sut.close()
    session.announce('devicechange', { id: 'back' })
    expect(sut.read()).toMatchObject({ descriptor: undefined, settings: undefined })
  })
})

describe('microphone-controller', () => {
  const create = (measuresLevel: boolean) => {
    const opener = new FakeOpener()
    const sut = new MicrophoneController(() => opener as unknown as MicrophoneManager, measuresLevel)

    return { opener, sut }
  }

  test('should carry muting over to the next session', async () => {
    const { opener, sut } = create(false)

    sut.setMuted(true)
    const session = new FakeSession()
    await openWith(sut, opener, session)

    expect(session.muted).toBe(true)
    expect(sut.read().muted).toBe(true)

    session.announce('mutechange', false)
    expect(sut.read().muted).toBe(false)

    sut.setMuted(true)
    expect(session.muted).toBe(true)
  })

  test('should measure the level only while asked to', async () => {
    const { opener, sut } = create(false)
    const level = new FakeSession()
    const session = Object.assign(new FakeSession(), { level })
    await openWith(sut, opener, session)

    level.announce('change', 0.5)
    expect(sut.read().level).toBe(0)

    sut.setMeasuresLevel(true)
    level.announce('change', 0.5)
    expect(sut.read().level).toBe(0.5)

    sut.setMeasuresLevel(false)
    expect(sut.read().level).toBe(0)
    expect(level.listening).toBe(0)
  })
})

import { describe, expect, test } from 'vitest'

import type { MediaSession } from '../../../media/session/media-session.ts'
import { fake, FakeOpener, flush } from '../testing/fake-session.ts'
import { MediaSessionController } from './media-session-controller.ts'

describe('media-session-controller', () => {
  const create = () => {
    const opener = new FakeOpener()
    const sut = new MediaSessionController<MediaSession, Record<string, unknown>>(() => opener, {})

    return { opener, sut }
  }

  test('should open a session and follow its state', async () => {
    const { opener, sut } = create()

    const opening = sut.open({ facing: 'back' })
    expect(sut.read().isOpening).toBe(true)
    await flush()

    const session = opener.succeed()
    expect(await opening).toBe(session)
    expect(opener.requests).toEqual([{ facing: 'back' }])
    expect(sut.read()).toMatchObject({ session, state: 'live', isOpening: false, error: undefined })

    fake(session).changeState('muted')
    expect(sut.read().state).toBe('muted')
  })

  test('should say why a session ended', async () => {
    const { opener, sut } = create()
    const opening = sut.open()
    await flush()
    opener.succeed()
    await opening

    await sut.close()

    expect(sut.read()).toMatchObject({ session: undefined, state: undefined, ended: { reason: 'closed' } })
  })

  test('should keep a failure instead of throwing it', async () => {
    const { opener, sut } = create()
    const failure = new Error('no camera')

    const opening = sut.open()
    await flush()
    opener.fail(failure)

    expect(await opening).toBeUndefined()
    expect(sut.read()).toMatchObject({ session: undefined, isOpening: false, error: failure })
  })

  test('should open one session after the other and close the one before', async () => {
    const { opener, sut } = create()

    const first = sut.open()
    const second = sut.open()
    await flush()
    expect(opener.waiting).toBe(1)

    const firstSession = opener.succeed()
    await first
    await flush()
    expect(sut.read().isOpening).toBe(true)

    const secondSession = opener.succeed()
    await second

    expect(fake(firstSession).closes).toBe(1)
    expect(sut.read()).toMatchObject({ session: secondSession, isOpening: false })
  })

  test('should close a session that arrives after the component went away', async () => {
    const { opener, sut } = create()

    const opening = sut.open()
    await flush()
    sut.deactivate()
    const session = opener.succeed()

    expect(await opening).toBeUndefined()
    expect(fake(session).closes).toBe(1)
    expect(sut.read().session).toBeUndefined()
  })

  test('should close the session when the component goes away, and open again once it is back', async () => {
    const { opener, sut } = create()
    const opening = sut.open()
    await flush()
    const session = opener.succeed()
    await opening

    sut.deactivate()
    await flush()
    expect(fake(session).closes).toBe(1)
    expect(await sut.open()).toBeUndefined()

    sut.activate()
    const again = sut.open()
    await flush()
    const next = opener.succeed()

    expect(await again).toBe(next)
  })

  test('should tell its listeners once per change', async () => {
    const { opener, sut } = create()
    let changes = 0
    const unsubscribe = sut.subscribe(() => changes++)

    const opening = sut.open()
    await flush()
    opener.succeed()
    await opening
    unsubscribe()
    await sut.close()

    // the start of the opening, the session, the end of the opening
    expect(changes).toBe(3)
  })
})

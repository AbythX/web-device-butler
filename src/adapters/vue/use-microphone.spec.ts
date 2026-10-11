import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { effectScope, type EffectScope } from 'vue'

import type { MicrophoneManager } from '../../media/microphone/microphone-manager.ts'
import { MicrophoneTestBench } from '../../media/microphone/testing/microphone-test-bench.ts'
import { FakeAudioContext } from '../../media/testing/fake-audio-context.ts'
import { FakeMediaBrowser } from '../../media/testing/fake-media-browser.ts'
import { useMicrophone } from './use-microphone.ts'

const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

const waitFor = async (condition: () => boolean) => {
  for (let attempt = 0; attempt < 200 && !condition(); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
}

describe('use-microphone', () => {
  /** stands for the component a composable is used in */
  let scope!: EffectScope

  const within = <Result>(setup: () => Result): Result => scope.run(setup) as Result

  beforeEach(() => {
    scope = effectScope()
  })

  afterEach(() => {
    scope.stop()
  })

  let browser!: FakeMediaBrowser
  let manager!: MicrophoneManager

  beforeEach(() => {
    FakeAudioContext.reset()
    browser = new FakeMediaBrowser({ inputs: MicrophoneTestBench.computer() })
    manager = MicrophoneTestBench.load(browser)
  })

  afterEach(async () => {
    manager.dispose()
    await flush()
    browser.close()
  })

  test('should open a session and expose its settings', async () => {
    const microphone = within(() => useMicrophone(manager))

    const session = await microphone.open()

    expect(microphone.session.value).toBe(session)
    expect(microphone.state.value).toBe('live')
    expect(microphone.settings.value?.noiseSuppression).toBe(true)
  })

  test('should follow the processing', async () => {
    const microphone = within(() => useMicrophone(manager))
    const session = await microphone.open()

    await session?.processing.set({ noiseSuppression: false })

    expect(microphone.settings.value?.noiseSuppression).toBe(false)
  })

  test('should mute and unmute through the state', async () => {
    const microphone = within(() => useMicrophone(manager))
    const session = await microphone.open()

    microphone.muted.value = true
    expect(session?.muted).toBe(true)
    expect(session?.track.enabled).toBe(false)

    microphone.muted.value = false
    expect(session?.track.enabled).toBe(true)
  })

  test('should follow a mute the application made on the session', async () => {
    const microphone = within(() => useMicrophone(manager))
    const session = await microphone.open()

    if (session !== undefined) {
      session.muted = true
    }

    expect(microphone.muted.value).toBe(true)
  })

  test('should keep the mute for the next session', async () => {
    const microphone = within(() => useMicrophone(manager))
    microphone.muted.value = true

    const session = await microphone.open()

    expect(session?.muted).toBe(true)
  })

  test('should not measure the level unless it is asked to', async () => {
    const microphone = within(() => useMicrophone(manager))
    await microphone.open()
    await flush()

    expect(microphone.level.value).toBe(0)
    expect(FakeAudioContext.instances).toEqual([])
  })

  test('should measure the level while a session runs', async () => {
    const microphone = within(() => useMicrophone(manager, { level: true }))
    await microphone.open()
    await waitFor(() => microphone.level.value > 0)

    expect(microphone.level.value).toBeCloseTo(0.5)

    await microphone.close()

    expect(microphone.level.value).toBe(0)
    expect(FakeAudioContext.instances[0]?.state).toBe('closed')
  })

  test('should close the session when the component is unmounted', async () => {
    const microphone = within(() => useMicrophone(manager))
    const session = await microphone.open()

    scope.stop()
    await flush()

    expect(session?.state).toBe('ended')
  })

  test('should open one session after another when it is asked twice at once', async () => {
    const microphone = within(() => useMicrophone(manager))

    const [first, second] = await Promise.all([microphone.open(), microphone.open()])

    expect(first?.state).toBe('ended')
    expect(microphone.session.value).toBe(second)
    expect(microphone.isOpening.value).toBe(false)
    expect(browser.devices.liveTracks).toHaveLength(1)
  })
})

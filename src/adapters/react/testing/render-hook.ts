import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

// tells React that the specs wrap what changes state in `act()`
Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

export interface RenderedHook<Result> {
  /** what the hook returned in the last render */
  readonly result: { current: Result }
  /** why the component could not be rendered */
  readonly failure: { current: unknown }
  /** runs something that changes the state of the component and waits until React has rendered */
  act(work: () => unknown): Promise<void>
  unmount(): Promise<void>
}

/**
 * Renders a component that does nothing but call the hook, with the real React in a real page.
 *
 * @param wrap puts providers around the component
 */
export const renderHook = async <Result>(
  hook: () => Result,
  wrap: (component: ReactNode) => ReactNode = (component) => component
): Promise<RenderedHook<Result>> => {
  const result = { current: undefined as Result }
  const failure: { current: unknown } = { current: undefined }

  const Probe = (): null => {
    result.current = hook()

    return null
  }

  const root = createRoot(document.createElement('div'), {
    onUncaughtError: (error) => {
      failure.current = error
    },
  })

  try {
    await act(async () => root.render(wrap(createElement(Probe))))
  } catch (error) {
    // React hands what a component throws while it renders to whoever waits for the render
    failure.current = error
  }

  return {
    result,
    failure,
    act: (work) => act(async () => void (await work())),
    unmount: () => act(async () => root.unmount()),
  }
}

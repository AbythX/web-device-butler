import { userEvent } from 'vitest/browser'

/**
 * Runs the action the way a browser wants it for what only the user may start, such as filling the screen or
 * copying: from the listener of a click that the browser takes for a real one.
 *
 * @returns what the action resolved with, or the error it rejected with
 */
export const inAnswerToAClick = async <Result>(action: () => Promise<Result>): Promise<Result | Error> => {
  const button = document.createElement('button')
  button.textContent = 'Go'
  document.body.append(button)

  let outcome: Promise<Result | Error> | undefined

  button.addEventListener('click', () => {
    outcome = action().catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  })

  try {
    await userEvent.click(button)

    return await (outcome ?? Promise.resolve(new Error('The click did not arrive')))
  } finally {
    button.remove()
  }
}

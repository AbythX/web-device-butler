/**
 * Waits until the condition holds, for three seconds at most. What is expected is asserted afterwards, so a
 * condition that never holds fails there.
 */
export const waitFor = async (condition: () => boolean | Promise<boolean>): Promise<void> => {
  for (let attempt = 0; attempt < 300 && !(await condition()); attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

import { PageLogger } from './page-logger.ts'

/**
 * What the demo pages share: the log on the page, the status line and the helpers that turn buttons into measured
 * calls. A page needs an element `log` and an element `status`.
 */
export abstract class DemoPage {
  protected readonly logger: PageLogger
  /** what the buttons did and how long it took */
  protected readonly timings: Record<string, unknown>[] = []

  protected constructor(protected readonly page: Document) {
    this.logger = new PageLogger(this.element('log'))
  }

  /**
   * Called after every action, whether it failed or not. A page shows here what an action can have changed.
   */
  protected refresh(): void {}

  /**
   * Runs what a button does, measures it and shows how it ended.
   */
  protected async run(name: string, action: () => unknown): Promise<void> {
    const startedAt = performance.now()
    this.status(`${name} ...`)

    try {
      await action()
      const duration = Math.round(performance.now() - startedAt)
      this.timings.push({ name, duration })

      if (this.element('status').textContent === `${name} ...`) {
        this.status(`${name}: done after ${duration} ms`)
      }
    } catch (error) {
      // SAFETY: only name and message are read, and both are optional below; a value that is not an error shows as
      // undefined
      const { name: errorName, message } = error as Error
      this.timings.push({ name, duration: Math.round(performance.now() - startedAt), error: errorName, message })
      this.status(`${name}: ${errorName}: ${message}`, true)
      this.logger.error(`${name} failed`, error)
    }

    this.refresh()
  }

  protected status(text: string, isError = false): void {
    const status = this.element('status')
    status.textContent = text
    status.classList.toggle('error', isError)
  }

  protected describe(id: string, facts: Record<string, string>): void {
    const entries = Object.entries(facts).flatMap(([term, description]) => {
      const dt = this.page.createElement('dt')
      const dd = this.page.createElement('dd')
      dt.textContent = term
      dd.textContent = description

      return [dt, dd]
    })

    this.element(id).replaceChildren(...entries)
  }

  protected button(label: string, action: () => unknown): HTMLButtonElement {
    const button = this.page.createElement('button')
    button.textContent = label
    button.addEventListener('click', () => void this.run(label, action))

    return button
  }

  protected slider(
    name: string,
    min: number,
    max: number,
    step: number,
    value: number,
    action: (value: number) => unknown
  ): HTMLLabelElement {
    const input = this.page.createElement('input')
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step) })
    input.value = String(value)
    input.addEventListener('change', () => void this.run(`${name} ${input.value}`, () => action(Number(input.value))))

    const label = this.page.createElement('label')
    label.append(`${name} `, input)

    return label
  }

  /**
   * A row of a table with one cell per text.
   */
  protected row(...cells: readonly (string | Node)[]): HTMLTableRowElement {
    const row = this.page.createElement('tr')

    for (const cell of cells) {
      row.insertCell().append(cell)
    }

    return row
  }

  protected onClick(id: string, action: () => unknown): void {
    const button = this.element(id)
    button.addEventListener('click', () => void this.run(button.textContent ?? id, action))
  }

  protected element<Element extends HTMLElement = HTMLElement>(id: string): Element {
    const element = this.page.getElementById(id)

    if (element === null) {
      throw new Error(`The page has no element '${id}'`)
    }

    // SAFETY: not checked: the caller names the class the element has in the HTML of its own page
    return element as Element
  }

  /**
   * A number of bytes the way a person reads it.
   */
  protected static bytes(bytes: number | undefined): string {
    if (bytes === undefined) {
      return 'unknown'
    }

    if (bytes < 1024) {
      return `${bytes} B`
    }

    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let unit = 0

    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024
      unit += 1
    }

    return `${value.toFixed(1)} ${units[unit]}`
  }
}

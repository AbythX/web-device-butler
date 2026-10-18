/**
 * The state of a hook of React or a composable of Vue, without the framework: it holds the state as an immutable
 * snapshot, does what the hook does, and tells its listeners after every change. The adapters only bind it.
 *
 * A controller is active from the start. A component that goes away deactivates it, which ends what it runs and makes
 * it ignore what arrives later. React's strict mode mounts a component again after that, so it can be activated again.
 */
export abstract class StateController<Snapshot extends object> {
  private current: Snapshot
  private active = true
  private readonly listeners = new Set<() => void>()

  protected constructor(initial: Snapshot) {
    this.current = initial
  }

  /**
   * The current state; a new object after every change, so React can compare it.
   */
  public readonly read = (): Snapshot => this.current

  /**
   * @returns stops listening
   */
  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  /**
   * Called when the component is mounted, also again after {@link deactivate}.
   */
  public activate(): void {
    this.active = true
  }

  /**
   * Called when the component goes away: ends what runs, and ignores what arrives later.
   */
  public deactivate(): void {
    this.active = false
    this.onDeactivate()
  }

  protected get isActive(): boolean {
    return this.active
  }

  /**
   * Changes the fields in one step, so the component renders once. Fields that keep their value change nothing.
   */
  protected change(partial: Partial<Snapshot>): void {
    // SAFETY: the keys of a partial snapshot are fields of the snapshot
    const fields = Object.keys(partial) as (keyof Snapshot)[]

    if (fields.every((field) => Object.is(partial[field], this.current[field]))) {
      return
    }

    this.current = { ...this.current, ...partial }

    for (const listener of [...this.listeners]) {
      listener()
    }
  }

  /**
   * Ends what the controller runs.
   */
  protected onDeactivate(): void {}
}

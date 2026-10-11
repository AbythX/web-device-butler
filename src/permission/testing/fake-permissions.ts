/**
 * A `PermissionStatus` for specs.
 */
export class FakePermissionStatus {
  private readonly listeners = new Set<() => void>()

  public constructor(public state: PermissionState) {}

  public get listenerCount(): number {
    return this.listeners.size
  }

  public addEventListener(_type: 'change', listener: () => void): void {
    this.listeners.add(listener)
  }

  public removeEventListener(_type: 'change', listener: () => void): void {
    this.listeners.delete(listener)
  }

  public change(state: PermissionState): void {
    this.state = state

    for (const listener of [...this.listeners]) {
      listener()
    }
  }
}

/**
 * `navigator.permissions` for specs. Like a browser, it rejects the names it does not know.
 */
export class FakePermissions {
  private readonly statuses = new Map<string, FakePermissionStatus>()

  /**
   * @param names the permissions this browser can be asked about
   */
  public constructor(names: readonly string[] = ['camera', 'microphone', 'geolocation', 'persistent-storage']) {
    names.forEach((name) => this.statuses.set(name, new FakePermissionStatus('prompt')))
  }

  public readonly query = async (descriptor: { name: string }): Promise<PermissionStatus> => {
    const status = this.statuses.get(descriptor.name)

    if (status === undefined) {
      throw new TypeError(`'${descriptor.name}' is not a valid value for enumeration PermissionName`)
    }

    return status as unknown as PermissionStatus
  }

  public status(name: string): FakePermissionStatus {
    const status = this.statuses.get(name)

    if (status === undefined) {
      throw new Error(`The fake browser does not know the permission '${name}'`)
    }

    return status
  }

  /**
   * Changes a permission the way a user does in the settings of the browser.
   */
  public set(name: string, state: PermissionState): void {
    this.status(name).change(state)
  }
}

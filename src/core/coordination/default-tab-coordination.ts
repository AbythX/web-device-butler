import type { CrossTabLock } from './lock/cross-tab-lock.ts'
import type { TabCoordination } from './tab-coordination.ts'

/**
 * The implementation of {@link TabCoordination}.
 */
export class DefaultTabCoordination implements TabCoordination {
  public constructor(private readonly lock: CrossTabLock) {}

  public get isCrossTab(): boolean {
    return this.lock.isCrossTab
  }
}

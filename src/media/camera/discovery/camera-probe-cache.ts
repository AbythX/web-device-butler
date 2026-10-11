import type { Logger } from '../../../core/logging/logger.ts'
import type { StorageManager } from '../../../storage/storage-manager.ts'
import type { Store } from '../../../storage/store/store.ts'
import { CameraDescriptor, type CameraDescriptorValues } from '../model/camera-descriptor.ts'

/**
 * What the cache keeps.
 */
interface CameraProbeRecord {
  /** the format of the record */
  version: number
  /** the ids of every camera that was listed when the cameras were looked at, sorted */
  ids: string[]
  /** the cameras that were looked at */
  cameras: CameraDescriptorValues[]
}

/**
 * Remembers what the cameras can do, so they are only started to find that out on the first visit.
 *
 * The record belongs to one set of cameras. Browsers give cameras new ids when the user clears the site data, and
 * cameras are plugged in and removed; as soon as the listed cameras differ from the remembered ones, the record is
 * thrown away.
 *
 * The cache never fails a call. Storage that does not work means that nothing is remembered.
 */
export class CameraProbeCache {
  private static readonly version = 1
  private static readonly namespace = 'camera-probes'
  private static readonly key = 'cameras'

  private store: Promise<Store<unknown>> | undefined

  /**
   * @param openStore opens the store of the cache, on first use
   */
  public constructor(
    private readonly openStore: () => Promise<Store<unknown>>,
    private readonly logger: Logger
  ) {}

  /**
   * A cache in a store of the library: `localStorage`, or the memory of the page where that is not available.
   */
  public static in(storage: StorageManager, logger: Logger): CameraProbeCache {
    return new CameraProbeCache(
      () => storage.open({ driver: ['local', 'memory'], namespace: CameraProbeCache.namespace }),
      logger
    )
  }

  /**
   * Replaces the listed cameras by what is remembered about them. Throws the record away if it belongs to another
   * set of cameras.
   *
   * @param listed every camera the browser lists right now
   */
  public async apply(listed: readonly CameraDescriptor[]): Promise<CameraDescriptor[]> {
    const ids = CameraProbeCache.idsOf(listed)

    if (ids === undefined) {
      return [...listed]
    }

    const record = await this.read()

    if (record === undefined) {
      return [...listed]
    }

    if (!CameraProbeCache.isSameSet(record.ids, ids)) {
      this.logger.debug('The cameras are not the remembered ones, forgetting what they could do')
      await this.clear()

      return [...listed]
    }

    const remembered = new Map(CameraProbeCache.descriptorsOf(record).map((camera) => [camera.id, camera]))

    return listed.map((camera) => {
      const known = remembered.get(camera.id)

      return known === undefined
        ? camera
        : // the label is taken from the list: it changes with the language of the system
          new CameraDescriptor(camera.id, camera.groupId, camera.label, 'probed', known.facing, known.features)
    })
  }

  /**
   * Everything that is remembered, whether or not the cameras are still the same. For a tab that cannot list the
   * cameras because another tab holds them.
   */
  public async all(): Promise<CameraDescriptor[]> {
    const record = await this.read()

    return record === undefined ? [] : CameraProbeCache.descriptorsOf(record)
  }

  /**
   * Adds cameras that were looked at. Safe when several tabs do it at once.
   *
   * @param listed every camera the browser lists right now
   */
  public async remember(listed: readonly CameraDescriptor[], probed: readonly CameraDescriptor[]): Promise<void> {
    const ids = CameraProbeCache.idsOf(listed)

    if (ids === undefined || probed.length === 0) {
      return
    }

    try {
      const store = await this.opened()
      await store.update(CameraProbeCache.key, (current) => {
        const record = CameraProbeCache.recordOf(current)

        const kept =
          record !== undefined && CameraProbeCache.isSameSet(record.ids, ids)
            ? record.cameras.filter((camera) => !probed.some((descriptor) => descriptor.id === camera.id))
            : []

        return {
          version: CameraProbeCache.version,
          ids,
          cameras: [...kept, ...probed.map((descriptor) => descriptor.toJSON())],
        } satisfies CameraProbeRecord
      })
    } catch (error) {
      this.logger.warn('Could not remember what the cameras can do', error)
    }
  }

  /**
   * Forgets what the cameras can do, so they are started again to find out. A failure is logged, not thrown.
   */
  public async clear(): Promise<void> {
    try {
      const store = await this.opened()
      await store.delete(CameraProbeCache.key)
    } catch (error) {
      this.logger.warn('Could not forget what the cameras could do', error)
    }
  }

  private opened(): Promise<Store<unknown>> {
    this.store ??= this.openStore()
    // a store that could not be opened is tried again next time
    this.store.catch(() => (this.store = undefined))

    return this.store
  }

  private async read(): Promise<CameraProbeRecord | undefined> {
    try {
      const store = await this.opened()

      return CameraProbeCache.recordOf(await store.get(CameraProbeCache.key))
    } catch (error) {
      this.logger.warn('Could not read what the cameras can do', error)

      return undefined
    }
  }

  /**
   * @returns `undefined` for what another version of the library wrote in a format this one does not know
   */
  private static recordOf(value: unknown): CameraProbeRecord | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined
    }

    // SAFETY: checked above to be an object; every property is still unknown and checked below
    const { version, ids, cameras } = value as Record<string, unknown>

    if (
      version !== CameraProbeCache.version ||
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === 'string') ||
      !Array.isArray(cameras)
    ) {
      return undefined
    }

    return { version, ids, cameras }
  }

  private static descriptorsOf(record: CameraProbeRecord): CameraDescriptor[] {
    return record.cameras.map((camera) => CameraDescriptor.fromJSON(camera)).filter((camera) => camera !== undefined)
  }

  /**
   * @returns `undefined` if the list does not identify the cameras: it is empty, or the browser withholds the ids
   */
  private static idsOf(listed: readonly CameraDescriptor[]): string[] | undefined {
    const ids = listed.map((camera) => camera.id)

    return ids.length === 0 || ids.some((id) => id.length === 0) ? undefined : ids.sort()
  }

  private static isSameSet(first: readonly string[], second: readonly string[]): boolean {
    return first.length === second.length && first.every((id, index) => id === second[index])
  }
}

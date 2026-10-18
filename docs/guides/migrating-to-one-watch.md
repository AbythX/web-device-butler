# Migrating to one shape for the watches

The three watches, of the location, of the sensors and of the storage space, share one shape now: `current` is the
latest value, `change` announces a new one, `isActive` tells whether the watch runs and `stop()` ends it. They were
renamed without a period in which both names worked. The compiler finds every place: the old names are no longer
part of the types.

The watches of the sensors (`butler.motion.watchAttitude()`, `watchMotion()`) had that shape already. Nothing that
was written for them has to change.

## Location

| Before                              | After                             |
| ----------------------------------- | --------------------------------- |
| `watch.position`                    | `watch.current`                   |
| `watch.on('position', (position) => …)` | `watch.on('change', (position) => …)` |

`error`, `isActive` and `stop()` stay as they were. The hook keeps its name: `useLocation()` still returns
`position`.

## Storage space

| Before                  | After                                        |
| ----------------------- | -------------------------------------------- |
| `watch.dispose()`       | `watch.stop()`                               |
| —                       | `watch.isActive`, `false` once it has stopped |

A watch declared with `using` stops at the end of its block as before.

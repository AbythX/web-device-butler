# Recording a route

**Goal.** The application follows the device while the user walks, shows the distance and keeps the points, so a
reload or a closed tab does not lose the route.

**Demo.** `pnpm demo`, page `location/`: `watch()` lists the positions and the distance from the start. There is no
page for the whole use case.

## Following the device

```ts
const watch = butler.location.watch({ highAccuracy: true, maximumAge: 0 })
```

`highAccuracy` asks for GPS, which a route needs and which costs battery. To keep the coarse positions of the
first seconds out of the route, require an accuracy: `watch({ highAccuracy: true, require: { accuracy: 30 } })`
only announces positions that are at most 30 metres off. The call can show the permission prompt,
so make it from the click on "Start".

```ts
interface Point {
  latitude: number
  longitude: number
  timestamp: number
}

const points: Point[] = []
let distance = 0
let last: DevicePosition | undefined

watch.on('position', (position) => {
  // a position that is less certain than 30 m would draw a zigzag
  if (position.accuracy > 30) return
  // standing still jitters by a few metres; count only real movement
  if (last && last.distanceTo(position) < Math.max(5, position.accuracy)) return

  if (last) distance += last.distanceTo(position)
  last = position
  points.push({ latitude: position.latitude, longitude: position.longitude, timestamp: position.timestamp })
  showDistance(distance)
})
```

`distanceTo()` is the distance along the surface of the earth in metres. `position.speed` and `position.heading`
are there where the device reports them and `undefined` otherwise.

## Problems on the way

```ts
watch.on('error', (error) => {
  if (!watch.isActive) {
    // the permission was refused or taken away: the watch has stopped
    showProblem('The location is blocked. Allow it in the settings of the browser.')
  } else {
    // LocationUnavailableError, LocationTimeoutError: a tunnel, a building. The watch goes on.
    showNotice('No position right now.')
  }
})
```

## Keeping the route

Appending with `update()` is one step, also if a second tab shows the same route:

```ts
const routes = await butler.storage.open<Point[]>({ driver: ['indexeddb', 'local'], namespace: 'routes' })

const append = (point: Point) => routes.update(routeId, (stored = []) => [...stored, point])
```

That rewrites the whole route for every point, which is fine for a walk and slow for a day of driving. For long
routes, store segments: one entry per hundred points (`${routeId}/0`, `${routeId}/1`, ...), so a write stays small.

After a reload, `routes.get(routeId)` brings the route back and a new watch continues it.

## Stopping

```ts
watch.stop()
```

Or let the scope do it:

```ts
using watch = butler.location.watch({ highAccuracy: true })
```

`butler.dispose()` stops every watch.

## The limit: the background

A browser stops delivering positions to a page that is not visible, on phones soon after the screen is locked. A
web page cannot record a route from the pocket; there is no permission for it. Say so in the application, and keep
the screen on while a route is recorded, for example with the Screen Wake Lock API of the browser, which is outside
of this library.

## With Vue

```ts
import { useLocation } from 'web-device-butler/vue'

const { position, error, isWatching, start, stop } = useLocation(butler.location)

start({ highAccuracy: true }) // from a click
watch(position, (current) => current && addPoint(current))
```

The watch is stopped when the component is unmounted.

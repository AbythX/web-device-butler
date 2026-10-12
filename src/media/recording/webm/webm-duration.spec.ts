import { describe, expect, test } from 'vitest'

import { WebmDuration } from './webm-duration.ts'

/** the ids of the elements a WebM file begins with */
const ids = {
  ebml: [0x1a, 0x45, 0xdf, 0xa3],
  segment: [0x18, 0x53, 0x80, 0x67],
  seekHead: [0x11, 0x4d, 0x9b, 0x74],
  info: [0x15, 0x49, 0xa9, 0x66],
  tracks: [0x16, 0x54, 0xae, 0x6b],
  cluster: [0x1f, 0x43, 0xb6, 0x75],
  timestampScale: [0x2a, 0xd7, 0xb1],
  muxingApp: [0x4d, 0x80],
  duration: [0x44, 0x89],
}

/** a size that says "until the end", as a recorder writes it */
const untilTheEnd = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]

/** an element with a size of one byte */
const element = (id: number[], content: number[]): number[] => [...id, 0x80 | content.length, ...content]

/** an element whose size is written the way it is given */
const sized = (id: number[], size: number[], content: number[]): number[] => [...id, ...size, ...content]

const float64 = (value: number): number[] => {
  const bytes = new Uint8Array(8)
  new DataView(bytes.buffer).setFloat64(0, value)

  return [...bytes]
}

const header = element(ids.ebml, [0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d])

const muxingApp = element(ids.muxingApp, [0x61, 0x62])

const tracks = element(ids.tracks, [0x01, 0x02, 0x03])

const cluster = sized(ids.cluster, untilTheEnd, [0xaa, 0xbb, 0xcc, 0xdd])

/** a file the way a recorder writes it: nothing says how long it is */
const recorded = (info: number[] = muxingApp, before: number[] = []) =>
  Uint8Array.from([
    ...header,
    ...sized(ids.segment, untilTheEnd, [...before, ...element(ids.info, info), ...tracks, ...cluster]),
  ])

const durationField = (duration: number) => [...ids.duration, 0x88, ...float64(duration)]

describe('webm-duration', () => {
  describe('#patch', () => {
    test('should add the length to the info of a file that has none', async () => {
      const file = recorded()

      const patched = WebmDuration.patch(file, 2500)

      expect([...(patched?.head ?? [])]).toEqual([
        ...header,
        ...ids.segment,
        ...untilTheEnd,
        ...element(ids.info, [...muxingApp, ...durationField(2500)]),
      ])
      // everything after the info stays as it is
      expect(patched?.replaced).toBe(file.length - tracks.length - cluster.length)
    })

    test('should write the length in the scale of the file', async () => {
      // a scale of 500 000 nanoseconds: one unit is half a millisecond
      const scale = element(ids.timestampScale, [0x07, 0xa1, 0x20])

      const patched = WebmDuration.patch(recorded(scale), 2500)

      expect([...(patched?.head ?? [])].slice(-10)).toEqual(durationField(5000).slice(-10))
    })

    test('should let a segment that says how long it is grow by what was added', async () => {
      const content = [...element(ids.info, muxingApp), ...tracks]
      const file = Uint8Array.from([...header, ...element(ids.segment, content)])

      const patched = WebmDuration.patch(file, 1000)

      const segmentSize = patched?.head[header.length + ids.segment.length]
      expect(segmentSize).toBe(0x80 | (content.length + 11))
    })

    test('should take a size that does not fit any more for "until the end"', async () => {
      // 120 bytes of content leave no room for eleven more in a size of one byte
      const padding = Array.from<number>({ length: 104 }).fill(0)
      const content = [...element(ids.info, muxingApp), ...element(ids.tracks, padding)]
      const file = Uint8Array.from([...header, ...element(ids.segment, content)])

      const patched = WebmDuration.patch(file, 1000)

      expect(patched?.head[header.length + ids.segment.length]).toBe(0xff)
    })

    test('should give the info a longer size where the added length needs one', async () => {
      // 121 bytes of info and eleven more are too many for a size of one byte
      const long = element(ids.muxingApp, Array.from<number>({ length: 118 }).fill(0x61))

      const patched = WebmDuration.patch(recorded(long), 1000)
      const info = [...(patched?.head ?? [])].slice(header.length + ids.segment.length + untilTheEnd.length)

      expect(info.slice(0, 6)).toEqual([...ids.info, 0x40, 132])
      expect(info).toHaveLength(4 + 2 + 132)
    })

    test.each([
      ['eight', [...ids.duration, 0x88, ...float64(0)], [...ids.duration, 0x88, ...float64(2500)]],
      ['four', [...ids.duration, 0x84, 0, 0, 0, 0], [...ids.duration, 0x84, 0x45, 0x1c, 0x40, 0x00]],
    ])('should fill in a length of %s bytes that the recorder left at zero', async (_name, empty, filled) => {
      const file = recorded([...empty, ...muxingApp])

      const patched = WebmDuration.patch(file, 2500)

      // nothing moves: the head has the length it had
      expect(patched?.replaced).toBe(patched?.head.length)
      expect([...(patched?.head ?? [])]).toEqual([
        ...header,
        ...ids.segment,
        ...untilTheEnd,
        ...element(ids.info, [...filled, ...muxingApp]),
      ])
    })

    test('should read past an index of positions that is empty', async () => {
      const patched = WebmDuration.patch(recorded(muxingApp, element(ids.seekHead, [])), 1000)

      expect(patched).toBeDefined()
    })

    test.each([
      ['a file that has its length', recorded([...muxingApp, ...durationField(1)])],
      ['something that is not a WebM file', Uint8Array.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70])],
      ['nothing', new Uint8Array()],
      ['a file that is cut off inside its info', recorded().slice(0, header.length + 16)],
      [
        'a file without an info before its data',
        Uint8Array.from([...header, ...sized(ids.segment, untilTheEnd, cluster)]),
      ],
      ['a file with an index of positions', recorded(muxingApp, element(ids.seekHead, [0x01]))],
      ['a file whose scale is zero', recorded(element(ids.timestampScale, [0x00]))],
    ])('should not change %s', async (_name, file) => {
      expect(WebmDuration.patch(file, 1000)).toBeUndefined()
    })
  })

  describe('#apply', () => {
    const createBlob = (parts: BlobPart[], type: string) => new Blob(parts, { type })

    test('should return the recording with its length written into it', async () => {
      const file = recorded()
      const recording = new Blob([file], { type: 'video/webm;codecs=vp9' })

      const fixed = await WebmDuration.apply(recording, 2500, createBlob)
      const bytes = new Uint8Array(await fixed.arrayBuffer())

      expect(fixed.type).toBe('video/webm;codecs=vp9')
      expect(bytes).toHaveLength(file.length + 11)
      // the data of the recording is still at its end
      expect([...bytes.slice(-cluster.length)]).toEqual(cluster)
      expect(WebmDuration.patch(bytes, 2500)).toBeUndefined()
    })

    test('should return the blob it was given if nothing is to change', async () => {
      const recording = new Blob(['not a recording'], { type: 'video/mp4' })

      expect(await WebmDuration.apply(recording, 1000, createBlob)).toBe(recording)
    })
  })
})

# arcade-waypoints

A MakeCode Arcade extension that turns colour-coded tilemap markers into an ordered list of race track waypoints, for driving AI-controlled racers around a track.

## The idea

In a top-down driving game, you can mark out a track by painting coloured tiles along its centre line in the tilemap editor:

* Exactly **one** tile of a "start" colour (e.g. purple) - this is the start/finish line.
* One or more tiles of a second colour (e.g. blue) for the next stretch of track.
* One or more tiles of a third colour (e.g. red), then a fourth (e.g. yellow), and so on, for as many colour bands as your track needs.

This extension scans the tilemap for those tiles, and orders each colour's tiles using a nearest-neighbor search (starting from wherever the previous colour left off), so the tiles come out in the order a car should drive over them - even though `array of all tile locations` (the built-in tilemap block this extension is built on) returns them in an arbitrary order.

The result is a `Track`, an ordered array of waypoints that a computer-controlled sprite can steer towards, one at a time, looping back to the start for every lap of the race.

## Marking your track

1. Paint your track's centre line with 4 (or more) different single-purpose tiles, one colour per band of the track, in the order the track should be driven.
2. Make sure there is only **one** tile of the first colour - it's used as the unique start/finish line.
3. Build an array of those tile images, in order, and pass it to `build waypoint track from tiles`.

```blocks
let track: waypoints.Track = null
track = waypoints.buildTrack([
    assets.tile`start`,
    assets.tile`checkpoint1`,
    assets.tile`checkpoint2`,
    assets.tile`checkpoint3`
])
```

## Driving through the waypoints

Keep an index per racer and move it forward every time the racer reaches its current target. `waypoint at index` wraps back around to the start automatically, so the same ever-increasing index works across every lap of the race:

```blocks
let track: waypoints.Track = null
let raceIndex = 0
let target: tiles.Location = null

track = waypoints.buildTrack([assets.tile`start`, assets.tile`checkpoint1`])
target = waypoints.waypointAt(track, raceIndex)

game.onUpdate(function () {
    // steer/accelerate the opponent sprite towards `target` here, then:
    // if the sprite has reached `target`, advance to the next waypoint
    raceIndex += 1
    target = waypoints.waypointAt(track, raceIndex)
})
```

If you'd rather work with a plain array (for example to use a `for each` loop), use `array of waypoints in`:

```blocks
let track: waypoints.Track = null
track = waypoints.buildTrack([assets.tile`start`, assets.tile`checkpoint1`])
for (let waypoint of waypoints.toArray(track)) {
    // ...
}
```

## Notes and limitations

* Waypoints are found on the tilemap that's currently active in the scene (the same tilemap `array of all tile locations` and other `tiles` blocks operate on).
* If the first colour marks more than one tile, the extension logs a warning and uses the first one it finds; if it finds none, the resulting track is empty.
* Within a colour band, tiles are chained together by proximity only (nearest neighbor), so avoid looping a single colour band back near itself, or the search may take a shortcut across the loop instead of following the intended path.

## API

### waypoints.buildTrack(tileColours: Image[]): waypoints.Track

Scan the tilemap for the given sequence of marker tile colours and return them as an ordered waypoint track. The first colour must mark exactly one tile (the start/finish line); every colour after that can mark one or more tiles.

### waypoints.waypointAt(track: waypoints.Track, index: number): tiles.Location

Get the waypoint at the given index of a track, wrapping around to the start once the index runs past the end - safe to call with an ever-increasing index across multiple laps.

### waypoints.count(track: waypoints.Track): number

Get the number of waypoints in a track.

### waypoints.toArray(track: waypoints.Track): tiles.Location[]

Get the ordered waypoints of a track as a plain array, for use with `for each` loops.

## Supported targets

* for PXT/arcade
(The metadata above is needed for package search.)

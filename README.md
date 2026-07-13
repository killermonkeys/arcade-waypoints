# arcade-waypoints

A MakeCode Arcade extension that turns colour-coded tilemap markers into an ordered list of race track waypoints, for driving AI-controlled racers around a track.

## The idea

In a top-down driving game, you can mark out a track by painting coloured tiles along its centre line in the tilemap editor:

* Exactly **one** tile of a "start" colour (e.g. purple) - this is the start/finish line.
* One or more tiles of a second colour (e.g. blue) for the next stretch of track.
* One or more tiles of a third colour (e.g. red), then a fourth (e.g. yellow), and so on, for as many colour bands as your track needs.

This extension scans a tilemap for those tiles, and orders each colour's tiles using a nearest-neighbor search (starting from wherever the previous colour left off), so the tiles come out in the order a car should drive over them - even though the tilemap itself stores them in no particular order.

The result is a plain, ordered array of waypoints that a computer-controlled sprite can steer towards, one at a time, looping back to the start for every lap of the race.

## Marking your track

1. Paint your track's centre line with 4 (or more) different single-purpose tiles, one colour per band of the track, in the order the track should be driven.
2. Make sure there is only **one** tile of the first colour - it's used as the unique start/finish line. The game will stop with an error if it finds more than one.
3. Build the ordered list of those tile colours - the `create list with` block is expandable, so add as many colours as your track needs with the `+` button.
4. Pass your tilemap (as a `tilemap` block) and that list to `waypoints on tilemap ... with tile colours ...`.

```blocks
let waypointList: tiles.Location[] = null
waypointList = waypoints.buildTrack(tilemap`level`, [
    assets.tile`start`,
    assets.tile`checkpoint1`,
    assets.tile`checkpoint2`,
    assets.tile`checkpoint3`
])
```

## Driving through the waypoints

Keep an index per racer and move it forward every time the racer reaches its current target. `waypoint at index` wraps back around to the start automatically, so the same ever-increasing index works across every lap of the race:

```blocks
let waypointList: tiles.Location[] = null
let raceIndex = 0
let target: tiles.Location = null

waypointList = waypoints.buildTrack(tilemap`level`, [assets.tile`start`, assets.tile`checkpoint1`])
target = waypoints.waypointAt(waypointList, raceIndex)

game.onUpdate(function () {
    // steer/accelerate the opponent sprite towards `target` here, then:
    // if the sprite has reached `target`, advance to the next waypoint
    raceIndex += 1
    target = waypoints.waypointAt(waypointList, raceIndex)
})
```

Because the result is a plain array of `tiles.Location`, you can also use it directly with the built-in `for each` and `length of` array blocks.

## Notes and limitations

* If the first colour marks more than one tile, the game stops with an error (`control.fail`) - fix your tilemap so that colour only marks a single start/finish tile.
* If the first colour marks no tiles at all, the resulting list is empty (logged as a warning, not a fatal error).
* Within a colour band, tiles are chained together by proximity only (nearest neighbor), so avoid looping a single colour band back near itself, or the search may take a shortcut across the loop instead of following the intended path.
* Waypoint ordering is computed from the tilemap's column/row grid, so it works correctly even if the tilemap you pass in isn't the one currently active in the scene.

## API

### waypoints.buildTrack(tilemap: tiles.TileMapData, tileColours: Image[]): tiles.Location[]

Scan the given tilemap for the given sequence of marker tile colours and return them as an ordered array of waypoints. The first colour must mark exactly one tile (the start/finish line); every colour after that can mark one or more tiles.

### waypoints.waypointAt(waypointList: tiles.Location[], index: number): tiles.Location

Get the waypoint at the given index of a waypoint list, wrapping around to the start once the index runs past the end - safe to call with an ever-increasing index across multiple laps.

## Supported targets

* for PXT/arcade
(The metadata above is needed for package search.)

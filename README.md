# arcade-vehicles

A MakeCode Arcade extension for top-down vehicles (cars, boats, planes, and similar): angle + speed physics, tile surfaces that change grip/traction/friction, and optional colour-coded waypoint tracks so AI can drive with the same controls as the player.

You do **not** need arcade-sprite-util, arcade-sprite-data, or sprite-fx for vehicle angle, speed, facing, or velocity — those pieces are built in.

## Quick start

```blocks
let playerSprite: Sprite = null
let playerCar: vehicles.Vehicle = null
let opponentCar: vehicles.Vehicle = null
let waypointList: waypoints.WaypointList = null

tiles.setCurrentTilemap(tilemap`level0`)

// Wrap an existing sprite (same instance — setPosition / overlaps / camera still use it)
playerSprite = sprites.create(assets.image`car-red`, SpriteKind.Player)
playerCar = vehicles.createFromSprite(playerSprite)
playerSprite.setPosition(232, 648)
vehicles.setAngle(playerCar, -90)
vehicles.setPowers(playerCar, 2, 5)

// Or create sprite + vehicle in one step
opponentCar = vehicles.create(assets.image`car-orange`, SpriteKind.Enemy)
opponentCar.sprite.setPosition(200, 648)
vehicles.setAngle(opponentCar, -90)
vehicles.setPowers(opponentCar, 2, 5)

waypointList = waypoints.buildTrack(tilemap`level0`, [
    assets.tile`waypoint00`,
    assets.tile`waypoint01`,
    assets.tile`waypoint02`
])
waypoints.follow(waypointList, 24)
waypoints.drawGates(waypointList, true)

scene.cameraFollowSprite(playerSprite)

game.onUpdateInterval(100, function () {
    // Player: wire your own left/right and accel/brake into turn/accel (-1/0/+1)
    vehicles.drive(playerCar, /* turn */, /* accel */)
    vehicles.drive(
        opponentCar,
        waypoints.planTurn(waypointList, opponentCar, 12),
        waypoints.planAccel(waypointList, opponentCar, 35)
    )
})
```

That replaces the older pattern of storing `"angle"` / `"speed"` / `"accelPower"` / `"brakePower"` on sprite data, calling custom `turn`/`accel` helpers, then `setVelocityAtAngle` + `faceDirection` every tick.

## Vehicles

A `vehicles.Vehicle` wraps a sprite and owns:

| Property | Meaning |
| --- | --- |
| `sprite` | **same** Sprite instance — x/y, collisions, kinds live here |
| `angle` | degrees; orientation **and** velocity direction |
| `speed` | magnitude (≥ 0) |
| `accelPower` / `brakePower` | speed change per `drive` step (`brakePower` is positive) |
| `maxSpeed` | clamp; also the speed at which turn rate reaches zero (default 200) |
| `maxTurnRate` | peak turn rate at speed 0 (default 10°) |
| `handling` | how fast turn falls off with speed (default 1 = linear) |

Position is not duplicated on the vehicle. Speed/angle are vehicle-owned; each `drive` writes them to `vx`/`vy`. If something else changes the sprite's velocity first (wall bounce, `setVelocity`, …), the next `drive` re-reads `vx`/`vy` into speed/angle so they stay consistent.

### Driving

`vehicles.drive(vehicle, turn, accel)` runs one physics step:

1. If sprite `vx`/`vy` diverged from the vehicle's speed/angle, re-sync from the sprite.
2. Looks up the **surface** under the sprite (see below).
3. Turns if `turn ≠ 0` and `speed > 0`:
   `turnRate = maxTurnRate × (1 − speed/maxSpeed)^handling × surface.grip`.
   So steering is strongest when slow and fades to none at max speed.
   Raise `maxTurnRate` for sharper low-speed steering; lower `handling`
   (e.g. `0.5`) to keep more turn at high speed, or raise it (e.g. `2`)
   for a vehicle that washes out sooner.
4. Accelerates or brakes using `accelPower` / `brakePower` × surface traction.
5. Subtracts surface friction (additive drain).
6. Sets `vx`/`vy` from angle + speed and rotates the sprite image to match.

`turn` and `accel` are typically `-1`, `0`, or `+1` — the same signals `waypoints.planTurn` / `planAccel` return.

### Tile surfaces

```blocks
vehicles.setSurface(assets.tile`ice`, 0.4, 0.5, 0)
vehicles.setSurface(assets.tile`mud`, 0.7, 0.6, 3)
vehicles.setSurface(assets.tile`asphalt`, 1.2, 1.1, 0)
```

Unregistered tiles use **grip 1**, **traction 1**, **friction 0**.

- **Grip** / **traction**: multipliers (can be above or below 1).
- **Friction**: non-negative additive speed loss per drive step (not a multiplier; cannot be negative).

## Waypoints (AI tracks)

Mark the track centre line with coloured tiles in drive order:

1. Exactly **one** tile of the first colour (start/finish).
2. One or more tiles of each following colour.
3. Pass that ordered colour list to `waypoints.buildTrack`.

You can author markers on a **separate tilemap** (same width/height/scale as the playable level) so the real level stays clean — see notes below.

Then:

- `waypoints.follow(list, gateHalfWidthPx)` — turns every waypoint into a crossing gate and tracks all vehicles, including vehicles created later.
- `waypoints.planTurn` / `planAccel` — return turn/accel for `vehicles.drive`, using **`vehicle.angle`** as heading.
- `waypoints.drawGates(list, true)` — draw the gate lines for debugging; each gate changes colour when crossed.

Each gate is a line through a waypoint, perpendicular to the line from the previous waypoint to that waypoint. A vehicle advances only when it crosses its current gate in the forward direction, which avoids the old “missed the radius and circled back” problem.

### Keeping marker tiles off the real level

1. Duplicate your level tilemap (e.g. `level` → `level_waypoints`).
2. Paint markers only on the duplicate.
3. Call `buildTrack` with the duplicate; keep the real tilemap as current during play.

### Finish line and laps

Define a finish line from two tile locations and a direction:

```blocks
waypoints.setFinishLine(
    tiles.getTileLocation(10, 42),
    tiles.getTileLocation(13, 42),
    true
)

waypoints.onFinishCrossed(function (vehicle, fullLap) {
    if (fullLap) {
        // Count a lap, record game.runtime(), decide whether the race is over.
    } else {
        // First crossing starts the first timed lap, or the car skipped gates.
    }
})
```

`upward = true` means the valid crossing direction is toward the top of the screen; `false` means toward the bottom. The first finish crossing for a vehicle always reports `fullLap = false`. Later crossings report `true` only if that vehicle crossed every active waypoint gate in order since its previous finish crossing.

Lap counts, lap timing, and deciding the winner are intentionally left to the game. A typical pattern is to store per-vehicle `laps`, `lapStartMs`, and `bestLapMs`; on `fullLap`, increment `laps`, compute `game.runtime() - lapStartMs`, then reset `lapStartMs`.

## Notes and limitations

* `brakePower` is stored as a **positive** value (speed lost when braking). Old sprite-data setups that used `-5` become `vehicles.setPowers(..., 2, 5)`.
* Vehicle images are assumed to face **right** at angle 0° (same convention as typical Arcade “velocity at angle” helpers). `createFromSprite` treats the sprite's current image as that unrotated art.
* Within a waypoint colour band, tiles are chained by nearest neighbor — avoid looping a single colour band back near itself.
* `planTurn` sign: positive angle difference (target clockwise of heading) → `+1` (right). Flip in your own code if needed.
* All public angles and thresholds are in **degrees**. `planTurn` defaults to about `12°`; `planAccel` defaults to about `35°`.
* `waypoints.follow` tracks all vehicles globally for that waypoint list. Call it once after building the track; vehicles created later are picked up automatically.

## API sketch

### Vehicles

- `vehicles.create(img, kind): Vehicle`
- `vehicles.createFromSprite(sprite): Vehicle` (idempotent; same sprite → same vehicle)
- `vehicles.vehicleOf(sprite): Vehicle` (lookup only)
- `vehicles.all(): Vehicle[]`
- `vehicles.spriteOf(vehicle): Sprite`
- `vehicles.setAngle` / `angle` (degrees in blocks)
- `vehicles.setSpeed` / `speed`
- `vehicles.setPowers(vehicle, accelPower, brakePower)`
- `vehicles.setMaxSpeed` / `setMaxTurnRate` / `setHandling`
- `vehicles.drive(vehicle, turn, accel)`
- `vehicles.setSurface(tile, grip, traction, friction)`

### Waypoints

- `waypoints.buildTrack(tilemap, tileColours): WaypointList`
- `waypoints.waypointAt` / `allWaypoints`
- `waypoints.distanceTo` / `angleTo` (sprite ↔ location helpers)
- `waypoints.follow` / `currentWaypoint`
- `waypoints.planTurn` / `planAccel`
- `waypoints.onWaypointReached`
- `waypoints.drawGates`
- `waypoints.setFinishLine` / `onFinishCrossed`

## Supported targets

* for PXT/arcade
(The metadata above is needed for package search.)

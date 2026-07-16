# arcade-vehicles

A MakeCode Arcade extension for top-down vehicles (cars, boats, planes, and similar): angle + speed physics, tile surfaces that change grip/traction/friction, and optional colour-coded waypoint tracks so AI can drive with the same controls as the player.

You do **not** need arcade-sprite-util, arcade-sprite-data, or sprite-fx for vehicle angle, speed, facing, or velocity — those pieces are built in.

## Quick start

```blocks
let playerCar: vehicles.Vehicle = null
let opponentCar: vehicles.Vehicle = null
let waypointList: waypoints.WaypointList = null

tiles.setCurrentTilemap(tilemap`level0`)

playerCar = vehicles.create(assets.image`car-red`, SpriteKind.Player)
playerCar.sprite.setPosition(232, 648)
vehicles.setAngle(playerCar, -90)
vehicles.setPowers(playerCar, 2, 5)

opponentCar = vehicles.create(assets.image`car-orange`, SpriteKind.Enemy)
opponentCar.sprite.setPosition(200, 648)
vehicles.setAngle(opponentCar, -90)
vehicles.setPowers(opponentCar, 2, 5)

waypointList = waypoints.buildTrack(tilemap`level0`, [
    assets.tile`waypoint00`,
    assets.tile`waypoint01`,
    assets.tile`waypoint02`
])
waypoints.follow(waypointList, opponentCar, 20)

scene.cameraFollowSprite(vehicles.spriteOf(opponentCar))

game.onUpdateInterval(100, function () {
    // Player: wire your own left/right and accel/brake into turn/accel (-1/0/+1)
    vehicles.drive(playerCar, /* turn */, /* accel */)
    vehicles.drive(
        opponentCar,
        waypoints.planTurn(waypointList, opponentCar, 0.2),
        waypoints.planAccel(waypointList, opponentCar, 0.2)
    )
})
```

That replaces the older pattern of storing `"angle"` / `"speed"` / `"accelPower"` / `"brakePower"` on sprite data, calling custom `turn`/`accel` helpers, then `setVelocityAtAngle` + `faceDirection` every tick.

## Vehicles

A `vehicles.Vehicle` wraps a sprite and owns:

| Property | Meaning |
| --- | --- |
| `sprite` | x/y and collisions live here |
| `angle` | radians; orientation **and** velocity direction |
| `speed` | magnitude (≥ 0) |
| `accelPower` / `brakePower` | speed change per `drive` step (`brakePower` is positive) |
| `lateralGrip` | base turn multiplier (default 1) |
| `maxSpeed` | clamp (default 200) |
| `maxTurnRate` | peak turn rate at low speed (default 10°) |

### Driving

`vehicles.drive(vehicle, turn, accel)` runs one physics step:

1. Looks up the **surface** under the sprite (see below).
2. Turns if `turn ≠ 0` and `speed > 0`, using a speed-dependent turn curve (high turn rate at low speed → near zero near max speed), scaled by `lateralGrip`, surface grip, and `maxTurnRate`.
3. Accelerates or brakes using `accelPower` / `brakePower` × surface traction.
4. Subtracts surface friction (additive drain).
5. Sets `vx`/`vy` from angle + speed and rotates the sprite image to match.

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

- `waypoints.follow(list, vehicle, thresholdPx)` — auto-advance current waypoint.
- `waypoints.planTurn` / `planAccel` — return turn/accel for `vehicles.drive`, using **`vehicle.angle`** as heading.
- Optional debug highlighting of prev/current/next tiles.

### Keeping marker tiles off the real level

1. Duplicate your level tilemap (e.g. `level` → `level_waypoints`).
2. Paint markers only on the duplicate.
3. Call `buildTrack` with the duplicate; keep the real tilemap as current during play.

### Debug highlighting

```blocks
waypoints.debugShowWaypoints(
    waypointList,
    opponentCar,
    assets.tile`debugPrev`,
    assets.tile`debugCur`,
    assets.tile`debugNext`
)
```

Paints onto the **active** tilemap and restores whatever tile was really there (works with the separate-authoring-tilemap pattern).

## Notes and limitations

* `brakePower` is stored as a **positive** value (speed lost when braking). Old sprite-data setups that used `-5` become `vehicles.setPowers(..., 2, 5)`.
* Vehicle images are assumed to face **right** at angle 0° (same convention as typical Arcade “velocity at angle” helpers).
* Within a waypoint colour band, tiles are chained by nearest neighbor — avoid looping a single colour band back near itself.
* `planTurn` sign: positive angle difference (target clockwise of heading) → `+1` (right). Flip in your own code if needed.
* If a vehicle isn’t registered with `follow`, `planTurn` / `planAccel` log a warning and return `0`.

## API sketch

### Vehicles

- `vehicles.create(img, kind): Vehicle`
- `vehicles.spriteOf(vehicle): Sprite`
- `vehicles.setAngle` / `angle` (degrees in blocks)
- `vehicles.setSpeed` / `speed`
- `vehicles.setPowers(vehicle, accelPower, brakePower)`
- `vehicles.setLateralGrip` / `setMaxSpeed` / `setMaxTurnRate`
- `vehicles.drive(vehicle, turn, accel)`
- `vehicles.setSurface(tile, grip, traction, friction)`

### Waypoints

- `waypoints.buildTrack(tilemap, tileColours): WaypointList`
- `waypoints.waypointAt` / `allWaypoints`
- `waypoints.distanceTo` / `angleTo` (sprite ↔ location helpers)
- `waypoints.follow` / `currentWaypoint`
- `waypoints.planTurn` / `planAccel`
- `waypoints.onWaypointReached`
- `waypoints.debugShowWaypoints` / `debugHideWaypoints`

## Supported targets

* for PXT/arcade
(The metadata above is needed for package search.)

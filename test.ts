// Usage smoke test: checks that the public waypoints API compiles and wires
// together as expected. It doesn't set up a real tilemap (that's normally
// painted with the tilemap editor and referenced with a `tilemap` literal),
// so this just exercises the API surface, not the ordering logic itself.

const startTile = img`
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . 5 5 5 5 5 5 . . . . .
    . . . . . 5 5 5 5 5 5 . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    `
const checkpoint1 = img`
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . 6 6 6 6 6 6 . . . . .
    . . . . . 6 6 6 6 6 6 . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    `
const checkpoint2 = img`
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . 2 2 2 2 2 2 . . . . .
    . . . . . 2 2 2 2 2 2 . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    . . . . . . . . . . . . . . . .
    `

// A real tilemap is normally painted with the tilemap editor and referenced
// with a `tilemap` literal, e.g. `tilemap\`level1\``. This test only checks
// that the API compiles, so it leaves the tilemap unset.
let level: tiles.TileMapData = null

const waypointList = waypoints.buildTrack(level, [startTile, checkpoint1, checkpoint2])

console.log("waypoint count: " + waypointList.length)

for (const waypoint of waypointList) {
    console.log("waypoint at column " + waypoint.column + ", row " + waypoint.row)
}

let raceIndex = 0
game.onUpdateInterval(500, function () {
    const target = waypoints.waypointAt(waypointList, raceIndex)
    if (target) {
        console.log("driving towards waypoint " + raceIndex)
    }
    raceIndex += 1
})

tiles.setCurrentTilemap(tilemap`map`);
let trackWaypoints: tiles.Location[] = null;
let starttile = assets.tile`roadTurn1`;
trackWaypoints = waypoints.buildTrack(tilemap`map`, [
    assets.tile`roadTurn1`,
    assets.tile`roadTurn2`,
    assets.tile`roadTurn3`,
    assets.tile`roadTurn4`]);
let isMatch = tiles.getTileAt(1, 7);
console.log(assets.tile`roadTurn1`.equals(isMatch));

let numberTiles = [
    assets.tile`number00`,
    assets.tile`number01`,
    assets.tile`number02`,
    assets.tile`number03`,
    assets.tile`number04`,
    assets.tile`number05`,
    assets.tile`number06`,
    assets.tile`number07`,
    assets.tile`number08`,
    assets.tile`number09`,
    assets.tile`number10`,
    assets.tile`number11`,
    assets.tile`number12`
];
for (let i = 0; i < trackWaypoints.length; i++) {
    // Ensure we don't go out of bounds of our array
    let tileToSet = numberTiles[i % numberTiles.length];

    // Set the tile at the location coordinates
    tiles.setTileAt(trackWaypoints[i], tileToSet);
}

let debugData = trackWaypoints.map(loc => {
    return {
        x: loc.col, // tiles.Location uses 'col' and 'row'
        y: loc.row,
        tileKind: loc.getImage() // If you need to see what the tile is
    };
});
console.log(JSON.stringify(debugData));
let mySprite = sprites.create(assets.image`carRedRight`, SpriteKind.Player);
controller.moveSprite(mySprite);
scene.cameraFollowSprite(mySprite)
/**
 * Order colour-coded tilemap markers into a race track waypoint list.
 *
 * Mark your track with coloured tiles: exactly one tile of a "start" colour,
 * then one or more tiles of each following checkpoint colour, in the order
 * the track should be driven. This extension finds all of those tiles on a
 * tilemap and chains them together with a nearest-neighbor search (within
 * each colour) to produce an ordered list of waypoints an AI-controlled
 * sprite can drive towards, lap after lap.
 */
//% color="#B36521" icon="\uf1b9" block="Waypoints"
namespace waypoints {
    /**
     * Scan a tilemap for the given sequence of marker tile colours and
     * return them as an ordered list of waypoints.
     *
     * The first colour must mark exactly one tile - the start/finish line
     * (the game will fail with an error if more than one is found). Every
     * colour after that can mark one or more tiles: starting from the last
     * waypoint found so far, each colour's tiles are repeatedly chained on
     * by picking whichever one of that colour is nearest, until none of
     * that colour are left. This means the result only ever moves forward
     * through the sequence of colours you provide.
     * @param tilemap the tilemap to search for marker tiles
     * @param tileColours the marker tile colours, in track order (start colour first)
     */
    //% blockId=waypoints_build_track
    //% block="waypoints on tilemap $tilemap with tile colours $tileColours"
    //% tilemap.shadow=tiles_tilemap_editor
    //% tileColours.shadow="lists_create_with"
    //% tileColours.defl="tileset_tile_picker"
    //% blockSetVariable=waypointList
    //% weight=100 blockGap=8
    export function buildTrack(tilemap: tiles.TileMapData, tileColours: Image[]): tiles.Location[] {
        return orderWaypoints(tilemap, tileColours);
    }

    /**
     * Get the waypoint at the given index of a waypoint list, wrapping
     * around to the start once the index runs past the end of the list.
     * This makes it safe to keep incrementing an index every time a racer
     * reaches its current target, across as many laps as you like.
     * @param waypointList the ordered list of waypoints, from waypoints.buildTrack
     * @param index the waypoint index, can be any integer
     */
    //% blockId=waypoints_waypoint_at
    //% block="waypoint at index $index of $waypointList"
    //% weight=90 blockGap=8
    export function waypointAt(waypointList: tiles.Location[], index: number): tiles.Location {
        if (!waypointList || waypointList.length === 0) return undefined;
        const wrapped = ((index % waypointList.length) + waypointList.length) % waypointList.length;
        return waypointList[wrapped];
    }

    function orderWaypoints(tilemap: tiles.TileMapData, tileColours: Image[]): tiles.Location[] {
        let result: tiles.Location[] = [];
        if (!tilemap || !tileColours || tileColours.length === 0) return result;

        const startTiles = getTilesOfTypeForMap(tilemap, tileColours[0]);
        if (startTiles.length === 0) {
            console.log("waypoints: no start tile found for the first tile colour");
            return result;
        } else {
            console.log("found start tiles: " + JSON.stringify(startTiles));
        }
        if (startTiles.length > 1) {
            control.fail("waypoints: expected exactly one start tile, found " + startTiles.length);
            return result;
        }

        let current = startTiles[0];
        result.push(current);

        for (let colourIndex = 1; colourIndex < tileColours.length; colourIndex++) {
            const remaining = getTilesOfTypeForMap(tilemap, tileColours[colourIndex]);

            while (remaining.length > 0) {
                let nearestIndex = 0;
                let nearestDistance = gridDistanceSquared(current, remaining[0]);

                for (let j = 1; j < remaining.length; j++) {
                    const d = gridDistanceSquared(current, remaining[j]);
                    if (d < nearestDistance) {
                        nearestDistance = d;
                        nearestIndex = j;
                    }
                }

                current = remaining[nearestIndex];
                result.push(current);
                remaining.splice(nearestIndex, 1);
            }
        }

        return result;
    }

    /**
     * Find tiles of a type for a specific tile map, similar to tiles.getTilesOfType but for any map
     */
    function getTilesOfTypeForMap(tilemap: tiles.TileMapData, tile: Image): tiles.Location[] {
        if (!tilemap || !tile) {
            console.log("error, no tilemap or tile");
            return [];
        }
        let locations: tiles.Location[] = [];
        for (let i=0; i < tilemap.width; i++) {
            for (let j=0; j < tilemap.height; j++) {
                if (tilemap.getTileImage(tilemap.getTile(i,j)).equals(tile)) {
                    console.log("found match at x:" + i + ", y:" + j);
                    let loc = new tiles.Location(i, j, null)
                    locations.push(loc);
                }
            }
        }
        return locations;
    }

    // Uses column/row (grid coordinates) rather than x/y (pixel coordinates)
    // because a Location's x/y getters read the scale of whichever tilemap
    // is currently active in the scene - which may not be the tilemap
    // passed in here. Column/row are stable regardless of which tilemap is
    // active, and scale equally in both axes, so nearest-neighbor ordering
    // comes out identical either way.
    function gridDistanceSquared(a: tiles.Location, b: tiles.Location): number {
        const dCol = a.column - b.column;
        const dRow = a.row - b.row;
        return dCol * dCol + dRow * dRow;
    }
}
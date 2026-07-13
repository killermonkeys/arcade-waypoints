/**
 * Order colour-coded tilemap markers into a race track waypoint list.
 *
 * Mark your track with coloured tiles: exactly one tile of a "start" colour,
 * then one or more tiles of each following checkpoint colour, in the order
 * the track should be driven. This extension finds all of those tiles and
 * chains them together with a nearest-neighbor search (within each colour)
 * to produce an ordered list of waypoints an AI-controlled sprite can drive
 * towards, lap after lap.
 */
//% color="#B36521" icon="\uf1b9" block="Waypoints"
namespace waypoints {
    /**
     * An ordered set of waypoints that make up one lap of a race track.
     */
    export class Track {
        public waypoints: tiles.Location[];

        constructor(waypoints: tiles.Location[]) {
            this.waypoints = waypoints;
        }

        /**
         * The number of waypoints in this track.
         */
        count(): number {
            return this.waypoints.length;
        }

        /**
         * The waypoint at the given index, wrapping around to the start of
         * the track once the index runs past the end. This makes it safe to
         * keep incrementing an index across multiple laps.
         * @param index the waypoint index, can be any integer (including negative or beyond the track length)
         */
        waypointAt(index: number): tiles.Location {
            if (this.waypoints.length === 0) return undefined;
            const wrapped = ((index % this.waypoints.length) + this.waypoints.length) % this.waypoints.length;
            return this.waypoints[wrapped];
        }
    }

    /**
     * Scan the current tilemap for the given sequence of marker tile
     * colours and return them as an ordered waypoint track.
     *
     * The first colour must mark exactly one tile - the start/finish line.
     * Every colour after that can mark one or more tiles; each colour's
     * tiles are chained together with a nearest-neighbor search starting
     * from the last waypoint found so far, so the track only ever moves
     * forward through the sequence of colours.
     * @param tileColours the marker tile colours, in track order (start colour first)
     */
    //% blockId=waypoints_build_track
    //% block="build waypoint track from tiles $tileColours"
    //% weight=100 blockGap=8
    //% group="Track"
    export function buildTrack(tileColours: Image[]): Track {
        return new Track(orderWaypoints(tileColours));
    }

    /**
     * Get the waypoint at the given index of a track, wrapping around to
     * the start once the index runs past the end of the track. Useful for
     * driving multiple laps: keep incrementing the index every time a
     * sprite reaches its current waypoint.
     * @param track the waypoint track
     * @param index the waypoint index
     */
    //% blockId=waypoints_waypoint_at
    //% block="waypoint at index $index of $track"
    //% weight=90 blockGap=8
    //% group="Track"
    export function waypointAt(track: Track, index: number): tiles.Location {
        return track ? track.waypointAt(index) : undefined;
    }

    /**
     * Get the number of waypoints in a track.
     * @param track the waypoint track
     */
    //% blockId=waypoints_count
    //% block="number of waypoints in $track"
    //% weight=80
    //% group="Track"
    export function count(track: Track): number {
        return track ? track.count() : 0;
    }

    /**
     * Get the ordered waypoints of a track as a plain array, for use with
     * "for each" loops.
     * @param track the waypoint track
     */
    //% blockId=waypoints_to_array
    //% block="array of waypoints in $track"
    //% weight=70
    //% group="Track"
    export function toArray(track: Track): tiles.Location[] {
        return track ? track.waypoints : [];
    }

    function orderWaypoints(tileColours: Image[]): tiles.Location[] {
        const result: tiles.Location[] = [];
        if (!tileColours || tileColours.length === 0) return result;

        const startTiles = tiles.getTilesByType(tileColours[0]);
        if (startTiles.length === 0) {
            console.log("waypoints: no start tile found for the first colour");
            return result;
        }
        if (startTiles.length > 1) {
            console.log("waypoints: expected exactly one start tile, found " + startTiles.length + " - using the first one");
        }

        let current = startTiles[0];
        result.push(current);

        for (let colourIndex = 1; colourIndex < tileColours.length; colourIndex++) {
            const remaining = tiles.getTilesByType(tileColours[colourIndex]);

            while (remaining.length > 0) {
                let nearestIndex = 0;
                let nearestDistance = distanceSquared(current, remaining[0]);

                for (let j = 1; j < remaining.length; j++) {
                    const d = distanceSquared(current, remaining[j]);
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

    function distanceSquared(a: tiles.Location, b: tiles.Location): number {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }
}

/**
 * Colour-coded tilemap waypoints for AI-driven vehicles.
 *
 * Mark your track with coloured tiles: exactly one tile of a "start" colour,
 * then one or more tiles of each following checkpoint colour, in the order
 * the track should be driven. buildTrack finds those tiles and chains them
 * with nearest-neighbor ordering. Start following a list once; every live
 * vehicle then advances through gates built from those waypoints. planTurn /
 * planAccel produce the same -1/0/+1 signals that vehicles.drive expects,
 * using the vehicle's angle as its heading.
 */
//% color="#B36521" icon="\uf018" block="Waypoints"
//% groups=['Track', 'Driving', 'Events', 'Debug']
namespace waypoints {
    /**
     * An ordered list of race track waypoints, plus the per-vehicle progress
     * needed to drive one or more vehicles around it. Create one with
     * waypoints.buildTrack.
     */
    export class WaypointList {
        locations: tiles.Location[];
        tilemap: tiles.TileMapData;
        progress: VehicleProgress[];
        changeHandlers: ((sprite: Sprite, index: number) => void)[];
        gateHalfWidth: number;
        gateColors: number[];
        active: boolean;
        drawGateLines: boolean;
        tickerStarted: boolean;
        paintStarted: boolean;

        constructor(locations: tiles.Location[], tilemap: tiles.TileMapData) {
            this.locations = locations;
            this.tilemap = tilemap;
            this.progress = [];
            this.changeHandlers = [];
            this.gateHalfWidth = 16;
            this.gateColors = [];
            this.active = false;
            this.drawGateLines = false;
            this.tickerStarted = false;
            this.paintStarted = false;
        }
    }

    class VehicleProgress {
        vehicle: vehicles.Vehicle;
        currentIndex: number;
        lastX: number;
        lastY: number;
        gatesHit: boolean[];

        constructor(vehicle: vehicles.Vehicle, currentIndex: number, waypointCount: number) {
            this.vehicle = vehicle;
            this.currentIndex = currentIndex;
            this.lastX = vehicle.sprite.x;
            this.lastY = vehicle.sprite.y;
            this.gatesHit = newBooleanArray(waypointCount);
        }
    }

    class GateSegment {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        px: number;
        py: number;
        nx: number;
        ny: number;
    }

    class FinishLine {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
        nx: number;
        ny: number;
    }

    class FinishProgress {
        vehicle: vehicles.Vehicle;
        lastX: number;
        lastY: number;
        crossCount: number;

        constructor(vehicle: vehicles.Vehicle) {
            this.vehicle = vehicle;
            this.lastX = vehicle.sprite.x;
            this.lastY = vehicle.sprite.y;
            this.crossCount = 0;
        }
    }

    const DEBUG_COLORS = [2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14];
    const activeLists: WaypointList[] = [];
    const finishHandlers: ((vehicle: vehicles.Vehicle, fullLap: boolean) => void)[] = [];
    const finishProgress: FinishProgress[] = [];
    let finishLine: FinishLine = undefined;
    let finishTickerStarted = false;

    /**
     * Scan a tilemap for the given sequence of marker tile colours and
     * return them as an ordered waypoint list.
     *
     * The first colour must mark exactly one tile - the start/finish line
     * (the game will fail with an error if more than one is found). Every
     * colour after that can mark one or more tiles: starting from the last
     * waypoint found so far, each colour's tiles are repeatedly chained on
     * by picking whichever one of that colour is nearest, until none of
     * that colour are left. This means the result only ever moves forward
     * through the sequence of colours you provide.
     *
     * The tilemap you pass in here doesn't need to be the one currently
     * active/rendered in the scene - it can be a separate, never-shown copy
     * of your level with marker tiles painted onto it (handy if you don't
     * want the markers visible in the real level). It just needs to have
     * the same width, height, and tile scale as the tilemap you actually
     * play on, so each waypoint's grid position lines up correctly.
     * @param tilemap the tilemap to search for marker tiles
     * @param tileColours the marker tile colours, in track order (start colour first)
     */
    //% blockId=waypoints_build_track
    //% block="waypoints on tilemap $tilemap with tile colours $tileColours"
    //% tilemap.shadow=tiles_tilemap_editor
    //% tileColours.shadow="lists_create_with"
    //% tileColours.defl="tileset_tile_picker"
    //% blockSetVariable=waypointList
    //% group="Track" weight=100 blockGap=8
    export function buildTrack(tilemap: tiles.TileMapData, tileColours: Image[]): WaypointList {
        const locations = orderWaypoints(tilemap, tileColours);
        return new WaypointList(locations, tilemap);
    }

    /**
     * Get the waypoint at the given index of a waypoint list, wrapping
     * around to the start once the index runs past the end of the list.
     * This makes it safe to keep incrementing an index every time a racer
     * reaches its current target, across as many laps as you like.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param index the waypoint index, can be any integer
     */
    //% blockId=waypoints_waypoint_at
    //% block="waypoint at index $index of $list"
    //% group="Track" weight=95 blockGap=8
    export function waypointAt(list: WaypointList, index: number): tiles.Location {
        if (!list || !list.locations || list.locations.length === 0) return undefined;
        const count = list.locations.length;
        const wrapped = ((index % count) + count) % count;
        return list.locations[wrapped];
    }

    /**
     * Get all of the waypoints in a waypoint list as a plain array, for use
     * with "for each" or "length of" blocks.
     * @param list the waypoint list, from waypoints.buildTrack
     */
    //% blockId=waypoints_all_waypoints
    //% block="all waypoints in $list"
    //% group="Track" weight=90 blockGap=8
    export function allWaypoints(list: WaypointList): tiles.Location[] {
        return list ? list.locations : [];
    }

    /**
     * The distance in pixels from a sprite to a tile location.
     * @param sprite the sprite
     * @param location the tile location
     */
    //% blockId=waypoints_distance_to
    //% block="distance from $sprite to $location"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Driving" weight=85 blockGap=8
    export function distanceTo(sprite: Sprite, location: tiles.Location): number {
        if (!sprite || !location) return 0;
        return Math.sqrt((location.x - sprite.x) * (location.x - sprite.x) + (location.y - sprite.y) * (location.y - sprite.y));
    }

    /**
     * The angle in degrees from a sprite to a tile location.
     * @param sprite the sprite
     * @param location the tile location
     */
    //% blockId=waypoints_angle_to
    //% block="angle from $sprite to $location"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Driving" weight=84 blockGap=8
    export function angleTo(sprite: Sprite, location: tiles.Location): number {
        if (!sprite || !location) return 0;
        return toDegrees(Math.atan2(location.y - sprite.y, location.x - sprite.x));
    }

    /**
     * Start gate following for every vehicle. Each waypoint becomes a gate:
     * a line through that waypoint, perpendicular to the line from the
     * previous waypoint to this one. Any existing or future vehicle advances
     * when it crosses its current gate in the correct direction.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param gateHalfWidth half the drawn/checkable gate width in pixels
     */
    //% blockId=waypoints_follow
    //% block="follow gates on $list with half width $gateHalfWidth px"
    //% gateHalfWidth.defl=24
    //% group="Driving" weight=80 blockGap=8
    export function follow(list: WaypointList, gateHalfWidth: number): void {
        if (!list || !list.locations || list.locations.length === 0) return;
        list.gateHalfWidth = Math.max(1, gateHalfWidth);
        list.active = true;
        initGateColors(list);
        if (activeLists.indexOf(list) < 0) activeLists.push(list);
        ensureAllVehicleProgress(list);
        ensureTicker(list);
    }

    /**
     * Get the waypoint a vehicle is currently headed towards, or undefined
     * if the vehicle isn't following this waypoint list.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param vehicle the vehicle
     */
    //% blockId=waypoints_current_waypoint
    //% block="current waypoint of $vehicle following $list"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% group="Driving" weight=75 blockGap=8
    export function currentWaypoint(list: WaypointList, vehicle: vehicles.Vehicle): tiles.Location {
        if (!list || !vehicle) return undefined;
        const progress = ensureProgress(list, vehicle);
        if (!progress) return undefined;
        return list.locations[progress.currentIndex];
    }

    /**
     * Plan whether a vehicle following a waypoint list should turn left or
     * right to face its current waypoint. Returns 0 if the vehicle is
     * already facing close enough to the waypoint (within the threshold),
     * -1 to turn left, or +1 to turn right. Feed the result into
     * vehicles.drive.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param vehicle the vehicle
     * @param thresholdDegrees how far off (in degrees) the vehicle's angle can be before it needs to turn
     */
    //% blockId=waypoints_plan_turn
    //% block="plan turn for $vehicle following $list with threshold $thresholdDegrees degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% thresholdDegrees.defl=12
    //% group="Driving" weight=70 blockGap=8
    export function planTurn(list: WaypointList, vehicle: vehicles.Vehicle, thresholdDegrees: number): number {
        if (!list || !vehicle || !ensureProgress(list, vehicle)) {
            console.log("waypoints: vehicle is not following this waypoint list");
            return 0;
        }

        const diff = headingDifference(list, vehicle);
        if (Math.abs(diff) <= thresholdDegrees) return 0;
        return diff > 0 ? 1 : -1;
    }

    /**
     * Plan whether a vehicle following a waypoint list should accelerate or
     * brake. Returns +1 to accelerate, unless the vehicle's angle is off
     * from its current waypoint by more than the threshold, in which case
     * it returns -1 to brake. Feed the result into vehicles.drive.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param vehicle the vehicle
     * @param thresholdDegrees how far off (in degrees) the vehicle's angle can be before it should brake instead of accelerating
     */
    //% blockId=waypoints_plan_accel
    //% block="plan accel for $vehicle following $list with threshold $thresholdDegrees degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% thresholdDegrees.defl=35
    //% group="Driving" weight=65 blockGap=8
    export function planAccel(list: WaypointList, vehicle: vehicles.Vehicle, thresholdDegrees: number): number {
        if (!list || !vehicle || !ensureProgress(list, vehicle)) {
            console.log("waypoints: vehicle is not following this waypoint list");
            return 0;
        }

        const diff = headingDifference(list, vehicle);
        return Math.abs(diff) > thresholdDegrees ? -1 : 1;
    }

    /**
     * Run some code whenever a vehicle following this waypoint list reaches
     * its current waypoint and advances to the next one.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param handler code to run, given the vehicle's sprite and its new waypoint index
     */
    //% blockId=waypoints_on_waypoint_reached
    //% block="on waypoint reached of $list"
    //% draggableParameters="reporter"
    //% group="Events" weight=60 blockGap=8
    export function onWaypointReached(list: WaypointList, handler: (sprite: Sprite, index: number) => void): void {
        if (!list || !handler) return;
        list.changeHandlers.push(handler);
    }

    /**
     * Draw each waypoint gate as a debug line. Gate colours cycle when any
     * vehicle crosses them.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param enabled whether gate lines should be drawn
     */
    //% blockId=waypoints_draw_gates
    //% block="draw gates for $list $enabled"
    //% enabled.defl=true
    //% group="Debug" weight=50 blockGap=8
    export function drawGates(list: WaypointList, enabled: boolean): void {
        if (!list) return;
        list.drawGateLines = enabled;
        initGateColors(list);
        ensurePainter(list);
    }

    /**
     * Define the finish line as the segment between two tile locations.
     * If upward is true, the valid crossing direction is toward the top of
     * the screen; otherwise it is toward the bottom. For near-vertical lines
     * where both normals are horizontal, the tie-break is left for upward
     * and right for downward.
     * @param tileA one end of the finish line
     * @param tileB the other end of the finish line
     * @param upward true for crossings toward screen-up, false for screen-down
     */
    //% blockId=waypoints_set_finish_line
    //% block="finish line from $tileA to $tileB upward $upward"
    //% tileA.shadow=mapgettile
    //% tileB.shadow=mapgettile
    //% upward.defl=true
    //% group="Events" weight=58 blockGap=8
    export function setFinishLine(tileA: tiles.Location, tileB: tiles.Location, upward: boolean): void {
        if (!tileA || !tileB) return;
        const dx = tileB.x - tileA.x;
        const dy = tileB.y - tileA.y;
        const mag = Math.sqrt(dx * dx + dy * dy);
        if (mag <= 0) return;

        const nx1 = -dy / mag;
        const ny1 = dx / mag;
        const nx2 = -nx1;
        const ny2 = -ny1;
        const pickFirst = Math.abs(ny1 - ny2) > 0.001
            ? (upward ? ny1 < ny2 : ny1 > ny2)
            : (upward ? nx1 < nx2 : nx1 > nx2);

        finishLine = new FinishLine();
        finishLine.x1 = tileA.x;
        finishLine.y1 = tileA.y;
        finishLine.x2 = tileB.x;
        finishLine.y2 = tileB.y;
        finishLine.nx = pickFirst ? nx1 : nx2;
        finishLine.ny = pickFirst ? ny1 : ny2;
        ensureFinishTicker();
    }

    /**
     * Run code whenever a vehicle crosses the finish line in the configured
     * direction. The first crossing for a vehicle returns fullLap = false;
     * later crossings return true only if that vehicle crossed every active
     * waypoint gate in order since the previous finish crossing.
     * @param handler code to run with the vehicle and whether the lap was complete
     */
    //% blockId=waypoints_on_finish_crossed
    //% block="on finish crossed"
    //% draggableParameters="reporter"
    //% group="Events" weight=55 blockGap=8
    export function onFinishCrossed(handler: (vehicle: vehicles.Vehicle, fullLap: boolean) => void): void {
        if (!handler) return;
        finishHandlers.push(handler);
        ensureFinishTicker();
    }

    function orderWaypoints(tilemap: tiles.TileMapData, tileColours: Image[]): tiles.Location[] {
        let result: tiles.Location[] = [];
        if (!tilemap || !tileColours || tileColours.length === 0) return result;

        const startTiles = getTilesOfTypeForMap(tilemap, tileColours[0]);
        if (startTiles.length === 0) {
            console.log("waypoints: no start tile found for the first tile colour");
            return result;
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
        for (let i = 0; i < tilemap.width; i++) {
            for (let j = 0; j < tilemap.height; j++) {
                if (tilemap.getTileImage(tilemap.getTile(i, j)).equals(tile)) {
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

    function nearestWaypointIndex(list: WaypointList, sprite: Sprite): number {
        let nearestIndex = 0;
        let nearestDistance = distanceTo(sprite, list.locations[0]);

        for (let i = 1; i < list.locations.length; i++) {
            const d = distanceTo(sprite, list.locations[i]);
            if (d < nearestDistance) {
                nearestDistance = d;
                nearestIndex = i;
            }
        }

        return nearestIndex;
    }

    function findProgress(list: WaypointList, vehicle: vehicles.Vehicle): VehicleProgress {
        if (!list || !vehicle || !vehicle.sprite) return undefined;
        for (let i = 0; i < list.progress.length; i++) {
            if (list.progress[i].vehicle.sprite.id === vehicle.sprite.id) return list.progress[i];
        }
        return undefined;
    }

    function ensureProgress(list: WaypointList, vehicle: vehicles.Vehicle): VehicleProgress {
        if (!list || !list.active || !vehicle || !vehicle.sprite || list.locations.length === 0) return undefined;
        let progress = findProgress(list, vehicle);
        if (!progress) {
            progress = new VehicleProgress(vehicle, nearestWaypointIndex(list, vehicle.sprite), list.locations.length);
            list.progress.push(progress);
        }
        return progress;
    }

    function ensureAllVehicleProgress(list: WaypointList): void {
        const allVehicles = vehicles.all();
        for (let i = 0; i < allVehicles.length; i++) {
            ensureProgress(list, allVehicles[i]);
        }
    }

    function ensureTicker(list: WaypointList): void {
        if (list.tickerStarted) return;
        list.tickerStarted = true;

        game.onUpdate(function () {
            tick(list);
        });
    }

    function tick(list: WaypointList): void {
        if (!list.active) return;
        ensureAllVehicleProgress(list);

        let cleanupNeeded = false;
        for (let i = 0; i < list.progress.length; i++) {
            const progress = list.progress[i];
            const sprite = progress.vehicle.sprite;
            if (!sprite || (sprite.flags & sprites.Flag.Destroyed)) {
                cleanupNeeded = true;
                continue;
            }

            const gate = gateForIndex(list, progress.currentIndex);
            if (crossedForwardSegment(progress.lastX, progress.lastY, sprite.x, sprite.y, gate)) {
                progress.gatesHit[progress.currentIndex] = true;
                bumpGateColor(list, progress.currentIndex);
                progress.currentIndex = (progress.currentIndex + 1) % list.locations.length;
                fireWaypointReached(list, sprite, progress.currentIndex);
            }
            progress.lastX = sprite.x;
            progress.lastY = sprite.y;
        }

        if (cleanupNeeded) {
            list.progress = list.progress.filter(function (p) {
                return p.vehicle.sprite && !(p.vehicle.sprite.flags & sprites.Flag.Destroyed);
            });
        }
    }

    function fireWaypointReached(list: WaypointList, sprite: Sprite, index: number): void {
        for (let i = 0; i < list.changeHandlers.length; i++) {
            list.changeHandlers[i](sprite, index);
        }
    }

    function ensurePainter(list: WaypointList): void {
        if (list.paintStarted) return;
        list.paintStarted = true;
        game.onPaint(function () {
            if (!list.drawGateLines || !list.locations || list.locations.length === 0) return;
            const left = scene.cameraProperty(CameraProperty.Left);
            const top = scene.cameraProperty(CameraProperty.Top);
            for (let i = 0; i < list.locations.length; i++) {
                const gate = gateForIndex(list, i);
                screen.drawLine(
                    Math.round(gate.x1 - left),
                    Math.round(gate.y1 - top),
                    Math.round(gate.x2 - left),
                    Math.round(gate.y2 - top),
                    gateColor(list, i)
                );
            }
        });
    }

    function initGateColors(list: WaypointList): void {
        while (list.gateColors.length < list.locations.length) {
            list.gateColors.push(DEBUG_COLORS[list.gateColors.length % DEBUG_COLORS.length]);
        }
    }

    function gateColor(list: WaypointList, index: number): number {
        initGateColors(list);
        return list.gateColors[index];
    }

    function bumpGateColor(list: WaypointList, index: number): void {
        initGateColors(list);
        const current = list.gateColors[index];
        let slot = DEBUG_COLORS.indexOf(current);
        if (slot < 0) slot = index % DEBUG_COLORS.length;
        list.gateColors[index] = DEBUG_COLORS[(slot + 1) % DEBUG_COLORS.length];
    }

    function gateForIndex(list: WaypointList, index: number): GateSegment {
        const count = list.locations.length;
        const current = list.locations[index];
        const previous = list.locations[(index - 1 + count) % count];
        let tx = current.x - previous.x;
        let ty = current.y - previous.y;
        let mag = Math.sqrt(tx * tx + ty * ty);
        if (mag <= 0 && count > 1) {
            const next = list.locations[(index + 1) % count];
            tx = next.x - current.x;
            ty = next.y - current.y;
            mag = Math.sqrt(tx * tx + ty * ty);
        }
        if (mag <= 0) mag = 1;

        const nx = tx / mag;
        const ny = ty / mag;
        const gx = -ny;
        const gy = nx;
        const half = list.gateHalfWidth;
        const gate = new GateSegment();
        gate.px = current.x;
        gate.py = current.y;
        gate.nx = nx;
        gate.ny = ny;
        gate.x1 = current.x - gx * half;
        gate.y1 = current.y - gy * half;
        gate.x2 = current.x + gx * half;
        gate.y2 = current.y + gy * half;
        return gate;
    }

    function crossedForwardSegment(x1: number, y1: number, x2: number, y2: number, gate: GateSegment): boolean {
        if (!gate) return false;
        const side1 = (x1 - gate.px) * gate.nx + (y1 - gate.py) * gate.ny;
        const side2 = (x2 - gate.px) * gate.nx + (y2 - gate.py) * gate.ny;
        if (!(side1 < -0.001 && side2 >= -0.001)) return false;
        return segmentsIntersect(x1, y1, x2, y2, gate.x1, gate.y1, gate.x2, gate.y2);
    }

    function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
        const rx = bx - ax;
        const ry = by - ay;
        const sx = dx - cx;
        const sy = dy - cy;
        const denom = rx * sy - ry * sx;
        if (Math.abs(denom) < 0.0001) return false;

        const qpx = cx - ax;
        const qpy = cy - ay;
        const t = (qpx * sy - qpy * sx) / denom;
        const u = (qpx * ry - qpy * rx) / denom;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }

    function newBooleanArray(length: number): boolean[] {
        const result: boolean[] = [];
        for (let i = 0; i < length; i++) result.push(false);
        return result;
    }

    function resetProgressForVehicle(vehicle: vehicles.Vehicle): void {
        for (let i = 0; i < activeLists.length; i++) {
            const progress = findProgress(activeLists[i], vehicle);
            if (progress) progress.gatesHit = newBooleanArray(activeLists[i].locations.length);
        }
    }

    function hasCompleteGateProgress(vehicle: vehicles.Vehicle): boolean {
        let sawActiveList = false;
        for (let i = 0; i < activeLists.length; i++) {
            const list = activeLists[i];
            if (!list.active || list.locations.length === 0) continue;
            sawActiveList = true;
            const progress = findProgress(list, vehicle);
            if (!progress || progress.gatesHit.length !== list.locations.length) return false;
            for (let j = 0; j < progress.gatesHit.length; j++) {
                if (!progress.gatesHit[j]) return false;
            }
        }
        return sawActiveList;
    }

    function findFinishProgress(vehicle: vehicles.Vehicle): FinishProgress {
        if (!vehicle || !vehicle.sprite) return undefined;
        for (let i = 0; i < finishProgress.length; i++) {
            if (finishProgress[i].vehicle.sprite.id === vehicle.sprite.id) return finishProgress[i];
        }
        const progress = new FinishProgress(vehicle);
        finishProgress.push(progress);
        return progress;
    }

    function ensureFinishTicker(): void {
        if (finishTickerStarted) return;
        finishTickerStarted = true;
        game.onUpdate(function () {
            tickFinishLine();
        });
    }

    function tickFinishLine(): void {
        const allVehicles = vehicles.all();
        for (let i = 0; i < allVehicles.length; i++) {
            const vehicle = allVehicles[i];
            const sprite = vehicle.sprite;
            const progress = findFinishProgress(vehicle);
            if (!sprite || !progress) continue;

            if (finishLine) {
                const gate = new GateSegment();
                gate.x1 = finishLine.x1;
                gate.y1 = finishLine.y1;
                gate.x2 = finishLine.x2;
                gate.y2 = finishLine.y2;
                gate.px = finishLine.x1;
                gate.py = finishLine.y1;
                gate.nx = finishLine.nx;
                gate.ny = finishLine.ny;

                if (crossedForwardSegment(progress.lastX, progress.lastY, sprite.x, sprite.y, gate)) {
                    const fullLap = progress.crossCount > 0 && hasCompleteGateProgress(vehicle);
                    progress.crossCount++;
                    resetProgressForVehicle(vehicle);
                    fireFinishCrossed(vehicle, fullLap);
                }
            }

            progress.lastX = sprite.x;
            progress.lastY = sprite.y;
        }
    }

    function fireFinishCrossed(vehicle: vehicles.Vehicle, fullLap: boolean): void {
        for (let i = 0; i < finishHandlers.length; i++) {
            finishHandlers[i](vehicle, fullLap);
        }
    }

    function toDegrees(radians: number): number {
        return radians * 180 / Math.PI;
    }

    function normalizeAngle(angle: number): number {
        let a = angle % 360;
        if (a > 180) a -= 360;
        if (a <= -180) a += 360;
        return a;
    }

    function headingDifference(list: WaypointList, vehicle: vehicles.Vehicle): number {
        const progress = ensureProgress(list, vehicle);
        if (!progress) return 0;

        const target = list.locations[progress.currentIndex];
        const toTarget = angleTo(vehicle.sprite, target);
        return normalizeAngle(toTarget - vehicle.angle);
    }
}

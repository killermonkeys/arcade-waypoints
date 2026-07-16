/**
 * Top-down vehicle physics for MakeCode Arcade.
 *
 * A Vehicle wraps a Sprite and owns the angle (orientation and velocity
 * direction), speed, accel/brake power, and lateral grip. Call drive each
 * tick with turn (-1/0/+1) and accel (-1/0/+1) signals - the same ones
 * waypoints.planTurn / planAccel produce - and it applies turning,
 * acceleration, tile-surface modifiers, then updates the sprite's
 * velocity and facing image.
 */
//% color="#2E7D5B" icon="\uf1b9" block="Vehicles"
//% groups=['Vehicle', 'Surfaces']
namespace vehicles {
    // Piecewise turn-rate curve (degrees at reference maxTurnRate of 10°),
    // matched to the classic arcade car bands, scaled by maxTurnRate / 10.
    const TURN_SPEEDS = [0, 20, 50, 100, 150, 200];
    const TURN_DEGREES = [10, 10, 8, 5, 2, 0];

    class SurfaceProps {
        grip: number;
        traction: number;
        friction: number;

        constructor(grip: number, traction: number, friction: number) {
            this.grip = grip;
            this.traction = traction;
            this.friction = friction;
        }
    }

    class SurfaceEntry {
        tile: Image;
        props: SurfaceProps;

        constructor(tile: Image, props: SurfaceProps) {
            this.tile = tile;
            this.props = props;
        }
    }

    const DEFAULT_SURFACE = new SurfaceProps(1, 1, 0);
    const surfaceRegistry: SurfaceEntry[] = [];

    /**
     * A top-down vehicle: a Sprite plus angle/speed/powers/grip used by
     * vehicles.drive. Create one with vehicles.create.
     */
    export class Vehicle {
        sprite: Sprite;
        // Radians; orientation and velocity direction (source of truth).
        angle: number;
        speed: number;
        accelPower: number;
        // Positive speed loss per drive step when braking.
        brakePower: number;
        lateralGrip: number;
        maxSpeed: number;
        // Peak turn rate in radians/step at low speed (default ≈ 10°).
        maxTurnRate: number;
        // Unrotated image used to rebuild the facing sprite each drive step.
        originalImage: Image;

        constructor(sprite: Sprite, originalImage: Image) {
            this.sprite = sprite;
            this.originalImage = originalImage;
            this.angle = 0;
            this.speed = 0;
            this.accelPower = 2;
            this.brakePower = 5;
            this.lateralGrip = 1;
            this.maxSpeed = 200;
            this.maxTurnRate = degreesToRadians(10);
        }
    }

    /**
     * Create a vehicle from an image and sprite kind.
     * @param img the vehicle's image (facing right at angle 0)
     * @param kind the sprite kind
     */
    //% blockId=vehicles_create
    //% block="create vehicle with image $img of kind $kind"
    //% img.shadow=screen_image_picker
    //% kind.shadow=spritekind
    //% blockSetVariable=myVehicle
    //% group="Vehicle" weight=100 blockGap=8
    export function create(img: Image, kind: number): Vehicle {
        const sprite = sprites.create(img, kind);
        const vehicle = new Vehicle(sprite, img.clone());
        applyFacing(vehicle);
        return vehicle;
    }

    /**
     * The underlying sprite of a vehicle (for camera follow, overlaps, etc.).
     */
    //% blockId=vehicles_sprite
    //% block="sprite of $vehicle"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% group="Vehicle" weight=95 blockGap=8
    export function spriteOf(vehicle: Vehicle): Sprite {
        return vehicle ? vehicle.sprite : undefined;
    }

    /**
     * Set the vehicle's facing/velocity angle in degrees.
     */
    //% blockId=vehicles_set_angle
    //% block="set $vehicle angle to $degrees degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% degrees.defl=-90
    //% group="Vehicle" weight=90 blockGap=8
    export function setAngle(vehicle: Vehicle, degrees: number): void {
        if (!vehicle) return;
        vehicle.angle = degreesToRadians(degrees);
        applyFacing(vehicle);
        applyVelocity(vehicle);
    }

    /**
     * The vehicle's facing/velocity angle in degrees.
     */
    //% blockId=vehicles_angle
    //% block="angle of $vehicle degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% group="Vehicle" weight=89 blockGap=8
    export function angle(vehicle: Vehicle): number {
        return vehicle ? radiansToDegrees(vehicle.angle) : 0;
    }

    /**
     * Set the vehicle's speed (magnitude). Clamped to [0, maxSpeed].
     */
    //% blockId=vehicles_set_speed
    //% block="set $vehicle speed to $speed"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% speed.defl=0
    //% group="Vehicle" weight=88 blockGap=8
    export function setSpeed(vehicle: Vehicle, speed: number): void {
        if (!vehicle) return;
        vehicle.speed = clamp(speed, 0, vehicle.maxSpeed);
        applyVelocity(vehicle);
    }

    /**
     * The vehicle's current speed.
     */
    //% blockId=vehicles_speed
    //% block="speed of $vehicle"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% group="Vehicle" weight=87 blockGap=8
    export function speed(vehicle: Vehicle): number {
        return vehicle ? vehicle.speed : 0;
    }

    /**
     * Set how much speed the vehicle gains when accelerating and loses when
     * braking, per drive step (before tile traction is applied).
     * @param accelPower speed gain when accelerating
     * @param brakePower positive speed loss when braking
     */
    //% blockId=vehicles_set_powers
    //% block="set $vehicle accel power $accelPower brake power $brakePower"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% accelPower.defl=2
    //% brakePower.defl=5
    //% group="Vehicle" weight=86 blockGap=8
    export function setPowers(vehicle: Vehicle, accelPower: number, brakePower: number): void {
        if (!vehicle) return;
        vehicle.accelPower = accelPower;
        vehicle.brakePower = Math.max(0, brakePower);
    }

    /**
     * Set the vehicle's base lateral grip (turn multiplier). Default 1;
     * lower makes the vehicle turn less; higher makes it turn more.
     */
    //% blockId=vehicles_set_grip
    //% block="set $vehicle lateral grip to $grip"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% grip.defl=1
    //% group="Vehicle" weight=85 blockGap=8
    export function setLateralGrip(vehicle: Vehicle, grip: number): void {
        if (!vehicle) return;
        vehicle.lateralGrip = grip;
    }

    /**
     * Set the vehicle's maximum speed.
     */
    //% blockId=vehicles_set_max_speed
    //% block="set $vehicle max speed to $maxSpeed"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% maxSpeed.defl=200
    //% group="Vehicle" weight=84 blockGap=8
    export function setMaxSpeed(vehicle: Vehicle, maxSpeed: number): void {
        if (!vehicle) return;
        vehicle.maxSpeed = Math.max(0, maxSpeed);
        if (vehicle.speed > vehicle.maxSpeed) vehicle.speed = vehicle.maxSpeed;
    }

    /**
     * Set the peak turn rate in degrees per drive step at low speed.
     * The turn curve scales with this value (default 10°).
     */
    //% blockId=vehicles_set_max_turn_rate
    //% block="set $vehicle max turn rate to $degrees degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% degrees.defl=10
    //% group="Vehicle" weight=83 blockGap=8
    export function setMaxTurnRate(vehicle: Vehicle, degrees: number): void {
        if (!vehicle) return;
        vehicle.maxTurnRate = degreesToRadians(Math.max(0, degrees));
    }

    /**
     * Drive the vehicle for one step. `turn` and `accel` are typically
     * -1, 0, or +1 (same signals as waypoints.planTurn / planAccel).
     *
     * Applies tile surface grip/traction/friction, updates angle and
     * speed, then sets the sprite's velocity and facing image.
     * @param turn -1 left, 0 straight, +1 right
     * @param accel -1 brake, 0 coast, +1 accelerate
     */
    //% blockId=vehicles_drive
    //% block="drive $vehicle turn $turn accel $accel"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% turn.defl=0
    //% accel.defl=0
    //% group="Vehicle" weight=80 blockGap=8
    export function drive(vehicle: Vehicle, turn: number, accel: number): void {
        if (!vehicle || !vehicle.sprite) return;

        const surface = surfaceUnder(vehicle.sprite);

        if (turn !== 0 && vehicle.speed > 0) {
            const rate = turnRateAtSpeed(vehicle.speed, vehicle.maxTurnRate, vehicle.maxSpeed);
            vehicle.angle = vehicle.angle + rate * vehicle.lateralGrip * surface.grip * turn;
        }

        if (accel > 0) {
            vehicle.speed = vehicle.speed + vehicle.accelPower * surface.traction;
        } else if (accel < 0) {
            vehicle.speed = vehicle.speed - vehicle.brakePower * surface.traction;
        }

        vehicle.speed = vehicle.speed - surface.friction;
        vehicle.speed = clamp(vehicle.speed, 0, vehicle.maxSpeed);

        applyVelocity(vehicle);
        applyFacing(vehicle);
    }

    /**
     * Register how a tile type affects vehicles driving over it.
     *
     * Unregistered tiles use grip 1, traction 1, friction 0.
     * Grip and traction are multipliers (may be above or below 1).
     * Friction is a non-negative additive speed drain per drive step.
     * @param tile the tile image
     * @param grip turn-rate multiplier
     * @param traction accel/brake multiplier
     * @param friction speed lost per drive step (clamped to ≥ 0)
     */
    //% blockId=vehicles_set_surface
    //% block="set surface $tile grip $grip traction $traction friction $friction"
    //% tile.shadow=tileset_tile_picker
    //% grip.defl=1
    //% traction.defl=1
    //% friction.defl=0
    //% group="Surfaces" weight=70 blockGap=8
    export function setSurface(tile: Image, grip: number, traction: number, friction: number): void {
        if (!tile) return;
        const props = new SurfaceProps(grip, traction, Math.max(0, friction));
        for (let i = 0; i < surfaceRegistry.length; i++) {
            if (surfaceRegistry[i].tile.equals(tile)) {
                surfaceRegistry[i].props = props;
                return;
            }
        }
        surfaceRegistry.push(new SurfaceEntry(tile, props));
    }

    export function degreesToRadians(degrees: number): number {
        return degrees * Math.PI / 180;
    }

    export function radiansToDegrees(radians: number): number {
        return radians * 180 / Math.PI;
    }

    function clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    function turnRateAtSpeed(speed: number, maxTurnRate: number, maxSpeed: number): number {
        // Scale the reference curve (degrees at 10° peak) by maxTurnRate / 10°,
        // and stretch speed breakpoints relative to maxSpeed / 200.
        const speedScale = maxSpeed > 0 ? maxSpeed / 200 : 1;
        const rateScale = maxTurnRate / degreesToRadians(10);

        const scaledSpeed = speedScale > 0 ? speed / speedScale : speed;
        const degrees = interpolateTurnDegrees(scaledSpeed);
        return degreesToRadians(degrees) * rateScale;
    }

    function interpolateTurnDegrees(speed: number): number {
        if (speed <= TURN_SPEEDS[0]) return TURN_DEGREES[0];
        for (let i = 1; i < TURN_SPEEDS.length; i++) {
            if (speed <= TURN_SPEEDS[i]) {
                const t0 = TURN_SPEEDS[i - 1];
                const t1 = TURN_SPEEDS[i];
                const d0 = TURN_DEGREES[i - 1];
                const d1 = TURN_DEGREES[i];
                const t = (speed - t0) / (t1 - t0);
                return d0 + (d1 - d0) * t;
            }
        }
        return TURN_DEGREES[TURN_DEGREES.length - 1];
    }

    function surfaceUnder(sprite: Sprite): SurfaceProps {
        const loc = sprite.tilemapLocation();
        if (!loc) return DEFAULT_SURFACE;
        const tile = tiles.tileImageAtLocation(loc);
        if (!tile) return DEFAULT_SURFACE;
        for (let i = 0; i < surfaceRegistry.length; i++) {
            if (surfaceRegistry[i].tile.equals(tile)) return surfaceRegistry[i].props;
        }
        return DEFAULT_SURFACE;
    }

    function applyVelocity(vehicle: Vehicle): void {
        vehicle.sprite.vx = vehicle.speed * Math.cos(vehicle.angle);
        vehicle.sprite.vy = vehicle.speed * Math.sin(vehicle.angle);
    }

    function applyFacing(vehicle: Vehicle): void {
        const degrees = radiansToDegrees(vehicle.angle);
        vehicle.sprite.setImage(rotateImage(vehicle.originalImage, degrees));
    }

    // Same approach as sprite-fx rotateImage: degrees in, rebuild from original.
    function rotateImage(source: Image, angleDegrees: number): Image {
        let normalized = angleDegrees % 360;
        if (normalized < 0) normalized += 360;
        const radians = normalized * Math.PI / 180;
        const sin = Math.sin(radians);
        const cos = Math.cos(radians);

        const w = source.width;
        const h = source.height;
        const centerX = (w - 1) / 2;
        const centerY = (h - 1) / 2;

        const rotated = image.create(w, h);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dx = x - centerX;
                const dy = y - centerY;

                const sourceX = Math.round(cos * dx + sin * dy + centerX);
                const sourceY = Math.round(-sin * dx + cos * dy + centerY);

                if (sourceX >= 0 && sourceX < w && sourceY >= 0 && sourceY < h) {
                    rotated.setPixel(x, y, source.getPixel(sourceX, sourceY));
                }
            }
        }

        return rotated;
    }
}

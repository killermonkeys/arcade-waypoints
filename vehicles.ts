/**
 * Top-down vehicle physics for MakeCode Arcade.
 *
 * A Vehicle wraps a Sprite and owns the angle (orientation and velocity
 * direction), speed, accel/brake power, and turning (maxTurnRate +
 * handling). Call drive each tick with turn (-1/0/+1) and accel (-1/0/+1)
 * signals - the same ones waypoints.planTurn / planAccel produce - and it
 * applies turning, acceleration, tile-surface modifiers, then updates the
 * sprite's velocity and facing image.
 */
//% color="#2E7D5B" icon="\uf1b9" block="Vehicles"
//% groups=['Vehicle', 'Surfaces']
namespace vehicles {
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
    // Vehicles keyed by the wrapped sprite so createFromSprite is idempotent
    // and overlap handlers can recover the Vehicle from a Sprite.
    const vehicleRegistry: Vehicle[] = [];
    // How far sprite vx/vy may drift from speed/angle before we treat the
    // sprite as authoritative (wall bounces, setVelocity, etc.).
    const VELOCITY_SYNC_EPS = 0.5;

    /**
     * A top-down vehicle: a Sprite plus angle/speed/powers/grip used by
     * vehicles.drive. Create one with vehicles.create or
     * vehicles.createFromSprite.
     *
     * Position (x/y) and collisions live only on the sprite - changing
     * them with ordinary sprite ops (setPosition, x = …, etc.) is fine
     * and stays in sync automatically. Speed and angle are vehicle-owned;
     * drive writes them back to sprite vx/vy each step, and will re-read
     * vx/vy first if something else changed the sprite's velocity.
     */
    export class Vehicle {
        sprite: Sprite;
        // Degrees; orientation and velocity direction (source of truth).
        angle: number;
        speed: number;
        accelPower: number;
        // Positive speed loss per drive step when braking.
        brakePower: number;
        maxSpeed: number;
        // Peak turn rate in degrees/step at speed 0 (default 10°).
        maxTurnRate: number;
        // How quickly turn rate falls off as speed approaches maxSpeed.
        // turnRate = maxTurnRate * (1 - speed/maxSpeed)^handling
        // 1 = linear; <1 keeps more turn at high speed; >1 loses turn sooner.
        handling: number;
        // Unrotated image used to rebuild the facing sprite each drive step.
        originalImage: Image;

        constructor(sprite: Sprite, originalImage: Image) {
            this.sprite = sprite;
            this.originalImage = originalImage;
            this.angle = 0;
            this.speed = 0;
            this.accelPower = 2;
            this.brakePower = 5;
            this.maxSpeed = 200;
            this.maxTurnRate = 10;
            this.handling = 1;
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
        return createFromSprite(sprites.create(img, kind));
    }

    /**
     * Wrap an existing sprite as a vehicle (same sprite instance - position,
     * overlaps, camera follow, etc. keep working on it). Calling again on
     * the same sprite returns the existing vehicle.
     *
     * The sprite's current image is treated as the unrotated (angle 0,
     * facing right) art. If the sprite is already moving, speed and angle
     * are seeded from its velocity.
     * @param sprite the sprite to drive as a vehicle
     */
    //% blockId=vehicles_create_from_sprite
    //% block="create vehicle from $sprite"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% blockSetVariable=myVehicle
    //% group="Vehicle" weight=99 blockGap=8
    export function createFromSprite(sprite: Sprite): Vehicle {
        if (!sprite) return undefined;

        const existing = vehicleOf(sprite);
        if (existing) return existing;

        const vehicle = new Vehicle(sprite, sprite.image.clone());
        seedKinematicsFromSprite(vehicle);
        vehicleRegistry.push(vehicle);
        applyFacing(vehicle);
        applyVelocity(vehicle);
        return vehicle;
    }

    /**
     * The vehicle wrapping this sprite, or undefined if it isn't one.
     * Handy from overlap / destruction handlers that only receive a Sprite.
     */
    //% blockId=vehicles_of_sprite
    //% block="vehicle of $sprite"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Vehicle" weight=96 blockGap=8
    export function vehicleOf(sprite: Sprite): Vehicle {
        if (!sprite) return undefined;
        pruneDestroyedVehicles();
        for (let i = 0; i < vehicleRegistry.length; i++) {
            if (vehicleRegistry[i].sprite && vehicleRegistry[i].sprite.id === sprite.id) {
                return vehicleRegistry[i];
            }
        }
        return undefined;
    }

    /**
     * All live vehicles currently registered with this extension.
     */
    export function all(): Vehicle[] {
        pruneDestroyedVehicles();
        return vehicleRegistry.slice();
    }

    /**
     * The underlying sprite of a vehicle (for camera follow, overlaps, etc.).
     * Same object you passed to createFromSprite, or that create made.
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
        vehicle.angle = degrees;
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
        return vehicle ? vehicle.angle : 0;
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
     * Set the vehicle's maximum speed. Turn rate falls to zero as speed
     * approaches this value.
     */
    //% blockId=vehicles_set_max_speed
    //% block="set $vehicle max speed to $maxSpeed"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% maxSpeed.defl=200
    //% group="Vehicle" weight=85 blockGap=8
    export function setMaxSpeed(vehicle: Vehicle, maxSpeed: number): void {
        if (!vehicle) return;
        vehicle.maxSpeed = Math.max(0, maxSpeed);
        if (vehicle.speed > vehicle.maxSpeed) vehicle.speed = vehicle.maxSpeed;
    }

    /**
     * Set the peak turn rate in degrees per drive step at speed 0 (default 10°).
     * Actual turn rate falls toward zero as speed approaches max speed,
     * shaped by handling.
     */
    //% blockId=vehicles_set_max_turn_rate
    //% block="set $vehicle max turn rate to $degrees degrees"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% degrees.defl=10
    //% group="Vehicle" weight=84 blockGap=8
    export function setMaxTurnRate(vehicle: Vehicle, degrees: number): void {
        if (!vehicle) return;
        vehicle.maxTurnRate = Math.max(0, degrees);
    }

    /**
     * Set how quickly turn rate falls off with speed (default 1 = linear).
     * Values below 1 keep more steering at high speed; values above 1
     * lose steering sooner. Always clamped to at least a small positive
     * number so the power curve stays well-defined.
     */
    //% blockId=vehicles_set_handling
    //% block="set $vehicle handling to $handling"
    //% vehicle.shadow=variables_get
    //% vehicle.defl=myVehicle
    //% handling.defl=1
    //% group="Vehicle" weight=83 blockGap=8
    export function setHandling(vehicle: Vehicle, handling: number): void {
        if (!vehicle) return;
        vehicle.handling = Math.max(0.01, handling);
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

        // Pick up external velocity changes (bounces, setVelocity, etc.)
        // before applying this step's turn/accel.
        syncKinematicsFromSprite(vehicle);

        const surface = surfaceUnder(vehicle.sprite);

        if (turn !== 0 && vehicle.speed > 0) {
            const rate = turnRateAtSpeed(vehicle.speed, vehicle.maxSpeed, vehicle.maxTurnRate, vehicle.handling);
            vehicle.angle = vehicle.angle + rate * surface.grip * turn;
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

    function clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }

    function toRadians(degrees: number): number {
        return degrees * Math.PI / 180;
    }

    function toDegrees(radians: number): number {
        return radians * 180 / Math.PI;
    }

    // Peak turn at speed 0, zero at maxSpeed: maxTurnRate * (1 - speed/maxSpeed)^handling
    function turnRateAtSpeed(speed: number, maxSpeed: number, maxTurnRate: number, handling: number): number {
        if (maxSpeed <= 0 || speed >= maxSpeed) return 0;
        const t = clamp(speed / maxSpeed, 0, 1);
        return maxTurnRate * Math.pow(1 - t, handling);
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

    function pruneDestroyedVehicles(): void {
        for (let i = vehicleRegistry.length - 1; i >= 0; i--) {
            const sp = vehicleRegistry[i].sprite;
            if (!sp || (sp.flags & sprites.Flag.Destroyed)) {
                vehicleRegistry.splice(i, 1);
            }
        }
    }

    // Seed speed/angle from the sprite's current velocity (used when wrapping).
    function seedKinematicsFromSprite(vehicle: Vehicle): void {
        const vx = vehicle.sprite.vx;
        const vy = vehicle.sprite.vy;
        const mag = Math.sqrt(vx * vx + vy * vy);
        vehicle.speed = clamp(mag, 0, vehicle.maxSpeed);
        if (mag > VELOCITY_SYNC_EPS) {
            vehicle.angle = toDegrees(Math.atan2(vy, vx));
        }
    }

    // If sprite vx/vy no longer match what speed/angle would produce, treat
    // the sprite as authoritative so wall bounces and sprite.setVelocity stay
    // consistent with the next drive step.
    function syncKinematicsFromSprite(vehicle: Vehicle): void {
        const radians = toRadians(vehicle.angle);
        const expectedVx = vehicle.speed * Math.cos(radians);
        const expectedVy = vehicle.speed * Math.sin(radians);
        const sp = vehicle.sprite;
        if (Math.abs(sp.vx - expectedVx) <= VELOCITY_SYNC_EPS
            && Math.abs(sp.vy - expectedVy) <= VELOCITY_SYNC_EPS) {
            return;
        }
        seedKinematicsFromSprite(vehicle);
    }

    function applyVelocity(vehicle: Vehicle): void {
        const radians = toRadians(vehicle.angle);
        vehicle.sprite.vx = vehicle.speed * Math.cos(radians);
        vehicle.sprite.vy = vehicle.speed * Math.sin(radians);
    }

    function applyFacing(vehicle: Vehicle): void {
        vehicle.sprite.setImage(rotateImage(vehicle.originalImage, vehicle.angle));
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

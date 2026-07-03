export const FIELD_LENGTH_METERS = 16.541;
export const FIELD_WIDTH_METERS = 8.069;
export const MODULE_HALF_LENGTH_METERS = 0.3429;
export const MODULE_HALF_WIDTH_METERS = 0.3429;

export const ROBOT_MODEL_YAW_OFFSET_RADIANS = 0;

export const MODULE_LOCATIONS = [
  { x: MODULE_HALF_LENGTH_METERS, y: MODULE_HALF_WIDTH_METERS },
  { x: MODULE_HALF_LENGTH_METERS, y: -MODULE_HALF_WIDTH_METERS },
  { x: -MODULE_HALF_LENGTH_METERS, y: MODULE_HALF_WIDTH_METERS },
  { x: -MODULE_HALF_LENGTH_METERS, y: -MODULE_HALF_WIDTH_METERS },
] as const;

export interface RobotChassisSpeeds {
  vxMetersPerSecond: number;
  vyMetersPerSecond: number;
  omegaRadiansPerSecond: number;
}

export interface RobotModuleState {
  speedMetersPerSecond: number;
  angleRadians: number;
}

export interface RobotDriveModuleCommand extends RobotModuleState {
  locationMeters: {
    x: number;
    y: number;
  };
}

export function normalizeRadians(value: number) {
  let result = value;
  while (result > Math.PI) {
    result -= Math.PI * 2;
  }
  while (result < -Math.PI) {
    result += Math.PI * 2;
  }
  return result;
}

// FieldCore uses Babylon's left-handed X/Z ground plane, while WPILib uses a
// right-handed X/Y field plane. Mapping WPILib y(left) directly onto FieldCore z
// introduces one handedness flip, so the FieldCore/Babylon robot heading is the
// negated WPILib yaw.
export function wpilibYawToFieldCoreRobotYaw(wpilibYawRadians: number) {
  return normalizeRadians(-wpilibYawRadians);
}

export function fieldCoreRobotYawToWpilibYaw(fieldCoreRobotYawRadians: number) {
  return normalizeRadians(-fieldCoreRobotYawRadians);
}

export function wpilibBlueXToFieldCoreX(wpilibXMeters: number) {
  return wpilibXMeters - FIELD_LENGTH_METERS / 2;
}

export function wpilibBlueYToFieldCoreZ(wpilibYMeters: number) {
  return wpilibYMeters - FIELD_WIDTH_METERS / 2;
}

export function fieldCoreXToWpilibBlueX(fieldCoreXMeters: number) {
  return fieldCoreXMeters + FIELD_LENGTH_METERS / 2;
}

export function fieldCoreZToWpilibBlueY(fieldCoreZMeters: number) {
  return fieldCoreZMeters + FIELD_WIDTH_METERS / 2;
}

export function robotYawToModelYaw(robotYawRadians: number) {
  return normalizeRadians(robotYawRadians + ROBOT_MODEL_YAW_OFFSET_RADIANS);
}

export function robotModelYawToRobotYaw(modelYawRadians: number) {
  return normalizeRadians(modelYawRadians - ROBOT_MODEL_YAW_OFFSET_RADIANS);
}

export function wpilibYawToRobotModelYaw(wpilibYawRadians: number) {
  return robotYawToModelYaw(wpilibYawToFieldCoreRobotYaw(wpilibYawRadians));
}

export function robotModelYawToWpilibYaw(modelYawRadians: number) {
  return fieldCoreRobotYawToWpilibYaw(robotModelYawToRobotYaw(modelYawRadians));
}

/**
 * Rotates a WPILib robot-frame vector (x forward, y left) into FieldCore world
 * axes (x field-length, z field-width) given the robot heading.
 *
 * WPILib field vector = [cosθ·rx − sinθ·ry, sinθ·rx + cosθ·ry]. FieldCore keeps
 * x and maps WPILib y onto z directly, while the FieldCore heading is ψ = −θ,
 * giving:
 *   x =  cosψ·rx + sinψ·ry
 *   z = −sinψ·rx + cosψ·ry
 */
export function rotateRobotVectorToFieldCore(
  robotX: number,
  robotY: number,
  fieldCoreRobotYawRadians: number,
) {
  const cos = Math.cos(fieldCoreRobotYawRadians);
  const sin = Math.sin(fieldCoreRobotYawRadians);
  return {
    x: cos * robotX + sin * robotY,
    z: -sin * robotX + cos * robotY,
  };
}

// Inverse of rotateRobotVectorToFieldCore.
export function rotateFieldCoreVectorToRobot(
  fieldX: number,
  fieldZ: number,
  fieldCoreRobotYawRadians: number,
) {
  const cos = Math.cos(fieldCoreRobotYawRadians);
  const sin = Math.sin(fieldCoreRobotYawRadians);
  return {
    x: cos * fieldX - sin * fieldZ,
    y: sin * fieldX + cos * fieldZ,
  };
}

export function moduleStatesFromChassisSpeeds(speeds: RobotChassisSpeeds): RobotModuleState[] {
  return MODULE_LOCATIONS.map((location) => {
    const wheelVx = speeds.vxMetersPerSecond - speeds.omegaRadiansPerSecond * location.y;
    const wheelVy = speeds.vyMetersPerSecond + speeds.omegaRadiansPerSecond * location.x;
    return {
      speedMetersPerSecond: Math.hypot(wheelVx, wheelVy),
      angleRadians: Math.atan2(wheelVy, wheelVx),
    };
  });
}

export function chassisSpeedsFromModuleStates(states: readonly RobotModuleState[]): RobotChassisSpeeds {
  const wheelVectors = states.slice(0, MODULE_LOCATIONS.length).map((state) => ({
    vx: state.speedMetersPerSecond * Math.cos(state.angleRadians),
    vy: state.speedMetersPerSecond * Math.sin(state.angleRadians),
  }));
  const vx =
    wheelVectors.reduce((sum, vector) => sum + vector.vx, 0) / Math.max(1, wheelVectors.length);
  const vy =
    wheelVectors.reduce((sum, vector) => sum + vector.vy, 0) / Math.max(1, wheelVectors.length);
  let omegaNumerator = 0;
  let omegaDenominator = 0;
  wheelVectors.forEach((vector, index) => {
    const location = MODULE_LOCATIONS[index];
    omegaNumerator += -location.y * (vector.vx - vx) + location.x * (vector.vy - vy);
    omegaDenominator += location.x * location.x + location.y * location.y;
  });
  return {
    vxMetersPerSecond: vx,
    vyMetersPerSecond: vy,
    omegaRadiansPerSecond: omegaDenominator > 1e-9 ? omegaNumerator / omegaDenominator : 0,
  };
}

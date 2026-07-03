import assert from "node:assert/strict";
import {
  MODULE_LOCATIONS,
  ROBOT_MODEL_YAW_OFFSET_RADIANS,
  chassisSpeedsFromModuleStates,
  fieldCoreXToWpilibBlueX,
  fieldCoreZToWpilibBlueY,
  fieldCoreRobotYawToWpilibYaw,
  moduleStatesFromChassisSpeeds,
  robotModelYawToRobotYaw,
  rotateRobotVectorToFieldCore,
  wpilibBlueXToFieldCoreX,
  wpilibBlueYToFieldCoreZ,
  wpilibYawToFieldCoreRobotYaw,
  wpilibYawToRobotModelYaw,
} from "../src/core/math/driveCoordinates.ts";

const EPSILON = 1e-9;

function nearly(actual, expected, label) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${label}: expected ${expected}, got ${actual}`,
  );
}

function vectorNearly(actual, expected, label) {
  nearly(actual.x, expected.x, `${label}.x`);
  nearly(actual.z, expected.z, `${label}.z`);
}

function summarizeModuleForces(states, robotYawRadians) {
  return states.slice(0, MODULE_LOCATIONS.length).reduce(
    (sum, state, index) => {
      const direction = rotateRobotVectorToFieldCore(
        Math.cos(state.angleRadians),
        Math.sin(state.angleRadians),
        robotYawRadians,
      );
      const offset = rotateRobotVectorToFieldCore(
        MODULE_LOCATIONS[index].x,
        MODULE_LOCATIONS[index].y,
        robotYawRadians,
      );
      const forceX = direction.x * state.speedMetersPerSecond;
      const forceZ = direction.z * state.speedMetersPerSecond;
      return {
        x: sum.x + forceX,
        z: sum.z + forceZ,
        torqueY: sum.torqueY + offset.z * forceX - offset.x * forceZ,
      };
    },
    { x: 0, z: 0, torqueY: 0 },
  );
}

function horizontalUnit(vector) {
  const length = Math.hypot(vector.x, vector.z);
  return length < 1e-9 ? { x: 0, z: 0 } : { x: vector.x / length, z: vector.z / length };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function summarizeModuleDriveImpulses(
  states,
  robotYawRadians,
  robotVelocity = { x: 0, z: 0 },
  angularVelocityY = 0,
  dtSeconds = 1 / 60,
) {
  const massKg = 68;
  const massPerModule = massKg / MODULE_LOCATIONS.length;
  const normalForcePerModule = (massKg * 9.81) / MODULE_LOCATIONS.length;
  const maxDriveImpulse = normalForcePerModule * 3.2 * dtSeconds;
  const maxSideImpulse = normalForcePerModule * 2.2 * dtSeconds;

  return states.slice(0, MODULE_LOCATIONS.length).reduce(
    (sum, state, index) => {
      const wheelAxisRobotX = Math.cos(state.angleRadians);
      const wheelAxisRobotY = Math.sin(state.angleRadians);
      const driveDirection = horizontalUnit(
        rotateRobotVectorToFieldCore(wheelAxisRobotX, wheelAxisRobotY, robotYawRadians),
      );
      const sideDirection = horizontalUnit(
        rotateRobotVectorToFieldCore(-wheelAxisRobotY, wheelAxisRobotX, robotYawRadians),
      );
      const moduleOffset = rotateRobotVectorToFieldCore(
        MODULE_LOCATIONS[index].x,
        MODULE_LOCATIONS[index].y,
        robotYawRadians,
      );
      const worldOffset = {
        x: moduleOffset.x,
        y: 0,
        z: moduleOffset.z,
      };
      const pointVelocity = {
        x: robotVelocity.x + angularVelocityY * worldOffset.z,
        z: robotVelocity.z - angularVelocityY * worldOffset.x,
      };
      const targetVelocity = {
        x: driveDirection.x * state.speedMetersPerSecond,
        z: driveDirection.z * state.speedMetersPerSecond,
      };
      const driveVelocityError =
        (targetVelocity.x - pointVelocity.x) * driveDirection.x +
        (targetVelocity.z - pointVelocity.z) * driveDirection.z;
      const driveImpulseMagnitude = clamp(
        massPerModule * driveVelocityError,
        -maxDriveImpulse,
        maxDriveImpulse,
      );
      const sideVelocity = pointVelocity.x * sideDirection.x + pointVelocity.z * sideDirection.z;
      const sideImpulseMagnitude = clamp(
        -massPerModule * sideVelocity,
        -maxSideImpulse,
        maxSideImpulse,
      );
      const impulse = {
        x: driveDirection.x * driveImpulseMagnitude + sideDirection.x * sideImpulseMagnitude,
        z: driveDirection.z * driveImpulseMagnitude + sideDirection.z * sideImpulseMagnitude,
      };
      return {
        x: sum.x + impulse.x,
        z: sum.z + impulse.z,
        torqueX: sum.torqueX + worldOffset.y * impulse.z,
        torqueY: sum.torqueY + worldOffset.z * impulse.x - worldOffset.x * impulse.z,
        torqueZ: sum.torqueZ - worldOffset.y * impulse.x,
      };
    },
    { x: 0, z: 0, torqueX: 0, torqueY: 0, torqueZ: 0 },
  );
}

function outsideDeadband(value, deadband) {
  const magnitude = Math.abs(value);
  return magnitude <= deadband ? 0 : Math.sign(value) * (magnitude - deadband);
}

function suspensionAngularImpulse(angleRadians, angularVelocityRadiansPerSecond, inertiaKgMetersSquared, dtSeconds) {
  const angleError = outsideDeadband(angleRadians, (18 * Math.PI) / 180);
  const frequency = 8;
  const angularAcceleration = -frequency * frequency * angleError - 2 * 0.85 * frequency * angularVelocityRadiansPerSecond;
  return inertiaKgMetersSquared * angularAcceleration * dtSeconds;
}

function summarizeSuspensionStabilityImpulse(
  rotation = { pitch: 0, roll: 0 },
  angularVelocity = { x: 0, z: 0 },
  dtSeconds = 1 / 60,
) {
  const config = { massKg: 68, widthMeters: 0.8, lengthMeters: 0.9, heightMeters: 0.55 };
  const inertiaScale = 1.85;
  const inertiaAroundX =
    ((config.massKg * (config.heightMeters * config.heightMeters + config.widthMeters * config.widthMeters)) / 12) *
    inertiaScale;
  const inertiaAroundZ =
    ((config.massKg * (config.lengthMeters * config.lengthMeters + config.heightMeters * config.heightMeters)) / 12) *
    inertiaScale;
  const maxAngularImpulse = config.massKg * 3.2 * dtSeconds;
  return {
    x: clamp(suspensionAngularImpulse(rotation.pitch, angularVelocity.x, inertiaAroundX, dtSeconds), -maxAngularImpulse, maxAngularImpulse),
    y: 0,
    z: clamp(suspensionAngularImpulse(rotation.roll, angularVelocity.z, inertiaAroundZ, dtSeconds), -maxAngularImpulse, maxAngularImpulse),
  };
}

nearly(ROBOT_MODEL_YAW_OFFSET_RADIANS, 0, "model yaw offset");

nearly(wpilibBlueXToFieldCoreX(0), -16.541 / 2, "blue wall WPILib x maps to negative centered x");
nearly(wpilibBlueXToFieldCoreX(16.541), 16.541 / 2, "red wall WPILib x maps to positive centered x");
nearly(wpilibBlueXToFieldCoreX(1) - wpilibBlueXToFieldCoreX(0), 1, "WPILib +X remains FieldCore +X");
nearly(wpilibBlueYToFieldCoreZ(1) - wpilibBlueYToFieldCoreZ(0), 1, "WPILib +Y remains FieldCore +Z");
nearly(fieldCoreXToWpilibBlueX(wpilibBlueXToFieldCoreX(3.2)), 3.2, "x conversion roundtrip");
nearly(fieldCoreZToWpilibBlueY(wpilibBlueYToFieldCoreZ(2.4)), 2.4, "y/z conversion roundtrip");

const modelYawAtWpilibZero = wpilibYawToRobotModelYaw(0);
nearly(modelYawAtWpilibZero, 0, "WPILib yaw 0 model yaw");
nearly(robotModelYawToRobotYaw(modelYawAtWpilibZero), 0, "model yaw 0 -> robot yaw 0");
nearly(fieldCoreRobotYawToWpilibYaw(0), 0, "robot yaw 0 -> WPILib yaw 0");
nearly(wpilibYawToFieldCoreRobotYaw(Math.PI / 2), -Math.PI / 2, "WPILib +90 -> FieldCore robot -90");

vectorNearly(rotateRobotVectorToFieldCore(1, 0, 0), { x: 1, z: 0 }, "yaw0 forward");
vectorNearly(rotateRobotVectorToFieldCore(0, 1, 0), { x: 0, z: 1 }, "yaw0 left");
vectorNearly(rotateRobotVectorToFieldCore(1, 0, -Math.PI / 2), { x: 0, z: 1 }, "yaw90 forward");

const forwardStates = moduleStatesFromChassisSpeeds({
  vxMetersPerSecond: 1,
  vyMetersPerSecond: 0,
  omegaRadiansPerSecond: 0,
});
const forwardSummary = summarizeModuleForces(forwardStates, 0);
nearly(forwardSummary.x, 4, "vx+ force x");
nearly(forwardSummary.z, 0, "vx+ force z");
nearly(forwardSummary.torqueY, 0, "vx+ torque");

const leftStates = moduleStatesFromChassisSpeeds({
  vxMetersPerSecond: 0,
  vyMetersPerSecond: 1,
  omegaRadiansPerSecond: 0,
});
const leftSummary = summarizeModuleForces(leftStates, 0);
nearly(leftSummary.x, 0, "vy+ force x");
nearly(leftSummary.z, 4, "vy+ force z");
nearly(leftSummary.torqueY, 0, "vy+ torque");

const rotatedForwardSummary = summarizeModuleForces(forwardStates, -Math.PI / 2);
nearly(rotatedForwardSummary.x, 0, "yaw90 vx+ force x");
nearly(rotatedForwardSummary.z, 4, "yaw90 vx+ force z");

const spinStates = moduleStatesFromChassisSpeeds({
  vxMetersPerSecond: 0,
  vyMetersPerSecond: 0,
  omegaRadiansPerSecond: 1,
});
const spinSummary = summarizeModuleForces(spinStates, 0);
nearly(spinSummary.x, 0, "omega+ force x");
nearly(spinSummary.z, 0, "omega+ force z");
assert.ok(spinSummary.torqueY < 0, `omega+ should produce Babylon negative-yaw torque, got ${spinSummary.torqueY}`);

const forwardDriveImpulse = summarizeModuleDriveImpulses(forwardStates, 0);
assert.ok(forwardDriveImpulse.x > 0, `vx+ should drive FieldCore +X, got ${forwardDriveImpulse.x}`);
nearly(forwardDriveImpulse.z, 0, "vx+ drive impulse z");
nearly(forwardDriveImpulse.torqueX, 0, "vx+ drive impulse roll torque");
nearly(forwardDriveImpulse.torqueY, 0, "vx+ drive impulse torque");
nearly(forwardDriveImpulse.torqueZ, 0, "vx+ drive impulse pitch torque");

const leftDriveImpulse = summarizeModuleDriveImpulses(leftStates, 0);
nearly(leftDriveImpulse.x, 0, "vy+ drive impulse x");
assert.ok(leftDriveImpulse.z > 0, `vy+ should drive FieldCore +Z, got ${leftDriveImpulse.z}`);
nearly(leftDriveImpulse.torqueX, 0, "vy+ drive impulse roll torque");
nearly(leftDriveImpulse.torqueY, 0, "vy+ drive impulse torque");
nearly(leftDriveImpulse.torqueZ, 0, "vy+ drive impulse pitch torque");

const spinDriveImpulse = summarizeModuleDriveImpulses(spinStates, 0);
nearly(spinDriveImpulse.x, 0, "omega+ drive impulse x");
nearly(spinDriveImpulse.z, 0, "omega+ drive impulse z");
assert.ok(
  spinDriveImpulse.torqueY < 0,
  `omega+ drive should produce Babylon negative-yaw torque, got ${spinDriveImpulse.torqueY}`,
);

const sideSlipImpulse = summarizeModuleDriveImpulses(forwardStates, 0, { x: 0, z: 1 });
assert.ok(sideSlipImpulse.z < 0, `side constraint should oppose +Z slip, got ${sideSlipImpulse.z}`);

const smallTiltStability = summarizeSuspensionStabilityImpulse({ pitch: 0.05, roll: -0.05 });
nearly(smallTiltStability.x, 0, "small pitch inside suspension deadband");
nearly(smallTiltStability.y, 0, "suspension stability does not touch yaw");
nearly(smallTiltStability.z, 0, "small roll inside suspension deadband");

const rollPitchRateStability = summarizeSuspensionStabilityImpulse(
  { pitch: 0, roll: 0 },
  { x: 1, z: -1 },
);
assert.ok(rollPitchRateStability.x < 0, `pitch damping should oppose +X angular velocity, got ${rollPitchRateStability.x}`);
nearly(rollPitchRateStability.y, 0, "roll/pitch damping does not touch yaw");
assert.ok(rollPitchRateStability.z > 0, `roll damping should oppose -Z angular velocity, got ${rollPitchRateStability.z}`);

const largeTiltStability = summarizeSuspensionStabilityImpulse({ pitch: 0.5, roll: -0.5 });
assert.ok(largeTiltStability.x < 0, `large positive pitch should restore negative X, got ${largeTiltStability.x}`);
nearly(largeTiltStability.y, 0, "large tilt stability does not touch yaw");
assert.ok(largeTiltStability.z > 0, `large negative roll should restore positive Z, got ${largeTiltStability.z}`);

const roundTrip = chassisSpeedsFromModuleStates(moduleStatesFromChassisSpeeds({
  vxMetersPerSecond: 1.2,
  vyMetersPerSecond: -0.4,
  omegaRadiansPerSecond: 0.8,
}));
nearly(roundTrip.vxMetersPerSecond, 1.2, "roundtrip vx");
nearly(roundTrip.vyMetersPerSecond, -0.4, "roundtrip vy");
nearly(roundTrip.omegaRadiansPerSecond, 0.8, "roundtrip omega");

const robotYawFromModel = robotModelYawToRobotYaw(0);
const modelForwardSummary = summarizeModuleForces(forwardStates, robotYawFromModel);
nearly(modelForwardSummary.x, 4, "model yaw offset does not reverse vx");
nearly(modelForwardSummary.z, 0, "model yaw offset does not add z");

console.log("drive-coordinate logic tests passed");

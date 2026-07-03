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

nearly(ROBOT_MODEL_YAW_OFFSET_RADIANS, Math.PI, "model yaw offset");

nearly(wpilibBlueXToFieldCoreX(0), -16.541 / 2, "blue wall WPILib x maps to negative centered x");
nearly(wpilibBlueXToFieldCoreX(16.541), 16.541 / 2, "red wall WPILib x maps to positive centered x");
nearly(wpilibBlueXToFieldCoreX(1) - wpilibBlueXToFieldCoreX(0), 1, "WPILib +X remains FieldCore +X");
nearly(wpilibBlueYToFieldCoreZ(1) - wpilibBlueYToFieldCoreZ(0), 1, "WPILib +Y remains FieldCore +Z");
nearly(fieldCoreXToWpilibBlueX(wpilibBlueXToFieldCoreX(3.2)), 3.2, "x conversion roundtrip");
nearly(fieldCoreZToWpilibBlueY(wpilibBlueYToFieldCoreZ(2.4)), 2.4, "y/z conversion roundtrip");

const modelYawAtWpilibZero = wpilibYawToRobotModelYaw(0);
nearly(Math.abs(modelYawAtWpilibZero), Math.PI, "WPILib yaw 0 model yaw");
nearly(robotModelYawToRobotYaw(modelYawAtWpilibZero), 0, "model yaw 180 -> robot yaw 0");
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

const roundTrip = chassisSpeedsFromModuleStates(moduleStatesFromChassisSpeeds({
  vxMetersPerSecond: 1.2,
  vyMetersPerSecond: -0.4,
  omegaRadiansPerSecond: 0.8,
}));
nearly(roundTrip.vxMetersPerSecond, 1.2, "roundtrip vx");
nearly(roundTrip.vyMetersPerSecond, -0.4, "roundtrip vy");
nearly(roundTrip.omegaRadiansPerSecond, 0.8, "roundtrip omega");

const robotYawFromFlippedModel = robotModelYawToRobotYaw(Math.PI);
const flippedModelForwardSummary = summarizeModuleForces(forwardStates, robotYawFromFlippedModel);
nearly(flippedModelForwardSummary.x, 4, "model 180 visual offset does not reverse vx");
nearly(flippedModelForwardSummary.z, 0, "model 180 visual offset does not add z");

console.log("drive-coordinate logic tests passed");

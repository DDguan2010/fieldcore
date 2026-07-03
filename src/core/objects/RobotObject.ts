import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  rotateRobotVectorToFieldCore,
  type RobotDriveModuleCommand,
} from "../math/driveCoordinates";
import { poseToQuaternion, poseToVector3, vectorQuaternionToPose, type Pose3dDto } from "../math/pose";
import { BaseSimObject } from "./SimObject";

export interface RobotConfig {
  widthMeters: number;
  lengthMeters: number;
  heightMeters: number;
  massKg: number;
  bumperHeightMeters: number;
  color: string;
}

export type RobotMotionMode = "networktables-pose" | "physics-from-module-states";

export const defaultRobotConfig: RobotConfig = {
  widthMeters: 0.8,
  lengthMeters: 0.9,
  heightMeters: 0.55,
  massKg: 68,
  bumperHeightMeters: 0.18,
  color: "#9ccaff",
};

export class RobotObject extends BaseSimObject {
  motionMode: RobotMotionMode = "physics-from-module-states";

  constructor(id: string, pose: Pose3dDto, public config: RobotConfig, mesh: Mesh, body?: PhysicsBody) {
    super(id, "robot", pose, { label: "Robot" }, mesh, body);
  }

  setPose(pose: Pose3dDto) {
    this.pose = pose;
    if (this.mesh) {
      this.mesh.position = poseToVector3(pose);
      this.mesh.rotationQuaternion = poseToQuaternion(pose);
    }
    if (this.body) {
      this.body.transformNode.setAbsolutePosition(poseToVector3(pose));
      this.body.transformNode.rotationQuaternion = poseToQuaternion(pose);
      this.body.setLinearVelocity(Vector3.Zero());
      this.body.setAngularVelocity(Vector3.Zero());
    }
  }

  syncPoseFromPhysics() {
    if (!this.mesh) {
      return;
    }
    this.pose = vectorQuaternionToPose(
      this.mesh.position,
      this.mesh.rotationQuaternion ?? poseToQuaternion(this.pose),
    );
  }

  applyModuleDrive(commands: RobotDriveModuleCommand[], dtSeconds: number, robotFrameYawRadians: number) {
    if (!this.body || !this.mesh || commands.length === 0 || dtSeconds <= 0) {
      return;
    }
    const center = this.mesh.getAbsolutePosition();
    const linearVelocity = this.body.getLinearVelocity();
    const angularVelocity = this.body.getAngularVelocity();
    const massPerModule = this.config.massKg / commands.length;
    const normalForcePerModule = (this.config.massKg * 9.81) / commands.length;
    const maxDriveImpulse = normalForcePerModule * DRIVE_GRIP_G * dtSeconds;
    const maxSideImpulse = normalForcePerModule * SIDE_GRIP_G * dtSeconds;

    commands.forEach((command) => {
      const wheelAxisRobotX = Math.cos(command.angleRadians);
      const wheelAxisRobotY = Math.sin(command.angleRadians);
      const driveDirection = horizontalUnit(
        rotateRobotVectorToFieldCore(wheelAxisRobotX, wheelAxisRobotY, robotFrameYawRadians),
      );
      const sideDirection = horizontalUnit(
        rotateRobotVectorToFieldCore(-wheelAxisRobotY, wheelAxisRobotX, robotFrameYawRadians),
      );
      const fieldModuleOffset = rotateRobotVectorToFieldCore(
        command.locationMeters.x,
        command.locationMeters.y,
        robotFrameYawRadians,
      );
      const worldOffset = new Vector3(fieldModuleOffset.x, 0, fieldModuleOffset.z);
      const modulePointVelocity = linearVelocity.add(Vector3.Cross(angularVelocity, worldOffset));
      modulePointVelocity.y = 0;

      const targetVelocity = driveDirection.scale(command.speedMetersPerSecond);
      const driveVelocityError = Vector3.Dot(targetVelocity.subtract(modulePointVelocity), driveDirection);
      const driveImpulseMagnitude = clamp(
        massPerModule * driveVelocityError,
        -maxDriveImpulse,
        maxDriveImpulse,
      );
      const sideVelocity = Vector3.Dot(modulePointVelocity, sideDirection);
      const sideImpulseMagnitude = clamp(
        -massPerModule * sideVelocity,
        -maxSideImpulse,
        maxSideImpulse,
      );
      const impulse = driveDirection
        .scale(driveImpulseMagnitude)
        .add(sideDirection.scale(sideImpulseMagnitude));

      this.body?.applyImpulse(impulse, center.add(worldOffset));
    });
  }

  applySuspensionStability(dtSeconds: number) {
    if (!this.body || !this.mesh || dtSeconds <= 0) {
      return;
    }
    const rotation = vectorQuaternionToPose(
      this.mesh.position,
      this.mesh.rotationQuaternion ?? poseToQuaternion(this.pose),
    ).rotation;
    const angularVelocity = this.body.getAngularVelocity();
    const maxAngularImpulse = this.config.massKg * MAX_UPRIGHT_ANGULAR_IMPULSE_PER_KG_PER_SECOND * dtSeconds;
    const pitchImpulse = clamp(
      suspensionAngularImpulse(
        rotation.pitch,
        angularVelocity.x,
        estimateBodyInertiaAroundX(this.config),
        dtSeconds,
      ),
      -maxAngularImpulse,
      maxAngularImpulse,
    );
    const rollImpulse = clamp(
      suspensionAngularImpulse(
        rotation.roll,
        angularVelocity.z,
        estimateBodyInertiaAroundZ(this.config),
        dtSeconds,
      ),
      -maxAngularImpulse,
      maxAngularImpulse,
    );
    if (Math.abs(pitchImpulse) > 1e-6 || Math.abs(rollImpulse) > 1e-6) {
      this.body.applyAngularImpulse(new Vector3(pitchImpulse, 0, rollImpulse));
    }
  }

  /**
   * Leaves the dynamic body under physics control. Linear/angular damping and
   * contact friction handle coast-down when no module command is available.
   */
  stopDrive() {}
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const DRIVE_GRIP_G = 3.2;
const SIDE_GRIP_G = 2.2;
const UPRIGHT_DEADBAND_RADIANS = (18 * Math.PI) / 180;
const UPRIGHT_NATURAL_FREQUENCY_RADIANS_PER_SECOND = 8;
const UPRIGHT_DAMPING_RATIO = 0.85;
const MAX_UPRIGHT_ANGULAR_IMPULSE_PER_KG_PER_SECOND = 3.2;
const ROBOT_INERTIA_SCALE = 1.85;

const horizontalUnit = (vector: { x: number; z: number }) => {
  const length = Math.hypot(vector.x, vector.z);
  if (length < 1e-9) {
    return Vector3.Zero();
  }
  return new Vector3(vector.x / length, 0, vector.z / length);
};

const outsideDeadband = (value: number, deadband: number) => {
  const magnitude = Math.abs(value);
  return magnitude <= deadband ? 0 : Math.sign(value) * (magnitude - deadband);
};

const suspensionAngularImpulse = (
  angleRadians: number,
  angularVelocityRadiansPerSecond: number,
  inertiaKgMetersSquared: number,
  dtSeconds: number,
) => {
  const angleError = outsideDeadband(angleRadians, UPRIGHT_DEADBAND_RADIANS);
  const frequency = UPRIGHT_NATURAL_FREQUENCY_RADIANS_PER_SECOND;
  const angularAcceleration =
    -frequency * frequency * angleError -
    2 * UPRIGHT_DAMPING_RATIO * frequency * angularVelocityRadiansPerSecond;
  return inertiaKgMetersSquared * angularAcceleration * dtSeconds;
};

const estimateBodyInertiaAroundX = (config: RobotConfig) =>
  ((config.massKg * (config.heightMeters * config.heightMeters + config.widthMeters * config.widthMeters)) / 12) *
  ROBOT_INERTIA_SCALE;

const estimateBodyInertiaAroundZ = (config: RobotConfig) =>
  ((config.massKg * (config.lengthMeters * config.lengthMeters + config.heightMeters * config.heightMeters)) / 12) *
  ROBOT_INERTIA_SCALE;

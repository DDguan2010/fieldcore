import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  rotateFieldCoreVectorToRobot,
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
    const robotVelocity = rotateFieldCoreVectorToRobot(
      linearVelocity.x,
      linearVelocity.z,
      robotFrameYawRadians,
    );
    // Babylon left-handed +Y angular velocity is opposite the WPILib-style CCW
    // yaw used by module states / chassis speeds / reset pose semantics.
    const robotOmegaRadiansPerSecond = -angularVelocity.y;
    const massPerModule = this.config.massKg / commands.length;
    const maxModuleImpulse = massPerModule * 9.81 * 1.35 * dtSeconds;

    commands.forEach((command) => {
      const wheelAxisRobotX = Math.cos(command.angleRadians);
      const wheelAxisRobotY = Math.sin(command.angleRadians);
      const moduleVelocityRobotX = robotVelocity.x - robotOmegaRadiansPerSecond * command.locationMeters.y;
      const moduleVelocityRobotY = robotVelocity.y + robotOmegaRadiansPerSecond * command.locationMeters.x;
      const targetModuleVelocityRobotX = command.speedMetersPerSecond * wheelAxisRobotX;
      const targetModuleVelocityRobotY = command.speedMetersPerSecond * wheelAxisRobotY;
      const velocityErrorAlongWheel =
        (targetModuleVelocityRobotX - moduleVelocityRobotX) * wheelAxisRobotX +
        (targetModuleVelocityRobotY - moduleVelocityRobotY) * wheelAxisRobotY;
      const moduleImpulse = clamp(massPerModule * velocityErrorAlongWheel, -maxModuleImpulse, maxModuleImpulse);
      const fieldImpulse = rotateRobotVectorToFieldCore(
        moduleImpulse * wheelAxisRobotX,
        moduleImpulse * wheelAxisRobotY,
        robotFrameYawRadians,
      );
      const fieldLocation = rotateRobotVectorToFieldCore(
        command.locationMeters.x,
        command.locationMeters.y,
        robotFrameYawRadians,
      );
      this.body?.applyImpulse(
        new Vector3(fieldImpulse.x, 0, fieldImpulse.z),
        center.add(new Vector3(fieldLocation.x, 0, fieldLocation.z)),
      );
    });
  }

  /**
   * Leaves the dynamic body under physics control. Linear/angular damping and
   * contact friction handle coast-down when no module command is available.
   */
  stopDrive() {}
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

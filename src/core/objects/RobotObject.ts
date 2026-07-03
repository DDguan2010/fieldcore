import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
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
  massKg: 52,
  bumperHeightMeters: 0.18,
  color: "#9ccaff",
};

export class RobotObject extends BaseSimObject {
  motionMode: RobotMotionMode = "networktables-pose";

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

  setDriveVelocity(fieldVxMetersPerSecond: number, fieldVzMetersPerSecond: number, yawRateRadiansPerSecond: number) {
    const verticalVelocity = this.body?.getLinearVelocity().y ?? 0;
    const angularVelocity = this.body?.getAngularVelocity() ?? Vector3.Zero();
    this.body?.setLinearVelocity(new Vector3(fieldVxMetersPerSecond, verticalVelocity, fieldVzMetersPerSecond));
    this.body?.setAngularVelocity(new Vector3(angularVelocity.x, yawRateRadiansPerSecond, angularVelocity.z));
  }

  stopDrive() {
    this.body?.setLinearVelocity(Vector3.Zero());
    this.body?.setAngularVelocity(Vector3.Zero());
  }
}

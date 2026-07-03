import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { poseToQuaternion, transformPoseOffset, type Pose3dDto } from "../math/pose";
import { BaseSimObject } from "./SimObject";

export interface IntakeConfig {
  enabledTopic: string;
  offsetFromRobotCenter: Pose3dDto;
  sizeMeters: {
    width: number;
    length: number;
    height: number;
  };
  captureDelaySeconds: number;
  captureRequiresRobotEnabled: boolean;
  maxHeldCount: number;
  visualYawOffsetRad: number;
}

export const defaultIntakeConfig: IntakeConfig = {
  enabledTopic: "/FieldCore/Robot/IntakeEnabled",
  offsetFromRobotCenter: {
    // Robot local +X is the forward direction.
    translation: { x: 0.56, y: -0.17, z: 0 },
    rotation: { roll: 0, pitch: 0, yaw: 0 },
  },
  sizeMeters: { width: 0.3, length: 0.72, height: 0.28 },
  captureDelaySeconds: 0.12,
  captureRequiresRobotEnabled: true,
  maxHeldCount: 0,
  visualYawOffsetRad: -Math.PI / 2,
};

export class IntakeObject extends BaseSimObject {
  enabled = false;

  constructor(id: string, robotPose: Pose3dDto, public config: IntakeConfig, mesh: Mesh) {
    super(id, "intake", transformPoseOffset(robotPose, config.offsetFromRobotCenter), { label: "Intake trigger" }, mesh);
  }

  updateFromRobotPose(robotPose: Pose3dDto) {
    this.pose = transformPoseOffset(robotPose, this.config.offsetFromRobotCenter);
    if (this.mesh) {
      const visualPose = this.getVisualPose();
      this.mesh.position.set(this.pose.translation.x, this.pose.translation.y, this.pose.translation.z);
      this.mesh.rotationQuaternion = poseToQuaternion(visualPose);
    }
  }

  getSensorPose(): Pose3dDto {
    return {
      translation: { ...this.pose.translation },
      rotation: { ...this.pose.rotation },
    };
  }

  getVisualPose(): Pose3dDto {
    return {
      translation: { ...this.pose.translation },
      rotation: {
        ...this.pose.rotation,
        yaw: this.pose.rotation.yaw + this.config.visualYawOffsetRad,
      },
    };
  }
}

import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Pose3dDto } from "../math/pose";

export type SimObjectId = string;

export type SimObjectType =
  | "field"
  | "robot"
  | "intake"
  | "game-piece"
  | "scoring-volume"
  | "trajectory";

export interface SimObjectMetadata {
  label: string;
  moduleId?: string;
  debugOnly?: boolean;
  [key: string]: unknown;
}

export interface SimObject {
  id: SimObjectId;
  type: SimObjectType;
  pose: Pose3dDto;
  mesh?: Mesh;
  body?: PhysicsBody;
  metadata: SimObjectMetadata;
  dispose(): void;
}

export abstract class BaseSimObject implements SimObject {
  constructor(
    public id: SimObjectId,
    public type: SimObjectType,
    public pose: Pose3dDto,
    public metadata: SimObjectMetadata,
    public mesh?: Mesh,
    public body?: PhysicsBody,
  ) {}

  dispose() {
    this.body?.dispose();
    this.mesh?.dispose();
  }
}

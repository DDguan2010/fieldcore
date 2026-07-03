import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Pose3dDto } from "../math/pose";
import { BaseSimObject } from "./SimObject";

export type GamePieceState =
  | "FREE"
  | "CONTACTING_INTAKE"
  | "INTAKING"
  | "HELD"
  | "SHOT"
  | "SCORED"
  | "REMOVED";

export class GamePieceObject extends BaseSimObject {
  state: GamePieceState = "FREE";
  contactStartedAtSeconds: number | null = null;

  constructor(id: string, pose: Pose3dDto, mesh: Mesh, body?: PhysicsBody) {
    super(id, "game-piece", pose, { label: id }, mesh, body);
  }
}

import type { Scene } from "@babylonjs/core/scene";
import type { GamePieceObject } from "../objects/GamePieceObject";
import type { ScoringVolumeConfig } from "../objects/ScoringVolume";
import type { Pose3dDto } from "../math/pose";

export interface AssetContext {
  baseUrl: string;
}

export interface FieldAssets {
  fieldModelUrl?: string;
  gamePieceModelUrl?: string;
}

export interface FieldCreationContext {
  scene: Scene;
  assets: FieldAssets;
}

export interface FieldInstance {
  id: string;
  fieldObjectIds: string[];
  scoringVolumes: ScoringVolumeConfig[];
}

export interface GamePieceInstance {
  id: string;
  pose: Pose3dDto;
}

export interface ScoringRule {
  id: string;
  label: string;
}

export interface VisionTarget {
  id: number;
  pose: Pose3dDto;
  sizeMeters: {
    width: number;
    height: number;
  };
}

export interface FieldModule {
  id: string;
  name: string;
  season: number;
  gameName: string;
  loadAssets(ctx: AssetContext): Promise<FieldAssets>;
  createField(ctx: FieldCreationContext): FieldInstance;
  createDefaultGamePieces(ctx: FieldCreationContext): GamePieceInstance[];
  createScoringRules(): ScoringRule[];
  createVisionTargets(): VisionTarget[];
}

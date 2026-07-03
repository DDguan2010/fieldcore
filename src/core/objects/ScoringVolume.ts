import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Pose3dDto } from "../math/pose";
import { BaseSimObject } from "./SimObject";

export interface ScoringVolumeConfig {
  id: string;
  pose: Pose3dDto;
  sizeMeters: {
    width: number;
    length: number;
    height: number;
  };
}

export class ScoringVolume extends BaseSimObject {
  constructor(config: ScoringVolumeConfig, mesh: Mesh) {
    super(config.id, "scoring-volume", config.pose, { label: config.id }, mesh);
  }
}

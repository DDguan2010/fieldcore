import type { Pose3dDto } from "../math/pose";

export type VisionStatus = "OK" | "NO_TARGET" | "DISCONNECTED" | "LOW_RELIABILITY";

export interface FieldCoreVisionMeasurement {
  pose: Pose3dDto;
  timestampSeconds: number;
  latency: number;
  reliability: number;
  detectedTagIds: number[];
  tagSpan: number;
  avgTagDist: number;
  avgTagArea: number;
  status: VisionStatus;
  lastHeartbeat: number;
  lastTsBootMs: number;
  lastSeenTime: number;
  temperature: number;
}

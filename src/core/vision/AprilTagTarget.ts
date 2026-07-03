import type { Pose3dDto } from "../math/pose";

export interface AprilTagTarget {
  id: number;
  pose: Pose3dDto;
  sizeMeters: {
    width: number;
    height: number;
  };
}

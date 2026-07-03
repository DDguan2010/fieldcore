import type { Pose3dDto } from "../math/pose";

export interface BoxSensorVolume {
  pose: Pose3dDto;
  sizeMeters: {
    width: number;
    length: number;
    height: number;
  };
}

export function isPoseInsideBoxSensor(point: Pose3dDto, volume: BoxSensorVolume): boolean {
  const dx = point.translation.x - volume.pose.translation.x;
  const dz = point.translation.z - volume.pose.translation.z;
  const cos = Math.cos(-volume.pose.rotation.yaw);
  const sin = Math.sin(-volume.pose.rotation.yaw);
  const localX = cos * dx - sin * dz;
  const localZ = sin * dx + cos * dz;
  return (
    Math.abs(localX) <= volume.sizeMeters.length / 2 &&
    Math.abs(point.translation.y - volume.pose.translation.y) <= volume.sizeMeters.height / 2 &&
    Math.abs(localZ) <= volume.sizeMeters.width / 2
  );
}

import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface Translation3dDto {
  x: number;
  y: number;
  z: number;
}

export interface Rotation3dDto {
  roll: number;
  pitch: number;
  yaw: number;
}

export interface Pose3dDto {
  translation: Translation3dDto;
  rotation: Rotation3dDto;
}

export type Pose3dArray = [
  x: number,
  y: number,
  z: number,
  roll: number,
  pitch: number,
  yaw: number,
];

export const zeroPose3d = (): Pose3dDto => ({
  translation: { x: 0, y: 0, z: 0 },
  rotation: { roll: 0, pitch: 0, yaw: 0 },
});

export const poseToArray = (pose: Pose3dDto): Pose3dArray => [
  pose.translation.x,
  pose.translation.y,
  pose.translation.z,
  pose.rotation.roll,
  pose.rotation.pitch,
  pose.rotation.yaw,
];

export const arrayToPose = (value: readonly number[]): Pose3dDto => ({
  translation: {
    x: value[0] ?? 0,
    y: value[1] ?? 0,
    z: value[2] ?? 0,
  },
  rotation: {
    roll: value[3] ?? 0,
    pitch: value[4] ?? 0,
    yaw: value[5] ?? 0,
  },
});

export const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

export const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

export const poseToVector3 = (pose: Pose3dDto) =>
  new Vector3(pose.translation.x, pose.translation.y, pose.translation.z);

export const poseToQuaternion = (pose: Pose3dDto) => {
  const { yaw, pitch, roll } = pose.rotation;
  return Quaternion.RotationYawPitchRoll(yaw, pitch, roll);
};

export const vectorQuaternionToPose = (position: Vector3, rotation: Quaternion): Pose3dDto => {
  const euler = rotation.toEulerAngles();
  return {
    translation: { x: position.x, y: position.y, z: position.z },
    rotation: { roll: euler.z, pitch: euler.x, yaw: euler.y },
  };
};

export const addPoseOffset = (base: Pose3dDto, offset: Pose3dDto): Pose3dDto => ({
  translation: {
    x: base.translation.x + offset.translation.x,
    y: base.translation.y + offset.translation.y,
    z: base.translation.z + offset.translation.z,
  },
  rotation: {
    roll: base.rotation.roll + offset.rotation.roll,
    pitch: base.rotation.pitch + offset.rotation.pitch,
    yaw: base.rotation.yaw + offset.rotation.yaw,
  },
});

export const transformPoseOffset = (base: Pose3dDto, offset: Pose3dDto): Pose3dDto => {
  const rotatedOffset = new Vector3(
    offset.translation.x,
    offset.translation.y,
    offset.translation.z,
  ).rotateByQuaternionToRef(poseToQuaternion(base), new Vector3());
  return {
    translation: {
      x: base.translation.x + rotatedOffset.x,
      y: base.translation.y + rotatedOffset.y,
      z: base.translation.z + rotatedOffset.z,
    },
    rotation: {
      roll: base.rotation.roll + offset.rotation.roll,
      pitch: base.rotation.pitch + offset.rotation.pitch,
      yaw: base.rotation.yaw + offset.rotation.yaw,
    },
  };
};

export const noisyPose = (
  pose: Pose3dDto,
  positionStdDevMeters: number,
  rotationStdDevRad: number,
  random = Math.random,
): Pose3dDto => {
  const gaussian = () => {
    const u = 1 - random();
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  return {
    translation: {
      x: pose.translation.x + gaussian() * positionStdDevMeters,
      y: pose.translation.y + gaussian() * positionStdDevMeters,
      z: pose.translation.z + gaussian() * positionStdDevMeters,
    },
    rotation: {
      roll: pose.rotation.roll + gaussian() * rotationStdDevRad,
      pitch: pose.rotation.pitch + gaussian() * rotationStdDevRad,
      yaw: pose.rotation.yaw + gaussian() * rotationStdDevRad,
    },
  };
};

export const robotToFieldCoreTopics = {
  enabled: "/FieldCore/Robot/Enabled",
  mode: "/FieldCore/Robot/Mode",
  poseEstimate: "/FieldCore/Robot/PoseEstimate",
  chassisSpeeds: "/FieldCore/Robot/ChassisSpeeds",
  moduleStates: "/FieldCore/Robot/ModuleStates",
  intakeEnabled: "/FieldCore/Robot/IntakeEnabled",
  shooterEnabled: "/FieldCore/Robot/ShooterEnabled",
  shooterRPM: "/FieldCore/Robot/ShooterRPM",
  hoodAngleDeg: "/FieldCore/Robot/HoodAngleDeg",
  shootCommand: "/FieldCore/Robot/ShootCommand",
  shootCount: "/FieldCore/Robot/ShootCount",
} as const;

export const fieldCoreToRobotTopics = {
  hasTarget: "/FieldCore/Vision/HasTarget",
  pose: "/FieldCore/Vision/Pose",
  timestampSeconds: "/FieldCore/Vision/TimestampSeconds",
  latencySeconds: "/FieldCore/Vision/LatencySeconds",
  reliability: "/FieldCore/Vision/Reliability",
  detectedTagIds: "/FieldCore/Vision/DetectedTagIds",
  tagSpan: "/FieldCore/Vision/TagSpan",
  avgTagDist: "/FieldCore/Vision/AvgTagDist",
  avgTagArea: "/FieldCore/Vision/AvgTagArea",
  status: "/FieldCore/Vision/Status",
  lastHeartbeat: "/FieldCore/Vision/LastHeartbeat",
  lastTsBootMs: "/FieldCore/Vision/LastTsBootMs",
  lastSeenTime: "/FieldCore/Vision/LastSeenTime",
  temperature: "/FieldCore/Vision/Temperature",
} as const;

export const debugTopics = {
  trueRobotPose: "/FieldCore/Sim/TrueRobotPose",
  gamePieceStates: "/FieldCore/Sim/GamePieceStates",
} as const;

export const topicRegistry = {
  robotToFieldCoreTopics,
  fieldCoreToRobotTopics,
  debugTopics,
};

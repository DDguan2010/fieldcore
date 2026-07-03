# FieldCore NetworkTables Topics

## Robot -> FieldCore

```text
/FieldCore/Robot/Enabled
/FieldCore/Robot/Mode
/FieldCore/Robot/PoseEstimate
/FieldCore/Robot/ChassisSpeeds
/FieldCore/Robot/ModuleStates
/FieldCore/Robot/IntakeEnabled
/FieldCore/Robot/ShooterEnabled
/FieldCore/Robot/ShooterRPM
/FieldCore/Robot/HoodAngleDeg
/FieldCore/Robot/ShootCommand
/FieldCore/Robot/ShootCount
```

`ShootCommand` may stay true while the robot is feeding balls. `ShootCount` is a monotonically increasing event counter for short shoot pulses that a browser NT client could otherwise miss.

## FieldCore -> Limelight

For Limelight-style robot projects, this is the preferred estimator path:

```text
/limelight-a/tv
/limelight-a/tid
/limelight-a/hb
/limelight-a/tl
/limelight-a/cl
/limelight-a/botpose
/limelight-a/botpose_wpiblue
/limelight-a/botpose_orb_wpiblue
/limelight-a/botpose_tagcount
/limelight-a/botpose_span
/limelight-a/botpose_avgdist
/limelight-a/botpose_avgarea
/limelight-a/rawfiducials
/limelight-a/json
```

`botpose_avgarea` and `rawfiducials` target area entries follow Limelight `ta` semantics. They are scaled target-area values for robot reliability filters, not raw square-meter geometry areas.

`/limelight-a/json` follows the official Limelight JSON field names for status parsing, including `ts`, `tl`, `cl`, `v`, `botpose_wpiblue`, and `botpose_orb_wpiblue`.

By default FieldCore runs vision in continuous pose-output mode: it publishes the robot's simulated final field pose every frame through standard Limelight `botpose_*` topics, with metadata kept inside common robot-side reliability filter ranges.

## FieldCore Debug Vision

```text
/FieldCore/Vision/HasTarget
/FieldCore/Vision/Pose
/FieldCore/Vision/TimestampSeconds
/FieldCore/Vision/LatencySeconds
/FieldCore/Vision/Reliability
/FieldCore/Vision/DetectedTagIds
/FieldCore/Vision/TagSpan
/FieldCore/Vision/AvgTagDist
/FieldCore/Vision/AvgTagArea
/FieldCore/Vision/Status
/FieldCore/Vision/LastHeartbeat
/FieldCore/Vision/LastTsBootMs
/FieldCore/Vision/LastSeenTime
/FieldCore/Vision/Temperature
```

## Debug Only

```text
/FieldCore/Sim/TrueRobotPose
/FieldCore/Sim/GamePieceStates
```

Do not use debug-only true pose topics for estimator correction.

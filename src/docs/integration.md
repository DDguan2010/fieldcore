# FieldCore Robot Code Integration

FieldCore connects to WPILib simulation through NetworkTables. For robot projects that already use Limelight-style vision code, FieldCore acts like the final pose-output side of a Limelight.

## Recommended Limelight Path

FieldCore publishes a standard Limelight table. The default table is `limelight-a`:

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

Robot code can keep using existing helpers such as:

```java
LimelightHelpers.getBotPoseEstimate_wpiBlue_MegaTag2("limelight-a");
```

The `botpose` arrays use Limelight units:

```text
[xMeters, yMeters, zMeters, rollDeg, pitchDeg, yawDeg, latencyMs, tagCount, tagSpan, avgTagDist, avgTagArea, rawFiducials...]
```

`avgTagArea` and `rawfiducials` `ta` use Limelight-style target area values. They are scaled like Limelight target area, not raw physical square-meter area, so existing robot-side reliability filters can treat FieldCore measurements like normal Limelight measurements.

FieldCore's default vision mode continuously publishes the final simulated robot field pose through the standard Limelight table. This is intended for robot-side localization testing: the robot code still owns `poseEstimator.addVisionMeasurement(...)`, `Vision/Ghost`, and AdvantageScope visualization.

## Robot -> FieldCore Topics

```text
/FieldCore/Robot/Enabled
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

`/FieldCore/Robot/PoseEstimate` is a WPILib blue-alliance wall-origin `double[6]`:

```text
[xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]
```

`/FieldCore/Robot/ShootCommand` may stay true while the robot is feeding balls. `/FieldCore/Robot/ShootCount` is optional but recommended; increment it on every shoot/feed event so FieldCore can catch short command pulses.

## Debug Topics

`/FieldCore/Vision/Pose` is still published as a FieldCore-native debug/general measurement:

```text
[xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]
```

`/FieldCore/Sim/TrueRobotPose` is debug-only and must not be written back into the pose estimator.

## AI Quick Configuration Prompt

```text
你是资深 FRC Java/WPILib 软件工程师。请在当前机器人项目中接入 FieldCore 仿真，并保持真实机器人代码路径可用。

要求：
1. 保留现有 LimelightIOReal / LimelightHelpers / poseEstimator.addVisionMeasurement(...) 视觉路径；不要新增自定义 Limelight 仿真 IO 绕过项目现有逻辑。
2. FieldCore 会发布标准 Limelight topics：/limelight-a/botpose_wpiblue、/limelight-a/botpose_orb_wpiblue、/limelight-a/tv、/limelight-a/hb、/limelight-a/rawfiducials、/limelight-a/json。
3. 如果项目使用 LimelightHelpers 的 cached DoubleArrayEntry 后只同步首帧，请只在项目的 LimelightIOReal 内部增加 live NetworkTableEntry.getDoubleArray(...) 兼容读取，不要修改公共 LimelightHelpers。
4. 新增 FieldCoreBridge，在 simulation periodic 发布 /FieldCore/Robot/Enabled、PoseEstimate、ChassisSpeeds、ModuleStates、IntakeEnabled、ShooterEnabled、ShooterRPM、HoodAngleDeg、ShootCommand、ShootCount。
5. PoseEstimate 使用 WPILib blue-alliance wall-origin 坐标，数组格式为 [xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]。
6. ModuleStates 使用 [FL speed mps, FL angle rad, FR speed mps, FR angle rad, BL speed mps, BL angle rad, BR speed mps, BR angle rad]。
7. ShootCommand 表示当前正在 feed/shoot；ShootCount 在每次射球事件递增，避免短 NT 脉冲丢失。
8. 不要为 FieldCore 在 robot code 里硬编码新的初始位姿；FieldCore 使用 robot code 自己的 autonomous / estimator 初始 pose，或由 FieldCore UI 手动指定。
9. 不要把 /FieldCore/Sim/TrueRobotPose 写回 pose estimator；它只是 debug 真值。
10. 最后运行 ./gradlew build，并列出修改文件和 topic 映射。
```

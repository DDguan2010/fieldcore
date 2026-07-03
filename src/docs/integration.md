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

FieldCore's default vision mode continuously publishes the current simulated robot field pose through the standard Limelight table. In `physics-from-module-states` mode, `/FieldCore/Robot/PoseEstimate` initializes the robot body once, `/FieldCore/Robot/ModuleStates` drive the FieldCore physical robot motion, and that physical pose is used for Limelight output and game-piece launch points. The robot code still owns `poseEstimator.addVisionMeasurement(...)`, `Vision/Ghost`, and AdvantageScope visualization.

FieldCore publishes complete Limelight poses, including heading. Robot code must keep the vision heading standard deviation finite if it expects FieldCore yaw to correct the estimator; an effectively infinite heading standard deviation will make vision correct only translation. In simulation, robot code should also allow high-reliability FieldCore/Limelight frames to reseed the simulated IMU yaw so odometry does not immediately pull the estimator back to the idealized gyro heading.

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

`/FieldCore/Robot/ShootCommand` may stay true while the robot is feeding balls. `/FieldCore/Robot/ShootCount` is optional but recommended; increment it on every shoot/feed event so FieldCore can catch short command pulses. FieldCore only launches a held ball on `ShootCommand` (continuous, rate-limited by shots/second) or a `ShootCount` change; `ShooterEnabled` alone never launches.

Launch position always comes from the current FieldCore physical robot pose plus the configured shooter exit offset. Balls captured by the intake disappear into a held inventory and re-appear at the shooter exit when launched; missed shots settle and become intakeable again.

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
2. FieldCore 会发布标准 Limelight topics：/limelight-a/botpose_wpiblue、/limelight-a/botpose_orb_wpiblue、/limelight-a/tv、/limelight-a/hb、/limelight-a/rawfiducials、/limelight-a/json。这些 topic 每帧持续更新（hb 递增），内容是 FieldCore 物理机器人真值 pose。
3. 如果项目使用 LimelightHelpers 的 cached DoubleArrayEntry 后只同步首帧，请只在项目的 LimelightIOReal 内部增加 live NetworkTableEntry.getDoubleArray(...) 兼容读取，不要修改公共 LimelightHelpers。
4. 新增 FieldCoreBridge，在 simulation periodic 发布 /FieldCore/Robot/Enabled、PoseEstimate、ChassisSpeeds、ModuleStates、IntakeEnabled、ShooterEnabled、ShooterRPM、HoodAngleDeg、ShootCommand、ShootCount。
5. PoseEstimate 使用 WPILib blue-alliance wall-origin 坐标，数组格式为 [xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]。FieldCore 默认 physics-from-module-states 模式下只用 PoseEstimate 首帧初始化机器人位置，之后由 ModuleStates/ChassisSpeeds 驱动 FieldCore 物理机器人，robot code 通过 Limelight topics + addVisionMeasurement 自行纠正 estimator。
6. ModuleStates 使用 [FL speed mps, FL angle rad, FR speed mps, FR angle rad, BL speed mps, BL angle rad, BR speed mps, BR angle rad]，机器人坐标系 +X forward、+Y left。
7. ShootCommand 表示当前正在 feed/shoot（shooter active 且 feed active）；ShootCount 在每次射球事件递增，避免短 NT 脉冲丢失。FieldCore 只在 ShootCommand 为 true 或 ShootCount 变化时发射，ShooterEnabled 单独为 true 不会发射。
8. 不要为 FieldCore 在 robot code 里硬编码新的初始位姿；FieldCore 使用 robot code 自己的 autonomous / estimator 初始 pose，或由 FieldCore UI 手动指定。
9. 不要把 /FieldCore/Sim/TrueRobotPose 写回 pose estimator；它只是 debug 真值。
10. 最后运行 ./gradlew build，并列出修改文件和 topic 映射。
```

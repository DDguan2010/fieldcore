# FieldCore Robot Code Integration

FieldCore connects to WPILib simulation through NetworkTables. It is a browser-based FRC 3D physics simulator: robot code publishes drivetrain and mechanism state to FieldCore, FieldCore simulates the field, game pieces, and physical robot motion, then publishes the simulated physical robot pose back through standard Limelight topics.

FieldCore is not a replacement for the robot project's pose estimator or vision subsystem. Robot code should keep its normal Limelight path and decide how to call `poseEstimator.addVisionMeasurement(...)`.

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

`/FieldCore/Robot/ChassisSpeeds` is a robot-relative `double[3]`:

```text
[vxMetersPerSecond, vyMetersPerSecond, omegaRadPerSecond]
```

`/FieldCore/Robot/ModuleStates` is a `double[8]`, ordered `FL, FR, BL, BR`:

```text
[FL speed mps, FL angle rad, FR speed mps, FR angle rad, BL speed mps, BL angle rad, BR speed mps, BR angle rad]
```

Module state angles use the WPILib robot frame: `+X` forward, `+Y` left, radians. FieldCore prioritizes fresh module states because it derives physical robot translation and rotation from the four swerve module forces.

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
你是资深 FRC Java/WPILib 软件工程师。当前机器人项目需要接入 FieldCore 仿真。即使你之前不知道 FieldCore 是什么，也必须按下面的协议完成适配，并保持真实机器人代码路径可用。

FieldCore 是一个浏览器 3D 物理仿真器，通过 NT4 连接 WPILib simulation NetworkTables server。FieldCore 不替代 robot code，不直接写 pose estimator；robot code 负责发布驱动、intake、shooter 状态给 FieldCore，FieldCore 负责模拟场地/球/机器人物理，并把物理世界中的真实机器人 pose 作为标准 Limelight 输出发回 robot code。

总体目标：
1. 保留真实机器人使用的 LimelightIOReal / LimelightHelpers / poseEstimator.addVisionMeasurement(...) / Vision 或 Ghost 可视化路径。
2. 不新增绕开现有视觉系统的 FieldCore-only LimelightIO。simulation 下也应尽量走真实 Limelight 读取路径，只是数据源由 FieldCore 发布。
3. 新增一个 simulation-only 的 FieldCoreBridge，周期性发布 /FieldCore/Robot/* topics。
4. FieldCore 默认 physics-from-module-states：PoseEstimate 只用于连接后的首帧初始化 FieldCore 机器人位置，后续 FieldCore 机器人由 ModuleStates 纯物理驱动。
5. 不在 robot code 中为 FieldCore 硬编码新的初始位姿。使用 robot 项目自己的 auto / estimator 初始 pose；无 robot code 时才由 FieldCore UI 手动指定。

请先阅读当前项目结构，找到：
- swerve / drivetrain subsystem
- pose estimator 或 getEstimatedPose()
- 当前 Limelight IO / vision subsystem / addVisionMeasurement 调用点
- module state 或 desired module state 的获取方式
- chassis speeds 的获取方式
- intake 是否正在吸球的状态
- shooter flywheel、hood、feeder 或 hopper 的状态
- robotPeriodic / simulationPeriodic / RobotContainer periodic 钩子
- build.gradle 或 GradleRIO simulation 配置

FieldCore -> robot code 的推荐视觉路径：
FieldCore 会持续发布标准 Limelight table，默认 table name 是 limelight-a。robot code 应继续读取这些 standard Limelight topics：
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

Limelight botpose array 单位：
[xMeters, yMeters, zMeters, rollDeg, pitchDeg, yawDeg, latencyMs, tagCount, tagSpan, avgTagDist, avgTagArea, rawFiducials...]

要求：
- 使用现有 LimelightHelpers.getBotPoseEstimate_wpiBlue_MegaTag2("limelight-a") 或项目现有等价读取路径。
- robot code 仍然自己调用 poseEstimator.addVisionMeasurement(pose, timestampSeconds, stdDevs)。
- simulation 下 FieldCore measurement 是高可靠 pose。不要因为 status/noise/dropout 过滤把它永久丢弃。
- 如果希望 FieldCore yaw 修正 estimator，vision heading standard deviation 必须是有限值；不要把 theta stddev 设置成无限大。
- 如果项目有 simulated gyro/IMU，simulation 下应允许高可靠 vision measurement 重置或校准 sim gyro yaw，否则 odometry 可能把 estimator 立刻拉回理想 gyro 角度。
- /FieldCore/Sim/TrueRobotPose 只能用于 debug 或 AdvantageScope 对比，禁止写回 pose estimator。

如果现有 LimelightHelpers 或 LimelightIOReal 只在 connect 第一帧读到 botpose，后续 pose 不更新：
- 优先只修改项目本地的 LimelightIOReal updateInputs。
- 在每次 updateInputs 中从 NetworkTableInstance.getDefault().getTable(limelightName) 实时读取 botpose_orb_wpiblue 或 botpose_wpiblue 的 DoubleArray。
- 不要依赖只初始化一次的 cached array snapshot。
- 不要随意修改第三方 vendored LimelightHelpers，除非该项目本来就维护它，且修改范围很小。

Robot -> FieldCore topics，FieldCoreBridge 必须在 simulation periodic 中每周期发布：
/FieldCore/Robot/Enabled，boolean，DriverStation.isEnabled()
/FieldCore/Robot/PoseEstimate，double[6]，WPILib blue-alliance wall-origin pose：[xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]
/FieldCore/Robot/ChassisSpeeds，double[3]，robot-relative chassis speeds：[vxMetersPerSecond, vyMetersPerSecond, omegaRadPerSecond]，+X forward，+Y left，+omega CCW
/FieldCore/Robot/ModuleStates，double[8]，顺序固定为 FL、FR、BL、BR：[FL speed mps, FL angle rad, FR speed mps, FR angle rad, BL speed mps, BL angle rad, BR speed mps, BR angle rad]
/FieldCore/Robot/IntakeEnabled，boolean，intake 正在主动吸球时为 true
/FieldCore/Robot/ShooterEnabled，boolean，shooter/superstructure 准备射球或飞轮启用时为 true；它单独不会让 FieldCore 发射球
/FieldCore/Robot/ShooterRPM，double，当前 shooter RPM 或 target RPM；没有就发 0
/FieldCore/Robot/HoodAngleDeg，double，当前 hood angle degree；没有 hood 就发 0
/FieldCore/Robot/ShootCommand，boolean，feeder/hopper 正在把球送入 shooter 时为 true；可以连续保持 true
/FieldCore/Robot/ShootCount，double，单调递增事件计数；每次真实 feed/shoot 一个球时递增一次，用于避免短脉冲被浏览器 NT client 漏掉

FieldCore 坐标要求：
- PoseEstimate 使用 WPILib 蓝方墙角原点坐标，不要转成 FieldCore 中心坐标。
- PoseEstimate 数组中的 yaw 用 radians。
- ModuleStates angle 使用 WPILib robot frame：+X forward，+Y left，单位 radians。
- ModuleStates 顺序必须是 FL、FR、BL、BR。不要混成 FL、FR、BR、BL。
- 如果项目只有 ChassisSpeeds，也发布 ChassisSpeeds；但只要能拿到 module states，就必须发布 ModuleStates，因为 FieldCore 会优先用四角 module force 做物理移动和旋转。

建议实现：
1. 新建 frc.robot.FieldCoreBridge 或项目等价包名下的 simulation-only bridge 类。
2. 在 bridge 内缓存 NetworkTableEntry 或 Publisher，不要每周期重复创建 table 对象。
3. 提供 periodic()，由 Robot.robotPeriodic、Robot.simulationPeriodic 或 RobotContainer.periodic 在 simulation 下调用。
4. bridge 构造函数接收 Supplier<Pose2d> estimatedPose、Supplier<ChassisSpeeds> chassisSpeeds、Supplier<SwerveModuleState[]> moduleStates，以及 BooleanSupplier/DoubleSupplier 获取 intake、shooter、hood、feed 状态。
5. ShootCount 应基于 feeder active 的 rising edge 或项目已有 shot event 递增，不要每周期无限递增。
6. 所有 FieldCoreBridge 调用用 RobotBase.isSimulation() 或等价条件保护，保证 real robot 不受影响。

Gradle/WPILib simulation：
- 确认 build.gradle 启用 wpi.sim GUI 和 DriverStation。
- 常见配置包括 wpi.sim.addGui().defaultEnabled = true 和 wpi.sim.addDriverstation()。
- 不要为了 FieldCore 改 roboRIO deployment 或真实 robot 的 NT server 设置。

验收标准：
1. ./gradlew build 通过。
2. 启动 WPILib simulation 后，NetworkTables 中 /FieldCore/Robot/PoseEstimate、ModuleStates、ChassisSpeeds 每周期更新。
3. FieldCore 连接后，/limelight-a/hb 持续递增，/limelight-a/botpose_orb_wpiblue 随 FieldCore 物理机器人连续变化，不是只同步第一帧。
4. robot code 的 existing vision subsystem 能读到 FieldCore 发布的 Limelight pose，并调用 addVisionMeasurement。
5. estimator 会被 FieldCore pose 同时纠正 XY 和 yaw。
6. AdvantageScope 中 robot pose / Vision Ghost 仍由 robot code 输出，不由 FieldCore 直接伪造。
7. intake active 时 FieldCore 中球碰到 intake 会被吸入并从场上消失；shoot/feed 触发时 FieldCore 从机器人顶部 shooter exit 生成 held ball 并投出。
8. 最后列出修改文件、topic 映射、如何启动 robot sim 与 FieldCore 的步骤。
```

const AI_SETUP_PROMPT = `你是资深 FRC Java/WPILib 软件工程师。当前机器人项目需要接入 FieldCore 仿真。即使你之前不知道 FieldCore 是什么，也必须按下面的协议完成适配，并保持真实机器人代码路径可用。

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
8. 最后列出修改文件、topic 映射、如何启动 robot sim 与 FieldCore 的步骤。`;

export function DocumentationPage() {
  return (
    <main className="page docs-page">
      <section className="doc-section">
        <h1>Integration Guide</h1>
        <p>
          FieldCore is a browser-based FRC 3D physics simulator that connects to WPILib simulation
          through NT4. Robot code publishes drivetrain and mechanism state to FieldCore, while
          FieldCore publishes the simulated physical robot pose back through standard Limelight topics.
        </p>
      </section>

      <section className="doc-section">
        <h2>Simulation Contract</h2>
        <p>
          Keep the real robot vision path intact. In simulation, FieldCore should act as the
          Limelight pose producer, not as a replacement for the robot project&apos;s estimator logic.
        </p>
        <pre>{`Robot code -> FieldCore:
/FieldCore/Robot/PoseEstimate
/FieldCore/Robot/ChassisSpeeds
/FieldCore/Robot/ModuleStates
/FieldCore/Robot/IntakeEnabled
/FieldCore/Robot/ShooterEnabled
/FieldCore/Robot/ShooterRPM
/FieldCore/Robot/HoodAngleDeg
/FieldCore/Robot/ShootCommand
/FieldCore/Robot/ShootCount

FieldCore -> robot code:
/limelight-a/botpose_orb_wpiblue
/limelight-a/botpose_wpiblue
/limelight-a/tv
/limelight-a/hb
/limelight-a/rawfiducials
/limelight-a/json`}</pre>
      </section>

      <section className="doc-section">
        <h2>WPILib Simulation</h2>
        <pre>{`simulationDebug {
    wpi.sim.enableDebug()
}
simulationRelease {
    wpi.sim.enableRelease()
}
wpi.sim.addGui().defaultEnabled = true
wpi.sim.addDriverstation()`}</pre>
      </section>

      <section className="doc-section">
        <h2>Limelight Pose Path</h2>
        <p>
          FieldCore publishes a standard Limelight table. Existing robot code can keep using
          LimelightHelpers and <code>poseEstimator.addVisionMeasurement(...)</code>.
        </p>
        <pre>{`/limelight-a/tv
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
/limelight-a/json`}</pre>
        <pre>{`[xMeters, yMeters, zMeters, rollDeg, pitchDeg, yawDeg,
 latencyMs, tagCount, tagSpan, avgTagDist, avgTagArea, rawFiducials...]`}</pre>
      </section>

      <section className="doc-section">
        <h2>Robot Data Format</h2>
        <pre>{`PoseEstimate double[6]:
[xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]

ChassisSpeeds double[3]:
[vxMetersPerSecond, vyMetersPerSecond, omegaRadPerSecond]

ModuleStates double[8], order FL, FR, BL, BR:
[FL speed, FL angle, FR speed, FR angle, BL speed, BL angle, BR speed, BR angle]`}</pre>
        <p>
          PoseEstimate uses WPILib blue-alliance wall-origin coordinates. Module angles use the
          WPILib robot frame: +X forward and +Y left.
        </p>
      </section>

      <section className="doc-section">
        <h2>Shooter And Intake</h2>
        <p>
          FieldCore stores intaken balls in a held inventory. A shot is launched only when
          <code> ShootCommand </code> is true or <code> ShootCount </code> changes;{" "}
          <code>ShooterEnabled</code> alone only reports flywheel/superstructure state.
        </p>
        <pre>{`/FieldCore/Robot/IntakeEnabled
/FieldCore/Robot/ShooterEnabled
/FieldCore/Robot/ShooterRPM
/FieldCore/Robot/HoodAngleDeg
/FieldCore/Robot/ShootCommand
/FieldCore/Robot/ShootCount`}</pre>
      </section>

      <section className="doc-section">
        <h2>Estimator Rules</h2>
        <p>
          Use finite heading standard deviation if simulated Limelight yaw should correct the
          estimator. <code>/FieldCore/Sim/TrueRobotPose</code> is debug-only and must not be written
          back into the estimator.
        </p>
      </section>

      <section className="doc-section">
        <h2>AI Setup Prompt</h2>
        <p>
          Copy this prompt into Codex, Claude, or another coding agent inside a robot project to
          request a complete FieldCore integration.
        </p>
        <pre>{AI_SETUP_PROMPT}</pre>
      </section>
    </main>
  );
}

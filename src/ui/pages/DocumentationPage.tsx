export function DocumentationPage() {
  return (
    <main className="page docs-page">
      <section className="doc-section">
        <h1>Integration Guide</h1>
        <p>
          FieldCore publishes standard Limelight pose topics such as{" "}
          <code>/limelight-a/botpose_orb_wpiblue</code>. Robot code can keep its normal
          LimelightHelpers and pose estimator path.
        </p>
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
        <h2>Limelight Topics</h2>
        <pre>{`/limelight-a/tv
/limelight-a/hb
/limelight-a/tl
/limelight-a/cl
/limelight-a/botpose
/limelight-a/botpose_wpiblue
/limelight-a/botpose_orb_wpiblue
/limelight-a/botpose_avgarea
/limelight-a/rawfiducials
/limelight-a/json`}</pre>
        <p>
          <code>botpose_avgarea</code> and <code>rawfiducials</code> target area values follow
          Limelight <code>ta</code> semantics for normal robot-side reliability filters.
        </p>
      </section>

      <section className="doc-section">
        <h2>Robot Topics</h2>
        <pre>{`/FieldCore/Robot/PoseEstimate
/FieldCore/Robot/ChassisSpeeds
/FieldCore/Robot/ModuleStates
/FieldCore/Robot/IntakeEnabled
/FieldCore/Robot/ShooterEnabled
/FieldCore/Robot/ShootCommand
/FieldCore/Robot/ShootCount`}</pre>
      </section>

      <section className="doc-section">
        <h2>Robot IO</h2>
        <pre>{`visionIO = new LimelightIOReal(
    config,
    swerve::getIMUYaw,
    swerve::getYawVelocityRadPerSec,
    () -> false,
    deviationParams
);`}</pre>
      </section>

      <section className="doc-section">
        <h2>Pose Estimator</h2>
        <pre>{`if (inputs.reliability > 0.5 && inputs.status.equals("Connected")) {
    poseEstimator.addVisionMeasurement(
        inputs.pose,
        inputs.timestampSeconds,
        visionStdDevs
    );
}`}</pre>
      </section>

      <section className="doc-section">
        <h2>Debug Pose Warning</h2>
        <p>
          <code>/FieldCore/Sim/TrueRobotPose</code> is debug-only. Do not use it to overwrite robot
          estimated pose.
        </p>
      </section>

      <section className="doc-section">
        <h2>AI Setup Prompt</h2>
        <pre>{`你是资深 FRC Java/WPILib 软件工程师。请在当前机器人项目中接入 FieldCore 仿真，并保持真实机器人代码路径可用。

要求：
1. 保留现有 LimelightIOReal / LimelightHelpers / poseEstimator.addVisionMeasurement(...) 视觉路径；不要新增自定义 Limelight 仿真 IO 绕过项目现有逻辑。
2. FieldCore 会发布标准 Limelight topics：/limelight-a/botpose_wpiblue、/limelight-a/botpose_orb_wpiblue、/limelight-a/tv、/limelight-a/hb、/limelight-a/rawfiducials、/limelight-a/json。
3. 如果项目使用 LimelightHelpers 的 cached DoubleArrayEntry 后只同步首帧，请只在项目的 LimelightIOReal 内部增加 live NetworkTableEntry.getDoubleArray(...) 兼容读取，不要修改公共 LimelightHelpers。
4. 新增 FieldCoreBridge，在 simulation periodic 发布 /FieldCore/Robot/Enabled、PoseEstimate、ChassisSpeeds、ModuleStates、IntakeEnabled、ShooterEnabled、ShooterRPM、HoodAngleDeg、ShootCommand、ShootCount。
5. PoseEstimate 使用 WPILib blue-alliance wall-origin 坐标，数组格式为 [xMeters, yMeters, zMeters, rollRad, pitchRad, yawRad]。
6. ModuleStates 使用 [FL speed mps, FL angle rad, FR speed mps, FR angle rad, BL speed mps, BL angle rad, BR speed mps, BR angle rad]。
7. ShootCommand 表示当前正在 feed/shoot；ShootCount 在每次射球事件递增，避免短 NT 脉冲丢失。
8. 不要把 /FieldCore/Sim/TrueRobotPose 写回 pose estimator；它只是 debug 真值。
9. 最后运行 ./gradlew build，并列出修改文件和 topic 映射。`}</pre>
      </section>
    </main>
  );
}

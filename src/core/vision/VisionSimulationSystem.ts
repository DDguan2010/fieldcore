import { noisyPose, poseToArray, transformPoseOffset, type Pose3dDto } from "../math/pose";
import { fieldCoreToRobotTopics } from "../nt/TopicRegistry";
import type { NetworkTablesClient } from "../nt/NetworkTablesClient";
import type { VisionTarget } from "../modules/FieldModule";
import type { FieldCoreVisionMeasurement } from "./VisionMeasurement";

export interface VisionSimConfig {
  cameraOffsetFromRobotCenter: Pose3dDto;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  maxDistanceMeters: number;
  minTargetArea: number;
  latencyMeanSeconds: number;
  latencyStdDevSeconds: number;
  positionStdDevMeters: number;
  rotationStdDevRad: number;
  dropoutProbability: number;
  publishTopicPrefix: string;
  limelightTableName: string;
  noiseEnabled: boolean;
  continuousPoseOutput: boolean;
}

export const defaultVisionSimConfig: VisionSimConfig = {
  cameraOffsetFromRobotCenter: {
    translation: { x: 0.22, y: 0.35, z: 0 },
    rotation: { roll: 0, pitch: 0, yaw: 0 },
  },
  horizontalFovDeg: 70,
  verticalFovDeg: 45,
  maxDistanceMeters: 8,
  minTargetArea: 0.00025,
  latencyMeanSeconds: 0.035,
  latencyStdDevSeconds: 0.006,
  positionStdDevMeters: 0.04,
  rotationStdDevRad: 0.025,
  dropoutProbability: 0,
  publishTopicPrefix: "/FieldCore/Vision",
  limelightTableName: "limelight-a",
  noiseEnabled: false,
  continuousPoseOutput: true,
};

interface QueuedMeasurement {
  releaseTimeSeconds: number;
  measurement: FieldCoreVisionMeasurement;
}

export class VisionSimulationSystem {
  private queue: QueuedMeasurement[] = [];
  private lastMeasurement: FieldCoreVisionMeasurement;
  private limelightHeartbeat = 0;

  constructor(
    private getRobotTruePose: () => Pose3dDto,
    private targets: VisionTarget[],
    private nt: NetworkTablesClient,
    public config: VisionSimConfig = defaultVisionSimConfig,
    private mapRobotPoseForPublish: (pose: Pose3dDto) => Pose3dDto = (pose) => pose,
  ) {
    this.lastMeasurement = this.createNoTargetMeasurement(0);
  }

  update(nowSeconds: number): FieldCoreVisionMeasurement {
    const measurement = this.sample(nowSeconds);
    this.queue.push({
      releaseTimeSeconds: nowSeconds + measurement.latency,
      measurement,
    });

    const ready = this.queue.filter((item) => item.releaseTimeSeconds <= nowSeconds);
    this.queue = this.queue.filter((item) => item.releaseTimeSeconds > nowSeconds);
    if (ready.length > 0) {
      this.lastMeasurement = ready[ready.length - 1].measurement;
    }
    this.publish(this.lastMeasurement);

    return this.lastMeasurement;
  }

  publish(measurement: FieldCoreVisionMeasurement) {
    const truePose = this.mapRobotPoseForPublish(this.getRobotTruePose());
    const detectedTagIds = ensureHighReliabilityTagSet(measurement.detectedTagIds);
    const perfectMeasurement: FieldCoreVisionMeasurement = {
      ...measurement,
      pose: this.getRobotTruePose(),
      latency: 0,
      reliability: 1,
      detectedTagIds,
      tagSpan: 0.4,
      avgTagDist: 1.5,
      avgTagArea: 1,
      status: "OK",
      lastHeartbeat: Date.now() / 1000,
      lastTsBootMs: Date.now(),
      lastSeenTime: Date.now() / 1000,
      temperature: 42,
    };
    this.nt.publish(fieldCoreToRobotTopics.hasTarget, true);
    this.nt.publish(fieldCoreToRobotTopics.pose, poseToArray(truePose));
    this.nt.publish(fieldCoreToRobotTopics.timestampSeconds, Date.now() / 1000);
    this.nt.publish(fieldCoreToRobotTopics.latencySeconds, 0);
    this.nt.publish(fieldCoreToRobotTopics.reliability, 1);
    this.nt.publish(fieldCoreToRobotTopics.detectedTagIds, detectedTagIds);
    this.nt.publish(fieldCoreToRobotTopics.tagSpan, perfectMeasurement.tagSpan);
    this.nt.publish(fieldCoreToRobotTopics.avgTagDist, perfectMeasurement.avgTagDist);
    this.nt.publish(fieldCoreToRobotTopics.avgTagArea, perfectMeasurement.avgTagArea);
    this.nt.publish(fieldCoreToRobotTopics.status, "Connected");
    this.nt.publish(fieldCoreToRobotTopics.lastHeartbeat, Date.now() / 1000);
    this.nt.publish(fieldCoreToRobotTopics.lastTsBootMs, Date.now());
    this.nt.publish(fieldCoreToRobotTopics.lastSeenTime, Date.now() / 1000);
    this.nt.publish(fieldCoreToRobotTopics.temperature, 42);
    this.publishLimelightTopics(perfectMeasurement, truePose);
  }

  private publishLimelightTopics(measurement: FieldCoreVisionMeasurement, publishedPose: Pose3dDto) {
    const prefix = `/${this.config.limelightTableName}`;
    const hasTarget = true;
    const latencyMs = 0;
    const botpose = toLimelightBotposeArray(publishedPose, measurement, latencyMs);
    const rawFiducials = toRawFiducialsArray(measurement);

    this.limelightHeartbeat += 1;
    this.nt.publish(`${prefix}/tv`, hasTarget ? 1 : 0);
    this.nt.publish(`${prefix}/tid`, 1);
    this.nt.publish(`${prefix}/hb`, this.limelightHeartbeat);
    this.nt.publish(`${prefix}/tl`, latencyMs);
    this.nt.publish(`${prefix}/cl`, 0);
    this.nt.publish(`${prefix}/botpose`, botpose);
    this.nt.publish(`${prefix}/botpose_wpiblue`, botpose);
    this.nt.publish(`${prefix}/botpose_orb_wpiblue`, botpose);
    this.nt.publish(`${prefix}/botpose_tagcount`, measurement.detectedTagIds.length);
    this.nt.publish(`${prefix}/botpose_span`, measurement.tagSpan);
    this.nt.publish(`${prefix}/botpose_avgdist`, measurement.avgTagDist);
    this.nt.publish(`${prefix}/botpose_avgarea`, measurement.avgTagArea);
    this.nt.publish(`${prefix}/rawfiducials`, rawFiducials);
    this.nt.publish(`${prefix}/json`, JSON.stringify({
      pID: 0,
      pTYPE: "fiducial",
      v: hasTarget ? 1 : 0,
      ts: Date.now(),
      ts_rio: Date.now() / 1000,
      ts_nt: Date.now(),
      ts_sys: Date.now(),
      ts_us: Date.now() * 1000,
      tl: latencyMs,
      cl: 0,
      ta: measurement.avgTagArea,
      tid: measurement.detectedTagIds[0] ?? 1,
      botpose,
      botpose_wpiblue: botpose,
      botpose_orb: botpose,
      botpose_orb_wpiblue: botpose,
      botpose_tagcount: measurement.detectedTagIds.length,
      botpose_span: measurement.tagSpan,
      botpose_avgdist: measurement.avgTagDist,
      botpose_avgarea: measurement.avgTagArea,
      Fiducial: measurement.detectedTagIds.map((id) => ({ fID: id, ta: measurement.avgTagArea })),
    }));
  }

  private sample(nowSeconds: number): FieldCoreVisionMeasurement {
    if (Math.random() < this.config.dropoutProbability) {
      return this.createNoTargetMeasurement(nowSeconds);
    }

    const robotPose = this.getRobotTruePose();
    const cameraPose = transformPoseOffset(robotPose, this.config.cameraOffsetFromRobotCenter);
    const candidates = this.targets
      .map((target) => ({
        target,
        distance: distance2d(cameraPose, target.pose),
        horizontalAngle: horizontalAngleTo(cameraPose, target.pose),
        verticalAngle: verticalAngleTo(cameraPose, target.pose),
      }));
    const reachableCandidates = candidates
      .filter((item) => item.distance <= this.config.maxDistanceMeters)
      .filter((item) => approximateArea(item.target.sizeMeters.width, item.target.sizeMeters.height, item.distance) >= this.config.minTargetArea)
      .sort((a, b) => a.distance - b.distance);
    const visibleInFov = reachableCandidates
      .filter((item) => Math.abs(item.horizontalAngle) <= degreesToRadians(this.config.horizontalFovDeg) / 2)
      .filter((item) => Math.abs(item.verticalAngle) <= degreesToRadians(this.config.verticalFovDeg) / 2);
    const visible = visibleInFov.length > 0 ? visibleInFov : reachableCandidates.slice(0, 4);
    const syntheticVisible =
      visible.length > 0
        ? visible
        : this.config.continuousPoseOutput
          ? candidates.sort((a, b) => a.distance - b.distance).slice(0, 2)
          : [];

    if (syntheticVisible.length === 0) {
      return this.createNoTargetMeasurement(nowSeconds);
    }

    const avgDistance = syntheticVisible.reduce((sum, item) => sum + item.distance, 0) / syntheticVisible.length;
    const estimatorAvgDistance = this.config.continuousPoseOutput ? Math.min(avgDistance, 4.5) : avgDistance;
    const targetArea =
      syntheticVisible.reduce(
        (sum, item) => sum + approximateLimelightTargetArea(item.target.sizeMeters.width, item.target.sizeMeters.height, item.distance),
        0,
      ) / syntheticVisible.length;
    const estimatorArea = this.config.continuousPoseOutput ? Math.max(targetArea, 0.35) : targetArea;
    const targetSpan =
      syntheticVisible.length > 1
        ? syntheticVisible[syntheticVisible.length - 1].distance - syntheticVisible[0].distance
        : 0;
    const estimatorSpan = this.config.continuousPoseOutput ? Math.max(targetSpan, 0.35) : targetSpan;
    const reliability = this.config.continuousPoseOutput
      ? 1
      : Math.max(0.05, Math.min(1, 1 - avgDistance / this.config.maxDistanceMeters));
    const status = reliability < 0.25 ? "LOW_RELIABILITY" : "OK";
    const latency = Math.max(
      0,
      this.config.latencyMeanSeconds + gaussian() * this.config.latencyStdDevSeconds,
    );
    const measuredPose = this.config.noiseEnabled
      ? noisyPose(robotPose, this.config.positionStdDevMeters, this.config.rotationStdDevRad)
      : robotPose;

    return {
      pose: measuredPose,
      timestampSeconds: nowSeconds - latency,
      latency,
      reliability,
      detectedTagIds: syntheticVisible.map((item) => item.target.id),
      tagSpan: estimatorSpan,
      avgTagDist: estimatorAvgDistance,
      avgTagArea: estimatorArea,
      status,
      lastHeartbeat: nowSeconds,
      lastTsBootMs: nowSeconds * 1000,
      lastSeenTime: nowSeconds,
      temperature: 42,
    };
  }

  private createNoTargetMeasurement(nowSeconds: number): FieldCoreVisionMeasurement {
    const robotPose = this.getRobotTruePose();
    return {
      pose: robotPose,
      timestampSeconds: nowSeconds,
      latency: 0,
      reliability: 0,
      detectedTagIds: [],
      tagSpan: 0,
      avgTagDist: 0,
      avgTagArea: 0,
      status: "NO_TARGET",
      lastHeartbeat: nowSeconds,
      lastTsBootMs: nowSeconds * 1000,
      lastSeenTime: 0,
      temperature: 42,
    };
  }
}

const distance2d = (a: Pose3dDto, b: Pose3dDto) =>
  Math.hypot(a.translation.x - b.translation.x, a.translation.z - b.translation.z);

const horizontalAngleTo = (from: Pose3dDto, to: Pose3dDto) =>
  normalizeRadians(Math.atan2(to.translation.z - from.translation.z, to.translation.x - from.translation.x) - from.rotation.yaw);

const verticalAngleTo = (from: Pose3dDto, to: Pose3dDto) => {
  const planarDistance = Math.max(0.001, distance2d(from, to));
  return Math.atan2(to.translation.y - from.translation.y, planarDistance) - from.rotation.pitch;
};

const approximateArea = (width: number, height: number, distance: number) =>
  (width * height) / Math.max(1, distance * distance);

const approximateLimelightTargetArea = (width: number, height: number, distance: number) =>
  Math.min(1, Math.max(0.05, approximateArea(width, height, distance) * 100));

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;
const radiansToDegrees = (radians: number) => (radians * 180) / Math.PI;

const toLimelightBotposeArray = (
  pose: Pose3dDto,
  measurement: FieldCoreVisionMeasurement,
  latencyMs: number,
) => [
  pose.translation.x,
  pose.translation.y,
  pose.translation.z,
  radiansToDegrees(pose.rotation.roll),
  radiansToDegrees(pose.rotation.pitch),
  radiansToDegrees(pose.rotation.yaw),
  latencyMs,
  measurement.detectedTagIds.length,
  measurement.tagSpan,
  measurement.avgTagDist,
  measurement.avgTagArea,
  ...toRawFiducialsArray(measurement),
];

const toRawFiducialsArray = (measurement: FieldCoreVisionMeasurement) =>
  measurement.detectedTagIds.flatMap((id) => [
    id,
    0,
    0,
    measurement.avgTagArea,
    measurement.avgTagDist,
    measurement.avgTagDist,
    0,
  ]);

const ensureHighReliabilityTagSet = (tagIds: readonly number[]) => {
  const uniqueIds = Array.from(new Set(tagIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (uniqueIds.length >= 2) {
    return uniqueIds;
  }
  if (uniqueIds.length === 1) {
    return uniqueIds[0] === 1 ? [1, 2] : [uniqueIds[0], 1];
  }
  return [1, 2];
};

const normalizeRadians = (value: number) => {
  let result = value;
  while (result > Math.PI) {
    result -= Math.PI * 2;
  }
  while (result < -Math.PI) {
    result += Math.PI * 2;
  }
  return result;
};

const gaussian = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const toLimelightStatus = (status: FieldCoreVisionMeasurement["status"]) => {
  switch (status) {
    case "OK":
      return "Connected";
    case "DISCONNECTED":
      return "Disconnected";
    case "NO_TARGET":
    case "LOW_RELIABILITY":
      return "Connected";
  }
};

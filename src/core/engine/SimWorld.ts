import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsActivationControl, PhysicsMotionType, PhysicsPrestepType, PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import type { Scene } from "@babylonjs/core/scene";
import type { FieldModule } from "../modules/FieldModule";
import {
  poseToArray,
  poseToQuaternion,
  poseToVector3,
  transformPoseOffset,
  vectorQuaternionToPose,
  type Pose3dDto,
} from "../math/pose";
import {
  FIELD_LENGTH_METERS,
  FIELD_WIDTH_METERS,
  MODULE_LOCATIONS,
  ROBOT_MODEL_YAW_OFFSET_RADIANS,
  fieldCoreRobotYawToWpilibYaw,
  fieldCoreXToWpilibBlueX,
  fieldCoreZToWpilibBlueY,
  moduleStatesFromChassisSpeeds,
  robotModelYawToRobotYaw,
  wpilibBlueXToFieldCoreX,
  wpilibBlueYToFieldCoreZ,
  wpilibYawToRobotModelYaw,
  type RobotChassisSpeeds,
  type RobotDriveModuleCommand,
  type RobotModuleState,
} from "../math/driveCoordinates";
import { defaultRobotConfig, RobotObject, type RobotConfig } from "../objects/RobotObject";
import { defaultIntakeConfig, IntakeObject, type IntakeConfig } from "../objects/IntakeObject";
import { GamePieceObject } from "../objects/GamePieceObject";
import { ScoringVolume, type ScoringVolumeConfig } from "../objects/ScoringVolume";
import { Nt4WebSocketClient } from "../nt/Nt4WebSocketClient";
import type { NTConnectionConfig, NetworkTablesClient } from "../nt/NetworkTablesClient";
import { debugTopics, robotToFieldCoreTopics } from "../nt/TopicRegistry";
import {
  defaultVisionSimConfig,
  VisionSimulationSystem,
  type VisionSimConfig,
} from "../vision/VisionSimulationSystem";
import type { FieldCoreVisionMeasurement } from "../vision/VisionMeasurement";
import { isPoseInsideBoxSensor } from "./SensorVolume";
import { tryLoadGlb } from "./AssetLoader";

const GRAVITY_METERS_PER_SECOND_SQUARED = 9.81;
const METERS_PER_INCH = 0.0254;
const HUB_OUTER_TOP_HEIGHT_METERS = 72 * METERS_PER_INCH;
const HUB_SHOT_CLEARANCE_ABOVE_TOP_METERS = 0.3;
const HUB_UPPER_OPENING_AIM_HEIGHT_METERS =
  HUB_OUTER_TOP_HEIGHT_METERS + HUB_SHOT_CLEARANCE_ABOVE_TOP_METERS;
const HUB_CENTER_X_METERS = 3.493265;
const HUB_CENTER_Z_METERS = 0;
const HUB_EXIT_CHUTE_OFFSET_TOWARD_FIELD_CENTER_METERS = 1.05;
// Center from the AdvantageScope Field3d_2026FRCFieldV1 GE-263 hub assembly
// bounds. Aim above the upper rim so the Fuel clears the top edge before
// falling through the hub center.
const BLUE_HUB_TARGET_METERS = new Vector3(
  -HUB_CENTER_X_METERS,
  HUB_UPPER_OPENING_AIM_HEIGHT_METERS,
  HUB_CENTER_Z_METERS,
);
const RED_HUB_TARGET_METERS = new Vector3(
  HUB_CENTER_X_METERS,
  HUB_UPPER_OPENING_AIM_HEIGHT_METERS,
  HUB_CENTER_Z_METERS,
);

export interface ShooterConfig {
  enabledTopic: string;
  shootCommandTopic: string;
  rpmTopic: string;
  hoodAngleTopic: string;
  exitPoseFromRobotCenter: Pose3dDto;
  baseLaunchSpeedMetersPerSecond: number;
  rpmToLaunchSpeedScale: number;
  shotsPerSecond: number;
  launchAngleOffsetDeg: number;
  spreadStdDevDeg: number;
  latencySeconds: number;
}

export const defaultShooterConfig: ShooterConfig = {
  enabledTopic: robotToFieldCoreTopics.shooterEnabled,
  shootCommandTopic: robotToFieldCoreTopics.shootCommand,
  rpmTopic: robotToFieldCoreTopics.shooterRPM,
  hoodAngleTopic: robotToFieldCoreTopics.hoodAngleDeg,
  exitPoseFromRobotCenter: {
    // Balls launch from the top of the robot, straight above chassis center,
    // clear of the chassis collider (robot top ~0.55m + ball radius).
    translation: { x: 0, y: 0.45, z: 0 },
    rotation: { roll: 0, pitch: 0, yaw: 0 },
  },
  baseLaunchSpeedMetersPerSecond: 7.5,
  rpmToLaunchSpeedScale: 0.0005,
  shotsPerSecond: 5,
  launchAngleOffsetDeg: 64,
  spreadStdDevDeg: 0,
  latencySeconds: 0.05,
};

export interface SimStats {
  renderFps: number;
  physicsFps: number;
  ntConnected: boolean;
  ntStatusMessage: string | null;
  robotPose: Pose3dDto;
  heldGamePieces: number;
  gamePieces: number;
  vision: FieldCoreVisionMeasurement | null;
  paused: boolean;
}

export class SimWorld {
  readonly nt: NetworkTablesClient = new Nt4WebSocketClient();
  robotConfig: RobotConfig = { ...defaultRobotConfig };
  intakeConfig: IntakeConfig = structuredClone(defaultIntakeConfig);
  shooterConfig: ShooterConfig = structuredClone(defaultShooterConfig);
  visionConfig: VisionSimConfig = structuredClone(defaultVisionSimConfig);
  robot!: RobotObject;
  intake!: IntakeObject;
  gamePieces: GamePieceObject[] = [];
  scoringVolumes: ScoringVolume[] = [];
  visionSystem!: VisionSimulationSystem;
  robotEnabled = true;
  shooterEnabled = false;
  shootCommand = false;
  shootCount = 0;
  shooterRpm = 0;
  hoodAngleDeg = 0;
  lastShootCommand = false;
  private lastShootCount = 0;
  private nextShotAllowedAtSeconds = 0;
  ntStatusMessage: string | null = null;
  paused = false;
  physicsFps = 0;
  visionMeasurement: FieldCoreVisionMeasurement | null = null;
  private gamePieceTemplate: AbstractMesh[] = [];
  private gamePieceVisualScale = 1;
  private gamePieceRadiusMeters = 0.075;
  private gamePieceMassKg = 0.215;
  private robotChassisSpeeds: RobotChassisSpeeds | null = null;
  private robotModuleStates: RobotModuleState[] = [];
  private robotEstimatedPose: Pose3dDto | null = null;
  private robotPoseInitializedFromNt = false;
  private lastChassisSpeedsUpdateSeconds = Number.NEGATIVE_INFINITY;
  private lastModuleStatesUpdateSeconds = Number.NEGATIVE_INFINITY;
  private lastRobotPoseUpdateSeconds = Number.NEGATIVE_INFINITY;
  private lastDebugPublishSeconds = Number.NEGATIVE_INFINITY;
  private physicsFrames = 0;
  private physicsFpsTimer = 0;

  constructor(
    public scene: Scene,
    private module: FieldModule,
  ) {}

  async initialize() {
    this.scene.clearColor = new Color4(0.035, 0.043, 0.055, 1);
    this.createCameraAndLights();
    const assets = await this.module.loadAssets({ baseUrl: "" });
    const field = this.module.createField({ scene: this.scene, assets });
    await this.createFieldGeometry(field.scoringVolumes, assets.fieldModelUrl);
    await this.loadGamePieceTemplate(assets.gamePieceModelUrl);
    this.createRobot();
    this.createIntake();
    this.scene.onAfterPhysicsObservable.add(() => {
      this.robot.syncPoseFromPhysics();
      this.syncRobotAttachedObjects();
    });
    this.resetGamePieces();
    this.visionSystem = new VisionSimulationSystem(
      () => this.getRobotFramePose(),
      this.module.createVisionTargets(),
      this.nt,
      this.visionConfig,
      (pose) => this.robotFramePoseToWallBluePose(pose),
    );
    this.bindNtTopics();
  }

  update(dtSeconds: number, nowSeconds: number) {
    if (this.paused) {
      return;
    }
    this.physicsFrames += 1;
    this.physicsFpsTimer += dtSeconds;
    if (this.physicsFpsTimer >= 1) {
      this.physicsFps = this.physicsFrames / this.physicsFpsTimer;
      this.physicsFrames = 0;
      this.physicsFpsTimer = 0;
    }

    this.robot.syncPoseFromPhysics();
    this.syncRobotAttachedObjects();
    this.updateRobotMotionFromNetworkTables(dtSeconds, nowSeconds);
    if (this.robot.motionMode === "physics-from-module-states") {
      this.robot.applySuspensionStability(dtSeconds);
    }
    this.updateGamePiecePoses();
    this.updateIntakeState(nowSeconds);
    this.updateShooter(nowSeconds);
    this.updateScoring();
    this.visionMeasurement = this.visionSystem.update(nowSeconds);
    if (nowSeconds - this.lastDebugPublishSeconds >= 0.25) {
      this.lastDebugPublishSeconds = nowSeconds;
      this.nt.publish(debugTopics.trueRobotPose, poseToArray(this.getRobotFramePose()));
      this.nt.publish(
        debugTopics.gamePieceStates,
        this.gamePieces.map((piece) => ({ id: piece.id, state: piece.state, pose: poseToArray(piece.pose) })),
      );
    }
  }

  getStats(renderFps: number): SimStats {
    this.robot.syncPoseFromPhysics();
    this.syncNtStatusMessage();
    const ntConnected = this.nt.isConnected();
    return {
      renderFps,
      physicsFps: this.physicsFps,
      ntConnected,
      ntStatusMessage: this.ntStatusMessage,
      robotPose: this.getRobotFramePose(),
      heldGamePieces: this.gamePieces.filter((piece) => piece.state === "HELD").length,
      gamePieces: this.gamePieces.length,
      vision: this.visionMeasurement,
      paused: this.paused,
    };
  }

  resetRobotPose() {
    this.robot.setPose(this.robotEstimatedPose ?? this.createNeutralRobotPose());
    this.syncRobotAttachedObjects();
  }

  setRobotPoseFromWallBlue(xMeters: number, yMeters: number, yawRadians: number) {
    this.robot.setPose(this.wallBlueRobotPoseArrayToFieldCorePose([xMeters, yMeters, 0, 0, 0, yawRadians]));
    this.syncRobotAttachedObjects();
    this.robotPoseInitializedFromNt = true;
  }

  spawnGamePiece() {
    const id = `game-piece-${this.gamePieces.length + 1}-${Date.now()}`;
    this.createGamePiece(id, {
      translation: {
        x: this.robot.pose.translation.x + 1,
        y: 0.18,
        z: this.robot.pose.translation.z,
      },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
    });
  }

  clearGamePieces() {
    this.gamePieces.forEach((piece) => piece.dispose());
    this.gamePieces = [];
  }

  resetGamePieces() {
    this.clearGamePieces();
    const instances = this.module.createDefaultGamePieces({ scene: this.scene, assets: {} });
    instances.forEach((piece) => this.createGamePiece(piece.id, piece.pose));
  }

  toggleIntake() {
    this.intake.enabled = !this.intake.enabled;
    this.nt.publish(robotToFieldCoreTopics.intakeEnabled, this.intake.enabled);
  }

  fireTestShot() {
    this.shooterEnabled = true;
    this.shootCommand = true;
    this.shootCount += 1;
    this.nt.publish(robotToFieldCoreTopics.shooterEnabled, true);
    this.nt.publish(robotToFieldCoreTopics.shootCommand, true);
    this.nt.publish(robotToFieldCoreTopics.shootCount, this.shootCount);
    window.setTimeout(() => {
      this.shootCommand = false;
      this.nt.publish(robotToFieldCoreTopics.shootCommand, false);
    }, 80);
  }

  async connectNt(config: NTConnectionConfig) {
    this.ntStatusMessage = "Connecting";
    try {
      await this.nt.connect(config);
      this.ntStatusMessage = this.nt.isConnected() ? `Connected to ${config.host}:${config.port}` : "Disconnected";
    } catch (error) {
      this.ntStatusMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  disconnectNt() {
    this.nt.disconnect();
    this.ntStatusMessage = "Disconnected";
  }

  toggleVisionNoise() {
    this.visionConfig.noiseEnabled = !this.visionConfig.noiseEnabled;
  }

  setPaused(paused: boolean) {
    this.paused = paused;
  }

  step(nowSeconds: number) {
    const wasPaused = this.paused;
    this.paused = false;
    this.update(1 / 60, nowSeconds);
    this.paused = wasPaused;
  }

  private createCameraAndLights() {
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 14, Vector3.Zero(), this.scene);
    camera.attachControl(this.scene.getEngine().getRenderingCanvas(), true);
    camera.lowerRadiusLimit = 4;
    camera.upperRadiusLimit = 30;

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.65;
    const directional = new DirectionalLight("sun", new Vector3(-0.4, -0.8, -0.3), this.scene);
    directional.intensity = 0.75;
  }

  private async createFieldGeometry(scoringVolumeConfigs: ScoringVolumeConfig[], fieldModelUrl?: string) {
    const fieldMaterial = new StandardMaterial("field-mat", this.scene);
    fieldMaterial.diffuseColor = new Color3(0.13, 0.16, 0.18);
    const lineMaterial = new StandardMaterial("field-line-mat", this.scene);
    lineMaterial.diffuseColor = new Color3(0.6, 0.7, 0.8);

    const ground = MeshBuilder.CreateBox("field-floor-physics", {
      width: FIELD_LENGTH_METERS,
      height: 0.08,
      depth: FIELD_WIDTH_METERS,
    }, this.scene);
    ground.position.y = -0.04;
    const groundMaterial = new StandardMaterial("field-physics-ground-mat", this.scene);
    groundMaterial.diffuseColor = new Color3(0.12, 0.16, 0.14);
    groundMaterial.alpha = fieldModelUrl ? 0.18 : 1;
    ground.material = fieldModelUrl ? groundMaterial : fieldMaterial;
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0, friction: 0.8, restitution: 0.2 }, this.scene);

    let loadedOfficialModel = false;
    if (fieldModelUrl) {
      const loaded = await tryLoadGlb(this.scene, fieldModelUrl);
      loadedOfficialModel = loaded.loaded;
      if (loaded.loaded) {
        loaded.meshes.forEach((mesh) => {
          if (mesh.name.includes("Fuel") || mesh.id.includes("Fuel")) {
            mesh.setEnabled(false);
          }
        });
        this.createOfficialFieldMeshColliders(loaded.meshes);
      } else {
        console.warn(`Unable to load official field GLB, using fallback geometry: ${loaded.error}`);
      }
    }

    const wallMat = new StandardMaterial("wall-mat", this.scene);
    wallMat.diffuseColor = new Color3(0.2, 0.24, 0.3);
    wallMat.alpha = loadedOfficialModel ? 0 : 1;
    const walls = [
      { name: "field-wall-blue", position: new Vector3(-FIELD_LENGTH_METERS / 2, 0.25, 0), size: { width: 0.12, height: 0.5, depth: FIELD_WIDTH_METERS } },
      { name: "field-wall-red", position: new Vector3(FIELD_LENGTH_METERS / 2, 0.25, 0), size: { width: 0.12, height: 0.5, depth: FIELD_WIDTH_METERS } },
      { name: "field-wall-left", position: new Vector3(0, 0.25, -FIELD_WIDTH_METERS / 2), size: { width: FIELD_LENGTH_METERS, height: 0.5, depth: 0.12 } },
      { name: "field-wall-right", position: new Vector3(0, 0.25, FIELD_WIDTH_METERS / 2), size: { width: FIELD_LENGTH_METERS, height: 0.5, depth: 0.12 } },
    ];
    walls.forEach((wall) => {
      const mesh = this.createStaticBox(wall.name, wall.position, wall.size, wallMat);
      mesh.visibility = loadedOfficialModel ? 0 : 1;
      mesh.isPickable = !loadedOfficialModel;
    });
    if (!loadedOfficialModel) {
      this.createStaticFieldCollisionProxies();
    }

    const scoringMaterial = new StandardMaterial("scoring-volume-mat", this.scene);
    scoringMaterial.diffuseColor = new Color3(0.95, 0.75, 0.25);
    scoringMaterial.alpha = 0.28;
    scoringVolumeConfigs.forEach((config) => {
      const mesh = MeshBuilder.CreateBox(config.id, {
        width: config.sizeMeters.width,
        height: config.sizeMeters.height,
        depth: config.sizeMeters.length,
      }, this.scene);
      mesh.position = poseToVector3(config.pose);
      mesh.material = scoringMaterial;
      mesh.isVisible = false;
      mesh.isPickable = false;
      this.scoringVolumes.push(new ScoringVolume(config, mesh));
    });
  }

  private createOfficialFieldMeshColliders(meshes: AbstractMesh[]) {
    meshes.forEach((mesh) => {
      if (!this.shouldUseOfficialFieldCollider(mesh)) {
        return;
      }
      mesh.computeWorldMatrix(true);
      try {
        new PhysicsAggregate(mesh, PhysicsShapeType.MESH, {
          mass: 0,
          friction: 0.82,
          restitution: 0.08,
          mesh: mesh as Mesh,
        }, this.scene);
      } catch (error) {
        console.warn(`Unable to create exact field mesh collider for ${mesh.name}:`, error);
      }
    });
  }

  private shouldUseOfficialFieldCollider(mesh: AbstractMesh) {
    if (!mesh.isEnabled() || mesh.getTotalVertices() <= 0) {
      return false;
    }
    const name = `${mesh.name} ${mesh.id}`;
    if (/Fuel|Tape|Vinyl|Sticker|Decal|Screw|Bearing|Spacer|Washer|Nut|Bolt|PEM|Rivet|Tread|Wheel|Gas Spring|REV-21-2246/i.test(name)) {
      return false;
    }
    if (mesh.getTotalVertices() > 80000) {
      return false;
    }
    return true;
  }

  private createStaticBox(
    name: string,
    position: Vector3,
    size: { width: number; height: number; depth: number },
    material?: StandardMaterial,
    rotation?: Vector3,
  ) {
    const mesh = MeshBuilder.CreateBox(name, size, this.scene);
    mesh.position = position;
    if (rotation) {
      mesh.rotation = rotation;
    }
    if (material) {
      mesh.material = material;
    }
    new PhysicsAggregate(mesh, PhysicsShapeType.BOX, { mass: 0, friction: 0.75, restitution: 0.12 }, this.scene);
    return mesh;
  }

  private createStaticFieldCollisionProxies() {
    const colliderMaterial = new StandardMaterial("field-collider-proxy-mat", this.scene);
    colliderMaterial.diffuseColor = new Color3(0.95, 0.8, 0.3);
    colliderMaterial.alpha = 0;

    [
      { name: "blue-hub-physical-proxy", position: new Vector3(-6.2, 0.55, 0), size: { width: 1.35, height: 1.1, depth: 1.35 } },
      { name: "red-hub-physical-proxy", position: new Vector3(6.2, 0.55, 0), size: { width: 1.35, height: 1.1, depth: 1.35 } },
      { name: "blue-source-left-proxy", position: new Vector3(-8.35, 0.42, 3.25), size: { width: 1.1, height: 0.08, depth: 1.25 }, yaw: 0, roll: -0.35 },
      { name: "blue-source-right-proxy", position: new Vector3(-8.35, 0.42, -3.25), size: { width: 1.1, height: 0.08, depth: 1.25 }, yaw: 0, roll: 0.35 },
      { name: "red-source-left-proxy", position: new Vector3(8.35, 0.42, 3.25), size: { width: 1.1, height: 0.08, depth: 1.25 }, yaw: 0, roll: -0.35 },
      { name: "red-source-right-proxy", position: new Vector3(8.35, 0.42, -3.25), size: { width: 1.1, height: 0.08, depth: 1.25 }, yaw: 0, roll: 0.35 },
      { name: "center-barrier-proxy", position: new Vector3(0, 0.2, 0), size: { width: 0.16, height: 0.4, depth: 1.4 } },
    ].forEach((proxy) => {
      const mesh = this.createStaticBox(
        proxy.name,
        proxy.position,
        proxy.size,
        colliderMaterial,
        new Vector3(proxy.roll ?? 0, 0, proxy.yaw ?? 0),
      );
      mesh.visibility = 0;
    });

    this.module.createDefaultGamePieces({ scene: this.scene, assets: {} }).forEach((piece) => {
      if (piece.pose.translation.y <= this.gamePieceRadiusMeters + 0.12) {
        return;
      }
      const support = this.createStaticBox(
        `${piece.id}-staged-support`,
        new Vector3(piece.pose.translation.x, piece.pose.translation.y - this.gamePieceRadiusMeters - 0.025, piece.pose.translation.z),
        { width: 0.24, height: 0.05, depth: 0.24 },
        colliderMaterial,
      );
      support.visibility = 0;
      support.isPickable = false;
    });
  }

  private createRobot() {
    const pose = this.createNeutralRobotPose();
    const robotMaterial = new StandardMaterial("robot-mat", this.scene);
    robotMaterial.diffuseColor = Color3.FromHexString(this.robotConfig.color);
    const mesh = MeshBuilder.CreateBox("robot-physics", {
      width: this.robotConfig.lengthMeters,
      depth: this.robotConfig.widthMeters,
      height: this.robotConfig.heightMeters,
    }, this.scene);
    const physicsMaterial = new StandardMaterial("robot-physics-mat", this.scene);
    physicsMaterial.diffuseColor = new Color3(0.15, 0.18, 0.22);
    physicsMaterial.alpha = 0;
    mesh.material = physicsMaterial;
    mesh.position = poseToVector3(pose);
    mesh.rotationQuaternion = poseToQuaternion(pose);

    const visual = MeshBuilder.CreateBox("robot-visual", {
      width: this.robotConfig.lengthMeters,
      depth: this.robotConfig.widthMeters,
      height: this.robotConfig.heightMeters,
    }, this.scene);
    visual.parent = mesh;
    visual.material = robotMaterial;
    visual.position.set(0, 0, 0);

    const tailMaterial = new StandardMaterial("robot-tail-mat", this.scene);
    tailMaterial.diffuseColor = new Color3(0.1, 0.9, 0.62);
    const tailMarker = MeshBuilder.CreateBox("robot-tail-marker", {
      width: 0.035,
      depth: this.robotConfig.widthMeters * 0.9,
      height: this.robotConfig.heightMeters * 0.88,
    }, this.scene);
    tailMarker.parent = mesh;
    tailMarker.material = tailMaterial;
    tailMarker.position.set(-this.robotConfig.lengthMeters / 2 - 0.018, 0, 0);

    const frontMaterial = new StandardMaterial("robot-front-mat", this.scene);
    frontMaterial.diffuseColor = new Color3(0.55, 0.8, 1);
    const frontMarker = MeshBuilder.CreateBox("robot-front-marker", {
      width: 0.035,
      depth: this.robotConfig.widthMeters * 0.45,
      height: this.robotConfig.heightMeters * 0.88,
    }, this.scene);
    frontMarker.parent = mesh;
    frontMarker.material = frontMaterial;
    frontMarker.position.set(this.robotConfig.lengthMeters / 2 + 0.018, 0, 0);

    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.BOX, {
      mass: this.robotConfig.massKg,
      friction: 0.04,
      restitution: 0.01,
    }, this.scene);
    aggregate.body.setMotionType(PhysicsMotionType.DYNAMIC);
    aggregate.body.disablePreStep = false;
    aggregate.body.setMassProperties({
      mass: this.robotConfig.massKg,
      centerOfMass: new Vector3(0, -this.robotConfig.heightMeters * 0.38, 0),
    });
    aggregate.body.setLinearDamping(0.02);
    aggregate.body.setAngularDamping(0.08);
    this.keepBodyAlwaysActive(aggregate.body);
    this.robot = new RobotObject("robot", pose, this.robotConfig, mesh, aggregate.body);
  }

  private keepBodyAlwaysActive(body: PhysicsBody) {
    const plugin = this.scene.getPhysicsEngine()?.getPhysicsPlugin();
    if (plugin && "setActivationControl" in plugin) {
      (plugin as { setActivationControl: (physicsBody: PhysicsBody, control: PhysicsActivationControl) => void })
        .setActivationControl(body, PhysicsActivationControl.ALWAYS_ACTIVE);
    }
  }

  private createIntake() {
    const material = new StandardMaterial("intake-mat", this.scene);
    material.diffuseColor = new Color3(0.55, 0.8, 1);
    material.alpha = 0.35;
    const mesh = MeshBuilder.CreateBox("intake-trigger", {
      width: this.intakeConfig.sizeMeters.length,
      depth: this.intakeConfig.sizeMeters.width,
      height: this.intakeConfig.sizeMeters.height,
    }, this.scene);
    mesh.material = material;
    this.intake = new IntakeObject("intake", this.robot.pose, this.intakeConfig, mesh);
  }

  private async loadGamePieceTemplate(gamePieceModelUrl?: string) {
    if (!gamePieceModelUrl) {
      return;
    }
    const loaded = await tryLoadGlb(this.scene, gamePieceModelUrl);
    if (!loaded.loaded) {
      console.warn(`Unable to load official game piece GLB, using procedural sphere: ${loaded.error}`);
      return;
    }
    this.gamePieceTemplate = loaded.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    const min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    this.gamePieceTemplate.forEach((mesh) => {
      mesh.computeWorldMatrix(true);
      const bounds = mesh.getBoundingInfo().boundingBox;
      min.x = Math.min(min.x, bounds.minimumWorld.x);
      min.y = Math.min(min.y, bounds.minimumWorld.y);
      min.z = Math.min(min.z, bounds.minimumWorld.z);
      max.x = Math.max(max.x, bounds.maximumWorld.x);
      max.y = Math.max(max.y, bounds.maximumWorld.y);
      max.z = Math.max(max.z, bounds.maximumWorld.z);
      mesh.setEnabled(false);
    });
    const dimensions = max.subtract(min);
    const modelDiameter = Math.max(dimensions.x, dimensions.y, dimensions.z);
    if (Number.isFinite(modelDiameter) && modelDiameter > 0) {
      this.gamePieceVisualScale = (this.gamePieceRadiusMeters * 2) / modelDiameter;
    }
  }

  private createGamePiece(id: string, pose: Pose3dDto) {
    const material = new StandardMaterial(`${id}-collision-mat`, this.scene);
    material.diffuseColor = new Color3(1, 0.64, 0.2);
    material.alpha = this.gamePieceTemplate.length > 0 ? 0.28 : 1;
    const mesh = MeshBuilder.CreateSphere(id, { diameter: this.gamePieceRadiusMeters * 2, segments: 16 }, this.scene);
    mesh.position = poseToVector3(pose);
    mesh.rotationQuaternion = poseToQuaternion(pose);
    mesh.material = material;
    if (this.gamePieceTemplate.length > 0) {
      this.gamePieceTemplate.forEach((template, index) => {
        const clone = template.clone(`${id}-visual-${index}`, mesh);
        if (clone) {
          clone.setEnabled(true);
          clone.position.set(0, 0, 0);
          clone.rotation.set(Math.PI / 2, 0, 0);
          clone.scaling.copyFrom(template.scaling).scaleInPlace(this.gamePieceVisualScale);
        }
      });
    }
    this.setGamePieceVisualsVisible({ mesh }, true);
    const aggregate = new PhysicsAggregate(mesh, PhysicsShapeType.SPHERE, {
      mass: this.gamePieceMassKg,
      friction: 0.6,
      restitution: 0.18,
      startAsleep: true,
    }, this.scene);
    aggregate.body.setLinearDamping(0.16);
    aggregate.body.setAngularDamping(0.22);
    aggregate.body.setPrestepType(PhysicsPrestepType.TELEPORT);
    aggregate.body.setLinearVelocity(Vector3.Zero());
    aggregate.body.setAngularVelocity(Vector3.Zero());
    this.gamePieces.push(new GamePieceObject(id, pose, mesh, aggregate.body));
  }

  private bindNtTopics() {
    this.nt.subscribe<boolean>(robotToFieldCoreTopics.enabled, (value) => {
      this.robotEnabled = value;
    });
    this.nt.subscribe<number[]>(robotToFieldCoreTopics.poseEstimate, (value) => {
      const pose = this.wallBlueRobotPoseArrayToFieldCorePose(value);
      this.robotEstimatedPose = pose;
      this.lastRobotPoseUpdateSeconds = performance.now() / 1000;
      if (!this.robotPoseInitializedFromNt || this.robot.motionMode === "networktables-pose") {
        this.robot.setPose(pose);
        this.syncRobotAttachedObjects();
        this.robotPoseInitializedFromNt = true;
      }
    });
    this.nt.subscribe<number[]>(robotToFieldCoreTopics.chassisSpeeds, (value) => {
      this.robotChassisSpeeds = {
        vxMetersPerSecond: value[0] ?? 0,
        vyMetersPerSecond: value[1] ?? 0,
        omegaRadiansPerSecond: value[2] ?? 0,
      };
      this.lastChassisSpeedsUpdateSeconds = performance.now() / 1000;
    });
    this.nt.subscribe<number[]>(robotToFieldCoreTopics.moduleStates, (value) => {
      const states: RobotModuleState[] = [];
      for (let i = 0; i + 1 < value.length; i += 2) {
        states.push({
          speedMetersPerSecond: value[i] ?? 0,
          angleRadians: value[i + 1] ?? 0,
        });
      }
      this.robotModuleStates = states;
      this.lastModuleStatesUpdateSeconds = performance.now() / 1000;
    });
    this.nt.subscribe<boolean>(robotToFieldCoreTopics.intakeEnabled, (value) => {
      this.intake.enabled = value;
    });
    this.nt.subscribe<boolean>(robotToFieldCoreTopics.shooterEnabled, (value) => {
      this.shooterEnabled = value;
    });
    this.nt.subscribe<number>(robotToFieldCoreTopics.shooterRPM, (value) => {
      this.shooterRpm = value;
    });
    this.nt.subscribe<number>(robotToFieldCoreTopics.hoodAngleDeg, (value) => {
      this.hoodAngleDeg = value;
    });
    this.nt.subscribe<boolean>(robotToFieldCoreTopics.shootCommand, (value) => {
      this.shootCommand = value;
    });
    this.nt.subscribe<number>(robotToFieldCoreTopics.shootCount, (value) => {
      this.shootCount = value;
    });
  }

  private updateRobotMotionFromNetworkTables(dtSeconds: number, nowSeconds: number) {
    if (!this.nt.isConnected() || !this.robotEnabled) {
      this.robot.stopDrive();
      return;
    }
    if (this.robot.motionMode === "networktables-pose") {
      this.robot.stopDrive();
      return;
    }
    const moduleCommands =
      nowSeconds - this.lastModuleStatesUpdateSeconds < 0.25 && this.robotModuleStates.length >= 4
        ? this.robotModuleStates.slice(0, MODULE_LOCATIONS.length)
        : nowSeconds - this.lastChassisSpeedsUpdateSeconds < 0.25 && this.robotChassisSpeeds
          ? moduleStatesFromChassisSpeeds(this.robotChassisSpeeds)
          : null;
    if (!moduleCommands) {
      this.robot.stopDrive();
      return;
    }
    const driveCommands: RobotDriveModuleCommand[] = moduleCommands.map((state, index) => ({
      speedMetersPerSecond: state.speedMetersPerSecond,
      angleRadians: state.angleRadians,
      locationMeters: MODULE_LOCATIONS[index],
    }));
    this.robot.applyModuleDrive(driveCommands, dtSeconds, this.getRobotFramePose().rotation.yaw);
  }

  private updateGamePiecePoses() {
    let heldIndex = 0;
    this.gamePieces.forEach((piece) => {
      if (piece.mesh && piece.state !== "HELD") {
        piece.previousPose = piece.pose;
        piece.pose = {
          translation: { x: piece.mesh.position.x, y: piece.mesh.position.y, z: piece.mesh.position.z },
          rotation: vectorQuaternionToPose(piece.mesh.position, piece.mesh.rotationQuaternion ?? poseToQuaternion(piece.pose)).rotation,
        };
      }
      if (piece.state === "HELD" && piece.mesh) {
        // Logical inventory pose follows the robot for the inspector/debug topics,
        // but the actual physics body stays parked far below the field so the
        // invisible held collider can never push the robot chassis or free balls.
        piece.pose = this.getHeldGamePiecePose(heldIndex);
        this.setGamePieceVisualsVisible(piece, false);
        this.parkGamePieceBody(piece, heldIndex);
        heldIndex += 1;
      }
    });
  }

  private setGamePieceVisualsVisible(piece: Pick<GamePieceObject, "mesh">, visible: boolean) {
    if (!piece.mesh) {
      return;
    }
    piece.mesh.setEnabled(true);
    // The root sphere is the physics shape. When an official GLB is attached,
    // keep that collider invisible and show only the cloned visual meshes.
    piece.mesh.isVisible = visible && this.gamePieceTemplate.length === 0;
    piece.mesh.getChildMeshes(false).forEach((child) => {
      child.setEnabled(visible);
      child.isVisible = visible;
    });
  }

  private parkGamePieceBody(piece: GamePieceObject, index: number) {
    if (!piece.mesh) {
      return;
    }
    const parked = new Vector3(0, -10 - index * (this.gamePieceRadiusMeters * 2 + 0.1), 0);
    piece.mesh.position.copyFrom(parked);
    piece.mesh.computeWorldMatrix(true);
    if (piece.body) {
      piece.body.setMotionType(PhysicsMotionType.ANIMATED);
      piece.body.setPrestepType(PhysicsPrestepType.TELEPORT);
      piece.body.transformNode.setEnabled(true);
      piece.body.transformNode.setAbsolutePosition(parked);
      piece.body.transformNode.computeWorldMatrix(true);
      piece.body.setLinearVelocity(Vector3.Zero());
      piece.body.setAngularVelocity(Vector3.Zero());
    }
  }

  private getHeldGamePiecePose(index: number) {
    const slotSpacingMeters = this.gamePieceRadiusMeters * 2.15;
    return transformPoseOffset(this.getRobotFramePose(), {
      translation: {
        x: -0.12 - Math.floor(index / 2) * slotSpacingMeters,
        y: -0.13 + Math.floor(index / 4) * this.gamePieceRadiusMeters * 0.8,
        z: (index % 2 === 0 ? -0.11 : 0.11),
      },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
    });
  }

  private getIntakeStoragePose() {
    return transformPoseOffset(this.getRobotFramePose(), {
      translation: { x: -0.28, y: -0.14, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
    });
  }

  private captureGamePiece(piece: GamePieceObject) {
    const heldIndex = this.gamePieces.filter((candidate) => candidate.state === "HELD").length;
    piece.state = "HELD";
    piece.contactStartedAtSeconds = null;
    piece.shotAtSeconds = null;
    piece.pose = this.getHeldGamePiecePose(heldIndex);
    piece.previousPose = null;
    this.setGamePieceVisualsVisible(piece, false);
    piece.body?.setMotionType(PhysicsMotionType.ANIMATED);
    piece.body?.setPrestepType(PhysicsPrestepType.TELEPORT);
    this.parkGamePieceBody(piece, heldIndex);
  }

  private updateIntakeState(nowSeconds: number) {
    let heldCount = this.gamePieces.filter((piece) => piece.state === "HELD").length;
    const intakeSensorPose = this.intake.getSensorPose();
    const captureVolume = {
      pose: intakeSensorPose,
      sizeMeters: {
        width: this.intake.config.sizeMeters.width + this.gamePieceRadiusMeters * 1.8,
        length: this.intake.config.sizeMeters.length + this.gamePieceRadiusMeters * 1.8,
        height: Math.max(this.intake.config.sizeMeters.height + this.gamePieceRadiusMeters * 2.2, this.gamePieceRadiusMeters * 3),
      },
    };
    const suctionVolume = {
      pose: intakeSensorPose,
      sizeMeters: {
        width: this.intake.config.sizeMeters.width + 0.45,
        length: this.intake.config.sizeMeters.length + 0.9,
        height: Math.max(this.intake.config.sizeMeters.height + 0.32, this.gamePieceRadiusMeters * 3.4),
      },
    };

    this.gamePieces.forEach((piece) => {
      if (piece.state !== "FREE" && piece.state !== "CONTACTING_INTAKE" && piece.state !== "INTAKING") {
        return;
      }
      const canCapture =
        this.intake.enabled &&
        (!this.intake.config.captureRequiresRobotEnabled || this.robotEnabled) &&
        (this.intake.config.maxHeldCount <= 0 || heldCount < this.intake.config.maxHeldCount);
      const insideCapture = isPoseInsideBoxSensor(piece.pose, captureVolume);
      const insideSuction = isPoseInsideBoxSensor(piece.pose, suctionVolume);
      if (!insideCapture && !(canCapture && insideSuction)) {
        piece.state = "FREE";
        piece.contactStartedAtSeconds = null;
        return;
      }
      if (canCapture && insideCapture) {
        piece.contactStartedAtSeconds ??= nowSeconds;
        if (nowSeconds - piece.contactStartedAtSeconds >= Math.min(0.03, this.intake.config.captureDelaySeconds)) {
          this.captureGamePiece(piece);
          heldCount += 1;
          return;
        }
      }
      if (canCapture && insideSuction) {
        const captured = this.applyIntakeAttraction(piece, insideCapture ? 2.6 : 1.55);
        if (captured) {
          heldCount += 1;
          return;
        }
      }
      if (!insideCapture) {
        piece.state = "CONTACTING_INTAKE";
        piece.contactStartedAtSeconds = null;
        return;
      }
      piece.state = canCapture ? "INTAKING" : "CONTACTING_INTAKE";
      piece.contactStartedAtSeconds ??= nowSeconds;
      if (canCapture && nowSeconds - piece.contactStartedAtSeconds >= this.intake.config.captureDelaySeconds) {
        this.captureGamePiece(piece);
        heldCount += 1;
      }
    });
  }

  private applyIntakeAttraction(piece: GamePieceObject, speedMetersPerSecond: number) {
    if (!piece.mesh || !piece.body) {
      return false;
    }
    const targetPose = this.getIntakeStoragePose();
    const target = poseToVector3(targetPose);
    const delta = target.subtract(piece.mesh.position);
    if (delta.length() <= this.gamePieceRadiusMeters * 0.85) {
      this.captureGamePiece(piece);
      return true;
    }
    const velocity = delta.normalize().scale(speedMetersPerSecond);
    piece.body.setLinearVelocity(velocity);
    return false;
  }

  private updateShooter(nowSeconds: number) {
    const risingEdge = this.shootCommand && !this.lastShootCommand;
    this.lastShootCommand = this.shootCommand;
    const shootCountChanged = this.shootCount > this.lastShootCount;
    this.lastShootCount = this.shootCount;

    // Launch only on an explicit feed/shoot request: a held-true ShootCommand fires
    // continuously at shotsPerSecond, and ShootCount changes catch short NT pulses.
    // ShooterEnabled (flywheel above idle) alone must NOT launch game pieces.
    if (!this.shootCommand && !risingEdge && !shootCountChanged) {
      return;
    }
    if (nowSeconds < this.nextShotAllowedAtSeconds && !risingEdge && !shootCountChanged) {
      return;
    }

    const held = this.gamePieces.find((piece) => piece.state === "HELD");
    if (!held) {
      return;
    }

    held.state = "SHOT";
    held.shotAtSeconds = nowSeconds;
    const launchPose = transformPoseOffset(this.getAuthoritativeRobotPose(), this.shooterConfig.exitPoseFromRobotCenter);
    const target = this.getAllianceScoringTarget();
    const requestedSpeed =
      this.shooterConfig.baseLaunchSpeedMetersPerSecond + this.shooterRpm * this.shooterConfig.rpmToLaunchSpeedScale;
    const velocity = this.solveShotVelocity(
      poseToVector3(launchPose),
      target,
      requestedSpeed,
    );
    this.launchHeldGamePiece(held, launchPose, velocity);
    const shotPeriodSeconds = 1 / Math.max(0.1, this.shooterConfig.shotsPerSecond);
    this.nextShotAllowedAtSeconds = nowSeconds + shotPeriodSeconds;
  }

  private launchHeldGamePiece(piece: GamePieceObject, launchPose: Pose3dDto, velocity: Vector3) {
    const launchPosition = poseToVector3(launchPose);
    const launchRotation = poseToQuaternion(launchPose);
    piece.previousPose = launchPose;
    piece.pose = launchPose;

    if (piece.body) {
      piece.body.setMotionType(PhysicsMotionType.ANIMATED);
      piece.body.setPrestepType(PhysicsPrestepType.TELEPORT);
      piece.body.setLinearVelocity(Vector3.Zero());
      piece.body.setAngularVelocity(Vector3.Zero());
    }
    if (piece.mesh) {
      this.setGamePieceVisualsVisible(piece, true);
      piece.mesh.position.copyFrom(launchPosition);
      piece.mesh.rotationQuaternion = launchRotation.clone();
      piece.mesh.computeWorldMatrix(true);
    }
    if (piece.body) {
      piece.body.transformNode.setEnabled(true);
      piece.body.transformNode.setAbsolutePosition(launchPosition);
      piece.body.transformNode.rotationQuaternion = launchRotation.clone();
      piece.body.transformNode.computeWorldMatrix(true);
      piece.body.setMotionType(PhysicsMotionType.DYNAMIC);
      piece.body.setPrestepType(PhysicsPrestepType.TELEPORT);
      piece.body.setLinearVelocity(velocity);
      piece.body.setAngularVelocity(Vector3.Zero());
    }
  }

  private getAuthoritativeRobotPose() {
    if (
      this.robot.motionMode === "networktables-pose" &&
      this.robotEstimatedPose != null &&
      performance.now() / 1000 - this.lastRobotPoseUpdateSeconds < 0.35
    ) {
      return this.robotModelPoseToRobotFramePose(this.robotEstimatedPose);
    }
    return this.getRobotFramePose();
  }

  private syncRobotAttachedObjects() {
    if (!this.intake) {
      return;
    }
    this.intake.updateFromRobotPose(this.getRobotFramePose());
  }

  private updateScoring() {
    const nowSeconds = performance.now() / 1000;
    this.gamePieces.forEach((piece) => {
      if (piece.state !== "SHOT") {
        return;
      }
      const scored = this.scoringVolumes.some((volume) => this.didShotScore(piece, volume));
      if (scored) {
        piece.state = "SCORED";
        piece.shotAtSeconds = null;
        piece.scoredAtSeconds = nowSeconds;
        return;
      }
      // Missed shots settle back onto the field and become intakeable again.
      if (piece.shotAtSeconds != null && nowSeconds - piece.shotAtSeconds > 2.5) {
        piece.state = "FREE";
        piece.shotAtSeconds = null;
      }
    });

    // Scored balls pass through the hub and roll back out of a lower exit chute a
    // moment later, becoming FREE again so they can be re-intaken and re-used.
    this.gamePieces.forEach((piece) => {
      if (piece.state !== "SCORED" || piece.scoredAtSeconds == null) {
        return;
      }
      if (nowSeconds - piece.scoredAtSeconds < 0.9) {
        return;
      }
      this.releaseScoredGamePiece(piece);
    });
  }

  private releaseScoredGamePiece(piece: GamePieceObject) {
    piece.state = "FREE";
    piece.scoredAtSeconds = null;
    piece.contactStartedAtSeconds = null;
    piece.previousPose = null;
    const allianceSign = piece.pose.translation.x < 0 ? -1 : 1;
    const hubTarget = this.getScoringTargetForFieldX(piece.pose.translation.x);
    // Exit chute at the hub base, offset toward field center so the ball rolls
    // back into play instead of resting against the hub collider.
    const exitPosition = new Vector3(
      hubTarget.x - allianceSign * HUB_EXIT_CHUTE_OFFSET_TOWARD_FIELD_CENTER_METERS,
      0.45,
      (Math.random() - 0.5) * 1.2,
    );
    if (piece.mesh) {
      this.setGamePieceVisualsVisible(piece, true);
      piece.mesh.position.copyFrom(exitPosition);
      piece.mesh.computeWorldMatrix(true);
    }
    if (piece.body) {
      piece.body.transformNode.setAbsolutePosition(exitPosition);
      piece.body.transformNode.computeWorldMatrix(true);
      piece.body.transformNode.setEnabled(true);
      piece.body.setMotionType(PhysicsMotionType.DYNAMIC);
      piece.body.setLinearVelocity(new Vector3(allianceSign * -1.1, -0.4, (Math.random() - 0.5) * 0.8));
      piece.body.setAngularVelocity(Vector3.Zero());
    }
    piece.pose = {
      translation: { x: exitPosition.x, y: exitPosition.y, z: exitPosition.z },
      rotation: { roll: 0, pitch: 0, yaw: 0 },
    };
  }

  private getAllianceScoringTarget() {
    const robotPose = this.getAuthoritativeRobotPose();
    return this.getScoringTargetForFieldX(robotPose.translation.x);
  }

  private getScoringTargetForFieldX(fieldX: number) {
    const targetId = fieldX < 0 ? "blue" : "red";
    const officialHubCenter = fieldX < 0 ? BLUE_HUB_TARGET_METERS : RED_HUB_TARGET_METERS;
    const volume =
      this.scoringVolumes.find((candidate) => candidate.id.toLowerCase().includes(targetId)) ??
      this.scoringVolumes[0];
    if (!volume) {
      return officialHubCenter.clone();
    }
    return new Vector3(
      officialHubCenter.x,
      volume.pose.translation.y,
      officialHubCenter.z,
    );
  }

  private solveShotVelocity(start: Vector3, target: Vector3, requestedSpeed: number) {
    const dx = target.x - start.x;
    const dz = target.z - start.z;
    const horizontalDistance = Math.max(0.1, Math.hypot(dx, dz));
    const dy = target.y - start.y;
    const launchAngleRadians = (clamp(this.shooterConfig.launchAngleOffsetDeg, 45, 72) * Math.PI) / 180;
    const cosAngle = Math.cos(launchAngleRadians);
    const tanAngle = Math.tan(launchAngleRadians);
    const ballisticDenominator =
      2 * cosAngle * cosAngle * (horizontalDistance * tanAngle - dy);
    let horizontalSpeed: number;
    let verticalSpeed: number;
    if (ballisticDenominator > 1e-6) {
      const requiredSpeed = Math.sqrt(
        (GRAVITY_METERS_PER_SECOND_SQUARED * horizontalDistance * horizontalDistance) /
          ballisticDenominator,
      );
      const finiteRequestedSpeed = Number.isFinite(requestedSpeed) && requestedSpeed > 0
        ? requestedSpeed
        : requiredSpeed;
      const softSolvedSpeed = Math.min(
        Math.max(finiteRequestedSpeed, requiredSpeed),
        requiredSpeed * 1.04,
      );
      horizontalSpeed = softSolvedSpeed * cosAngle;
      verticalSpeed = softSolvedSpeed * Math.sin(launchAngleRadians);
    } else {
      const flightTime = Math.max(0.9, Math.min(1.8, horizontalDistance / 2.7));
      horizontalSpeed = horizontalDistance / flightTime;
      verticalSpeed =
        (dy + 0.5 * GRAVITY_METERS_PER_SECOND_SQUARED * flightTime * flightTime) /
        flightTime;
    }
    const spreadStdDevDeg = Number.isFinite(this.shooterConfig.spreadStdDevDeg)
      ? Math.max(0, this.shooterConfig.spreadStdDevDeg)
      : 0;
    const spreadYaw = spreadStdDevDeg > 0 ? (gaussian() * spreadStdDevDeg * Math.PI) / 180 : 0;
    const cos = Math.cos(spreadYaw);
    const sin = Math.sin(spreadYaw);
    const directionX = dx / horizontalDistance;
    const directionZ = dz / horizontalDistance;
    const baseVx = directionX * horizontalSpeed;
    const baseVz = directionZ * horizontalSpeed;
    const vx = baseVx * cos - baseVz * sin;
    const vz = baseVx * sin + baseVz * cos;
    return new Vector3(vx, verticalSpeed, vz);
  }

  private didShotScore(piece: GamePieceObject, volume: ScoringVolume) {
    const size = {
      width: (volume.mesh?.getBoundingInfo().boundingBox.extendSize.x ?? 0) * 2,
      length: (volume.mesh?.getBoundingInfo().boundingBox.extendSize.z ?? 0) * 2,
      height: (volume.mesh?.getBoundingInfo().boundingBox.extendSize.y ?? 0) * 2,
    };
    const sensor = {
      pose: volume.pose,
      sizeMeters: {
        width: size.width + this.gamePieceRadiusMeters * 2,
        length: size.length + this.gamePieceRadiusMeters * 2,
        height: size.height + this.gamePieceRadiusMeters * 2,
      },
    };
    if (isPoseInsideBoxSensor(piece.pose, sensor)) {
      return true;
    }
    if (!piece.previousPose) {
      return false;
    }
    return segmentIntersectsAxisAlignedBox(
      poseToVector3(piece.previousPose),
      poseToVector3(piece.pose),
      poseToVector3(sensor.pose),
      new Vector3(sensor.sizeMeters.width / 2, sensor.sizeMeters.height / 2, sensor.sizeMeters.length / 2),
    );
  }

  private createNeutralRobotPose(): Pose3dDto {
    return {
      translation: {
        x: 0,
        y: this.robotConfig.heightMeters / 2,
        z: 0,
      },
      rotation: { roll: 0, pitch: 0, yaw: ROBOT_MODEL_YAW_OFFSET_RADIANS },
    };
  }

  private wallBlueRobotPoseArrayToFieldCorePose(value: readonly number[]): Pose3dDto {
    return {
      translation: {
        x: wpilibBlueXToFieldCoreX(value[0] ?? FIELD_LENGTH_METERS / 2),
        y: (value[2] ?? 0) + this.robotConfig.heightMeters / 2,
        z: wpilibBlueYToFieldCoreZ(value[1] ?? FIELD_WIDTH_METERS / 2),
      },
      rotation: {
        roll: value[3] ?? 0,
        pitch: value[4] ?? 0,
        // Convert WPILib field yaw to the Babylon yaw used by the robot model.
        yaw: wpilibYawToRobotModelYaw(value[5] ?? 0),
      },
    };
  }

  private fieldCoreRobotPoseToWallBluePose(pose: Pose3dDto): Pose3dDto {
    return this.robotFramePoseToWallBluePose(this.robotModelPoseToRobotFramePose(pose));
  }

  private robotFramePoseToWallBluePose(pose: Pose3dDto): Pose3dDto {
    return {
      translation: {
        x: fieldCoreXToWpilibBlueX(pose.translation.x),
        y: fieldCoreZToWpilibBlueY(pose.translation.z),
        z: Math.max(0, pose.translation.y - this.robotConfig.heightMeters / 2),
      },
      rotation: {
        roll: pose.rotation.roll,
        pitch: pose.rotation.pitch,
        yaw: fieldCoreRobotYawToWpilibYaw(pose.rotation.yaw),
      },
    };
  }

  private getRobotFramePose() {
    return this.robotModelPoseToRobotFramePose(this.robot.pose);
  }

  private robotModelPoseToRobotFramePose(pose: Pose3dDto): Pose3dDto {
    return {
      translation: { ...pose.translation },
      rotation: {
        ...pose.rotation,
        yaw: robotModelYawToRobotYaw(pose.rotation.yaw),
      },
    };
  }

  private syncNtStatusMessage() {
    if (!this.nt.isConnected() && this.ntStatusMessage?.startsWith("Connected to")) {
      this.ntStatusMessage = "Disconnected";
    }
  }
}

const gaussian = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function segmentIntersectsAxisAlignedBox(
  start: Vector3,
  end: Vector3,
  center: Vector3,
  halfExtents: Vector3,
) {
  let tMin = 0;
  let tMax = 1;
  const startValues = [start.x, start.y, start.z];
  const endValues = [end.x, end.y, end.z];
  const centerValues = [center.x, center.y, center.z];
  const halfExtentValues = [halfExtents.x, halfExtents.y, halfExtents.z];

  for (let axis = 0; axis < 3; axis += 1) {
    const axisStart = startValues[axis];
    const axisDelta = endValues[axis] - axisStart;
    const min = centerValues[axis] - halfExtentValues[axis];
    const max = centerValues[axis] + halfExtentValues[axis];

    if (Math.abs(axisDelta) < 1e-9) {
      if (axisStart < min || axisStart > max) {
        return false;
      }
      continue;
    }

    const t1 = (min - axisStart) / axisDelta;
    const t2 = (max - axisStart) / axisDelta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    if (tMin > tMax) {
      return false;
    }
  }

  return true;
}

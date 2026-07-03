import type { FieldModule } from "../modules/FieldModule";
import { PhysicsWorld } from "./PhysicsWorld";
import { SimWorld, type SimStats } from "./SimWorld";
import { TimeStep } from "./TimeStep";

export class SimEngine {
  readonly physicsWorld: PhysicsWorld;
  readonly simWorld: SimWorld;
  readonly timestep = new TimeStep(1 / 60);
  private running = false;
  private lastTimestamp = 0;
  private statsCallback: ((stats: SimStats) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, fieldModule: FieldModule) {
    this.physicsWorld = new PhysicsWorld(canvas);
    this.simWorld = new SimWorld(this.physicsWorld.scene, fieldModule);
  }

  async initialize() {
    await this.physicsWorld.initializePhysics();
    await this.simWorld.initialize();
  }

  start(onStats?: (stats: SimStats) => void) {
    this.statsCallback = onStats ?? null;
    this.running = true;
    this.lastTimestamp = performance.now();
    this.physicsWorld.engine.runRenderLoop(() => this.frame());
    window.addEventListener("resize", this.resize);
  }

  dispose() {
    this.running = false;
    window.removeEventListener("resize", this.resize);
    this.physicsWorld.dispose();
  }

  private frame() {
    if (!this.running) {
      return;
    }
    const nowMs = performance.now();
    const deltaSeconds = (nowMs - this.lastTimestamp) / 1000;
    this.lastTimestamp = nowMs;
    const nowSeconds = nowMs / 1000;
    this.timestep.consume(deltaSeconds, (dt) => this.simWorld.update(dt, nowSeconds));
    this.physicsWorld.scene.render();
    this.statsCallback?.(this.simWorld.getStats(this.physicsWorld.engine.getFps()));
  }

  private resize = () => {
    this.physicsWorld.engine.resize();
  };
}

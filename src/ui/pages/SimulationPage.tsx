import { useEffect, useRef, useState } from "react";
import type { ModuleRegistry } from "../../core/modules/ModuleRegistry";
import { SimEngine } from "../../core/engine/SimEngine";
import type { SimStats } from "../../core/engine/SimWorld";
import { ConnectionPanel } from "../panels/ConnectionPanel";
import { RobotConfigPanel } from "../panels/RobotConfigPanel";
import { IntakeConfigPanel } from "../panels/IntakeConfigPanel";
import { ShooterConfigPanel } from "../panels/ShooterConfigPanel";
import { VisionConfigPanel } from "../panels/VisionConfigPanel";
import { TopicMappingPanel } from "../panels/TopicMappingPanel";
import { GamePieceInspectorPanel } from "../panels/GamePieceInspectorPanel";

interface SimulationPageProps {
  fieldModuleId: string;
  registry: ModuleRegistry;
}

export function SimulationPage({ fieldModuleId, registry }: SimulationPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<SimEngine | null>(null);
  const [stats, setStats] = useState<SimStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let disposed = false;
    const engine = new SimEngine(canvas, registry.get(fieldModuleId));
    engineRef.current = engine;
    engine
      .initialize()
      .then(() => {
        if (disposed) {
          return;
        }
        if (engine.physicsWorld.physicsError) {
          setError(`Havok physics failed: ${engine.physicsWorld.physicsError}`);
        }
        if (isLocalDebugHost()) {
          (window as unknown as { __fieldCoreDebug?: unknown }).__fieldCoreDebug = {
            engine,
            world: engine.simWorld,
          };
        }
        engine.start(setStats);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)));

    return () => {
      disposed = true;
      if (isLocalDebugHost()) {
        const debugWindow = window as unknown as { __fieldCoreDebug?: { engine?: SimEngine } };
        if (debugWindow.__fieldCoreDebug?.engine === engine) {
          delete debugWindow.__fieldCoreDebug;
        }
      }
      engine.dispose();
      engineRef.current = null;
    };
  }, [fieldModuleId, registry]);

  const world = engineRef.current?.simWorld ?? null;
  if (world && isLocalDebugHost()) {
    (window as unknown as { __fieldCoreDebug?: unknown }).__fieldCoreDebug = {
      engine: engineRef.current,
      world,
    };
  }

  return (
    <main className="simulation-layout">
      <section className="viewport-wrap">
        <canvas ref={canvasRef} className="sim-canvas" />
        {error ? <div className="viewport-error">{error}</div> : null}
      </section>
      <aside className="side-panel">
        <details className="panel" open>
          <summary><h3>Quick Actions</h3></summary>
          <div className="panel-body quick-actions">
            <button onClick={() => world?.resetGamePieces()}>Reset Field</button>
            <button onClick={() => world?.resetRobotPose()}>Reset Robot Pose</button>
            <button onClick={() => world?.spawnGamePiece()}>Spawn Game Piece</button>
            <button onClick={() => world?.clearGamePieces()}>Clear Game Pieces</button>
            <button onClick={() => world?.toggleIntake()}>Toggle Intake</button>
            <button onClick={() => world?.fireTestShot()}>Fire Test Shot</button>
            <button onClick={() => world?.toggleVisionNoise()}>Toggle Vision Noise</button>
            <button onClick={() => world?.setPaused(!stats?.paused)}>Pause Physics</button>
            <button onClick={() => world?.step(performance.now() / 1000)}>Step Physics</button>
          </div>
        </details>
        {world ? (
          <>
            <ConnectionPanel world={world} stats={stats} />
            <RobotConfigPanel world={world} />
            <IntakeConfigPanel world={world} />
            <ShooterConfigPanel world={world} />
            <VisionConfigPanel world={world} />
            <GamePieceInspectorPanel world={world} />
            <TopicMappingPanel />
          </>
        ) : null}
      </aside>
      <footer className="status-bar">
        <span className={`status-pill ${stats?.ntConnected ? "ok" : "warn"}`}>
          NT {stats?.ntConnected ? "connected" : "disconnected"}
        </span>
        {stats?.ntStatusMessage ? <span>{stats.ntStatusMessage}</span> : null}
        <span>Robot x {stats?.robotPose.translation.x.toFixed(2) ?? "0.00"} m</span>
        <span>Robot z {stats?.robotPose.translation.z.toFixed(2) ?? "0.00"} m</span>
        <span>Vision {stats?.vision?.status ?? "NO_TARGET"}</span>
        <span>Reliability {(stats?.vision?.reliability ?? 0).toFixed(2)}</span>
        <span>Held {stats?.heldGamePieces ?? 0}</span>
        <span>Pieces {stats?.gamePieces ?? 0}</span>
        <span>Render FPS {(stats?.renderFps ?? 0).toFixed(0)}</span>
        <span>Physics FPS {(stats?.physicsFps ?? 0).toFixed(0)}</span>
        <span>{stats?.paused ? "Paused" : "Running"}</span>
      </footer>
    </main>
  );
}

function isLocalDebugHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

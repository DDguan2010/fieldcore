import { useState } from "react";
import type { SimWorld } from "../../core/engine/SimWorld";

export function GamePieceInspectorPanel({ world }: { world: SimWorld }) {
  const [, rerender] = useState(0);
  const heights = world.gamePieces.map((piece) => piece.pose.translation.y);
  const belowFloorCount = heights.filter((height) => height < -0.01).length;
  const minHeight = heights.length > 0 ? Math.min(...heights) : 0;
  const maxHeight = heights.length > 0 ? Math.max(...heights) : 0;
  return (
    <details className="panel">
      <summary><h3>Game Pieces</h3></summary>
      <div className="panel-body form-grid">
        <button onClick={() => rerender((x) => x + 1)}>Refresh</button>
        <div className={`status-pill ${belowFloorCount === 0 ? "ok" : "warn"}`}>
          Count {world.gamePieces.length} | Below floor {belowFloorCount} | Y {minHeight.toFixed(2)}-{maxHeight.toFixed(2)} m
        </div>
        {world.gamePieces.map((piece) => (
          <div className="status-pill" key={piece.id}>
            {piece.id}: {piece.state} x {piece.pose.translation.x.toFixed(2)} y {piece.pose.translation.y.toFixed(2)} z{" "}
            {piece.pose.translation.z.toFixed(2)}
          </div>
        ))}
      </div>
    </details>
  );
}

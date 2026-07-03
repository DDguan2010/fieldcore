import { useState } from "react";
import type { SimStats, SimWorld } from "../../core/engine/SimWorld";

export function ConnectionPanel({ world, stats }: { world: SimWorld; stats: SimStats | null }) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5810);
  const [teamNumber, setTeamNumber] = useState(0);
  const [mode, setMode] = useState<"local-simulation" | "robot">("local-simulation");
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const connect = async () => {
    setConnecting(true);
    setMessage(null);
    try {
      await world.connectNt({ host, port, teamNumber, mode });
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    world.disconnectNt();
    setMessage(null);
  };
  const messageText = stats?.ntStatusMessage ?? message;

  return (
    <details className="panel" open>
      <summary><h3>Connection</h3></summary>
      <div className="panel-body form-grid">
        <Field label="Host" value={host} onChange={setHost} />
        <NumberField label="Port" value={port} onChange={setPort} />
        <NumberField label="Team Number" value={teamNumber} onChange={setTeamNumber} />
        <div className="field-row">
          <label>Mode</label>
          <select value={mode} onChange={(event) => setMode(event.target.value as "local-simulation" | "robot")}>
            <option value="local-simulation">local simulation</option>
            <option value="robot">robot</option>
          </select>
        </div>
        <button onClick={() => void connect()} disabled={connecting}>{connecting ? "Connecting..." : "Connect"}</button>
        <button onClick={disconnect}>Disconnect</button>
        {messageText ? <p className="form-message">{messageText}</p> : null}
      </div>
    </details>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className="field-row">
      <label>{label}</label>
      <input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

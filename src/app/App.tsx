import { useState } from "react";
import { FieldSelectPage } from "../ui/pages/FieldSelectPage";
import { SimulationPage } from "../ui/pages/SimulationPage";
import { DocumentationPage } from "../ui/pages/DocumentationPage";
import { moduleRegistry } from "../modules/fields/frc2026/FRC2026FieldModule";
import { ErrorBoundary } from "./ErrorBoundary";

type Route = "select" | "simulation" | "docs";

export function App() {
  const [route, setRoute] = useState<Route>("select");
  const [fieldModuleId, setFieldModuleId] = useState("frc2026");

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="top-bar">
          <button className="brand-button" onClick={() => setRoute("select")}>
            <span className="brand-mark">FC</span>
            <span>
              <strong>FieldCore</strong>
              <small>FRC physics simulator</small>
            </span>
          </button>
          <nav className="top-nav">
            <button onClick={() => setRoute("select")}>Fields</button>
            <button onClick={() => setRoute("simulation")}>Simulation</button>
            <button onClick={() => setRoute("docs")}>Docs</button>
          </nav>
        </header>

        {route === "select" ? (
          <FieldSelectPage
            modules={moduleRegistry.list()}
            selectedId={fieldModuleId}
            onSelect={(id) => {
              setFieldModuleId(id);
              setRoute("simulation");
            }}
          />
        ) : null}

        {route === "simulation" ? (
          <SimulationPage fieldModuleId={fieldModuleId} registry={moduleRegistry} />
        ) : null}

        {route === "docs" ? <DocumentationPage /> : null}
      </div>
    </ErrorBoundary>
  );
}

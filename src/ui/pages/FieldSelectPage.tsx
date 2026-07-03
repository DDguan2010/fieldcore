import type { FieldModule } from "../../core/modules/FieldModule";

interface FieldSelectPageProps {
  modules: FieldModule[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function FieldSelectPage({ modules, selectedId, onSelect }: FieldSelectPageProps) {
  return (
    <main className="page field-select">
      <h1>Select Field</h1>
      <p>Choose a modular FRC field plugin to load into the physics world.</p>
      <section className="module-list">
        {modules.map((module) => (
          <button
            key={module.id}
            className={`field-card ${selectedId === module.id ? "selected" : ""}`}
            onClick={() => onSelect(module.id)}
          >
            <strong>{module.name}</strong>
            <span>{module.season} {module.gameName}</span>
            <small>Module ID: {module.id}</small>
          </button>
        ))}
      </section>
    </main>
  );
}

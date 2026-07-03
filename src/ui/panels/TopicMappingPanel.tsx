import { debugTopics, fieldCoreToRobotTopics, robotToFieldCoreTopics } from "../../core/nt/TopicRegistry";

export function TopicMappingPanel() {
  return (
    <details className="panel">
      <summary><h3>NetworkTables Topics</h3></summary>
      <div className="panel-body">
        <TopicList title="Robot -> FieldCore" values={robotToFieldCoreTopics} />
        <TopicList title="FieldCore -> Robot" values={fieldCoreToRobotTopics} />
        <TopicList title="Debug Only" values={debugTopics} />
      </div>
    </details>
  );
}

function TopicList({ title, values }: { title: string; values: Record<string, string> }) {
  return (
    <div>
      <h4>{title}</h4>
      {Object.entries(values).map(([key, topic]) => (
        <div className="field-row" key={key}>
          <label>{key}</label>
          <input readOnly value={topic} />
        </div>
      ))}
    </div>
  );
}

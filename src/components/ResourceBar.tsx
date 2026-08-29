import type { ResourceDef, ResourceValue } from '../types/game-system';

interface Props {
  def: ResourceDef;
  value: ResourceValue;
  editable: boolean;
  onChange: (next: ResourceValue) => void;
}

export function ResourceBar({ def, value, editable, onChange }: Props) {
  if (def.type === 'text') {
    return (
      <div className="resource-row resource-text">
        <label>{def.label}</label>
        <input
          type="text"
          value={value.texto ?? ''}
          disabled={!editable}
          onChange={(e) => onChange({ ...value, texto: e.target.value })}
          placeholder="—"
        />
      </div>
    );
  }

  const atual = value.atual ?? 0;
  const max = value.max ?? def.maxDefault ?? 0;
  const pct = max > 0 ? Math.max(0, Math.min(100, (atual / max) * 100)) : 0;
  const color = def.color ?? '#c9a84c';

  function bump(delta: number) {
    const next = Math.max(0, Math.min(max, atual + delta));
    onChange({ ...value, atual: next });
  }

  return (
    <div className="resource-row resource-bar">
      <div className="resource-bar-head">
        <label>{def.label}</label>
        <span className="resource-values">
          {editable ? (
            <>
              <input
                type="number"
                className="resource-num"
                value={atual}
                onChange={(e) => onChange({ ...value, atual: Number(e.target.value) })}
              />
              {' / '}
              <input
                type="number"
                className="resource-num"
                value={max}
                onChange={(e) => onChange({ ...value, max: Number(e.target.value) })}
              />
            </>
          ) : (
            <>
              {atual} / {max}
            </>
          )}
        </span>
      </div>
      <div className="resource-bar-track">
        <div className="resource-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      {editable && (
        <div className="resource-bar-buttons">
          <button type="button" onClick={() => bump(-5)}>-5</button>
          <button type="button" onClick={() => bump(-1)}>-1</button>
          <button type="button" onClick={() => bump(1)}>+1</button>
          <button type="button" onClick={() => bump(5)}>+5</button>
        </div>
      )}
    </div>
  );
}

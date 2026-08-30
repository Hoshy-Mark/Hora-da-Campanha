import type { FieldDef, GameSystemSchema, SheetData } from '../types/game-system';

interface Props {
  schema: GameSystemSchema;
  data: SheetData;
  editable: boolean;
  onFieldChange: (key: string, value: number | string) => void;
  // Opcional: quando presente, campos numéricos (ou calculados por
  // fórmula) ganham um botão de dado que rola 1d20 + o valor do campo.
  // Ausente pro editor de moldes do Bestiário, que não tem campanha
  // nenhuma pra logar a rolagem.
  onRollField?: (field: FieldDef, value: number) => void;
}

// Renderiza as seções de campos de uma ficha (Identidade, Atributos, o
// que o sistema definir) — usado tanto pela ficha de personagem de
// verdade (CharacterSheet) quanto pelo editor de moldes do Bestiário,
// que precisa do mesmo formulário dinâmico movido pelo schema.
export function SheetFieldsEditor({ schema, data, editable, onFieldChange, onRollField }: Props) {
  return (
    <div className="sheet-sections">
      {schema.sections.map((section) => (
        <div key={section.key} className="sheet-card">
          <strong className="sheet-card-title">{section.label}</strong>
          {section.description && <p className="muted sheet-section-desc">{section.description}</p>}
          <div className="sheet-fields-grid">
            {section.fields.map((field) =>
              field.formula ? (
                <label key={field.key} className="sheet-field">
                  <span>{field.label}</span>
                  <div className="computed-field-row">
                    <div className="computed-field" title={`Calculado: ${field.formula}`}>
                      {data.fields[field.key] ?? 0}
                    </div>
                    {onRollField && (
                      <button
                        type="button"
                        className="field-roll-btn"
                        title={`Rolar 1d20 + ${field.label}`}
                        onClick={() => onRollField(field, Number(data.fields[field.key]) || 0)}
                      >
                        🎲
                      </button>
                    )}
                  </div>
                  <small className="muted mono">= {field.formula}</small>
                </label>
              ) : (
                <label key={field.key} className="sheet-field">
                  <span>{field.label}</span>
                  {field.type === 'select' ? (
                    <select
                      disabled={!editable}
                      value={String(data.fields[field.key] ?? '')}
                      onChange={(e) => onFieldChange(field.key, e.target.value)}
                    >
                      <option value="" disabled>
                        —
                      </option>
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'longtext' ? (
                    <textarea
                      rows={3}
                      disabled={!editable}
                      value={String(data.fields[field.key] ?? '')}
                      onChange={(e) => onFieldChange(field.key, e.target.value)}
                    />
                  ) : field.type === 'number' ? (
                    <div className="computed-field-row">
                      <input
                        type="number"
                        disabled={!editable}
                        min={field.min}
                        max={field.max}
                        value={data.fields[field.key] ?? 0}
                        onChange={(e) => onFieldChange(field.key, Number(e.target.value))}
                      />
                      {onRollField && (
                        <button
                          type="button"
                          className="field-roll-btn"
                          title={`Rolar 1d20 + ${field.label}`}
                          onClick={() => onRollField(field, Number(data.fields[field.key]) || 0)}
                        >
                          🎲
                        </button>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      disabled={!editable}
                      value={data.fields[field.key] ?? ''}
                      onChange={(e) => onFieldChange(field.key, e.target.value)}
                    />
                  )}
                  {field.helpText && <small className="muted">{field.helpText}</small>}
                </label>
              )
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

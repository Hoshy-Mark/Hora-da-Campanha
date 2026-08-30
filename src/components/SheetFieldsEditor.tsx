import type { GameSystemSchema, SheetData } from '../types/game-system';

interface Props {
  schema: GameSystemSchema;
  data: SheetData;
  editable: boolean;
  onFieldChange: (key: string, value: number | string) => void;
}

// Renderiza as seções de campos de uma ficha (Identidade, Atributos, o
// que o sistema definir) — usado tanto pela ficha de personagem de
// verdade (CharacterSheet) quanto pelo editor de moldes do Bestiário,
// que precisa do mesmo formulário dinâmico movido pelo schema.
export function SheetFieldsEditor({ schema, data, editable, onFieldChange }: Props) {
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
                  <div className="computed-field" title={`Calculado: ${field.formula}`}>
                    {data.fields[field.key] ?? 0}
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
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : 'text'}
                      disabled={!editable}
                      min={field.min}
                      max={field.max}
                      value={data.fields[field.key] ?? (field.type === 'number' ? 0 : '')}
                      onChange={(e) =>
                        onFieldChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)
                      }
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

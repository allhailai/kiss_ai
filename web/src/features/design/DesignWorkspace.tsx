import { useMemo, useState } from "react";
import type { DesignState, FileContent, FileDiff } from "../../contracts/api";
import { countDeletedLines, countDiffRangeLines } from "../../domain/diffs";
import { designIdentityFilePath } from "../../domain/projectPaths";
import {
  asRecord,
  asString,
  isHexColor,
  parseDesignIdentityDraft,
  serializeDesignIdentityDraft,
  type DesignIdentityDraft,
  type DesignMarkdownSection,
} from "../../domain/designIdentity";

export function DesignWorkspace({
  design,
  selected,
  selectedDiff,
  draft,
  hasUnsavedChanges,
  loading,
  onDraft,
  onRevert,
  onSave,
}: {
  design: DesignState | null;
  selected: FileContent | null;
  selectedDiff: FileDiff | null;
  draft: string;
  hasUnsavedChanges: boolean;
  loading: boolean;
  onDraft: (value: string) => void;
  onRevert: () => void;
  onSave: () => void;
}) {
  const colors = design?.parsed.colors ?? {};
  const parsedDraft = useMemo(() => parseDesignIdentityDraft(draft), [draft]);
  const savedChangedLineCount = countDiffRangeLines(selectedDiff?.ranges ?? []);
  const savedDeletedLineCount = countDeletedLines(selectedDiff?.deletions ?? []);
  const hasSavedDiff = savedChangedLineCount > 0 || savedDeletedLineCount > 0;
  const [activeDesignTab, setActiveDesignTab] = useState<"preview" | "edit">("preview");
  const savedDiffLabel =
    hasSavedDiff
      ? `${(savedChangedLineCount + savedDeletedLineCount).toLocaleString()} saved ${
          savedChangedLineCount + savedDeletedLineCount === 1 ? "change" : "changes"
        }`
      : "No saved changes";

  function updateDesignDraft(nextDraft: DesignIdentityDraft) {
    onDraft(serializeDesignIdentityDraft(nextDraft));
  }

  function updateFrontmatterValue(key: string, value: unknown) {
    updateDesignDraft({
      ...parsedDraft,
      frontmatter: {
        ...parsedDraft.frontmatter,
        [key]: value,
      },
    });
  }

  function updateTokenValue(group: string, key: string, value: string) {
    updateFrontmatterValue(group, {
      ...asRecord(parsedDraft.frontmatter[group]),
      [key]: value,
    });
  }

  function updateNestedTokenValue(group: string, parentKey: string, key: string, value: string) {
    const groupValue = asRecord(parsedDraft.frontmatter[group]);

    updateFrontmatterValue(group, {
      ...groupValue,
      [parentKey]: {
        ...asRecord(groupValue[parentKey]),
        [key]: value,
      },
    });
  }

  function updateOpening(value: string) {
    updateDesignDraft({
      ...parsedDraft,
      opening: value,
    });
  }

  function updateSection(index: number, section: DesignMarkdownSection) {
    updateDesignDraft({
      ...parsedDraft,
      sections: parsedDraft.sections.map((currentSection, currentIndex) => (currentIndex === index ? section : currentSection)),
    });
  }

  if (!selected) {
    return (
      <div className="design-workspace">
        <section className="editor-pane empty">
          <h2>Select the design identity file</h2>
          <p>Choose `{designIdentityFilePath}` from the left panel to edit project design tokens.</p>
        </section>
      </div>
    );
  }

  return (
    <div className="design-workspace">
      <header className="page-header">
        <span className="eyebrow">Human-owned design identity</span>
        <h2>{design?.parsed.name ?? "Project Design Identity"}</h2>
        <p>{design?.parsed.description || "Customize DESIGN.md tokens and rationale for this project."}</p>
      </header>

      <div className="design-tab-shell">
        <div className="design-tabs" role="tablist" aria-label="Design identity views">
          <button
            aria-selected={activeDesignTab === "preview"}
            className={activeDesignTab === "preview" ? "design-tab active" : "design-tab"}
            onClick={() => setActiveDesignTab("preview")}
            role="tab"
            type="button"
          >
            Token Preview
          </button>
          <button
            aria-selected={activeDesignTab === "edit"}
            className={activeDesignTab === "edit" ? "design-tab active" : "design-tab"}
            onClick={() => setActiveDesignTab("edit")}
            role="tab"
            type="button"
          >
            Edit Design
          </button>
        </div>

        {activeDesignTab === "preview" ? (
          <section className="content-card design-tab-panel" role="tabpanel">
            <h3>Token preview</h3>
            <div className="swatch-grid">
              {Object.entries(colors).map(([name, value]) => (
                <div className="swatch" key={name}>
                  <span style={{ background: value }} />
                  <strong>{name}</strong>
                  <code>{value}</code>
                </div>
              ))}
            </div>
            <p className={design?.lint.ok ? "lint-ok" : "lint-warning"}>{design?.lint.message ?? "Design lint not run."}</p>
          </section>
        ) : null}

        {activeDesignTab === "edit" ? (
          <section className="editor-pane design-editor-pane design-tab-panel" role="tabpanel">
            <div className="editor-toolbar">
              <div>
                <span className="eyebrow">Structured DESIGN.md-compatible file</span>
                <h2>{selected?.path ?? designIdentityFilePath}</h2>
              </div>
              <div className="editor-toolbar-actions">
                {hasSavedDiff ? (
                  <button className="editor-secondary-button" disabled={!selected.editable || loading} onClick={onRevert} type="button">
                    Restore Original
                  </button>
                ) : null}
                {selected.editable && hasUnsavedChanges ? (
                  <>
                    <button
                      className="editor-secondary-button"
                      disabled={loading}
                      onClick={() => onDraft(selected.content)}
                      type="button"
                    >
                      Undo Changes
                    </button>
                    <button className="editor-save-button" disabled={loading} onClick={onSave} type="button">
                      Save Design Identity
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="editor-meta">
              <span>
                Loaded {draft.length.toLocaleString()} characters across {draft.split("\n").length.toLocaleString()} lines.
              </span>
              <span className="editor-diff-legend" aria-label="Design editor diff highlight legend">
                <span className="editor-diff-key editor-diff-key-unsaved">Your changes (not saved)</span>
                <span className="editor-diff-key editor-diff-key-saved">{savedDiffLabel}</span>
              </span>
            </div>

            {parsedDraft.parseError ? (
              <div className="design-form-scroll">
                <div className="warning-callout">
                  <strong>Frontmatter parse error</strong>
                  <p>{parsedDraft.parseError}</p>
                </div>
                <label className="design-field">
                  <span>Raw design identity file</span>
                  <textarea value={draft} onChange={(event) => onDraft(event.target.value)} spellCheck="true" />
                </label>
              </div>
            ) : (
              <div className="design-form-scroll">
                <div className="design-form-grid">
                  <section className="design-form-card">
                    <div>
                      <span className="eyebrow">Identity</span>
                      <h3>Project identity</h3>
                    </div>
                    <DesignTextField label="Version" onChange={(value) => updateFrontmatterValue("version", value)} value={asString(parsedDraft.frontmatter.version)} />
                    <DesignTextField label="Name" onChange={(value) => updateFrontmatterValue("name", value)} value={asString(parsedDraft.frontmatter.name)} />
                    <DesignTextField
                      label="Description"
                      multiline
                      onChange={(value) => updateFrontmatterValue("description", value)}
                      value={asString(parsedDraft.frontmatter.description)}
                    />
                  </section>

                  <section className="design-form-card design-form-card-wide">
                    <div>
                      <span className="eyebrow">Colors</span>
                      <h3>Color tokens</h3>
                    </div>
                    <ColorTokenFields colors={asRecord(parsedDraft.frontmatter.colors)} onChange={(key, value) => updateTokenValue("colors", key, value)} />
                  </section>

                  <ScalarTokenFields title="Rounded corners" tokens={asRecord(parsedDraft.frontmatter.rounded)} onChange={(key, value) => updateTokenValue("rounded", key, value)} />
                  <ScalarTokenFields title="Spacing" tokens={asRecord(parsedDraft.frontmatter.spacing)} onChange={(key, value) => updateTokenValue("spacing", key, value)} />

                  <NestedTokenFields
                    groupLabel="Typography"
                    groups={asRecord(parsedDraft.frontmatter.typography)}
                    onChange={(group, key, value) => updateNestedTokenValue("typography", group, key, value)}
                  />
                  <NestedTokenFields
                    groupLabel="Components"
                    groups={asRecord(parsedDraft.frontmatter.components)}
                    onChange={(group, key, value) => updateNestedTokenValue("components", group, key, value)}
                  />

                  <section className="design-form-card design-form-card-wide">
                    <div>
                      <span className="eyebrow">Markdown</span>
                      <h3>Body sections</h3>
                    </div>
                    {parsedDraft.opening ? <DesignTextField label="Opening text" multiline onChange={updateOpening} value={parsedDraft.opening} /> : null}
                    {parsedDraft.sections.map((section, index) => (
                      <div className="design-markdown-section" key={`${section.title}-${index}`}>
                        <DesignTextField label="Section title" onChange={(value) => updateSection(index, { ...section, title: value })} value={section.title} />
                        <DesignTextField
                          label={`${section.title || "Section"} content`}
                          multiline
                          onChange={(value) => updateSection(index, { ...section, content: value })}
                          value={section.content}
                        />
                      </div>
                    ))}
                  </section>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function DesignTextField({
  label,
  value,
  multiline = false,
  onChange,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="design-field">
      <span>{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} spellCheck="true" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} type="text" />
      )}
    </label>
  );
}

function ColorTokenFields({ colors, onChange }: { colors: Record<string, unknown>; onChange: (key: string, value: string) => void }) {
  const entries = Object.entries(colors);

  if (!entries.length) {
    return <p>No color tokens found.</p>;
  }

  return (
    <div className="design-token-list">
      {entries.map(([key, value]) => {
        const stringValue = asString(value);
        const pickerValue = isHexColor(stringValue) ? stringValue : "#000000";

        return (
          <label className="design-color-row" key={key}>
            <span>{key}</span>
            <input
              aria-label={`${key} color picker`}
              disabled={!isHexColor(stringValue)}
              onChange={(event) => onChange(key, event.target.value)}
              type="color"
              value={pickerValue}
            />
            <input aria-label={`${key} color value`} onChange={(event) => onChange(key, event.target.value)} type="text" value={stringValue} />
          </label>
        );
      })}
    </div>
  );
}

function ScalarTokenFields({
  title,
  tokens,
  onChange,
}: {
  title: string;
  tokens: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
}) {
  const entries = Object.entries(tokens);

  return (
    <section className="design-form-card">
      <div>
        <span className="eyebrow">Tokens</span>
        <h3>{title}</h3>
      </div>
      {entries.length ? (
        <div className="design-token-list">
          {entries.map(([key, value]) => (
            <DesignTextField key={key} label={key} onChange={(nextValue) => onChange(key, nextValue)} value={asString(value)} />
          ))}
        </div>
      ) : (
        <p>No {title.toLowerCase()} tokens found.</p>
      )}
    </section>
  );
}

function NestedTokenFields({
  groupLabel,
  groups,
  onChange,
}: {
  groupLabel: string;
  groups: Record<string, unknown>;
  onChange: (group: string, key: string, value: string) => void;
}) {
  const entries = Object.entries(groups);

  return (
    <section className="design-form-card design-form-card-wide">
      <div>
        <span className="eyebrow">Tokens</span>
        <h3>{groupLabel}</h3>
      </div>
      {entries.length ? (
        <div className="design-nested-list">
          {entries.map(([group, values]) => (
            <fieldset className="design-token-fieldset" key={group}>
              <legend>{group}</legend>
              <div className="design-token-list">
                {Object.entries(asRecord(values)).map(([key, value]) => (
                  <DesignTextField key={key} label={key} onChange={(nextValue) => onChange(group, key, nextValue)} value={asString(value)} />
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <p>No {groupLabel.toLowerCase()} tokens found.</p>
      )}
    </section>
  );
}

import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import {
  clampFrame,
  formatValue,
  iconNames,
  sizes,
  type WidgetDefinitionV1,
  type WidgetElement,
  type WidgetSize,
} from "../shared/widget";
import { WidgetRenderer } from "./WidgetRenderer";
import { editorReducer, newElement, type Design } from "./editorState";
import { errorMessage, timeLabel } from "./ui";
import { permitNavigation } from "./navigation";

type Gesture = {
  element: WidgetElement;
  x: number;
  y: number;
  mode: "move" | "resize";
};

export function WidgetEditor({
  source,
  initialDefinition,
  widget,
  onBack,
}: {
  source: Doc<"sources">;
  initialDefinition: WidgetDefinitionV1;
  widget?: Doc<"widgets">;
  onBack: () => void;
}) {
  const initial: Design = {
    name: widget?.name ?? source.title,
    definition: initialDefinition,
  };
  const [state, dispatch] = useReducer(editorReducer, {
    past: [],
    present: initial,
    future: [],
  });
  const [saved, setSaved] = useState(initial);
  const [target, setTarget] = useState<{
    widgetId: Id<"widgets">;
    revision: number;
  } | null>(
    widget ? { widgetId: widget._id, revision: widget.revision } : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewFrame, setPreviewFrame] = useState<
    WidgetElement["frame"] | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(480);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const save = useMutation(api.widgets.save);
  const refresh = useMutation(api.sources.requestRefresh);
  const { name, definition } = state.present;
  const selected = definition.elements.find(
    (element) => element.id === selectedId,
  );
  const dirty = JSON.stringify(state.present) !== JSON.stringify(saved);
  const canvas = sizes[definition.size];
  const previewWidth = Math.min(
    viewportWidth,
    definition.size === "1x1" ? 280 : definition.size === "2x2" ? 360 : 640,
  );
  const scale = previewWidth / canvas.width;
  const renderedDefinition =
    previewFrame && selectedId
      ? {
          ...definition,
          elements: definition.elements.map((element) =>
            element.id === selectedId
              ? { ...element, frame: previewFrame }
              : element,
          ),
        }
      : definition;

  useEffect(() => {
    const node = canvasContainer.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setViewportWidth(Math.max(160, entry.contentRect.width - 48)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const confirm = (event: Event) => {
      if (saving || (dirty && !window.confirm("Discard your unsaved changes?")))
        event.preventDefault();
    };
    window.addEventListener("widget-now:navigate", confirm);
    return () => window.removeEventListener("widget-now:navigate", confirm);
  }, [dirty, saving]);

  function change(next: WidgetDefinitionV1) {
    dispatch({ type: "change", design: { name, definition: next } });
    setNotice(null);
  }
  function editElement(next: WidgetElement) {
    change({
      ...definition,
      elements: definition.elements.map((element) =>
        element.id === next.id ? next : element,
      ),
    });
  }
  function add(
    kind: WidgetElement["kind"],
    fieldId?: string,
    position?: { x: number; y: number },
  ) {
    if (definition.elements.length >= 60) {
      setError("A widget can have up to 60 elements.");
      return;
    }
    const field = source.fields.find((item) => item.id === fieldId);
    const element = newElement(
      kind,
      definition.theme === "light" ? "#172b28" : "#ffffff",
      field,
      position,
    );
    change({ ...definition, elements: [...definition.elements, element] });
    setSelectedId(element.id);
  }
  function removeSelected() {
    change({
      ...definition,
      elements: definition.elements.filter(
        (element) => element.id !== selectedId,
      ),
    });
    setSelectedId(null);
  }
  function moveLayer(direction: number) {
    const elements = [...definition.elements];
    const index = elements.findIndex((element) => element.id === selectedId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= elements.length) return;
    [elements[index], elements[next]] = [elements[next], elements[index]];
    change({ ...definition, elements });
  }
  function beginGesture(
    event: PointerEvent<HTMLDivElement>,
    element: WidgetElement,
    mode: Gesture["mode"],
  ) {
    if (saving) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(element.id);
    gesture.current = { element, mode, x: event.clientX, y: event.clientY };
  }
  function moveFrame(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return null;
    const dx = (event.clientX - current.x) / previewWidth;
    const dy = (event.clientY - current.y) / (canvas.height * scale);
    return clampFrame(
      current.mode === "move"
        ? {
            ...current.element.frame,
            x: current.element.frame.x + dx,
            y: current.element.frame.y + dy,
          }
        : {
            ...current.element.frame,
            width: Math.min(
              1 - current.element.frame.x,
              current.element.frame.width + dx,
            ),
            height: Math.min(
              1 - current.element.frame.y,
              current.element.frame.height + dy,
            ),
          },
    );
  }
  async function saveDesign() {
    setSaving(true);
    setError(null);
    const submitted = state.present;
    try {
      const result = await save({
        sourceId: source._id,
        name: submitted.name,
        definition: submitted.definition,
        ...(target
          ? { widgetId: target.widgetId, expectedRevision: target.revision }
          : {}),
      });
      setTarget(result);
      setSaved(submitted);
      setNotice("Widget saved. Live data refreshes every 15 minutes.");
      window.history.replaceState(null, "", `#widget=${result.widgetId}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  function leave() {
    if (permitNavigation()) onBack();
  }

  return (
    <div className="editor-shell">
      <div className="editor-heading">
        <div className="editor-heading-left">
          <button
            className="icon-button"
            aria-label="Back to widgets"
            onClick={leave}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <input
              className="widget-name"
              aria-label="Widget name"
              maxLength={100}
              value={name}
              disabled={saving}
              onChange={(event) =>
                dispatch({
                  type: "change",
                  design: { definition, name: event.target.value },
                })
              }
            />
            <p>
              {dirty
                ? "Unsaved changes"
                : target
                  ? "All changes saved"
                  : "Choose your details. Make it yours."}
            </p>
          </div>
        </div>
        <div className="row">
          <button
            className="icon-button"
            aria-label="Undo"
            disabled={!state.past.length || saving}
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo"
            disabled={!state.future.length || saving}
            onClick={() => dispatch({ type: "redo" })}
          >
            <Redo2 size={18} />
          </button>
          <button
            className="primary"
            disabled={saving || (target !== null && !dirty)}
            onClick={() => void saveDesign()}
          >
            <Save size={16} />
            {saving ? "Saving…" : "Save widget"}
          </button>
        </div>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
          <button className="text-button" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      <fieldset className="editor-fieldset" disabled={saving}>
        <div
          className={`editor-grid ${saving ? "editor-saving" : ""}`}
          aria-busy={saving}
        >
          <aside className="data-panel">
            <div className="panel-title">
              <span>Live data</span>
              <span className="count">{source.fields.length}</span>
            </div>
            <p className="panel-description">
              Everything we found. Drag a field onto your widget, or click +.
            </p>
            <div className="field-list">
              {source.fields.map((field) => {
                const used = definition.elements.some(
                  (element) =>
                    element.kind === "data" && element.fieldId === field.id,
                );
                return (
                  <div
                    key={field.id}
                    className={`field-card ${used ? "field-used" : ""}`}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData(
                        "application/widget-field",
                        field.id,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <div className="field-top">
                      <GripVertical size={14} />
                      <span>{field.label}</span>
                      {used && (
                        <span className="field-included">
                          <Check size={12} /> Included
                        </span>
                      )}
                      <button
                        className="field-add"
                        aria-label={`Add ${field.label}`}
                        onClick={() => add("data", field.id)}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <strong>{formatValue(field)}</strong>
                    <p>{field.description}</p>
                    <div className="field-meta">
                      {field.stale ? (
                        <span className="stale">
                          Stale · last value retained
                        </span>
                      ) : (
                        <span>Live source value</span>
                      )}
                      <span>{timeLabel(field.observedAt)}</span>
                    </div>
                    {field.excerpt && (
                      <details>
                        <summary>Source evidence</summary>
                        <p>{field.excerpt}</p>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="source-footer">
              <span className="eyebrow">CONNECTED SOURCE</span>
              <a href={source.url} target="_blank" rel="noreferrer">
                {new URL(source.url).hostname} ↗
              </a>
              <p>Last updated {timeLabel(source.lastSuccessAt)}</p>
              <p>
                {target
                  ? "Refreshes every 15 minutes"
                  : "Automatic refresh starts after saving"}
              </p>
              {source.fields.some((field) => field.stale) && (
                <p className="stale">
                  Some values are stale. Showing their last successful
                  observations.
                </p>
              )}
              {source.lastAttemptAt && (
                <p>Last attempt {timeLabel(source.lastAttemptAt)}</p>
              )}
              {source.refreshError && (
                <p className="stale" role="alert">
                  {source.refreshError}
                </p>
              )}
              <button
                className="secondary"
                disabled={!target || source.refreshing}
                onClick={() => {
                  void refresh({ sourceId: source._id }).catch((err: unknown) =>
                    setError(errorMessage(err)),
                  );
                }}
              >
                <RefreshCw
                  size={14}
                  className={source.refreshing ? "spin" : ""}
                />
                {source.refreshing ? "Refreshing…" : "Refresh now"}
              </button>
            </div>
          </aside>
          <section className="canvas-panel">
            <div className="canvas-toolbar">
              <div className="size-switch">
                {(Object.keys(sizes) as WidgetSize[]).map((size) => (
                  <button
                    key={size}
                    className={definition.size === size ? "active" : ""}
                    onClick={() => change({ ...definition, size })}
                  >
                    {size.replace("x", " × ")}
                  </button>
                ))}
              </div>
              <span className="canvas-scale">
                {Math.round(scale * 100)}% preview
              </span>
            </div>
            <div
              className="canvas-stage"
              ref={canvasContainer}
              onClick={() => setSelectedId(null)}
            >
              <div
                className="canvas-drop-zone"
                onDragOver={(event) => {
                  if (
                    event.dataTransfer.types.includes(
                      "application/widget-field",
                    )
                  )
                    event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData(
                    "application/widget-field",
                  );
                  if (!source.fields.some((field) => field.id === id)) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  add("data", id, {
                    x: (event.clientX - rect.left) / rect.width,
                    y: (event.clientY - rect.top) / rect.height,
                  });
                }}
              >
                <WidgetRenderer
                  definition={renderedDefinition}
                  fields={source.fields}
                  width={previewWidth}
                  selectedId={selectedId}
                  renderOverlay={(element) => {
                    const frame =
                      selectedId === element.id && previewFrame
                        ? previewFrame
                        : element.frame;
                    return (
                      <div
                        key={element.id}
                        className={`element-handle ${selectedId === element.id ? "handle-selected" : ""}`}
                        style={{
                          left: `${frame.x * 100}%`,
                          top: `${frame.y * 100}%`,
                          width: `${frame.width * 100}%`,
                          height: `${frame.height * 100}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedId(element.id);
                        }}
                        onPointerDown={(event) =>
                          beginGesture(
                            event,
                            element,
                            (event.target as HTMLElement).classList.contains(
                              "resize-handle",
                            )
                              ? "resize"
                              : "move",
                          )
                        }
                        onPointerMove={(event) => {
                          const frame = moveFrame(event);
                          if (frame) setPreviewFrame(frame);
                        }}
                        onPointerUp={(event) => {
                          const frame = moveFrame(event);
                          if (gesture.current && frame)
                            editElement({
                              ...gesture.current.element,
                              frame,
                            });
                          gesture.current = null;
                          setPreviewFrame(null);
                        }}
                        onPointerCancel={() => {
                          gesture.current = null;
                          setPreviewFrame(null);
                        }}
                      >
                        {selectedId === element.id && (
                          <span className="resize-handle" aria-hidden="true" />
                        )}
                      </div>
                    );
                  }}
                />
              </div>
              <p className="canvas-caption">
                {sizes[definition.size].label} widget <span>·</span>{" "}
                {canvas.width} × {canvas.height}
                <br />
                <span>Drag to position. Pull the corner to resize.</span>
              </p>
            </div>
            <div className="add-toolbar">
              <span>Add something</span>
              <button onClick={() => add("text")}>
                <Type size={16} />
                Text
              </button>
              <button onClick={() => add("icon")}>
                <Sparkles size={16} />
                Icon
              </button>
              <button onClick={() => add("shape")}>
                <Shapes size={16} />
                Shape
              </button>
            </div>
          </section>
          <aside className="property-panel">
            <div className="panel-title">Appearance</div>
            <Property label="Widget background">
              <input
                type="color"
                aria-label="Widget background"
                value={definition.background}
                onChange={(event) =>
                  change({
                    ...definition,
                    background: event.target.value,
                    theme: "custom",
                  })
                }
              />
            </Property>
            <div className="theme-presets">
              {[
                {
                  name: "Forest",
                  background: "#183f36",
                  foreground: "#ffffff",
                  theme: "dark",
                },
                {
                  name: "Paper",
                  background: "#f6f3ec",
                  foreground: "#243b34",
                  theme: "light",
                },
                {
                  name: "Midnight",
                  background: "#20283e",
                  foreground: "#ffffff",
                  theme: "dark",
                },
                {
                  name: "Terracotta",
                  background: "#a7513e",
                  foreground: "#ffffff",
                  theme: "dark",
                },
              ].map((theme) => (
                <button
                  key={theme.name}
                  aria-label={`${theme.name} theme`}
                  title={theme.name}
                  style={{ background: theme.background }}
                  onClick={() =>
                    change({
                      ...definition,
                      background: theme.background,
                      theme: theme.theme as WidgetDefinitionV1["theme"],
                      elements: definition.elements.map((element) => ({
                        ...element,
                        style: { ...element.style, color: theme.foreground },
                      })),
                    })
                  }
                />
              ))}
            </div>
            {selected ? (
              <>
                <div className="panel-divider" />
                <div className="panel-title">
                  {selected.kind === "data"
                    ? "Live field"
                    : selected.kind === "text"
                      ? "Text"
                      : selected.kind === "icon"
                        ? "Icon"
                        : "Shape"}
                </div>
                {selected.kind === "text" && (
                  <Property label="Text">
                    <textarea
                      aria-label="Text content"
                      value={selected.text}
                      maxLength={2000}
                      onChange={(event) =>
                        editElement({ ...selected, text: event.target.value })
                      }
                    />
                  </Property>
                )}
                {selected.kind === "data" && (
                  <>
                    <Property label="Bound field">
                      <select
                        aria-label="Bound field"
                        value={selected.fieldId}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            fieldId: event.target.value,
                            label:
                              source.fields.find(
                                (field) => field.id === event.target.value,
                              )?.label ?? "",
                          })
                        }
                      >
                        {source.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </Property>
                    <Property label="Display label">
                      <input
                        aria-label="Display label"
                        value={selected.label}
                        maxLength={200}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            label: event.target.value,
                          })
                        }
                      />
                    </Property>
                    <Property label="Show label">
                      <input
                        type="checkbox"
                        checked={selected.showLabel}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            showLabel: event.target.checked,
                          })
                        }
                      />
                    </Property>
                    <Property label="Show unit">
                      <input
                        type="checkbox"
                        checked={selected.showUnit}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            showUnit: event.target.checked,
                          })
                        }
                      />
                    </Property>
                    <Property label="Decimal places">
                      <input
                        type="number"
                        min={0}
                        max={6}
                        step={1}
                        value={selected.precision}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            precision: Math.max(
                              0,
                              Math.min(
                                6,
                                Math.round(Number(event.target.value)),
                              ),
                            ),
                          })
                        }
                      />
                    </Property>
                    <p className="panel-description">
                      Values come from your website. Only their presentation is
                      editable.
                    </p>
                  </>
                )}
                {selected.kind === "icon" && (
                  <Property label="Icon">
                    <select
                      value={selected.icon}
                      onChange={(event) =>
                        editElement({
                          ...selected,
                          icon: event.target.value as typeof selected.icon,
                        })
                      }
                    >
                      {iconNames.map((icon) => (
                        <option key={icon} value={icon}>
                          {icon}
                        </option>
                      ))}
                    </select>
                  </Property>
                )}
                {selected.kind === "shape" && (
                  <>
                    <Property label="Shape">
                      <select
                        value={selected.shape}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            shape: event.target.value as typeof selected.shape,
                          })
                        }
                      >
                        <option value="rectangle">Rectangle</option>
                        <option value="ellipse">Ellipse</option>
                      </select>
                    </Property>
                    <Property label="Fill">
                      <input
                        type="color"
                        value={selected.fill}
                        onChange={(event) =>
                          editElement({ ...selected, fill: event.target.value })
                        }
                      />
                    </Property>
                    <Property label="Corner radius">
                      <input
                        type="number"
                        min={0}
                        max={160}
                        value={selected.radius}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            radius: Math.max(
                              0,
                              Math.min(160, Number(event.target.value)),
                            ),
                          })
                        }
                      />
                    </Property>
                  </>
                )}
                {selected.kind !== "shape" && (
                  <>
                    <Property label="Text color">
                      <input
                        type="color"
                        value={selected.style.color}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              color: event.target.value,
                            },
                          })
                        }
                      />
                    </Property>
                    <Property label="Font size">
                      <input
                        type="range"
                        min={8}
                        max={160}
                        value={selected.style.fontSize}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              fontSize: Number(event.target.value),
                            },
                          })
                        }
                      />
                    </Property>
                    <Property label="Font size (exact)">
                      <input
                        type="number"
                        min={8}
                        max={160}
                        value={selected.style.fontSize}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              fontSize: Math.max(
                                8,
                                Math.min(160, Number(event.target.value)),
                              ),
                            },
                          })
                        }
                      />
                    </Property>
                    <Property label="Weight">
                      <select
                        value={selected.style.fontWeight}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              fontWeight: Number(event.target.value) as
                                400 | 500 | 600 | 700,
                            },
                          })
                        }
                      >
                        <option value={400}>Regular</option>
                        <option value={500}>Medium</option>
                        <option value={600}>Semibold</option>
                        <option value={700}>Bold</option>
                      </select>
                    </Property>
                    <Property label="Alignment">
                      <select
                        value={selected.style.align}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              align: event.target
                                .value as typeof selected.style.align,
                            },
                          })
                        }
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </Property>
                    <Property label="Wrap text">
                      <input
                        type="checkbox"
                        checked={selected.style.wrap}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            style: {
                              ...selected.style,
                              wrap: event.target.checked,
                            },
                          })
                        }
                      />
                    </Property>
                  </>
                )}
                <Property label="Opacity">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={selected.style.opacity}
                    onChange={(event) =>
                      editElement({
                        ...selected,
                        style: {
                          ...selected.style,
                          opacity: Number(event.target.value),
                        },
                      })
                    }
                  />
                </Property>
                <div className="position-grid">
                  {(["x", "y", "width", "height"] as const).map((key) => (
                    <Property key={key} label={`${key} %`}>
                      <input
                        aria-label={`${key} percent`}
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(selected.frame[key] * 100)}
                        onChange={(event) =>
                          editElement({
                            ...selected,
                            frame: clampFrame({
                              ...selected.frame,
                              [key]: Number(event.target.value) / 100,
                            }),
                          })
                        }
                      />
                    </Property>
                  ))}
                </div>
                <div className="element-actions">
                  <button
                    className="secondary"
                    onClick={() => {
                      if (definition.elements.length >= 60) return;
                      const copy = {
                        ...selected,
                        id: crypto.randomUUID(),
                        frame: clampFrame({
                          ...selected.frame,
                          x: selected.frame.x + 0.03,
                          y: selected.frame.y + 0.03,
                        }),
                      };
                      change({
                        ...definition,
                        elements: [...definition.elements, copy],
                      });
                      setSelectedId(copy.id);
                    }}
                  >
                    <Copy size={14} />
                    Duplicate
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label="Delete selected element"
                    onClick={removeSelected}
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move layer backward"
                    onClick={() => moveLayer(-1)}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Move layer forward"
                    onClick={() => moveLayer(1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                </div>
              </>
            ) : (
              <div className="selection-empty">
                <Sparkles size={24} />
                <p>Select an element to fine-tune its details.</p>
              </div>
            )}
            <div className="panel-divider" />
            <div className="panel-title">Layers</div>
            <div className="layer-list">
              {[...definition.elements].reverse().map((element) => (
                <button
                  key={element.id}
                  className={element.id === selectedId ? "active" : ""}
                  onClick={() => setSelectedId(element.id)}
                >
                  <span>
                    {element.kind === "data"
                      ? "↗"
                      : element.kind === "text"
                        ? "T"
                        : "◇"}
                  </span>
                  {element.kind === "data"
                    ? element.label
                    : element.kind === "text"
                      ? element.text
                      : element.kind}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </fieldset>
    </div>
  );
}

function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="property">
      <span>{label}</span>
      {children}
    </label>
  );
}

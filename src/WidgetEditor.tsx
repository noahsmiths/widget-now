import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type DragEvent,
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
  formatDataFieldTitle,
  formatValue,
  iconNames,
  sizes,
  type WidgetDefinitionV1,
  type WidgetElement,
  type WidgetSize,
  type DataField,
} from "../shared/widget";
import { WidgetRenderer } from "./WidgetRenderer";
import {
  editorReducer,
  newElement,
  splitLiveDataElements,
  type Design,
} from "./editorState";
import { errorMessage, timeLabel } from "./ui";
import { permitNavigation } from "./navigation";
import { EmailWatch } from "./EmailWatch";

type ResizeDirection = "ne" | "se" | "sw" | "nw";
type ResizeEdges = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};
type Gesture = {
  element: WidgetElement;
  x: number;
  y: number;
  mode: "move" | "resize";
  edges?: ResizeEdges;
};

const resizeDirections: ResizeDirection[] = [
  "ne",
  "se",
  "sw",
  "nw",
];

const dataElementHeight = 0.25;
const elementInset = 6;
let textMeasurementContext: CanvasRenderingContext2D | null = null;

function contentWidth(
  text: string,
  fontSize: number,
  canvasWidth: number,
) {
  if (!textMeasurementContext)
    textMeasurementContext = document.createElement("canvas").getContext("2d");
  const context = textMeasurementContext;
  if (!context) return 0.35;
  context.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return Math.min(
    0.8,
    Math.max(0.04, (context.measureText(text).width + elementInset * 2) / canvasWidth),
  );
}

function contentHeight(fontSize: number, canvasHeight: number) {
  return Math.max(0.04, (fontSize * 1.15 + elementInset * 2) / canvasHeight);
}

function fittedElement(
  element: WidgetElement,
  fields: DataField[],
  canvas: { width: number; height: number },
  anchor: { horizontal: "left" | "center" | "right"; vertical: "top" | "center" | "bottom" } = {
    horizontal: "center",
    vertical: "center",
  },
): WidgetElement {
  if (element.kind === "shape" || (element.kind === "text" && element.style.wrap))
    return element;
  const field =
    element.kind === "data"
      ? fields.find((item) => item.id === element.fieldId)
      : undefined;
  const text =
    element.kind === "text"
      ? element.text
      : element.kind === "data"
        ? formatValue(field, element.precision, element.showUnit)
        : "";
  const width =
    element.kind === "icon"
      ? (element.style.fontSize + elementInset * 2) / canvas.width
      : contentWidth(text, element.style.fontSize, canvas.width);
  const height =
    element.kind === "icon"
      ? (element.style.fontSize + elementInset * 2) / canvas.height
      : contentHeight(element.style.fontSize, canvas.height);
  const x =
    anchor.horizontal === "left"
      ? element.frame.x
      : anchor.horizontal === "right"
        ? element.frame.x + element.frame.width - width
        : element.frame.x + (element.frame.width - width) / 2;
  const y =
    anchor.vertical === "top"
      ? element.frame.y
      : anchor.vertical === "bottom"
        ? element.frame.y + element.frame.height - height
        : element.frame.y + (element.frame.height - height) / 2;
  return { ...element, frame: clampFrame({ x, y, width, height }) };
}

function dataElements(
  field: Doc<"sources">["fields"][number],
  color: string,
  canvas: { width: number; height: number },
  position = { x: 0.1, y: 0.35 },
): {
  frame: WidgetElement["frame"];
  labelHeight: number;
  valueHeight: number;
  gap: number;
  elements: WidgetElement[];
} {
  const label = formatDataFieldTitle(field.label);
  const labelWidth = contentWidth(label, 12, canvas.width);
  const valueWidth = contentWidth(formatValue(field), 28, canvas.width);
  const labelHeight = contentHeight(12, canvas.height);
  const valueHeight = contentHeight(28, canvas.height);
  const gap = 0.01;
  const group = clampFrame({
    ...position,
    width: Math.max(labelWidth, valueWidth),
    height: labelHeight + valueHeight + gap,
  });
  const title = newElement("text", color, undefined, position) as Extract<
    WidgetElement,
    { kind: "text" }
  >;
  const value = newElement("data", color, field, position) as Extract<
    WidgetElement,
    { kind: "data" }
  >;
  return {
    frame: group,
    labelHeight,
    valueHeight,
    gap,
    elements: [
      {
        ...title,
        text: label,
        frame: {
          x: group.x + (group.width - labelWidth) / 2,
          y: group.y,
          width: labelWidth,
          height: labelHeight,
        },
        style: {
          ...title.style,
          fontSize: 12,
          fontWeight: 600 as const,
          align: "center" as const,
        },
      },
      {
        ...value,
        label,
        showLabel: false,
        frame: {
          x: group.x + (group.width - valueWidth) / 2,
          y: group.y + labelHeight + gap,
          width: valueWidth,
          height: valueHeight,
        },
        style: { ...value.style, align: "center" as const },
      },
    ],
  };
}

function newElementColor(definition: WidgetDefinitionV1) {
  if (definition.theme === "light") return "#111111";
  if (definition.theme === "dark") return "#ffffff";
  const color = Number.parseInt(definition.background.slice(1), 16);
  const red = color >> 16;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  return red * 0.299 + green * 0.587 + blue * 0.114 > 150
    ? "#111111"
    : "#ffffff";
}

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
  const normalizedDefinition = splitLiveDataElements(initialDefinition);
  const normalizedCanvas = sizes[normalizedDefinition.size];
  const initial: Design = {
    name: widget?.name ?? source.title,
    definition: {
      ...normalizedDefinition,
      elements: normalizedDefinition.elements.map((element) => {
        const normalizedElement =
          element.kind === "data"
            ? { ...element, label: formatDataFieldTitle(element.label) }
            : element;
        return fittedElement(normalizedElement, source.fields, normalizedCanvas);
      }),
    },
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
  const [previewElement, setPreviewElement] =
    useState<WidgetElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"data" | "canvas" | "style">(
    "canvas",
  );
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [dropOverWidget, setDropOverWidget] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(480);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const fieldGrab = useRef({ x: 0.5, y: 0.5 });
  const draggedFrame = useRef({ width: 0.35, height: dataElementHeight });
  const save = useMutation(api.widgets.save);
  const refresh = useMutation(api.sources.requestRefresh);
  const { name, definition } = state.present;
  const selected = definition.elements.find(
    (element) => element.id === selectedId,
  );
  const dirty = JSON.stringify(state.present) !== JSON.stringify(saved);
  const staleFields = source.fields.some((field) => field.stale);
  const canvas = sizes[definition.size];
  const previewWidth = Math.min(
    viewportWidth,
    definition.size === "square" ? 360 : 640,
  );
  const scale = previewWidth / canvas.width;
  const renderedDefinition =
    previewElement
      ? {
          ...definition,
          elements: definition.elements.map((element) =>
            element.id === previewElement.id
              ? previewElement
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
  useEffect(() => {
    const removeWithBackspace = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || saving || !selectedId) return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      )
        return;
      event.preventDefault();
      dispatch({
        type: "change",
        design: {
          name,
          definition: {
            ...definition,
            elements: definition.elements.filter(
              (element) => element.id !== selectedId,
            ),
          },
        },
      });
      setNotice(null);
      setSelectedId(null);
    };
    window.addEventListener("keydown", removeWithBackspace);
    return () => window.removeEventListener("keydown", removeWithBackspace);
  }, [definition, name, saving, selectedId]);

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
    if (kind === "data") {
      if (definition.elements.length > 58) {
        setError("A widget can have up to 60 elements.");
        return;
      }
      const field = source.fields.find((item) => item.id === fieldId);
      if (!field) return;
      const added = dataElements(
        field,
        newElementColor(definition),
        canvas,
        position,
      ).elements;
      change({ ...definition, elements: [...definition.elements, ...added] });
      setSelectedId(added[1].id);
      if (window.matchMedia("(max-width: 850px)").matches)
        setMobilePanel("canvas");
      return;
    }
    if (definition.elements.length >= 60) {
      setError("A widget can have up to 60 elements.");
      return;
    }
    const nextElement = newElement(
      kind,
      newElementColor(definition),
      undefined,
      position,
    );
    const element = fittedElement(nextElement, source.fields, canvas);
    change({ ...definition, elements: [...definition.elements, element] });
    setSelectedId(element.id);
  }
  function dragPosition(
    event: DragEvent<HTMLDivElement>,
    target: HTMLDivElement,
  ) {
    const rect = target.getBoundingClientRect();
    return {
      x:
        (event.clientX - rect.left) / rect.width -
        draggedFrame.current.width * fieldGrab.current.x,
      y:
        (event.clientY - rect.top) / rect.height -
        draggedFrame.current.height * fieldGrab.current.y,
    };
  }
  function endFieldDrag() {
    setDraggingFieldId(null);
    setDropOverWidget(false);
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
    direction?: ResizeDirection,
  ) {
    if (saving) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(element.id);
    gesture.current = {
      element,
      mode: direction ? "resize" : "move",
      ...(direction
        ? {
            edges: {
              left: direction.includes("w"),
              right: direction.includes("e"),
              top: direction.includes("n"),
              bottom: direction.includes("s"),
            },
          }
        : {}),
      x: event.clientX,
      y: event.clientY,
    };
  }
  function moveFrame(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) return null;
    const dx = (event.clientX - current.x) / previewWidth;
    const dy = (event.clientY - current.y) / (canvas.height * scale);
    if (current.mode === "move")
      return clampFrame({
        ...current.element.frame,
        x: current.element.frame.x + dx,
        y: current.element.frame.y + dy,
      });
    const edges = current.edges!;
    const frame = current.element.frame;
    let left = frame.x;
    let right = frame.x + frame.width;
    let top = frame.y;
    let bottom = frame.y + frame.height;
    if (edges.left) left = Math.max(0, Math.min(right - 0.04, left + dx));
    if (edges.right) right = Math.min(1, Math.max(left + 0.04, right + dx));
    if (edges.top) top = Math.max(0, Math.min(bottom - 0.04, top + dy));
    if (edges.bottom) bottom = Math.min(1, Math.max(top + 0.04, bottom + dy));
    return { x: left, y: top, width: right - left, height: bottom - top };
  }
  function resizeElement(
    element: WidgetElement,
    frame: WidgetElement["frame"],
    current: Gesture,
  ): WidgetElement {
    if (current.mode === "move" || element.kind === "shape")
      return { ...element, frame };
    const edges = current.edges!;
    const widthScale = frame.width / element.frame.width;
    const heightScale = frame.height / element.frame.height;
    const scaleFactor =
      edges.left || edges.right
        ? edges.top || edges.bottom
          ? Math.sqrt(widthScale * heightScale)
          : widthScale
        : heightScale;
    const resized = {
      ...element,
      frame,
      style: {
        ...element.style,
        fontSize: Math.max(
          8,
          Math.min(160, Math.round(element.style.fontSize * scaleFactor)),
        ),
      },
    };
    return fittedElement(resized, source.fields, canvas, {
      horizontal: edges.left ? "right" : edges.right ? "left" : "center",
      vertical: edges.top ? "bottom" : edges.bottom ? "top" : "center",
    });
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
      return result.widgetId;
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
            {(dirty || target) && (
              <p>{dirty ? "Unsaved changes" : "All changes saved"}</p>
            )}
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
            onClick={() =>
              void saveDesign().catch((err: unknown) =>
                setError(errorMessage(err)),
              )
            }
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
      <div className="editor-live-bar">
        <div className="editor-live-actions">
          <EmailWatch
            widgetId={target?.widgetId ?? null}
            fields={source.fields}
            onSaveWidget={saveDesign}
            disabled={saving}
          />
        </div>
      </div>
      <div
        className="editor-mobile-tabs"
        role="tablist"
        aria-label="Editor panels"
      >
        {(["data", "canvas", "style"] as const).map((panel) => (
          <button
            key={panel}
            type="button"
            role="tab"
            aria-selected={mobilePanel === panel}
            onClick={() => setMobilePanel(panel)}
          >
            {panel === "data"
              ? "Extracted data"
              : panel === "canvas"
                ? "Widget"
                : "Style"}
          </button>
        ))}
      </div>
      <fieldset className="editor-fieldset" disabled={saving}>
        <div
          className={`editor-grid mobile-panel-${mobilePanel} ${saving ? "editor-saving" : ""}`}
          aria-busy={saving}
        >
          <aside className="data-panel">
            <div className="data-panel-header">
              <div>
                <div className="panel-title">
                  <span>Extracted data</span>
                </div>
                <p className="data-updated">
                  {source.refreshing
                    ? "Refreshing…"
                    : `Updated ${timeLabel(source.lastSuccessAt)}`}
                </p>
              </div>
              <button
                className="secondary data-refresh"
                aria-label="Refresh extracted data"
                title="Refresh extracted data"
                disabled={saving || !target || source.refreshing}
                onClick={() => {
                  void refresh({ sourceId: source._id }).catch((err: unknown) =>
                    setError(errorMessage(err)),
                  );
                }}
              >
                <RefreshCw
                  size={13}
                  className={source.refreshing ? "spin" : ""}
                />
              </button>
            </div>
            <div className="field-list">
              {source.fields.map((field) => {
                const used = definition.elements.some(
                  (element) =>
                    element.kind === "data" && element.fieldId === field.id,
                );
                const layout = dataElements(
                  field,
                  newElementColor(definition),
                  canvas,
                );
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={`field-card ${used ? "field-used" : ""} ${draggingFieldId === field.id ? "field-dragging" : ""}`}
                    aria-label={`Add ${formatDataFieldTitle(field.label)}: ${formatValue(field)}`}
                    title="Click to add or drag onto the widget"
                    onClick={() => add("data", field.id)}
                    draggable
                    onDragStart={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      fieldGrab.current = {
                        x: Math.max(
                          0,
                          Math.min(
                            1,
                            (event.clientX - rect.left) / rect.width,
                          ),
                        ),
                        y: Math.max(
                          0,
                          Math.min(
                            1,
                            (event.clientY - rect.top) / rect.height,
                          ),
                        ),
                      };
                      event.dataTransfer.setData(
                        "application/widget-field",
                        field.id,
                      );
                      event.dataTransfer.effectAllowed = "copy";
                      const image = event.currentTarget.querySelector(
                        ".field-native-drag-image",
                      ) as HTMLElement;
                      draggedFrame.current = {
                        width: layout.frame.width,
                        height: layout.frame.height,
                      };
                      event.dataTransfer.setDragImage(
                        image,
                        image.offsetWidth * fieldGrab.current.x,
                        image.offsetHeight * fieldGrab.current.y,
                      );
                      setDraggingFieldId(field.id);
                    }}
                    onDragEnd={endFieldDrag}
                  >
                    <span className="field-title">
                      {formatDataFieldTitle(field.label)}
                    </span>
                    <strong>{formatValue(field)}</strong>
                    <span
                      className="field-native-drag-image"
                      aria-hidden="true"
                      style={{
                        width:
                          previewWidth * layout.frame.width,
                        height:
                          canvas.height * scale * layout.frame.height,
                        color: newElementColor(definition),
                        background: "transparent",
                        fontSize: 28 * scale,
                        fontWeight: 600,
                        textAlign: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12 * scale,
                          height: canvas.height * scale * layout.labelHeight,
                        }}
                      >
                        {formatDataFieldTitle(field.label)}
                      </span>
                      <strong
                        style={{
                          height: canvas.height * scale * layout.valueHeight,
                          marginTop: canvas.height * scale * layout.gap,
                        }}
                      >
                        {formatValue(field)}
                      </strong>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="source-footer">
              <div className="panel-title">Source</div>
              <a href={source.url} target="_blank" rel="noreferrer">
                {new URL(source.url).hostname} ↗
              </a>
              {!target && <p>Refresh starts after saving</p>}
              {staleFields && (
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
                    {sizes[size].label}
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
                className={`canvas-drop-zone ${draggingFieldId ? "can-drop" : ""} ${dropOverWidget ? "drop-over" : ""}`}
                onDragOver={(event) => {
                  if (
                    event.dataTransfer.types.includes(
                      "application/widget-field",
                    )
                  ) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "copy";
                    setDropOverWidget(true);
                  }
                }}
                onDragLeave={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  if (
                    event.clientX < rect.left ||
                    event.clientX > rect.right ||
                    event.clientY < rect.top ||
                    event.clientY > rect.bottom
                  ) {
                    setDropOverWidget(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData(
                    "application/widget-field",
                  );
                  if (source.fields.some((field) => field.id === id))
                    add(
                      "data",
                      id,
                      dragPosition(event, event.currentTarget),
                    );
                  endFieldDrag();
                }}
              >
                <WidgetRenderer
                  definition={renderedDefinition}
                  fields={source.fields}
                  width={previewWidth}
                  selectedId={selectedId}
                  renderOverlay={(element) => {
                    const frame =
                      selectedId === element.id && previewElement
                        ? previewElement.frame
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
                            (event.target as HTMLElement).closest<HTMLElement>(
                              "[data-resize]",
                            )?.dataset.resize as ResizeDirection | undefined,
                          )
                        }
                        onPointerMove={(event) => {
                          const frame = moveFrame(event);
                          if (gesture.current && frame)
                            setPreviewElement(
                              resizeElement(
                                gesture.current.element,
                                frame,
                                gesture.current,
                              ),
                            );
                        }}
                        onPointerUp={(event) => {
                          const frame = moveFrame(event);
                          if (gesture.current && frame)
                            editElement(
                              resizeElement(
                                gesture.current.element,
                                frame,
                                gesture.current,
                              ),
                            );
                          gesture.current = null;
                          setPreviewElement(null);
                        }}
                        onPointerCancel={() => {
                          gesture.current = null;
                          setPreviewElement(null);
                        }}
                      >
                        {selectedId === element.id &&
                          resizeDirections.map((direction) => (
                            <span
                              key={direction}
                              className={`resize-handle resize-${direction}`}
                              data-resize={direction}
                              aria-hidden="true"
                            />
                          ))}
                      </div>
                    );
                  }}
                />
              </div>
              <p className="canvas-caption">
                {sizes[definition.size].label} widget <span>·</span>{" "}
                {canvas.width} × {canvas.height}
              </p>
            </div>
            <div className="add-toolbar">
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
                  name: "White",
                  background: "#ffffff",
                  foreground: "#111111",
                  theme: "light",
                },
                {
                  name: "Light grey",
                  background: "#f3f3f3",
                  foreground: "#111111",
                  theme: "light",
                },
                {
                  name: "Black",
                  background: "#111111",
                  foreground: "#ffffff",
                  theme: "dark",
                },
                {
                  name: "Blue",
                  background: "#2563eb",
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
                        onChange={(event) => {
                          const field = source.fields.find(
                            (item) => item.id === event.target.value,
                          );
                          editElement({
                            ...selected,
                            fieldId: event.target.value,
                            label: field
                              ? formatDataFieldTitle(field.label)
                              : "",
                          });
                        }}
                      >
                        {source.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {formatDataFieldTitle(field.label)}
                          </option>
                        ))}
                      </select>
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
                <p>Select an element to edit it.</p>
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
                    ? formatDataFieldTitle(element.label)
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

import {
  useEffect,
  useLayoutEffect,
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
  ChevronDown,
  ChevronUp,
  Copy,
  Globe,
  Redo2,
  RefreshCw,
  Save,
  Shapes,
  Sun,
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
import { confirmWidgetDeletion, errorMessage, timeLabel } from "./ui";
import { permitNavigation } from "./navigation";
import { EmailWatch } from "./EmailWatch";

type ResizeDirection = "ne" | "se" | "sw" | "nw";
type ToolbarElementKind = "text" | "icon" | "shape";
type ToolbarElement = Extract<WidgetElement, { kind: ToolbarElementKind }>;
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

const resizeDirections: ResizeDirection[] = ["ne", "se", "sw", "nw"];

const dataElementHeight = 0.25;
const elementInset = 6;
const toolbarElementKinds: ToolbarElementKind[] = ["text", "icon", "shape"];
let textMeasurementContext: CanvasRenderingContext2D | null = null;
let textMeasurementElement: HTMLDivElement | null = null;

function measuredTextSize(
  text: string,
  fontSize: number,
  fontWeight: number,
  wrap: boolean,
  maxWidth: number,
) {
  if (!textMeasurementElement) {
    textMeasurementElement = document.createElement("div");
    Object.assign(textMeasurementElement.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      visibility: "hidden",
      pointerEvents: "none",
      boxSizing: "border-box",
      lineHeight: "1.15",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: `${elementInset}px`,
    });
    document.body.append(textMeasurementElement);
  }
  Object.assign(textMeasurementElement.style, {
    width: "max-content",
    maxWidth: `${maxWidth}px`,
    whiteSpace: wrap ? "pre-wrap" : "nowrap",
    fontSize: `${fontSize}px`,
    fontWeight: `${fontWeight}`,
  });
  textMeasurementElement.textContent = text || "\u200b";
  const bounds = textMeasurementElement.getBoundingClientRect();
  return { width: bounds.width, height: bounds.height };
}

function contentWidth(
  text: string,
  fontSize: number,
  canvasWidth: number,
  fontWeight = 600,
) {
  if (!textMeasurementContext)
    textMeasurementContext = document.createElement("canvas").getContext("2d");
  const context = textMeasurementContext;
  if (!context) return 0.35;
  context.font = `${fontWeight} ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  return Math.min(
    0.8,
    Math.max(
      0.04,
      (context.measureText(text).width + elementInset * 2) / canvasWidth,
    ),
  );
}

function contentHeight(fontSize: number, canvasHeight: number) {
  return Math.max(0.04, (fontSize * 1.15 + elementInset * 2) / canvasHeight);
}

function fittedElement(
  element: WidgetElement,
  fields: DataField[],
  canvas: { width: number; height: number },
  anchor: {
    horizontal: "left" | "center" | "right";
    vertical: "top" | "center" | "bottom";
  } = {
    horizontal: "center",
    vertical: "center",
  },
): WidgetElement {
  if (element.kind === "shape") return element;
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
  const measured =
    element.kind === "icon"
      ? {
          width: element.style.fontSize + elementInset * 2,
          height: element.style.fontSize + elementInset * 2,
        }
      : measuredTextSize(
          text,
          element.style.fontSize,
          element.style.fontWeight,
          element.style.wrap,
          element.style.wrap ? canvas.width * 0.8 : canvas.width,
        );
  const width = Math.max(0.04, measured.width / canvas.width);
  const height = Math.max(0.04, measured.height / canvas.height);
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

function ToolbarDragPreview({
  element,
  width,
  height,
  scale,
}: {
  element: ToolbarElement;
  width: number;
  height: number;
  scale: number;
}) {
  const style = {
    width,
    height,
    color: element.style.color,
    fontSize: element.style.fontSize * scale,
    fontWeight: element.style.fontWeight,
    textAlign: element.style.align,
    opacity: element.style.opacity,
    padding: element.kind === "shape" ? 0 : 6 * scale,
  } as const;
  return (
    <span
      className="toolbar-native-drag-image"
      aria-hidden="true"
      style={style}
    >
      {element.kind === "text" && <span>{element.text}</span>}
      {element.kind === "icon" && (
        <Sun
          size={Math.min(
            element.style.fontSize * scale,
            width - 12 * scale,
            height - 12 * scale,
          )}
          strokeWidth={1.7}
          style={{ display: "block" }}
        />
      )}
      {element.kind === "shape" && (
        <span
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            background: element.fill,
            borderRadius:
              element.shape === "ellipse" ? "50%" : element.radius * scale,
          }}
        />
      )}
    </span>
  );
}

export function WidgetEditor({
  source,
  initialDefinition,
  widget,
  onBack,
  onDeleted,
}: {
  source: Doc<"sources">;
  initialDefinition: WidgetDefinitionV1;
  widget?: Doc<"widgets">;
  onBack: () => void;
  onDeleted: () => void;
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
        return fittedElement(
          normalizedElement,
          source.fields,
          normalizedCanvas,
        );
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
  const [previewElement, setPreviewElement] = useState<WidgetElement | null>(
    null,
  );
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"data" | "canvas" | "style">(
    "canvas",
  );
  const [draggingFieldId, setDraggingFieldId] = useState<string | null>(null);
  const [draggingElementKind, setDraggingElementKind] =
    useState<ToolbarElementKind | null>(null);
  const [dropOverWidget, setDropOverWidget] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(480);
  const canvasContainer = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTextClick = useRef<{ id: string; time: number } | null>(null);
  const textCaret = useRef<{ id: string; offset: number } | null>(null);
  const fieldGrab = useRef({ x: 0.5, y: 0.5 });
  const draggedFrame = useRef({ width: 0.35, height: dataElementHeight });
  const save = useMutation(api.widgets.save);
  const remove = useMutation(api.widgets.remove);
  const refresh = useMutation(api.sources.requestRefresh);
  const { name, definition } = state.present;
  const selected = definition.elements.find(
    (element) => element.id === selectedId,
  );
  const dirty = JSON.stringify(state.present) !== JSON.stringify(saved);
  const busy = saving || deleting;
  const staleFields = source.fields.some((field) => field.stale);
  const canvas = sizes[definition.size];
  const previewWidth = Math.min(
    viewportWidth,
    definition.size === "square" ? 360 : 640,
  );
  const scale = previewWidth / canvas.width;
  const renderedDefinition = previewElement
    ? {
        ...definition,
        elements: definition.elements.map((element) =>
          element.id === previewElement.id ? previewElement : element,
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
    if (!editingTextId) return;
    const frame = window.requestAnimationFrame(() => {
      const text = Array.from(
        canvasContainer.current?.querySelectorAll<HTMLElement>(
          "[data-widget-text-id]",
        ) ?? [],
      ).find((node) => node.dataset.widgetTextId === editingTextId);
      if (!text) return;
      text.focus();
      const range = document.createRange();
      range.selectNodeContents(text);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingTextId]);
  useLayoutEffect(() => {
    const caret = textCaret.current;
    if (!caret || caret.id !== editingTextId) return;
    const text = Array.from(
      canvasContainer.current?.querySelectorAll<HTMLElement>(
        "[data-widget-text-id]",
      ) ?? [],
    ).find((node) => node.dataset.widgetTextId === caret.id);
    if (!text) return;
    const range = document.createRange();
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    let remaining = caret.offset;
    let node = walker.nextNode();
    while (node) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        range.setStart(node, remaining);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        textCaret.current = null;
        return;
      }
      remaining -= length;
      node = walker.nextNode();
    }
    range.selectNodeContents(text);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    textCaret.current = null;
  }, [definition, editingTextId]);
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
      if (busy || (dirty && !window.confirm("Discard your unsaved changes?")))
        event.preventDefault();
    };
    window.addEventListener("widget-now:navigate", confirm);
    return () => window.removeEventListener("widget-now:navigate", confirm);
  }, [busy, dirty]);
  useEffect(() => {
    const removeWithBackspace = (event: KeyboardEvent) => {
      if (event.key !== "Backspace" || busy || !selectedId) return;
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
      setSelectedId(null);
    };
    window.addEventListener("keydown", removeWithBackspace);
    return () => window.removeEventListener("keydown", removeWithBackspace);
  }, [busy, definition, name, selectedId]);

  function change(next: WidgetDefinitionV1) {
    dispatch({ type: "change", design: { name, definition: next } });
  }
  function editElement(next: WidgetElement, fit = true) {
    const fitted = fit ? fittedElement(next, source.fields, canvas) : next;
    change({
      ...definition,
      elements: definition.elements.map((element) =>
        element.id === fitted.id ? fitted : element,
      ),
    });
  }
  function rememberTextCaret(elementId: string, target: HTMLElement) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!target.contains(range.endContainer)) return;
    const before = range.cloneRange();
    before.selectNodeContents(target);
    before.setEnd(range.endContainer, range.endOffset);
    textCaret.current = { id: elementId, offset: before.toString().length };
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
    const element = fittedElement(
      nextElement,
      source.fields,
      canvas,
      position ? { horizontal: "left", vertical: "top" } : undefined,
    );
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
    setDraggingElementKind(null);
    setDropOverWidget(false);
  }
  function defaultToolbarElement(kind: ToolbarElementKind): ToolbarElement {
    return fittedElement(
      newElement(kind, newElementColor(definition)),
      source.fields,
      canvas,
    ) as ToolbarElement;
  }
  function toolbarDragPreview(kind: ToolbarElementKind) {
    const element = defaultToolbarElement(kind);
    return (
      <ToolbarDragPreview
        element={element}
        width={previewWidth * element.frame.width}
        height={canvas.height * scale * element.frame.height}
        scale={scale}
      />
    );
  }
  function beginToolbarDrag(
    event: DragEvent<HTMLButtonElement>,
    kind: ToolbarElementKind,
  ) {
    const rect = event.currentTarget.getBoundingClientRect();
    fieldGrab.current = {
      x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
    };
    const element = defaultToolbarElement(kind);
    draggedFrame.current = element.frame;
    event.dataTransfer.setData("application/widget-element", kind);
    event.dataTransfer.effectAllowed = "copy";
    const image = event.currentTarget.querySelector(
      ".toolbar-native-drag-image",
    ) as HTMLElement;
    event.dataTransfer.setDragImage(
      image,
      image.offsetWidth * fieldGrab.current.x,
      image.offsetHeight * fieldGrab.current.y,
    );
    setDraggingElementKind(kind);
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
    if (busy) return;
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
  function beginElementPointerGesture(
    event: PointerEvent<HTMLDivElement>,
    element: WidgetElement,
  ) {
    const direction = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-resize]",
    )?.dataset.resize as ResizeDirection | undefined;
    beginGesture(event, element, direction);
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
      window.history.replaceState(null, "", `#widget=${result.widgetId}`);
      return result.widgetId;
    } finally {
      setSaving(false);
    }
  }
  async function deleteWidget() {
    if (!target) return;
    if (!confirmWidgetDeletion(name)) return;
    setDeleting(true);
    setError(null);
    try {
      await remove({ widgetId: target.widgetId });
      onDeleted();
    } catch (err) {
      setError(errorMessage(err));
      setDeleting(false);
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
              disabled={busy}
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
          <EmailWatch
            widgetId={target?.widgetId ?? null}
            fields={source.fields}
            onSaveWidget={saveDesign}
            disabled={busy}
          />
          {target && (
            <button
              className="danger-button"
              disabled={busy}
              onClick={() => void deleteWidget()}
            >
              <Trash2 size={16} />
              {deleting ? "Deleting…" : "Delete"}
            </button>
          )}
          <button
            className="primary"
            disabled={busy || (target !== null && !dirty)}
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
      <fieldset className="editor-fieldset" disabled={busy}>
        <div
          className={`editor-grid mobile-panel-${mobilePanel} ${busy ? "editor-saving" : ""}`}
          aria-busy={busy}
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
                disabled={busy || !target || source.refreshing}
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
                          Math.min(1, (event.clientX - rect.left) / rect.width),
                        ),
                        y: Math.max(
                          0,
                          Math.min(1, (event.clientY - rect.top) / rect.height),
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
                        width: previewWidth * layout.frame.width,
                        height: canvas.height * scale * layout.frame.height,
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
              <div className="source-footer-heading">
                <span>Source</span>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {new URL(source.url).hostname} ↗
                </a>
              </div>
              {!target && <p>Refresh starts after saving</p>}
              {staleFields && (
                <p className="stale">
                  Some values are stale. Showing their last successful
                  observations.
                </p>
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
              <div className="canvas-history">
                <button
                  className="icon-button"
                  aria-label="Undo"
                  disabled={!state.past.length || busy}
                  onClick={() => dispatch({ type: "undo" })}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Redo"
                  disabled={!state.future.length || busy}
                  onClick={() => dispatch({ type: "redo" })}
                >
                  <Redo2 size={16} />
                </button>
              </div>
            </div>
            <div
              className="canvas-stage"
              ref={canvasContainer}
              onClick={() => {
                setSelectedId(null);
                setEditingTextId(null);
              }}
            >
              <div
                className={`canvas-drop-zone ${draggingFieldId || draggingElementKind ? "can-drop" : ""} ${dropOverWidget ? "drop-over" : ""}`}
                onDragOver={(event) => {
                  if (
                    event.dataTransfer.types.includes(
                      "application/widget-field",
                    ) ||
                    event.dataTransfer.types.includes(
                      "application/widget-element",
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
                    add("data", id, dragPosition(event, event.currentTarget));
                  const kind = event.dataTransfer.getData(
                    "application/widget-element",
                  );
                  if (toolbarElementKinds.includes(kind as ToolbarElementKind))
                    add(
                      kind as ToolbarElementKind,
                      undefined,
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
                  editableTextId={editingTextId}
                  onTextInput={(elementId, text, target) => {
                    rememberTextCaret(elementId, target);
                    const element = definition.elements.find(
                      (item) => item.id === elementId,
                    );
                    if (element?.kind === "text")
                      editElement({ ...element, text });
                  }}
                  onTextBlur={(elementId) => {
                    if (editingTextId === elementId) setEditingTextId(null);
                  }}
                  renderOverlay={(element) => {
                    const frame =
                      selectedId === element.id && previewElement
                        ? previewElement.frame
                        : element.frame;
                    return (
                      <div
                        key={element.id}
                        className={`element-handle ${selectedId === element.id ? "handle-selected" : ""} ${editingTextId === element.id ? "text-editing" : ""}`}
                        style={{
                          left: `${frame.x * 100}%`,
                          top: `${frame.y * 100}%`,
                          width: `${frame.width * 100}%`,
                          height: `${frame.height * 100}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (
                            (event.target as HTMLElement).closest(
                              "[data-resize]",
                            )
                          )
                            return;
                          const previous = lastTextClick.current;
                          const now = Date.now();
                          lastTextClick.current = {
                            id: element.id,
                            time: now,
                          };
                          setSelectedId(element.id);
                          setEditingTextId(
                            element.kind === "text" &&
                              previous?.id === element.id &&
                              now - previous.time < 500
                              ? element.id
                              : null,
                          );
                        }}
                        onDoubleClick={(event) => {
                          if (element.kind !== "text") return;
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedId(element.id);
                          setEditingTextId(element.id);
                        }}
                        onPointerDown={(event) =>
                          beginElementPointerGesture(event, element)
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
            </div>
            <div className="add-toolbar">
              <button
                onClick={() => add("text")}
                draggable
                onDragStart={(event) => beginToolbarDrag(event, "text")}
                onDragEnd={endFieldDrag}
              >
                <Type size={16} />
                Text
                {toolbarDragPreview("text")}
              </button>
              <button
                onClick={() => add("icon")}
                draggable
                onDragStart={(event) => beginToolbarDrag(event, "icon")}
                onDragEnd={endFieldDrag}
              >
                <Globe size={16} />
                Icon
                {toolbarDragPreview("icon")}
              </button>
              <button
                onClick={() => add("shape")}
                draggable
                onDragStart={(event) => beginToolbarDrag(event, "shape")}
                onDragEnd={endFieldDrag}
              >
                <Shapes size={16} />
                Shape
                {toolbarDragPreview("shape")}
              </button>
            </div>
          </section>
          <aside className="property-panel">
            {!selected && (
              <>
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
              </>
            )}
            {selected && (
              <>
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
                          editElement(
                            {
                              ...selected,
                              frame: clampFrame({
                                ...selected.frame,
                                [key]: Number(event.target.value) / 100,
                              }),
                            },
                            false,
                          )
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

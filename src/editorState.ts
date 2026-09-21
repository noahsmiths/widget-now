import {
  clampFrame,
  defaultStyle,
  formatDataFieldTitle,
  type DataField,
  type WidgetDefinitionV1,
  type WidgetElement,
} from "../shared/widget";

export type Design = { name: string; definition: WidgetDefinitionV1 };
export type EditorState = { past: Design[]; present: Design; future: Design[] };
export type EditorAction =
  { type: "change"; design: Design } | { type: "undo" } | { type: "redo" };
export function editorReducer(
  state: EditorState,
  action: EditorAction,
): EditorState {
  if (action.type === "change") {
    if (JSON.stringify(action.design) === JSON.stringify(state.present))
      return state;
    return {
      past: [...state.past.slice(-99), state.present],
      present: action.design,
      future: [],
    };
  }
  if (action.type === "undo" && state.past.length)
    return {
      past: state.past.slice(0, -1),
      present: state.past[state.past.length - 1],
      future: [state.present, ...state.future],
    };
  if (action.type === "redo" && state.future.length)
    return {
      past: [...state.past, state.present],
      present: state.future[0],
      future: state.future.slice(1),
    };
  return state;
}

export function newElement(
  kind: WidgetElement["kind"],
  color: string,
  field?: DataField,
  position = { x: 0.1, y: 0.35 },
): WidgetElement {
  const base = {
    id: crypto.randomUUID(),
    frame: clampFrame({ ...position, width: 0.55, height: 0.25 }),
    style: { ...defaultStyle, color },
  };
  switch (kind) {
    case "data": {
      if (!field) throw new Error("Choose a data field.");
      return {
        ...base,
        kind,
        fieldId: field.id,
        label: formatDataFieldTitle(field.label),
        showLabel: true,
        showUnit: true,
        precision: 0,
      };
    }
    case "text":
      return {
        ...base,
        kind,
        text: "Your text",
        style: { ...base.style, fontSize: 18 },
      };
    case "icon":
      return {
        ...base,
        kind,
        icon: "sun",
        frame: clampFrame({ ...position, width: 0.15, height: 0.15 }),
        style: { ...base.style, fontSize: 32 },
      };
    case "shape":
      return {
        ...base,
        kind,
        shape: "rectangle",
        fill: color,
        radius: 12,
        frame: clampFrame({ ...position, width: 0.3, height: 0.15 }),
      };
  }
}

export function splitLiveDataElements(
  definition: WidgetDefinitionV1,
): WidgetDefinitionV1 {
  return {
    ...definition,
    elements: definition.elements.flatMap((element) => {
      if (element.kind !== "data" || !element.showLabel) return [element];
      const labelHeight = Math.min(
        0.12,
        Math.max(0.04, element.frame.height * 0.36),
      );
      return [
        {
          id: crypto.randomUUID(),
          kind: "text" as const,
          text: formatDataFieldTitle(element.label),
          frame: clampFrame({ ...element.frame, height: labelHeight }),
          style: {
            ...element.style,
            fontSize: Math.max(8, element.style.fontSize * 0.36),
          },
        },
        {
          ...element,
          showLabel: false,
          frame: clampFrame({
            ...element.frame,
            y: element.frame.y + labelHeight,
            height: Math.max(0.04, element.frame.height - labelHeight),
          }),
        },
      ];
    }),
  };
}

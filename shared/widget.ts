import { v, type Infer } from "convex/values";

export const sizeValidator = v.union(
  v.literal("1x1"),
  v.literal("2x2"),
  v.literal("2x4"),
);
export const iconNames = [
  "sun",
  "cloud",
  "droplet",
  "wind",
  "chart",
  "globe",
  "clock",
  "star",
  "heart",
  "bolt",
] as const;
export const iconValidator = v.union(
  ...iconNames.map((name) => v.literal(name)),
);
export const frameValidator = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});
export const styleValidator = v.object({
  color: v.string(),
  fontSize: v.number(),
  fontWeight: v.union(
    v.literal(400),
    v.literal(500),
    v.literal(600),
    v.literal(700),
  ),
  align: v.union(v.literal("left"), v.literal("center"), v.literal("right")),
  wrap: v.boolean(),
  opacity: v.number(),
});
const common = { id: v.string(), frame: frameValidator, style: styleValidator };
export const elementValidator = v.union(
  v.object({
    ...common,
    kind: v.literal("data"),
    fieldId: v.string(),
    label: v.string(),
    showLabel: v.boolean(),
    showUnit: v.boolean(),
    precision: v.number(),
  }),
  v.object({ ...common, kind: v.literal("text"), text: v.string() }),
  v.object({ ...common, kind: v.literal("icon"), icon: iconValidator }),
  v.object({
    ...common,
    kind: v.literal("shape"),
    shape: v.union(v.literal("rectangle"), v.literal("ellipse")),
    fill: v.string(),
    radius: v.number(),
  }),
);
export const definitionValidator = v.object({
  version: v.literal(1),
  size: sizeValidator,
  background: v.string(),
  theme: v.union(v.literal("light"), v.literal("dark"), v.literal("custom")),
  elements: v.array(elementValidator),
});
export const scalarValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
);
export const fieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  description: v.string(),
  type: v.union(v.literal("number"), v.literal("string"), v.literal("boolean")),
  unit: v.string(),
  value: scalarValidator,
  excerpt: v.string(),
  stale: v.boolean(),
  observedAt: v.union(v.number(), v.null()),
});
export type WidgetDefinitionV1 = Infer<typeof definitionValidator>;
export type WidgetElement = Infer<typeof elementValidator>;
export type DataField = Infer<typeof fieldValidator>;
export type WidgetSize = Infer<typeof sizeValidator>;
export type ElementStyle = Infer<typeof styleValidator>;
export const sizes: Record<
  WidgetSize,
  { width: number; height: number; label: string }
> = {
  "1x1": { width: 160, height: 160, label: "Small" },
  "2x2": { width: 320, height: 320, label: "Large" },
  "2x4": { width: 640, height: 320, label: "Wide" },
};
export const defaultStyle: ElementStyle = {
  color: "#ffffff",
  fontSize: 28,
  fontWeight: 600,
  align: "left",
  wrap: false,
  opacity: 1,
};

export function formatValue(
  field: DataField | undefined,
  precision = 0,
  showUnit = true,
) {
  if (!field || field.value === null) return "—";
  const value =
    typeof field.value === "number"
      ? field.value.toLocaleString("en-US", {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision,
        })
      : typeof field.value === "boolean"
        ? field.value
          ? "Yes"
          : "No"
        : field.value;
  return (
    value +
    (showUnit && field.unit
      ? `${field.unit.startsWith("°") || field.unit === "%" ? "" : " "}${field.unit}`
      : "")
  );
}

export function clampFrame(frame: WidgetElement["frame"]) {
  const width = Math.min(1, Math.max(0.04, frame.width));
  const height = Math.min(1, Math.max(0.04, frame.height));
  return {
    x: Math.min(1 - width, Math.max(0, frame.x)),
    y: Math.min(1 - height, Math.max(0, frame.y)),
    width,
    height,
  };
}

export function validateDefinition(
  definition: WidgetDefinitionV1,
  fields: DataField[],
) {
  if (definition.elements.length > 60)
    throw new Error("A widget can have up to 60 elements.");
  const ids = new Set<string>();
  const fieldIds = new Set(fields.map((field) => field.id));
  const color = /^#[0-9a-fA-F]{6}$/;
  if (!color.test(definition.background))
    throw new Error("Choose a valid background color.");
  for (const element of definition.elements) {
    if (!element.id || ids.has(element.id))
      throw new Error("Element IDs must be unique.");
    ids.add(element.id);
    const { x, y, width, height } = element.frame;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width < 0.04 ||
      height < 0.04 ||
      x + width > 1.00001 ||
      y + height > 1.00001
    )
      throw new Error("Elements must fit inside the widget.");
    if (
      !color.test(element.style.color) ||
      !Number.isFinite(element.style.fontSize) ||
      element.style.fontSize < 8 ||
      element.style.fontSize > 160 ||
      !Number.isFinite(element.style.opacity) ||
      element.style.opacity < 0 ||
      element.style.opacity > 1
    )
      throw new Error("Invalid element styling.");
    if (
      element.kind === "data" &&
      (!fieldIds.has(element.fieldId) ||
        !Number.isInteger(element.precision) ||
        element.precision < 0 ||
        element.precision > 6)
    )
      throw new Error("Invalid live data binding or precision.");
    if (
      element.kind === "shape" &&
      (!color.test(element.fill) ||
        !Number.isFinite(element.radius) ||
        element.radius < 0 ||
        element.radius > 160)
    )
      throw new Error("Invalid shape styling.");
    if (element.kind === "text" && element.text.length > 2000)
      throw new Error("Text is too long.");
    if (element.kind === "data" && element.label.length > 200)
      throw new Error("Label is too long.");
  }
}

export function normalizePublicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a complete website URL, including https://.");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new Error(
      "Use a public HTTP or HTTPS URL without credentials or custom ports.",
    );
  if (
    !host.includes(".") ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host)
  )
    throw new Error("Use a public website hostname, not a local address.");
  url.hash = "";
  return url.toString();
}

export function mergeRefreshFields(
  previous: DataField[],
  updates: { id: string; value: DataField["value"]; excerpt: string }[],
  now: number,
) {
  const ids = new Set(previous.map((field) => field.id));
  if (
    new Set(updates.map((field) => field.id)).size !== updates.length ||
    updates.some((field) => !ids.has(field.id))
  )
    throw new Error("Refresh returned invalid field IDs.");
  return previous.map((field) => {
    const update = updates.find((item) => item.id === field.id);
    if (!update || update.value === null) return { ...field, stale: true };
    if (typeof update.value !== field.type)
      throw new Error(`Unexpected value type for ${field.label}.`);
    return {
      ...field,
      value: update.value,
      excerpt: update.excerpt,
      stale: false,
      observedAt: now,
    };
  });
}

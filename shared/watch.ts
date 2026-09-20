import { v, type Infer } from "convex/values";
import type { DataField } from "./widget";

export const conditionValidator = v.object({
  fieldId: v.string(),
  operator: v.union(
    v.literal("changed"),
    v.literal("below"),
    v.literal("above"),
    v.literal("equals"),
    v.literal("contains"),
  ),
  target: v.union(v.string(), v.number(), v.boolean(), v.null()),
});
export type WatchCondition = Infer<typeof conditionValidator>;
export const commandValidator = v.object({
  kind: v.union(
    v.literal("confirm"),
    v.literal("pause"),
    v.literal("resume"),
    v.literal("latest"),
    v.literal("update"),
    v.literal("help"),
  ),
  condition: v.union(conditionValidator, v.null()),
});
export type WatchCommand = Infer<typeof commandValidator>;

export function validateCondition(
  condition: WatchCondition,
  fields: DataField[],
) {
  const field = fields.find((item) => item.id === condition.fieldId);
  if (!field) throw new Error("Choose a field from this widget's source.");
  if (condition.operator === "changed") {
    if (condition.target !== null)
      throw new Error("A change watch needs no target value.");
  } else if (condition.operator === "contains") {
    if (
      field.type !== "string" ||
      typeof condition.target !== "string" ||
      !condition.target.trim()
    )
      throw new Error("Contains needs a text field and a nonempty value.");
  } else if (condition.operator === "above" || condition.operator === "below") {
    if (
      field.type !== "number" ||
      typeof condition.target !== "number" ||
      !Number.isFinite(condition.target)
    )
      throw new Error(
        "Threshold watches need a numeric field and a finite number in its stored units.",
      );
  } else if (
    condition.target === null ||
    typeof condition.target !== field.type
  ) {
    throw new Error("The target value must match this field's type.");
  }
  if (typeof condition.target === "string" && condition.target.length > 200)
    throw new Error("Keep the target value under 200 characters.");
  return field;
}

export function matchesCondition(
  condition: WatchCondition,
  value: DataField["value"],
): boolean {
  if (value === null || condition.operator === "changed") return false;
  if (condition.operator === "contains")
    return (
      typeof value === "string" &&
      typeof condition.target === "string" &&
      value.toLowerCase().includes(condition.target.trim().toLowerCase())
    );
  if (condition.operator === "equals")
    return typeof value === "string" && typeof condition.target === "string"
      ? value.trim().toLowerCase() === condition.target.trim().toLowerCase()
      : value === condition.target;
  return (
    typeof value === "number" &&
    typeof condition.target === "number" &&
    (condition.operator === "below"
      ? value < condition.target
      : value > condition.target)
  );
}

export function describeCondition(
  condition: WatchCondition,
  fields: DataField[],
) {
  const field = fields.find((item) => item.id === condition.fieldId);
  const label = field?.label ?? condition.fieldId;
  if (condition.operator === "changed") return `${label} has changed`;
  const target = `${String(condition.target)}${field?.unit ? ` ${field.unit}` : ""}`;
  if (condition.operator === "contains")
    return `${label} contains ${String(condition.target)}`;
  const phrase = {
    equals: "is equal to",
    above: "is greater than",
    below: "is less than",
  }[condition.operator];
  return `${label} ${phrase} ${target}`;
}

export function evaluateWatch(
  condition: WatchCondition,
  field: DataField | undefined,
  lastValue: DataField["value"],
  lastMatched: boolean | null,
) {
  if (
    !field ||
    field.stale ||
    field.value === null ||
    field.observedAt === null
  )
    return { trigger: false, lastValue, lastMatched };
  const matched = matchesCondition(condition, field.value);
  const trigger =
    condition.operator === "changed"
      ? lastValue !== null && field.value !== lastValue
      : lastMatched === false && matched;
  return { trigger, lastValue: field.value, lastMatched: matched };
}

export function emailAddress(value: string) {
  return (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

import { ConvexError } from "convex/values";
export function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string")
    return error.data;
  if (error instanceof Error)
    return error.message
      .replace(/^.*Uncaught (?:Error|ConvexError): /s, "")
      .split("\n    at ")[0];
  return "Something went wrong. Please try again.";
}
export function confirmWidgetDeletion(name: string) {
  return window.confirm(
    `Delete “${name}”? This permanently deletes the widget and its generation.`,
  );
}
export function confirmGenerationDeletion(name: string) {
  return window.confirm(
    `Delete “${name}”? This permanently deletes this generation and both designs.`,
  );
}
export function timeLabel(timestamp: number | null) {
  return timestamp === null
    ? "Not yet"
    : new Date(timestamp).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

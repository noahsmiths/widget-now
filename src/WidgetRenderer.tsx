import {
  Sun,
  Cloud,
  Droplets,
  Wind,
  TrendingUp,
  Globe,
  Clock,
  Star,
  Heart,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  formatDataFieldTitle,
  formatValue,
  sizes,
  type DataField,
  type WidgetDefinitionV1,
  type WidgetElement,
} from "../shared/widget";
import type { CSSProperties, ReactNode } from "react";

const icons: Record<
  Extract<WidgetElement, { kind: "icon" }>["icon"],
  LucideIcon
> = {
  sun: Sun,
  cloud: Cloud,
  droplet: Droplets,
  wind: Wind,
  chart: TrendingUp,
  globe: Globe,
  clock: Clock,
  star: Star,
  heart: Heart,
  bolt: Zap,
};

export function WidgetRenderer({
  definition,
  fields,
  width,
  selectedId,
  renderOverlay,
}: {
  definition: WidgetDefinitionV1;
  fields: DataField[];
  width: number;
  selectedId?: string | null;
  renderOverlay?: (element: WidgetElement, scale: number) => ReactNode;
}) {
  const canvas = sizes[definition.size];
  const scale = width / canvas.width;
  return (
    <div
      className="widget-preview"
      style={{ width, height: canvas.height * scale }}
    >
      <div
        className="widget-reference"
        style={{
          width: canvas.width,
          height: canvas.height,
          background: definition.background,
          borderRadius: 32,
          transform: `scale(${scale})`,
        }}
      >
        {definition.elements.map((element) => {
          const { frame, style } = element;
          const css: CSSProperties = {
            left: frame.x * canvas.width,
            top: frame.y * canvas.height,
            width: frame.width * canvas.width,
            height: frame.height * canvas.height,
            color: style.color,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            textAlign: style.align,
            opacity: style.opacity,
            whiteSpace: style.wrap ? "pre-wrap" : "nowrap",
          };
          const field =
            element.kind === "data"
              ? fields.find((item) => item.id === element.fieldId)
              : undefined;
          const Icon = element.kind === "icon" ? icons[element.icon] : null;
          const iconSize = Icon
            ? Math.min(
                style.fontSize,
                frame.width * canvas.width,
                frame.height * canvas.height,
              )
            : null;
          return (
            <div
              key={element.id}
              className={`widget-element ${selectedId === element.id ? "selected" : ""}`}
              style={css}
            >
              {element.kind === "text" && (
                <div className="widget-text">{element.text}</div>
              )}
              {element.kind === "data" && (
                <div className="widget-data">
                  {element.showLabel && (
                    <div
                      className="widget-data-label"
                      style={{ fontSize: Math.max(8, style.fontSize * 0.36) }}
                    >
                      {formatDataFieldTitle(element.label)}
                    </div>
                  )}
                  <div
                    className="widget-data-value"
                    title={
                      field?.stale
                        ? "This field is stale. Showing its last known value."
                        : undefined
                    }
                  >
                    {formatValue(field, element.precision, element.showUnit)}
                  </div>
                </div>
              )}
              {Icon && (
                <Icon
                  size={iconSize ?? 0}
                  strokeWidth={1.7}
                  style={{
                    display: "block",
                    marginLeft:
                      style.align === "center"
                        ? "auto"
                        : style.align === "right"
                          ? "auto"
                          : 0,
                    marginRight: style.align === "center" ? "auto" : 0,
                  }}
                />
              )}
              {element.kind === "shape" && (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: element.fill,
                    borderRadius:
                      element.shape === "ellipse" ? "50%" : element.radius,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
      {renderOverlay && (
        <div className="widget-overlays">
          {definition.elements.map((element) => renderOverlay(element, scale))}
        </div>
      )}
    </div>
  );
}

import SwiftUI

struct WidgetCanvas: View {
    let snapshot: WidgetSnapshot

    private var reference: CGSize {
        switch snapshot.definition.size {
        case "rectangle": CGSize(width: 640, height: 320)
        default: CGSize(width: 320, height: 320)
        }
    }

    var body: some View {
        GeometryReader { geometry in
            let scale = min(geometry.size.width / reference.width, geometry.size.height / reference.height)
            ZStack(alignment: .topLeading) {
                Color(hex: snapshot.definition.background)
                ForEach(snapshot.definition.elements) { element in
                    elementView(element)
                        .frame(width: element.frame.width * reference.width,
                               height: element.frame.height * reference.height,
                               alignment: .topLeading)
                        .opacity(element.style.opacity)
                        .offset(x: element.frame.x * reference.width, y: element.frame.y * reference.height)
                }
            }
            .frame(width: reference.width, height: reference.height)
            .clipShape(RoundedRectangle(cornerRadius: 32))
            .scaleEffect(scale, anchor: .topLeading)
            .frame(width: reference.width * scale, height: reference.height * scale, alignment: .topLeading)
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
        }
        .containerBackground(for: .widget) { Color(hex: snapshot.definition.background) }
    }

    @ViewBuilder private func elementView(_ element: WidgetElement) -> some View {
        let style = element.style
        let alignment: Alignment = style.align == "right" ? .trailing : (style.align == "center" ? .center : .leading)
        let textAlignment: TextAlignment = style.align == "right" ? .trailing : (style.align == "center" ? .center : .leading)
        switch element.kind {
        case "shape":
            if element.shape == "ellipse" {
                Ellipse().fill(Color(hex: element.fill ?? "#ffffff"))
            } else {
                RoundedRectangle(cornerRadius: element.radius ?? 0).fill(Color(hex: element.fill ?? "#ffffff"))
            }
        case "icon":
            Image(systemName: Self.symbol(element.icon ?? "star"))
                .font(.system(size: style.fontSize, weight: .regular))
                .foregroundStyle(Color(hex: style.color))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
        case "data":
            let field = snapshot.fields.first { $0.id == element.fieldId }
            VStack(alignment: style.align == "right" ? .trailing : (style.align == "center" ? .center : .leading), spacing: 0) {
                if element.showLabel == true {
                    Text((element.label ?? "").replacingOccurrences(of: "_", with: " ").capitalized)
                        .font(.system(size: max(8, style.fontSize * 0.36)))
                        .opacity(0.75)
                }
                Text(field?.value?.formatted(precision: element.precision ?? 0, unit: field?.unit ?? "", showUnit: element.showUnit ?? true) ?? "—")
                    .tracking(-style.fontSize * 0.035)
            }
            .font(.system(size: style.fontSize, weight: Font.Weight(css: style.fontWeight)))
            .foregroundStyle(Color(hex: style.color))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .multilineTextAlignment(textAlignment)
            .lineLimit(style.wrap ? nil : 1)
        default:
            Text(element.text ?? "")
                .font(.system(size: style.fontSize, weight: Font.Weight(css: style.fontWeight)))
                .foregroundStyle(Color(hex: style.color))
                .multilineTextAlignment(textAlignment)
                .lineLimit(style.wrap ? nil : 1)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
    }

    private static func symbol(_ name: String) -> String {
        ["sun": "sun.max", "cloud": "cloud", "droplet": "drop", "wind": "wind", "chart": "chart.line.uptrend.xyaxis", "globe": "globe", "clock": "clock", "star": "star", "heart": "heart", "bolt": "bolt"].first { $0.key == name }?.value ?? "star"
    }
}

private extension Font.Weight {
    init(css: Int) {
        switch css {
        case 400: self = .regular
        case 500: self = .medium
        case 600: self = .semibold
        default: self = .bold
        }
    }
}

private extension Color {
    init(hex: String) {
        let code = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        let value = UInt64(code, radix: 16) ?? 0
        self.init(.sRGB, red: Double((value >> 16) & 255) / 255,
                  green: Double((value >> 8) & 255) / 255,
                  blue: Double(value & 255) / 255, opacity: 1)
    }
}

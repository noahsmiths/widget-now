import Foundation

enum CompanionConfig {
    private static let deployment = Bundle.main.object(forInfoDictionaryKey: "ConvexDeployment") as! String
    static let deploymentURL = "https://\(deployment).convex.cloud"
    static let siteURL = "https://\(deployment).convex.site"
    static let appGroup = "group.com.widgetnow.shared"
}

struct WidgetSummary: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let size: String
}

struct WidgetPage: Decodable {
    let page: [WidgetSummary]
    let isDone: Bool
    let continueCursor: String
}

struct WidgetSnapshot: Decodable {
    let id: String
    let name: String
    let sourceUrl: String
    let definition: WidgetDefinition
    let fields: [WidgetField]
    let updatedAt: Double
    let lastSuccessAt: Double?
}

struct WidgetDefinition: Decodable {
    let version: Int
    let size: String
    let background: String
    let elements: [WidgetElement]
}

struct WidgetElement: Decodable, Identifiable {
    let id: String
    let kind: String
    let frame: WidgetFrame
    let style: WidgetStyle
    let fieldId: String?
    let label: String?
    let showLabel: Bool?
    let showUnit: Bool?
    let precision: Int?
    let text: String?
    let icon: String?
    let shape: String?
    let fill: String?
    let radius: Double?
}

struct WidgetFrame: Decodable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

struct WidgetStyle: Decodable {
    let color: String
    let fontSize: Double
    let fontWeight: Int
    let align: String
    let wrap: Bool
    let opacity: Double
}

struct WidgetField: Decodable {
    let id: String
    let unit: String
    let value: ScalarValue?
    let stale: Bool
}

enum ScalarValue: Decodable {
    case string(String)
    case number(Double)
    case boolean(Bool)

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if let bool = try? value.decode(Bool.self) { self = .boolean(bool) }
        else if let number = try? value.decode(Double.self) { self = .number(number) }
        else { self = .string(try value.decode(String.self)) }
    }

    func formatted(precision: Int, unit: String, showUnit: Bool) -> String {
        let text: String
        switch self {
        case .string(let value): text = value
        case .boolean(let value): text = value ? "Yes" : "No"
        case .number(let value):
            let formatter = NumberFormatter()
            formatter.numberStyle = .decimal
            formatter.minimumFractionDigits = min(max(precision, 0), 6)
            formatter.maximumFractionDigits = formatter.minimumFractionDigits
            formatter.locale = Locale(identifier: "en_US")
            text = formatter.string(from: NSNumber(value: value)) ?? String(value)
        }
        guard showUnit && !unit.isEmpty else { return text }
        if ["$", "€", "£", "¥", "₹", "₩"].contains(unit) { return unit + text }
        return text + ((unit.hasPrefix("°") || unit == "%") ? "" : " ") + unit
    }
}

enum WidgetCatalog {
    static var entries: [WidgetSummary] {
        guard let data = UserDefaults(suiteName: CompanionConfig.appGroup)?.data(forKey: "widgetCatalog") else { return [] }
        return (try? JSONDecoder().decode([WidgetSummary].self, from: data)) ?? []
    }

    static func save(_ entries: [WidgetSummary]) {
        let data = try? JSONEncoder().encode(entries)
        UserDefaults(suiteName: CompanionConfig.appGroup)?.set(data, forKey: "widgetCatalog")
    }
}

import AppIntents
import Combine
import ConvexMobile
import SwiftUI
import WidgetKit

private func designs(for size: String) -> [WidgetSummary] {
    WidgetCatalog.entries.filter { $0.size == size }
}

struct SquareDesign: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Square design")
    static var defaultQuery = SquareDesignQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct SquareDesignQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [SquareDesign] {
        designs(for: "square").filter { identifiers.contains($0.id) }.map { SquareDesign(id: $0.id, name: $0.name) }
    }
    func suggestedEntities() async throws -> [SquareDesign] {
        designs(for: "square").map { SquareDesign(id: $0.id, name: $0.name) }
    }
}

struct RectangleDesign: AppEntity {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Rectangle design")
    static var defaultQuery = RectangleDesignQuery()
    let id: String
    let name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct RectangleDesignQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [RectangleDesign] {
        designs(for: "rectangle").filter { identifiers.contains($0.id) }.map { RectangleDesign(id: $0.id, name: $0.name) }
    }
    func suggestedEntities() async throws -> [RectangleDesign] {
        designs(for: "rectangle").map { RectangleDesign(id: $0.id, name: $0.name) }
    }
}

protocol DesignSelection: WidgetConfigurationIntent {
    var widgetID: String? { get }
}

struct SquareSelection: DesignSelection {
    static var title: LocalizedStringResource = "Square widget"
    static var description = IntentDescription("Choose a saved Square design.")
    @Parameter(title: "Design") var design: SquareDesign?
    var widgetID: String? { design?.id }
    init() { }
}

struct RectangleSelection: DesignSelection {
    static var title: LocalizedStringResource = "Rectangle widget"
    static var description = IntentDescription("Choose a saved Rectangle design.")
    @Parameter(title: "Design") var design: RectangleDesign?
    var widgetID: String? { design?.id }
    init() { }
}

struct DesignEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let message: String
}

struct DesignProvider<Selection: DesignSelection>: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> DesignEntry {
        DesignEntry(date: .now, snapshot: nil, message: "Choose a design")
    }

    func snapshot(for configuration: Selection, in context: Context) async -> DesignEntry {
        await load(configuration)
    }

    func timeline(for configuration: Selection, in context: Context) async -> Timeline<DesignEntry> {
        let entry = await load(configuration)
        return Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
    }

    private func load(_ configuration: Selection) async -> DesignEntry {
        guard let widgetID = configuration.widgetID else {
            return DesignEntry(date: .now, snapshot: nil, message: "Touch and hold, then Edit Widget to choose a design")
        }
        let provider = AccountSession()
        let client = ConvexClientWithAuth<SessionTokens>(
            deploymentUrl: CompanionConfig.deploymentURL, authProvider: provider
        )
        guard case .success = await client.loginFromCache() else {
            return DesignEntry(date: .now, snapshot: nil, message: "Open Widget Now to sign in")
        }
        do {
            for try await snapshot in client.subscribe(
                to: "mobile:get", with: ["widgetId": widgetID], yielding: WidgetSnapshot.self
            ).first().values {
                return DesignEntry(date: .now, snapshot: snapshot, message: "")
            }
        } catch { }
        return DesignEntry(date: .now, snapshot: nil, message: "Open Widget Now to reconnect")
    }
}

struct DesignWidgetView: View {
    let entry: DesignEntry

    private var targetURL: URL? {
        if let sourceUrl = entry.snapshot?.sourceUrl,
           let url = URL(string: sourceUrl) {
            return url
        }
        return URL(string: "widgetnow://setup")
    }

    var body: some View {
        Group {
            if let snapshot = entry.snapshot {
                WidgetCanvas(snapshot: snapshot)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "square.grid.2x2.fill").font(.title2)
                    Text(entry.message).font(.caption).multilineTextAlignment(.center)
                }
                .padding()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .containerBackground(for: .widget) { Color(.secondarySystemBackground) }
            }
        }
        .widgetURL(targetURL)
    }
}

@main struct WidgetNowBundle: WidgetBundle {
    var body: some Widget {
        WidgetNowSquare()
        WidgetNowRectangle()
    }
}

struct WidgetNowSquare: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "WidgetNowSquare", intent: SquareSelection.self,
                               provider: DesignProvider<SquareSelection>()) { DesignWidgetView(entry: $0) }
            .configurationDisplayName("Widget Now · Square")
            .description("A saved Square design from your account.")
            .supportedFamilies([.systemSmall])
            .contentMarginsDisabled()
    }
}

struct WidgetNowRectangle: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "WidgetNowRectangle", intent: RectangleSelection.self,
                               provider: DesignProvider<RectangleSelection>()) { DesignWidgetView(entry: $0) }
            .configurationDisplayName("Widget Now · Rectangle")
            .description("A saved Rectangle design from your account.")
            .supportedFamilies([.systemMedium])
            .contentMarginsDisabled()
    }
}

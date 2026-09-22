import Combine
import ConvexMobile
import SwiftUI
import UIKit
import WidgetKit

@MainActor final class AccountModel: ObservableObject {
    @Published var signedIn = false
    @Published var loading = true
    @Published var error: String?
    @Published var widgets: [WidgetSummary] = []
    @Published var showSetup = false

    private let provider = AccountSession()
    private lazy var client = ConvexClientWithAuth<SessionTokens>(
        deploymentUrl: CompanionConfig.deploymentURL, authProvider: provider
    )
    private var subscription: AnyCancellable?
    private var pagesTask: Task<Void, Never>?

    func restore() async {
        if case .success = await client.loginFromCache() {
            if !signedIn { startCatalog() }
            WidgetCenter.shared.reloadAllTimelines()
        } else {
            subscription?.cancel()
            pagesTask?.cancel()
            signedIn = false
            loading = false
        }
    }

    func login(email: String, password: String) async {
        loading = true
        error = nil
        provider.prepareLogin(email: email.trimmingCharacters(in: .whitespacesAndNewlines), password: password)
        switch await client.login() {
        case .success: startCatalog()
        case .failure(let failure):
            error = failure.localizedDescription
            loading = false
        }
    }

    func loginWithGitHub() async {
        loading = true
        error = nil
        provider.prepareGitHub { url in try await GitHubBrowser.shared.authenticate(url) }
        switch await client.login() {
        case .success: startCatalog()
        case .failure(let failure):
            error = failure.localizedDescription
            loading = false
        }
    }

    func signOut() async {
        subscription?.cancel()
        pagesTask?.cancel()
        await client.logout()
        WidgetCatalog.save([])
        WidgetCenter.shared.reloadAllTimelines()
        widgets = []
        signedIn = false
    }

    private func startCatalog() {
        signedIn = true
        loading = false
        subscription = client.subscribe(
            to: "mobile:list", with: ["paginationOpts": paginationOptions(cursor: nil)], yielding: WidgetPage.self
        )
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { [weak self] completion in
                if case .failure(let failure) = completion {
                    self?.error = failure.localizedDescription
                }
            }, receiveValue: { [weak self] firstPage in
                self?.pagesTask?.cancel()
                self?.pagesTask = Task { await self?.loadCatalog(startingWith: firstPage) }
            })
    }

    private func loadCatalog(startingWith firstPage: WidgetPage) async {
        var entries = firstPage.page
        var page = firstPage
        do {
            while !page.isDone {
                if Task.isCancelled { return }
                for try await next in client.subscribe(
                    to: "mobile:list",
                    with: ["paginationOpts": paginationOptions(cursor: page.continueCursor)],
                    yielding: WidgetPage.self
                ).first().values {
                    page = next
                    entries += next.page
                }
            }
            if Task.isCancelled { return }
            widgets = entries
            WidgetCatalog.save(entries)
            WidgetCenter.shared.reloadAllTimelines()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func paginationOptions(cursor: String?) -> [String: ConvexEncodable?] {
        ["numItems": Double(100), "cursor": cursor]
    }
}

@main struct WidgetNowApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var account = AccountModel()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(account)
                .task(id: scenePhase) {
                    if scenePhase == .active { await account.restore() }
                }
                .onOpenURL { url in
                    if url.scheme == "http" || url.scheme == "https" {
                        UIApplication.shared.open(url)
                    } else if url.scheme == "widgetnow" && url.host == "setup" {
                        account.showSetup = true
                    }
                }
        }
    }
}

private struct ContentView: View {
    @EnvironmentObject private var account: AccountModel
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        Group {
            if !account.signedIn {
                SignInView(
                    email: $email,
                    password: $password,
                    loading: account.loading,
                    signIn: { Task { await account.login(email: email, password: password) } },
                    continueWithGitHub: { Task { await account.loginWithGitHub() } }
                )
            } else {
                  NavigationStack {
                    List {
                        Section {
                            Label("You're connected to Widget Now", systemImage: "checkmark.circle.fill")
                                .foregroundStyle(.green)
                            Text("Add a Widget Now Square or Rectangle to your Home Screen, then touch and hold it and choose Edit Widget to select one of your saved designs.")
                                .font(.subheadline)
                        }
                        Section("Your saved widgets") {
                            if account.widgets.isEmpty {
                                Text("No saved designs yet. Create one on the website, then it will appear here.")
                                    .foregroundStyle(.secondary)
                            }
                            ForEach(account.widgets) { widget in
                                HStack {
                                    Text(widget.name)
                                    Spacer()
                                    Text(Self.sizeLabel(widget.size)).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .navigationTitle("Widget Now")
                    .toolbar {
                        Button("Sign out") { Task { await account.signOut() } }
                    }
                  }
            }
        }
            .alert("Could not connect", isPresented: Binding(
                get: { account.error != nil },
                set: { if !$0 { account.error = nil } }
            )) { Button("OK") { account.error = nil } } message: {
                Text(account.error ?? "")
            }
            .alert("Choose a design", isPresented: $account.showSetup) {
                Button("Got it") { }
            } message: {
                Text("Touch and hold the Home Screen widget, tap Edit Widget, then choose a saved design matching its size. iOS keeps this selection separately for each widget.")
            }
    }

    private static func sizeLabel(_ size: String) -> String {
        switch size {
        case "square": "Square"
        case "rectangle": "Rectangle"
        default: "Widget"
        }
    }
}

private struct SignInView: View {
    @Binding var email: String
    @Binding var password: String
    let loading: Bool
    let signIn: () -> Void
    let continueWithGitHub: () -> Void

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(uiColor: .systemBackground).ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 12) {
                        Image(systemName: "square.grid.2x2.fill")
                            .font(.system(size: 44, weight: .semibold))
                            .foregroundStyle(.tint)
                            .padding(.bottom, 12)
                        Text("Widget Now")
                            .font(.title.bold())
                            .fixedSize(horizontal: false, vertical: true)
                        Text("Sign in with the same account you use on Widget Now.")
                            .foregroundStyle(.secondary)
                            .padding(.bottom, 12)
                        TextField("Email", text: $email)
                            .textContentType(.username)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .loginField()
                        SecureField("Password", text: $password)
                            .textContentType(.password)
                            .loginField()
                        LoginButton("Sign in", systemImage: "arrow.right", filled: true, action: signIn)
                            .disabled(email.isEmpty || password.isEmpty || loading)
                        LoginButton("Continue with GitHub", filled: false, action: continueWithGitHub)
                            .disabled(loading)
                        if loading {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                                .padding(.top, 4)
                        }
                    }
                    .frame(maxWidth: 480, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.top, 56)
                    .padding(.bottom, 32)
                    .frame(maxWidth: .infinity, minHeight: geometry.size.height, alignment: .top)
                }
                .scrollDismissesKeyboard(.interactively)
            }
        }
    }
}

private struct LoginButton: View {
    let title: String
    var systemImage: String? = nil
    let filled: Bool
    let action: () -> Void

    init(_ title: String, systemImage: String? = nil, filled: Bool, action: @escaping () -> Void) {
        self.title = title
        self.systemImage = systemImage
        self.filled = filled
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 9) {
                Text(title)
                if let systemImage {
                    Image(systemName: systemImage)
                }
            }
            .font(.body.weight(.medium))
            .frame(maxWidth: .infinity, minHeight: 50)
        }
        .buttonStyle(.plain)
        .foregroundStyle(filled ? Color(uiColor: .systemBackground) : Color.primary)
        .background(filled ? Color(uiColor: .label) : Color(uiColor: .secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay {
            if !filled {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color(uiColor: .separator), lineWidth: 1)
            }
        }
    }
}

private extension View {
    func loginField() -> some View {
        textFieldStyle(.plain)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(Color(uiColor: .secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color(uiColor: .separator), lineWidth: 1)
            }
    }
}

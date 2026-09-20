import AuthenticationServices
import UIKit

@MainActor final class GitHubBrowser: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GitHubBrowser()
    private var session: ASWebAuthenticationSession?

    func authenticate(_ url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "widgetnow") {
                [weak self] callback, error in
                Task { @MainActor in
                    self?.session = nil
                    if let callback { continuation.resume(returning: callback) }
                    else if let error {
                        let failure = error as NSError
                        if failure.domain == ASWebAuthenticationSessionError.errorDomain &&
                            failure.code == ASWebAuthenticationSessionError.Code.canceledLogin.rawValue {
                            continuation.resume(throwing: SessionError.githubCancelled)
                        } else {
                            continuation.resume(throwing: error)
                        }
                    } else {
                        continuation.resume(throwing: SessionError.invalidOAuthResponse)
                    }
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                continuation.resume(throwing: SessionError.githubFailed)
            }
        }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? UIWindow()
    }
}

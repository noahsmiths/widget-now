import ConvexMobile
import Foundation
import Security

struct SessionTokens: Codable {
    let accessToken: String
    let accessTokenExpiresAt: Double
    let refreshToken: String
    let refreshTokenExpiresAt: Double
    let userId: String
}

private struct PasswordResult: Decodable {
    let success: Bool
    let tokens: SessionTokens?
    let userError: PasswordError?
}

private struct PasswordError: Decodable {
    let error: String
}

private struct GitHubStart: Decodable {
    let redirect: String
    let state: String
}

enum SessionError: LocalizedError {
    case missingCredentials
    case invalidSession
    case wrongPassword
    case invalidOAuthResponse
    case githubCancelled
    case githubFailed

    var errorDescription: String? {
        switch self {
        case .missingCredentials: "Enter your email and password."
        case .invalidSession: "Your session expired. Please sign in again."
        case .wrongPassword: "Incorrect email or password."
        case .invalidOAuthResponse: "GitHub sign-in could not be completed. Please try again."
        case .githubCancelled: "GitHub sign-in was cancelled."
        case .githubFailed: "GitHub sign-in failed. Please try again."
        }
    }
}

enum SharedKeychain {
    private static var group: String {
        Bundle.main.object(forInfoDictionaryKey: "KeychainAccessGroup") as? String ?? ""
    }

    private static var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "WidgetNowSession",
         kSecAttrAccount as String: "account",
         kSecAttrAccessGroup as String: group]
    }

    static func read() -> SessionTokens? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var value: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &value) == errSecSuccess,
              let data = value as? Data else { return nil }
        return try? JSONDecoder().decode(SessionTokens.self, from: data)
    }

    static func save(_ tokens: SessionTokens) throws {
        let data = try JSONEncoder().encode(tokens)
        SecItemDelete(query as CFDictionary)
        var request = query
        request[kSecValueData as String] = data
        request[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(request as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    static func remove() {
        SecItemDelete(query as CFDictionary)
    }
}

final class AccountSession: AuthProvider {
    private let unauthenticated = ConvexClient(deploymentUrl: CompanionConfig.deploymentURL)
    private var credentials: (email: String, password: String)?
    private var githubBrowser: (@MainActor (URL) async throws -> URL)?

    func prepareLogin(email: String, password: String) {
        credentials = (email, password)
        githubBrowser = nil
    }

    func prepareGitHub(openBrowser: @escaping @MainActor (URL) async throws -> URL) {
        credentials = nil
        githubBrowser = openBrowser
    }

    func login(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> SessionTokens {
        let tokens: SessionTokens
        if let githubBrowser {
            self.githubBrowser = nil
            let start: GitHubStart = try await unauthenticated.mutation(
                "auth:startSignInGithub",
                with: ["redirectTo": CompanionConfig.siteURL + "/mobile/oauth/finish"]
            )
            guard let redirect = URL(string: start.redirect) else { throw SessionError.invalidOAuthResponse }
            let callback = try await githubBrowser(redirect)
            guard callback.scheme == "widgetnow", callback.host == "oauth",
                  let components = URLComponents(url: callback, resolvingAgainstBaseURL: false) else {
                throw SessionError.invalidOAuthResponse
            }
            if let oauthError = components.queryItems?.first(where: { $0.name == "convexAuthError" })?.value {
                throw oauthError == "access_denied" ? SessionError.githubCancelled : SessionError.githubFailed
            }
            guard let code = components.queryItems?.first(where: { $0.name == "convexAuthCode" })?.value,
                  !code.isEmpty else { throw SessionError.invalidOAuthResponse }
            guard let session: SessionTokens = try await unauthenticated.mutation(
                "auth:completeSignInGithub", with: ["code": code, "state": start.state]
            ) else { throw SessionError.invalidOAuthResponse }
            tokens = session
        } else {
            guard let credentials else { throw SessionError.missingCredentials }
            self.credentials = nil
            let result: PasswordResult = try await unauthenticated.mutation(
                "auth:signInWithPassword",
                with: ["username": credentials.email, "password": credentials.password]
            )
            guard result.success, let session = result.tokens else { throw SessionError.wrongPassword }
            tokens = session
        }
        try SharedKeychain.save(tokens)
        onIdToken(tokens.accessToken)
        return tokens
    }

    func loginFromCache(onIdToken: @Sendable @escaping (String?) -> Void) async throws -> SessionTokens {
        guard let existing = SharedKeychain.read() else { throw SessionError.invalidSession }
        if existing.accessTokenExpiresAt > Date().timeIntervalSince1970 * 1000 + 60_000 {
            onIdToken(existing.accessToken)
            return existing
        }
        let refreshed: SessionTokens? = try await unauthenticated.mutation(
            "auth:refreshSession", with: ["refreshToken": existing.refreshToken]
        )
        guard let refreshed else {
            SharedKeychain.remove()
            onIdToken(nil)
            throw SessionError.invalidSession
        }
        try SharedKeychain.save(refreshed)
        onIdToken(refreshed.accessToken)
        return refreshed
    }

    func extractIdToken(from authResult: SessionTokens) -> String {
        authResult.accessToken
    }

    func logout() async throws {
        if let token = SharedKeychain.read()?.refreshToken {
            try? await unauthenticated.mutation("auth:signOut", with: ["refreshToken": token])
        }
        SharedKeychain.remove()
        WidgetCatalog.save([])
    }
}

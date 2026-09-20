import { useState } from "react";
import {
  useOauth,
  useSignInWithGithub,
  type OauthFlowErrorCode,
} from "@convex-dev/auth/providers/oauth/react";
import {
  useSignInWithPassword,
  useSignUpWithPassword,
} from "@convex-dev/auth/providers/password/react";
import { api } from "../convex/_generated/api";
import { ArrowRight } from "lucide-react";

const OAUTH_ERROR_MESSAGES: Record<OauthFlowErrorCode, string> = {
  access_denied: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  rejected: "Sign-in was declined.",
  oauth_error: "Something went wrong during sign-in. Please try again.",
  invalid_flow: "This sign-in can't be completed here. Please try again.",
};

export function SignInForm() {
  const { signIn, pending: signInPending } = useSignInWithPassword(
    api.auth.signInWithPassword,
  );
  const { signUp, pending: signUpPending } = useSignUpWithPassword(
    api.auth.signUpWithPassword,
  );
  const { signInGithub } = useSignInWithGithub(api.auth);
  const { flowError } = useOauth();
  const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);
  const pending = signInPending || signUpPending;
  const visibleError =
    error ??
    (flowError === null
      ? null
      : (flowError.message ?? OAUTH_ERROR_MESSAGES[flowError.code]));

  return (
    <div className="auth-card">
      <div>
        <h2>{flow === "signIn" ? "Sign in" : "Create an account"}</h2>
      </div>
      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const formData = new FormData(e.currentTarget);
          const email = formData.get("email") as string;
          const password = formData.get("password") as string;
          const request =
            flow === "signIn"
              ? signIn({ username: email, password })
              : signUp({ username: email, password });
          void request
            .then((result) => {
              if (!result.success) {
                setError(passwordErrorMessage(result.userError.error));
              }
            })
            .catch(() => setError("Sign-in failed. Please try again."));
        }}
      >
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="email"
          aria-label="Email"
          autoComplete="username"
          name="email"
          placeholder="Email"
          required
          disabled={pending}
        />
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="password"
          aria-label="Password"
          autoComplete={flow === "signIn" ? "current-password" : "new-password"}
          minLength={flow === "signUp" ? 10 : undefined}
          name="password"
          placeholder="Password"
          required
          disabled={pending}
        />
        <button className="primary" type="submit" disabled={pending}>
          {pending
            ? "Please wait…"
            : flow === "signIn"
              ? "Sign in"
              : "Create account"}
          <ArrowRight size={16} />
        </button>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setError(null);
            void signInGithub().catch(() =>
              setError("GitHub sign-in failed. Please try again."),
            );
          }}
        >
          Continue with GitHub
        </button>
        <div className="auth-switch">
          <button
            type="button"
            disabled={pending}
            className="text-button underline"
            onClick={() => {
              setError(null);
              setFlow(flow === "signIn" ? "signUp" : "signIn");
            }}
          >
            {flow === "signIn" ? "Create an account" : "Sign in"}
          </button>
        </div>
        {visibleError && (
          <div className="alert" role="alert">
            <p className="text-dark dark:text-light font-mono text-xs">
              Error signing in: {visibleError}
            </p>
          </div>
        )}
      </form>
    </div>
  );
}

function passwordErrorMessage(error: string) {
  switch (error) {
    case "USER_NOT_FOUND":
    case "INVALID_CREDENTIALS":
      return "Incorrect email or password.";
    case "USERNAME_TAKEN":
      return "An account already exists with this email.";
    case "PASSWORD_TOO_SHORT":
      return "Password must be at least 10 characters.";
    case "PASSWORD_TOO_LONG":
      return "Password must be at most 100 characters.";
    case "PASSWORD_HAS_SURROUNDING_WHITESPACE":
      return "Password can't start or end with whitespace.";
    case "PASSWORD_TOO_COMMON":
      return "Please choose a less common password.";
    case "RATE_LIMITED":
      return "Too many attempts. Please try again shortly.";
    default:
      return "Something went wrong. Please try again.";
  }
}

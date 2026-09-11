"use client";

import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  useOauth,
  useSignInWithGithub,
  type OauthFlowErrorCode,
} from "@convex-dev/auth/providers/oauth/react";
import {
  useSignInWithPassword,
  useSignUpWithPassword,
} from "@convex-dev/auth/providers/password/react";
import { useState } from "react";

const OAUTH_ERROR_MESSAGES: Record<OauthFlowErrorCode, string> = {
  access_denied: "Sign-in was cancelled.",
  expired: "That sign-in took too long. Please try again.",
  rejected: "Sign-in was declined.",
  oauth_error: "Something went wrong during sign-in. Please try again.",
  invalid_flow: "This sign-in can't be completed here. Please try again.",
};

export default function App() {
  return (
    <>
      <header className="sticky top-0 z-10 bg-light dark:bg-dark p-4 border-b-2 border-slate-200 dark:border-slate-800">
        Convex + React + Convex Auth
        <SignOutButton />
      </header>
      <main className="p-8 flex flex-col gap-16">
        <h1 className="text-4xl font-bold text-center">
          Convex + React + Convex Auth
        </h1>
        <Authenticated>
          <Content />
        </Authenticated>
        <Unauthenticated>
          <SignInForm />
        </Unauthenticated>
      </main>
    </>
  );
}

function SignOutButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  return (
    <>
      {isAuthenticated && (
        <button
          className="bg-slate-200 dark:bg-slate-800 text-dark dark:text-light rounded-md px-2 py-1"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      )}
    </>
  );
}

function SignInForm() {
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
    <div className="flex flex-col gap-8 w-96 mx-auto">
      <p>Log in to see the numbers</p>
      <form
        className="flex flex-col gap-2"
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
          void request.then((result) => {
            if (!result.success) {
              setError(passwordErrorMessage(result.userError.error));
            }
          });
        }}
      >
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="email"
          name="email"
          placeholder="Email"
          required
          disabled={pending}
        />
        <input
          className="bg-light dark:bg-dark text-dark dark:text-light rounded-md p-2 border-2 border-slate-200 dark:border-slate-800"
          type="password"
          name="password"
          placeholder="Password"
          required
          disabled={pending}
        />
        <button
          className="bg-dark dark:bg-light text-light dark:text-dark rounded-md"
          type="submit"
          disabled={pending}
        >
          {flow === "signIn" ? "Sign in" : "Sign up"}
        </button>
        <button
          className="bg-dark dark:bg-light text-light dark:text-dark rounded-md"
          type="button"
          onClick={() => {
            setError(null);
            void signInGithub().catch(() => {});
          }}
        >
          Login with GitHub
        </button>
        <div className="flex flex-row gap-2">
          <span>
            {flow === "signIn"
              ? "Don't have an account?"
              : "Already have an account?"}
          </span>
          <span
            className="text-dark dark:text-light underline hover:no-underline cursor-pointer"
            onClick={() => setFlow(flow === "signIn" ? "signUp" : "signIn")}
          >
            {flow === "signIn" ? "Sign up instead" : "Sign in instead"}
          </span>
        </div>
        {visibleError && (
          <div className="bg-red-500/20 border-2 border-red-500/50 rounded-md p-2">
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

function Content() {
  const { viewer, numbers } =
    useQuery(api.myFunctions.listNumbers, {
      count: 10,
    }) ?? {};
  const addNumber = useMutation(api.myFunctions.addNumber);

  if (viewer === undefined || numbers === undefined) {
    return (
      <div className="mx-auto">
        <p>loading... (consider a loading skeleton)</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 max-w-lg mx-auto">
      <p>Welcome {viewer ?? "Anonymous"}!</p>
      <p>
        Click the button below and open this page in another window - this data
        is persisted in the Convex cloud database!
      </p>
      <p>
        <button
          className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
          onClick={() => {
            void addNumber({ value: Math.floor(Math.random() * 10) });
          }}
        >
          Add a random number
        </button>
      </p>
      <p>
        Numbers:{" "}
        {numbers?.length === 0
          ? "Click the button!"
          : (numbers?.join(", ") ?? "...")}
      </p>
      <p>
        Edit{" "}
        <code className="text-sm font-bold font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded-md">
          convex/myFunctions.ts
        </code>{" "}
        to change your backend
      </p>
      <p>
        Edit{" "}
        <code className="text-sm font-bold font-mono bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded-md">
          src/App.tsx
        </code>{" "}
        to change your frontend
      </p>
      <div className="flex flex-col">
        <p className="text-lg font-bold">Useful resources:</p>
        <div className="flex gap-2">
          <div className="flex flex-col gap-2 w-1/2">
            <ResourceCard
              title="Convex docs"
              description="Read comprehensive documentation for all Convex features."
              href="https://docs.convex.dev/home"
            />
            <ResourceCard
              title="Stack articles"
              description="Learn about best practices, use cases, and more from a growing
            collection of articles, videos, and walkthroughs."
              href="https://www.typescriptlang.org/docs/handbook/2/basic-types.html"
            />
          </div>
          <div className="flex flex-col gap-2 w-1/2">
            <ResourceCard
              title="Templates"
              description="Browse our collection of templates to get started quickly."
              href="https://www.convex.dev/templates"
            />
            <ResourceCard
              title="Discord"
              description="Join our developer community to ask questions, trade tips & tricks,
            and show off your projects."
              href="https://www.convex.dev/community"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResourceCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex flex-col gap-2 bg-slate-200 dark:bg-slate-800 p-4 rounded-md h-28 overflow-auto">
      <a href={href} className="text-sm underline hover:no-underline">
        {title}
      </a>
      <p className="text-xs">{description}</p>
    </div>
  );
}

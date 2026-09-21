import { Component, useEffect, useState, type ReactNode } from "react";
import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Grid2X2,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { sizes, type WidgetDefinitionV1 } from "../shared/widget";
import { WidgetRenderer } from "./WidgetRenderer";
import { WidgetEditor } from "./WidgetEditor";
import { SignInForm } from "./SignInForm";
import { errorMessage, timeLabel } from "./ui";
import { permitNavigation } from "./navigation";

type Route =
  | { kind: "library" }
  | { kind: "create" }
  | { kind: "source"; id: Id<"sources"> }
  | { kind: "widget"; id: Id<"widgets"> };
function readRoute(): Route {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const widget = params.get("widget");
  const source = params.get("source");
  if (widget) return { kind: "widget", id: widget as Id<"widgets"> };
  if (source) return { kind: "source", id: source as Id<"sources"> };
  return params.has("create") ? { kind: "create" } : { kind: "library" };
}

export default function App() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signOut } = useAuthActions();
  const [route, setRoute] = useState<Route>(readRoute);
  useEffect(() => {
    const update = (event: HashChangeEvent) => {
      if (permitNavigation()) setRoute(readRoute());
      else window.history.replaceState(null, "", event.oldURL);
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function navigate(next: Route, confirmed = false) {
    if (!confirmed && !permitNavigation()) return;
    setRoute(next);
    window.location.hash =
      next.kind === "widget"
        ? `widget=${next.id}`
        : next.kind === "source"
          ? `source=${next.id}`
          : next.kind === "create"
            ? "create"
            : "";
  }
  const home = () => navigate({ kind: "library" });
  const confirmedHome = () => navigate({ kind: "library" }, true);
  return (
    <div className="app">
      <header className="app-header">
        <button className="brand" onClick={home}>
          <span className="brand-icon">
            <Grid2X2 size={19} />
          </span>
          widget<span className="brand-now">now</span>
        </button>
        <nav>
          {isAuthenticated && (
            <>
              <button
                className={route.kind === "library" ? "nav-active" : ""}
                onClick={home}
              >
                Widgets
              </button>
              <button onClick={() => navigate({ kind: "create" })}>
                Create
              </button>
            </>
          )}
        </nav>
        <div className="header-right">
          {isAuthenticated ? (
            <>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() => {
                  if (permitNavigation()) void signOut().then(confirmedHome);
                }}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : null}
        </div>
      </header>
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Unauthenticated>
            <main className="auth-layout">
              <div className="auth-story">
                <h1>
                  Websites you follow.
                  <br />
                  <em>In one place.</em>
                </h1>
                <p>Turn a public page into a live, editable widget.</p>
              </div>
              <SignInForm />
            </main>
          </Unauthenticated>
          <Authenticated>
            <main className="workspace">
              <RouteBoundary
                key={
                  route.kind === "source" || route.kind === "widget"
                    ? route.id
                    : route.kind
                }
                onBack={home}
              >
                {route.kind === "library" ? (
                  <Library
                    onCreate={() => navigate({ kind: "create" })}
                    onWidget={(id) => navigate({ kind: "widget", id })}
                    onSource={(id) => navigate({ kind: "source", id })}
                  />
                ) : route.kind === "create" ? (
                  <CreateWidget
                    onBack={home}
                    onCreated={(id) => navigate({ kind: "source", id })}
                  />
                ) : route.kind === "source" ? (
                  <SourceView
                    sourceId={route.id}
                    onBack={home}
                    onWidget={(id) => navigate({ kind: "widget", id })}
                  />
                ) : (
                  <SavedWidget widgetId={route.id} onBack={confirmedHome} />
                )}
              </RouteBoundary>
            </main>
          </Authenticated>
        </>
      )}
    </div>
  );
}

function Library({
  onCreate,
  onWidget,
  onSource,
}: {
  onCreate: () => void;
  onWidget: (id: Id<"widgets">) => void;
  onSource: (id: Id<"sources">) => void;
}) {
  const widgets = usePaginatedQuery(
    api.widgets.list,
    {},
    { initialNumItems: 12 },
  );
  const sources = usePaginatedQuery(
    api.sources.list,
    {},
    { initialNumItems: 8 },
  );
  const remove = useMutation(api.widgets.remove);
  const removeGeneration = useMutation(api.sources.remove);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>My widgets</h1>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={17} />
          Create a widget
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {widgets.status === "LoadingFirstPage" ? (
        <Loading />
      ) : widgets.results.length ? (
        <>
          <div className="library-grid">
            {widgets.results.map((widget) => (
              <div className="library-card" key={widget._id}>
                <button
                  className="library-card-main"
                  onClick={() => onWidget(widget._id)}
                >
                  <LibraryPreview widget={widget} />
                  <div className="library-card-caption">
                    <h3>{widget.name}</h3>
                    <span>
                      {sizes[widget.definition.size].label} ·{" "}
                      {timeLabel(widget.updatedAt)}
                    </span>
                  </div>
                </button>
                <button
                  className="icon-button delete-widget"
                  aria-label={`Delete ${widget.name}`}
                  onClick={() => {
                    if (window.confirm(`Delete “${widget.name}”?`))
                      void remove({ widgetId: widget._id }).catch(
                        (err: unknown) => setError(errorMessage(err)),
                      );
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
          {widgets.status === "CanLoadMore" && (
            <button
              className="secondary load-more"
              onClick={() => widgets.loadMore(12)}
            >
              Load more widgets
            </button>
          )}
        </>
      ) : (
        <div className="library-empty">
          <h2>No widgets yet</h2>
          <p>Add a public website to get started.</p>
        </div>
      )}
      {sources.results.length > 0 && (
        <section className="recent-sources">
          <div className="section-heading">
            <h2>Recent generations</h2>
          </div>
          {sources.results.map((source) => (
            <div className="source-row" key={source._id}>
              <button
                className="source-row-main"
                onClick={() => onSource(source._id)}
              >
                <span className="source-row-icon">
                  <Globe size={18} />
                </span>
                <div>
                  <strong>{source.title}</strong>
                  <p>{source.url}</p>
                </div>
                <span
                  className={`status-pill ${source.status === "failed" ? "status-error" : ""}`}
                >
                  {source.status === "ready"
                    ? "Ready to customize"
                    : source.status === "failed"
                      ? "Needs a retry"
                      : source.status}
                </span>
                <ArrowRight size={16} />
              </button>
              <button
                className="icon-button delete-generation"
                aria-label={`Delete generation ${source.title}`}
                onClick={() => {
                  if (window.confirm(`Delete generation “${source.title}”?`))
                    void removeGeneration({ sourceId: source._id }).catch(
                      (err: unknown) => setError(errorMessage(err)),
                    );
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {sources.status === "CanLoadMore" && (
            <button className="text-button" onClick={() => sources.loadMore(8)}>
              More generations
            </button>
          )}
        </section>
      )}
    </>
  );
}
function LibraryPreview({ widget }: { widget: Doc<"widgets"> }) {
  const source = useQuery(api.sources.get, { sourceId: widget.sourceId });
  return (
    <div className="library-preview">
      <WidgetRenderer
        definition={widget.definition}
        fields={source?.fields ?? []}
        width={widget.definition.size === "rectangle" ? 264 : 192}
      />
      <span
        className={`preview-status ${source?.fields.some((field) => field.stale) ? "stale" : ""}`}
      >
        <span className="live-dot" />
        {source?.refreshing
          ? "Refreshing"
          : source?.fields.some((field) => field.stale)
            ? "Stale data"
            : "Live"}
      </span>
    </div>
  );
}

function CreateWidget({
  onBack,
  onCreated,
}: {
  onBack: () => void;
  onCreated: (id: Id<"sources">) => void;
}) {
  const start = useMutation(api.sources.start);
  const [url, setUrl] = useState("");
  const [blurb, setBlurb] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="creation-layout">
      <div className="creation-story">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          My widgets
        </button>
        <h1>Create a widget</h1>
        <p>Start with a public website.</p>
      </div>
      <form
        className="creation-card"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          void start({ url, blurb })
            .then(onCreated)
            .catch((err: unknown) => setError(errorMessage(err)))
            .finally(() => setPending(false));
        }}
      >
        <h2>Website details</h2>
        <label>
          Website link
          <input
            type="url"
            placeholder="https://your-favorite-site.com/page"
            required
            maxLength={2000}
            value={url}
            disabled={pending}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
        <label>
          What would you like to see?<span className="optional">Optional</span>
          <textarea
            placeholder="e.g. The current temperature, conditions, and humidity in Brooklyn"
            maxLength={2000}
            rows={2}
            value={blurb}
            disabled={pending}
            onChange={(event) => setBlurb(event.target.value)}
          />
        </label>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={pending}>
          {pending && <LoaderCircle size={17} className="spin" />}
          {pending ? "Connecting…" : "Generate my widgets"}
          <ArrowRight size={16} />
        </button>
      </form>
    </div>
  );
}

function SourceView({
  sourceId,
  onBack,
  onWidget,
}: {
  sourceId: Id<"sources">;
  onBack: () => void;
  onWidget: (id: Id<"widgets">) => void;
}) {
  const source = useQuery(api.sources.get, { sourceId });
  const existingWidgetId = useQuery(api.widgets.forSource, { sourceId });
  const retry = useMutation(api.sources.retry);
  const [candidate, setCandidate] = useState<WidgetDefinitionV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!candidate && existingWidgetId) onWidget(existingWidgetId);
  }, [candidate, existingWidgetId, onWidget]);
  if (!source) return <Loading />;
  if (candidate)
    return (
      <WidgetEditor
        source={source}
        initialDefinition={candidate}
        onBack={() => {
          if (source.savedCount > 0) {
            onBack();
            return;
          }
          setCandidate(null);
          window.history.replaceState(null, "", `#source=${sourceId}`);
        }}
      />
    );
  if (existingWidgetId === undefined || existingWidgetId) return <Loading />;
  if (source.status === "failed")
    return (
      <div className="generation-state">
        <span className="generation-icon">
          <Globe size={28} />
        </span>
        <h2>We couldn’t finish this widget.</h2>
        <p className="alert" role="alert">
          {source.error}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="row">
          <button className="secondary" onClick={onBack}>
            My widgets
          </button>
          <button
            className="primary"
            onClick={() => {
              void retry({ sourceId }).catch((err: unknown) =>
                setError(errorMessage(err)),
              );
            }}
          >
            <RefreshCw size={16} />
            Retry generation
          </button>
        </div>
      </div>
    );
  if (source.status !== "ready")
    return (
      <div className="generation-state">
        <h2>Creating your widgets</h2>
        <p>{new URL(source.url).hostname}</p>
        <div className="generation-progress">
          {[
            { status: "scraping", label: "Reading your website" },
            { status: "extracting", label: "Finding the useful details" },
            { status: "designing", label: "Designing your widgets" },
          ].map((step, index) => {
            const current = ["scraping", "extracting", "designing"].indexOf(
              source.status,
            );
            return (
              <div
                key={step.status}
                className={index <= current ? "progress-active" : ""}
              >
                {index < current ? (
                  <Check size={17} />
                ) : index === current ? (
                  <LoaderCircle size={17} className="spin" />
                ) : (
                  <span className="progress-dot" />
                )}
                {step.label}
              </div>
            );
          })}
        </div>
        <p className="panel-description">
          You can leave this page. Your generation will keep going.
        </p>
        <button className="text-button" onClick={onBack}>
          Back to my widgets
        </button>
      </div>
    );
  return (
    <>
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={15} />
        My widgets
      </button>
      <div className="page-heading">
        <div>
          <h1>Choose a design</h1>
          <p>{source.fields.length} fields found · Customize after choosing</p>
        </div>
        <span className="connected-pill">
          <span className="live-dot" />
          {new URL(source.url).hostname}
        </span>
      </div>
      <div className="candidate-grid">
        {source.candidates.map((definition) => (
          <div className="candidate-card" key={definition.size}>
            <div className="candidate-preview">
              <WidgetRenderer
                definition={definition}
                fields={source.fields}
                width={definition.size === "rectangle" ? 280 : 224}
              />
            </div>
            <div className="candidate-info">
              <div>
                <h3>{sizes[definition.size].label}</h3>
                <span>
                  {
                    definition.elements.filter(
                      (element) => element.kind === "data",
                    ).length
                  }{" "}
                  live fields
                </span>
              </div>
              <button
                className="secondary"
                onClick={() => setCandidate(definition)}
              >
                Customize
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
function SavedWidget({
  widgetId,
  onBack,
}: {
  widgetId: Id<"widgets">;
  onBack: () => void;
}) {
  const data = useQuery(api.widgets.get, { widgetId });
  return data ? (
    <WidgetEditor
      source={data.source}
      widget={data.widget}
      initialDefinition={data.widget.definition}
      onBack={onBack}
    />
  ) : (
    <Loading />
  );
}
function Loading() {
  return (
    <div className="loading">
      <LoaderCircle size={24} className="spin" />
      <span>Loading your world…</span>
    </div>
  );
}
class RouteBoundary extends Component<
  { children: ReactNode; onBack: () => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: errorMessage(error) };
  }
  render() {
    return this.state.error ? (
      <div className="generation-state">
        <h2>This page couldn’t be opened.</h2>
        <p role="alert">{this.state.error}</p>
        <button className="primary" onClick={this.props.onBack}>
          Back to my widgets
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}

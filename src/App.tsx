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
  Sparkles,
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
          <span className="beta">BETA</span>
        </button>
        <nav>
          {isAuthenticated && (
            <>
              <button
                className={route.kind === "library" ? "nav-active" : ""}
                onClick={home}
              >
                My widgets
              </button>
              <button onClick={() => navigate({ kind: "create" })}>
                Create a widget
              </button>
            </>
          )}
        </nav>
        <div className="header-right">
          <span className="live-dot" />
          {isAuthenticated ? (
            <>
              <span>Your world, at a glance</span>
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
          ) : (
            <span>Little widgets. Live possibilities.</span>
          )}
        </div>
      </header>
      {isLoading ? (
        <Loading />
      ) : (
        <>
          <Unauthenticated>
            <main className="auth-layout">
              <div className="auth-story">
                <span className="eyebrow">THE WEB, A LITTLE CLOSER</span>
                <h1>
                  Your favorite websites.
                  <br />
                  <em>In a widget.</em>
                </h1>
                <p>
                  Turn the information you care about into beautiful little
                  windows that stay up to date.
                </p>
                <div className="auth-samples">
                  <SampleWidgets />
                </div>
                <div className="feature-row">
                  <span>
                    <Check size={14} />
                    Live website data
                  </span>
                  <span>
                    <Check size={14} />
                    Made yours
                  </span>
                  <span>
                    <Check size={14} />
                    Always current
                  </span>
                </div>
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
                  <SourceView sourceId={route.id} onBack={home} />
                ) : (
                  <SavedWidget widgetId={route.id} onBack={confirmedHome} />
                )}
              </RouteBoundary>
            </main>
          </Authenticated>
        </>
      )}
      <footer className="app-footer">
        <span>Made for the things you keep checking.</span>
        <span>widget now · v1</span>
      </footer>
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
          <span className="eyebrow">YOUR PERSONAL COLLECTION</span>
          <h1>
            My widgets<span className="heading-dot">.</span>
          </h1>
          <p>A little less searching. A little more knowing.</p>
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
          <div className="empty-samples">
            <SampleWidgets />
          </div>
          <span className="eyebrow">A WINDOW INTO WHAT MATTERS</span>
          <h2>Your first widget is one link away.</h2>
          <p>
            The weather. A price you’re watching. Your favorite team.
            <br />
            Bring the bits of the web you love into one place.
          </p>
          <button className="primary" onClick={onCreate}>
            <Sparkles size={17} />
            Make my first widget
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      {sources.results.length > 0 && (
        <section className="recent-sources">
          <div className="section-heading">
            <h2>Recent generations</h2>
            <span>Pick up where you left off</span>
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
        width={widget.definition.size === "2x4" ? 264 : 192}
      />
      <span
        className={`preview-status ${source?.fields.some((field) => field.stale) ? "stale" : ""}`}
      >
        <span className="live-dot" />
        {source?.refreshing
          ? "Refreshing"
          : source?.fields.some((field) => field.stale)
            ? "Stale data"
            : "Live · every 15 min"}
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
        <span className="eyebrow">FROM WEBSITE TO WIDGET</span>
        <h1>
          Keep the good bits.
          <br />
          <em>Skip the searching.</em>
        </h1>
        <p>
          Drop in a link. We’ll find the useful data and suggest three beautiful
          ways to see it. You make it yours.
        </p>
        <div className="creation-steps">
          {[
            "Connect a website",
            "Choose a starting point",
            "Make it your own",
          ].map((step, index) => (
            <div key={step}>
              <span>{index + 1}</span>
              {step}
            </div>
          ))}
        </div>
        <SampleWidgets />
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
        <div className="creation-card-icon">
          <Globe size={23} />
        </div>
        <h2>What’s your widget about?</h2>
        <p>
          Start with a public page that has the information you want to follow.
        </p>
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
            rows={4}
            value={blurb}
            disabled={pending}
            onChange={(event) => setBlurb(event.target.value)}
          />
        </label>
        <p className="form-hint">
          Be specific, or leave it to us to find the highlights.
        </p>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={pending}>
          {pending ? (
            <LoaderCircle size={17} className="spin" />
          ) : (
            <Sparkles size={17} />
          )}
          {pending ? "Connecting…" : "Generate my widgets"}
          <ArrowRight size={16} />
        </button>
        <span className="creation-note">
          <span className="live-dot" />
          Live data. Three sizes. Endless possibilities.
        </span>
      </form>
    </div>
  );
}

function SourceView({
  sourceId,
  onBack,
}: {
  sourceId: Id<"sources">;
  onBack: () => void;
}) {
  const source = useQuery(api.sources.get, { sourceId });
  const retry = useMutation(api.sources.retry);
  const [candidate, setCandidate] = useState<WidgetDefinitionV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!source) return <Loading />;
  if (candidate)
    return (
      <WidgetEditor
        source={source}
        initialDefinition={candidate}
        onBack={() => {
          setCandidate(null);
          window.history.replaceState(null, "", `#source=${sourceId}`);
        }}
      />
    );
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
        <span className="generation-icon">
          <Sparkles size={28} className="pulse" />
        </span>
        <span className="eyebrow">A LITTLE MAGIC IN PROGRESS</span>
        <h2>Your website, taking a new shape.</h2>
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
          <span className="eyebrow">THREE WAYS TO SEE YOUR WORLD</span>
          <h1>
            Choose a starting point<span className="heading-dot">.</span>
          </h1>
          <p>
            We found {source.fields.length} data points. Pick a design, then
            change anything.
          </p>
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
                width={definition.size === "2x4" ? 280 : 224}
              />
            </div>
            <div className="candidate-info">
              <div>
                <h3>{sizes[definition.size].label}</h3>
                <span>
                  {definition.size.replace("x", " × ")} ·{" "}
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
      <p className="candidate-note">
        <Sparkles size={15} />A suggestion is just the beginning. All extracted
        fields are available in the editor.
      </p>
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
function SampleWidgets() {
  const fields = [
    {
      id: "temperature",
      label: "Temperature",
      description: "",
      type: "number" as const,
      value: 24,
      unit: "°",
      excerpt: "",
      stale: false,
      observedAt: 0,
    },
    {
      id: "price",
      label: "S&P 500",
      description: "",
      type: "number" as const,
      value: 5872.16,
      unit: "",
      excerpt: "",
      stale: false,
      observedAt: 0,
    },
  ];
  const style = {
    color: "#ffffff",
    fontSize: 38,
    fontWeight: 500 as const,
    align: "left" as const,
    wrap: false,
    opacity: 1,
  };
  const weather: WidgetDefinitionV1 = {
    version: 1,
    size: "1x1",
    background: "#234d42",
    theme: "dark",
    elements: [
      {
        id: "city",
        kind: "text",
        text: "Brooklyn",
        frame: { x: 0.12, y: 0.1, width: 0.7, height: 0.13 },
        style: { ...style, fontSize: 13 },
      },
      {
        id: "sun",
        kind: "icon",
        icon: "sun",
        frame: { x: 0.67, y: 0.33, width: 0.23, height: 0.23 },
        style: { ...style, fontSize: 32, color: "#e9d697" },
      },
      {
        id: "temp",
        kind: "data",
        fieldId: "temperature",
        label: "",
        showLabel: false,
        showUnit: true,
        precision: 0,
        frame: { x: 0.1, y: 0.27, width: 0.55, height: 0.36 },
        style: { ...style, fontSize: 48 },
      },
      {
        id: "desc",
        kind: "text",
        text: "Mostly sunny\nA good day to get outside.",
        frame: { x: 0.12, y: 0.7, width: 0.8, height: 0.23 },
        style: { ...style, fontSize: 10, wrap: true, opacity: 0.85 },
      },
    ],
  };
  const market: WidgetDefinitionV1 = {
    version: 1,
    size: "1x1",
    background: "#f1ece3",
    theme: "light",
    elements: [
      {
        id: "title",
        kind: "text",
        text: "Market watch",
        frame: { x: 0.12, y: 0.12, width: 0.8, height: 0.14 },
        style: { ...style, fontSize: 12, color: "#394e42" },
      },
      {
        id: "price",
        kind: "data",
        fieldId: "price",
        label: "S&P 500",
        showLabel: true,
        showUnit: false,
        precision: 2,
        frame: { x: 0.12, y: 0.35, width: 0.8, height: 0.34 },
        style: { ...style, fontSize: 25, color: "#203c2e" },
      },
      {
        id: "trend",
        kind: "text",
        text: "↗ +1.24% today",
        frame: { x: 0.12, y: 0.75, width: 0.8, height: 0.13 },
        style: { ...style, fontSize: 12, color: "#52785b" },
      },
    ],
  };
  return (
    <div
      className="sample-widgets"
      aria-label="Example widgets with illustrative data"
    >
      <WidgetRenderer definition={weather} fields={fields} width={160} />
      <WidgetRenderer definition={market} fields={fields} width={160} />
      <span className="sample-label">
        A few possibilities · illustrative data
      </span>
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

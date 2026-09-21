import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  Bell,
  Check,
  Globe,
  LoaderCircle,
  LogOut,
  PictureInPicture2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { sizes, type WidgetDefinitionV1 } from "../shared/widget";
import { WidgetRenderer } from "./WidgetRenderer";
import { WidgetEditor } from "./WidgetEditor";
import { EmailWatch } from "./EmailWatch";
import { SignInForm } from "./SignInForm";
import { confirmWidgetDeletion, errorMessage } from "./ui";
import { permitNavigation } from "./navigation";

type Route =
  | { kind: "library" }
  | { kind: "create" }
  | { kind: "source"; id: Id<"sources"> }
  | { kind: "widget"; id: Id<"widgets"> };
type PictureInPictureSelection = "all" | Id<"widgets">;

function galleryWidgetWidth(size: WidgetDefinitionV1["size"]) {
  return size === "rectangle" ? 384 : 192;
}

function preparePictureInPictureDocument(target: Document) {
  target.title = "Widget Now";
  target.body.className = "pip-body";
  document.head
    .querySelectorAll<HTMLLinkElement | HTMLStyleElement>(
      'link[rel="stylesheet"], style',
    )
    .forEach((node) => {
      const copy = node.cloneNode(true) as HTMLLinkElement | HTMLStyleElement;
      if (copy instanceof HTMLLinkElement)
        copy.href = (node as HTMLLinkElement).href;
      target.head.appendChild(copy);
    });
}

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
          <img className="brand-icon" src="/widget.svg" alt="" />
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
                    onDeleted={confirmedHome}
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
  const generations = usePaginatedQuery(
    api.sources.list,
    {},
    { initialNumItems: 24 },
  );
  const remove = useMutation(api.widgets.remove);
  const [widgetOrder, setWidgetOrder] = useState<Id<"widgets">[]>(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem("widget-gallery-order") ?? "[]",
      );
      return Array.isArray(stored)
        ? stored.filter((id): id is Id<"widgets"> => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [draggingWidgetId, setDraggingWidgetId] =
    useState<Id<"widgets"> | null>(null);
  const [dropTargetId, setDropTargetId] = useState<Id<"widgets"> | null>(null);
  const [generationsOpen, setGenerationsOpen] = useState(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipSelection, setPipSelection] =
    useState<PictureInPictureSelection | null>(null);
  const [deletingWidgetId, setDeletingWidgetId] =
    useState<Id<"widgets"> | null>(null);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const draggedFromGallery = useRef(false);
  const pipWindowRef = useRef<Window | null>(null);
  const generationMenuRef = useRef<HTMLDivElement>(null);
  const widgetIds = widgets.results.map((widget) => widget._id);
  const pictureInPictureSupported = "documentPictureInPicture" in window;

  useEffect(() => {
    window.localStorage.setItem("widget-gallery-order", JSON.stringify(widgetOrder));
  }, [widgetOrder]);

  useEffect(() => {
    if (!generationsOpen) return;
    const close = (event: PointerEvent) => {
      if (!generationMenuRef.current?.contains(event.target as Node))
        setGenerationsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setGenerationsOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [generationsOpen]);

  useEffect(
    () => () => {
      pipWindowRef.current?.close();
    },
    [],
  );

  const visibleWidgetOrder = [
    ...widgetOrder,
    ...widgetIds.filter((id) => !widgetOrder.includes(id)),
  ];
  const orderIndex = new Map(
    visibleWidgetOrder.map((id, index) => [id, index]),
  );
  const orderedWidgets = [...widgets.results].sort(
    (left, right) =>
      (orderIndex.get(left._id) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(right._id) ?? Number.MAX_SAFE_INTEGER),
  );
  const pipWidgets =
    pipSelection === "all"
      ? orderedWidgets
      : orderedWidgets.filter((widget) => widget._id === pipSelection);

  useEffect(() => {
    if (
      pipWindow &&
      pipSelection === "all" &&
      widgets.status === "CanLoadMore"
    )
      widgets.loadMore(12);
  }, [pipSelection, pipWindow, widgets]);

  async function openPictureInPicture(
    selection: PictureInPictureSelection,
  ) {
    const api = window.documentPictureInPicture;
    if (!api) return;
    const widget =
      selection === "all"
        ? null
        : orderedWidgets.find((item) => item._id === selection);
    if (selection !== "all" && !widget) return;
    setLibraryError(null);
    try {
      const contentWidth = widget
        ? galleryWidgetWidth(widget.definition.size)
        : Math.max(
            192,
            ...orderedWidgets.map((item) =>
              galleryWidgetWidth(item.definition.size),
            ),
          );
      const contentHeight = widget
        ? 192
        : Math.max(
            192,
            orderedWidgets.length * 192 +
              Math.max(0, orderedWidgets.length - 1) * 12,
          );
      const nextWindow = await api.requestWindow({
        width: contentWidth + 24,
        height: Math.min(contentHeight + 24, 560),
        disallowReturnToOpener: true,
      });
      preparePictureInPictureDocument(nextWindow.document);
      pipWindowRef.current = nextWindow;
      setPipSelection(selection);
      setPipWindow(nextWindow);
      nextWindow.addEventListener(
        "pagehide",
        () => {
          if (pipWindowRef.current === nextWindow)
            pipWindowRef.current = null;
          setPipWindow((current) => (current === nextWindow ? null : current));
          setPipSelection((current) =>
            window.documentPictureInPicture?.window ? current : null,
          );
        },
        { once: true },
      );
    } catch (error) {
      setLibraryError(errorMessage(error));
    }
  }

  async function deleteWidget(widget: Doc<"widgets">) {
    if (!confirmWidgetDeletion(widget.name)) return;
    setDeletingWidgetId(widget._id);
    setLibraryError(null);
    try {
      await remove({ widgetId: widget._id });
      setWidgetOrder((current) =>
        current.filter((id) => id !== widget._id),
      );
      if (pipSelection === widget._id) pipWindowRef.current?.close();
    } catch (error) {
      setLibraryError(errorMessage(error));
    } finally {
      setDeletingWidgetId(null);
    }
  }

  function reorderWidgets(
    draggedId: Id<"widgets">,
    targetId: Id<"widgets">,
  ) {
    if (draggedId === targetId) return;
    setWidgetOrder((current) => {
      const all = [
        ...current.filter((id) => widgetIds.includes(id)),
        ...widgetIds.filter((id) => !current.includes(id)),
      ];
      const targetIndex = all.indexOf(targetId);
      if (targetIndex < 0 || !all.includes(draggedId)) return current;
      const withoutDragged = all.filter((id) => id !== draggedId);
      return [
        ...withoutDragged.slice(0, targetIndex),
        draggedId,
        ...withoutDragged.slice(targetIndex),
      ];
    });
  }

  const generationInProgress = generations.results.some(
    (generation) =>
      generation.status === "scraping" ||
      generation.status === "extracting" ||
      generation.status === "designing",
  );

  return (
    <>
      <div className="page-heading">
        <div className="library-heading-title">
          <h1>My widgets</h1>
          <button
            className="icon-button library-popout-all"
            aria-label="Pop out all widgets"
            title={
              pictureInPictureSupported
                ? "Pop out all widgets"
                : "Picture-in-picture is not supported in this browser"
            }
            disabled={!pictureInPictureSupported || !orderedWidgets.length}
            onClick={() => void openPictureInPicture("all")}
          >
            <PictureInPicture2 size={17} />
          </button>
        </div>
        <div className="library-actions">
          {generations.results.length > 0 && (
            <div className="generation-menu-wrap" ref={generationMenuRef}>
              <button
                className="icon-button generation-trigger"
                aria-label="View widget generations"
                aria-haspopup="dialog"
                aria-expanded={generationsOpen}
                onClick={() => setGenerationsOpen((open) => !open)}
              >
                {generationInProgress ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Bell size={18} />
                )}
              </button>
              {generationsOpen && (
                <GenerationMenu
                  generations={generations}
                  onSource={(id) => {
                    setGenerationsOpen(false);
                    onSource(id);
                  }}
                />
              )}
            </div>
          )}
          <button className="primary" onClick={onCreate}>
            <Plus size={17} />
            Create a widget
          </button>
        </div>
      </div>
      {libraryError && (
        <div className="alert" role="alert">
          {libraryError}
          <button className="text-button" onClick={() => setLibraryError(null)}>
            Dismiss
          </button>
        </div>
      )}
      {widgets.status === "LoadingFirstPage" ? (
        <Loading />
      ) : widgets.results.length ? (
        <>
          <div className="library-grid">
            {orderedWidgets.map((widget) => (
              <div
                className={`library-card ${widget.definition.size} ${draggingWidgetId === widget._id ? "is-dragging" : ""} ${dropTargetId === widget._id ? "is-drop-target" : ""}`}
                key={widget._id}
                draggable
                onDragStart={(event) => {
                  if (
                    (event.target as HTMLElement).closest(
                      ".library-card-actions",
                    )
                  ) {
                    event.preventDefault();
                    return;
                  }
                  draggedFromGallery.current = true;
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", widget._id);
                  setDraggingWidgetId(widget._id);
                }}
                onDragOver={(event) => {
                  if (draggingWidgetId && draggingWidgetId !== widget._id) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropTargetId(widget._id);
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node))
                    setDropTargetId((current) =>
                      current === widget._id ? null : current,
                    );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingWidgetId) reorderWidgets(draggingWidgetId, widget._id);
                  setDropTargetId(null);
                }}
                onDragEnd={() => {
                  setDraggingWidgetId(null);
                  setDropTargetId(null);
                  window.setTimeout(() => {
                    draggedFromGallery.current = false;
                  });
                }}
              >
                <button
                  className="library-card-open"
                  aria-label={`Open ${widget.name}`}
                  onClick={() => {
                    if (!draggedFromGallery.current) onWidget(widget._id);
                  }}
                >
                  <LibraryPreview widget={widget} />
                </button>
                <div
                  className="library-card-actions"
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    className="library-card-action"
                    aria-label={`Pop out ${widget.name}`}
                    title={
                      pictureInPictureSupported
                        ? "Pop out widget"
                        : "Picture-in-picture is not supported in this browser"
                    }
                    disabled={!pictureInPictureSupported}
                    draggable={false}
                    onClick={(event) => {
                      event.stopPropagation();
                      void openPictureInPicture(widget._id);
                    }}
                  >
                    <PictureInPicture2 size={16} />
                  </button>
                  <LibraryEmailWatch
                    widget={widget}
                    disabled={deletingWidgetId !== null}
                  />
                  <button
                    className="library-card-action library-card-delete"
                    aria-label={`Delete ${widget.name}`}
                    title="Delete widget"
                    disabled={deletingWidgetId !== null}
                    draggable={false}
                    onClick={() => void deleteWidget(widget)}
                  >
                    {deletingWidgetId === widget._id ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
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
          <p>Create one now to get started.</p>
        </div>
      )}
      {pipWindow &&
        pipSelection &&
        createPortal(
          <div
            className={`pip-widgets ${pipSelection === "all" ? "all" : "single"}`}
          >
            {pipWidgets.map((widget) => (
              <PictureInPictureWidget key={widget._id} widget={widget} />
            ))}
          </div>,
          pipWindow.document.body,
        )}
    </>
  );
}

function GenerationMenu({
  generations,
  onSource,
}: {
  generations: ReturnType<typeof usePaginatedQuery<typeof api.sources.list>>;
  onSource: (id: Id<"sources">) => void;
}) {
  return (
    <div
      className="generation-menu"
      role="dialog"
      aria-label="Widget generations"
    >
      <div className="generation-menu-heading">
        <strong>Created widgets</strong>
      </div>
      {generations.results.length ? (
        <div className="generation-menu-list">
          {generations.results.map((generation) => (
            <button
              className="generation-menu-item"
              key={generation._id}
              onClick={() => onSource(generation._id)}
            >
              <span
                className={`generation-status-mark ${generation.status === "failed" ? "failed" : generation.status === "ready" ? "ready" : "working"}`}
              >
                {generation.status === "scraping" ||
                generation.status === "extracting" ||
                generation.status === "designing" ? (
                  <LoaderCircle size={14} className="spin" />
                ) : generation.status === "ready" ? (
                  <Check size={14} />
                ) : (
                  <span />
                )}
              </span>
              <span className="generation-menu-copy">
                <strong>{generation.title}</strong>
                <span>{generationStatus(generation.status)}</span>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      ) : (
        <p className="generation-menu-empty">No generations yet.</p>
      )}
      {generations.status === "CanLoadMore" && (
        <button
          className="text-button generation-menu-more"
          onClick={() => generations.loadMore(24)}
        >
          Load more
        </button>
      )}
    </div>
  );
}

function generationStatus(status: Doc<"sources">["status"]) {
  switch (status) {
    case "scraping":
      return "Reading website";
    case "extracting":
      return "Extracting data";
    case "designing":
      return "Designing widget";
    case "ready":
      return "Ready to customize";
    case "failed":
      return "Needs a retry";
  }
}

function LibraryPreview({ widget }: { widget: Doc<"widgets"> }) {
  const source = useQuery(api.sources.get, { sourceId: widget.sourceId });
  return (
    <div className="library-preview">
      <WidgetRenderer
        definition={widget.definition}
        fields={source?.fields ?? []}
        width={galleryWidgetWidth(widget.definition.size)}
      />
    </div>
  );
}

function LibraryEmailWatch({
  widget,
  disabled,
}: {
  widget: Doc<"widgets">;
  disabled: boolean;
}) {
  const source = useQuery(api.sources.get, { sourceId: widget.sourceId });
  return (
    <EmailWatch
      widgetId={widget._id}
      fields={source?.fields ?? []}
      onSaveWidget={() => Promise.resolve(widget._id)}
      disabled={disabled || !source}
      iconOnly
      triggerLabel={`Email notifications for ${widget.name}`}
    />
  );
}

function PictureInPictureWidget({ widget }: { widget: Doc<"widgets"> }) {
  const source = useQuery(api.sources.get, { sourceId: widget.sourceId });
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const pip = node.ownerDocument.defaultView!;
    const layout = node.parentElement!;
    const aspectRatio = widget.definition.size === "rectangle" ? 2 : 1;
    const updateWidth = () => {
      const naturalWidth = Number.parseFloat(
        pip
          .getComputedStyle(node)
          .getPropertyValue("--pip-widget-width"),
      );
      setWidth(
        Math.min(
          naturalWidth,
          layout.clientWidth,
          Math.max(1, pip.innerHeight - 24) * aspectRatio,
        ),
      );
    };
    const observer = new ResizeObserver(updateWidth);
    observer.observe(layout);
    pip.addEventListener("resize", updateWidth);
    updateWidth();
    return () => {
      observer.disconnect();
      pip.removeEventListener("resize", updateWidth);
    };
  }, [widget.definition.size]);
  return (
    <div
      ref={container}
      className={`pip-widget ${widget.definition.size}`}
      style={width > 0 ? { width, flexBasis: width } : undefined}
    >
      {width > 0 && (
        <WidgetRenderer
          definition={widget.definition}
          fields={source?.fields ?? []}
          width={width}
        />
      )}
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
  onDeleted,
  onWidget,
}: {
  sourceId: Id<"sources">;
  onBack: () => void;
  onDeleted: () => void;
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
        onDeleted={onDeleted}
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
        <span className="connected-pill">{new URL(source.url).hostname}</span>
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
      onDeleted={onBack}
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

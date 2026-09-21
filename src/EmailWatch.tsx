import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { Mail, Pause, Play, Check, LoaderCircle, X } from "lucide-react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { formatDataFieldTitle, type DataField } from "../shared/widget";
import {
  describeCondition,
  validateCondition,
  type WatchCondition,
} from "../shared/watch";
import { errorMessage, timeLabel } from "./ui";

export function EmailWatch({
  widgetId,
  fields,
  onSaveWidget,
  disabled,
}: {
  widgetId: Id<"widgets"> | null;
  fields: DataField[];
  onSaveWidget: () => Promise<Id<"widgets">>;
  disabled: boolean;
}) {
  const data = useQuery(api.watches.get, widgetId ? { widgetId } : "skip");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const save = useMutation(api.watches.save);
  const setEnabled = useMutation(api.watches.setEnabled);
  const remove = useMutation(api.watches.remove);
  const resend = useMutation(api.watches.resendConfirmation);
  const [editing, setEditing] = useState(false);
  const [fieldId, setFieldId] = useState("");
  const [operator, setOperator] = useState<WatchCondition["operator"] | "">("");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<{
    condition: WatchCondition;
    summary: string;
    revision: number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const watch = data?.watch;
  const field = fields.find((item) => item.id === fieldId);
  const needsValue = operator !== "" && operator !== "changed";
  const canReview = !!field && !!operator && (!needsValue || !!value.trim());

  function resetDraft() {
    setFieldId("");
    setOperator("");
    setValue("");
    setPreview(null);
  }

  function startEditing() {
    if (editing) {
      resetDraft();
    } else if (watch) {
      setFieldId(watch.condition.fieldId);
      setOperator(watch.condition.operator);
      setValue(
        watch.condition.target === null ? "" : String(watch.condition.target),
      );
      setPreview(null);
    }
    setEditing(!editing);
    setError(null);
    setNotice(null);
  }

  function updateDraft() {
    setPreview(null);
    setError(null);
    setNotice(null);
  }

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function perform(task: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await task();
      if (message) setNotice(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function review(event: FormEvent) {
    event.preventDefault();
    if (!field || !operator) return;
    const target =
      operator === "changed"
        ? null
        : field.type === "number"
          ? Number(value)
          : field.type === "boolean"
            ? value === "true"
            : value.trim();
    const condition = { fieldId: field.id, operator, target };
    try {
      validateCondition(condition, fields);
      setPreview({
        condition,
        summary: describeCondition(condition, fields),
        revision: watch?.revision ?? null,
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="email-watch">
      <button
        type="button"
        className="watch-trigger"
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setNotice(null);
          setOpen(true);
        }}
      >
        <Mail size={14} />
        <span>{watch ? "Email watch" : "Email me when…"}</span>
        {watch && (
          <span className="watch-status">
            {!watch.verifiedAt
              ? "Confirm email"
              : watch.enabled
                ? "On"
                : "Paused"}
          </span>
        )}
      </button>
      {createPortal(
        <dialog
          ref={dialog}
          className="watch-dialog"
          aria-labelledby={titleId}
          onClose={() => setOpen(false)}
          onCancel={(event) => {
            if (busy) event.preventDefault();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget && !busy) setOpen(false);
          }}
        >
          <div className="watch-dialog-body">
            <div className="watch-dialog-heading">
              <h2 id={titleId}>{watch ? "Email watch" : "Email me when…"}</h2>
              <button
                type="button"
                className="icon-button"
                aria-label="Close email watch"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="watch-content">
              {!widgetId ? (
                <>
                  <p>
                    Save this widget to set up email alerts for its live data.
                  </p>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => void perform(onSaveWidget)}
                  >
                    {busy && <LoaderCircle size={13} className="spin" />}
                    {busy ? "Saving…" : "Save widget & continue"}
                  </button>
                </>
              ) : !data ? (
                <p>Loading…</p>
              ) : !data.configured && !watch ? (
                <p>
                  Email watches aren't configured yet. Your widget will keep
                  refreshing.
                </p>
              ) : !data.recipient && !watch ? (
                <p>Your account needs an email address to use email watches.</p>
              ) : (
                <>
                  <p className="watch-recipient">
                    To {watch?.recipient ?? data.recipient}
                  </p>
                  {!data.configured && (
                    <p>
                      Email delivery is unavailable. You can still pause or
                      remove this watch.
                    </p>
                  )}
                  {watch && (
                    <>
                      <p className="watch-condition">
                        {describeCondition(watch.condition, fields)}
                      </p>
                      {!watch.verifiedAt ? (
                        <>
                          <p>
                            Check your email and reply <strong>CONFIRM</strong>{" "}
                            to start alerts.
                          </p>
                          <button
                            type="button"
                            className="text-button"
                            disabled={busy || !data.configured}
                            onClick={() =>
                              void perform(
                                () => resend({ watchId: watch._id }),
                                "Confirmation email queued.",
                              )
                            }
                          >
                            Resend confirmation
                          </button>
                        </>
                      ) : (
                        <>
                          <div className="watch-actions">
                            <button
                              type="button"
                              className="secondary"
                              disabled={
                                busy || (!data.configured && !watch.enabled)
                              }
                              onClick={() =>
                                void perform(() =>
                                  setEnabled({
                                    watchId: watch._id,
                                    enabled: !watch.enabled,
                                  }),
                                )
                              }
                            >
                              {watch.enabled ? (
                                <Pause size={13} />
                              ) : (
                                <Play size={13} />
                              )}
                              {watch.enabled ? "Pause" : "Resume"}
                            </button>
                            <button
                              type="button"
                              className="text-button"
                              disabled={busy || !data.configured}
                              onClick={startEditing}
                            >
                              {editing ? "Cancel" : "Edit condition"}
                            </button>
                          </div>
                          <p>
                            Reply to a watch email to pause, resume, change the
                            condition, or ask for the latest value.
                          </p>
                          {watch.lastNotifiedAt && (
                            <p>Last alert {timeLabel(watch.lastNotifiedAt)}</p>
                          )}
                        </>
                      )}
                      {watch.deliveryError && (
                        <p role="alert" className="stale">
                          {watch.deliveryError}
                        </p>
                      )}
                    </>
                  )}
                  {data.configured && (!watch || editing) && (
                    <form onSubmit={review}>
                      <label className="watch-input">
                        <span>Data field</span>
                        <select
                          value={fieldId}
                          disabled={busy}
                          onChange={(event) => {
                            setFieldId(event.target.value);
                            setOperator("");
                            setValue("");
                            updateDraft();
                          }}
                        >
                          <option value="">Choose a field</option>
                          {fields.map((item) => (
                            <option key={item.id} value={item.id}>
                              {formatDataFieldTitle(item.label)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="watch-input">
                        <span>Condition</span>
                        <select
                          value={operator}
                          disabled={busy || !field}
                          onChange={(event) => {
                            setOperator(
                              event.target.value as
                                WatchCondition["operator"] | "",
                            );
                            setValue("");
                            updateDraft();
                          }}
                        >
                          <option value="">Choose a condition</option>
                          <option value="changed">Has changed</option>
                          {field?.type === "string" && (
                            <option value="contains">Contains</option>
                          )}
                          <option value="equals">Is equal to</option>
                          {field?.type === "number" && (
                            <>
                              <option value="above">Is greater than</option>
                              <option value="below">Is less than</option>
                            </>
                          )}
                        </select>
                      </label>
                      {needsValue && field && (
                        <label className="watch-input">
                          <span>
                            Value
                            {field.unit && field.type === "number"
                              ? ` (${field.unit})`
                              : ""}
                          </span>
                          {field.type === "boolean" ? (
                            <select
                              value={value}
                              disabled={busy}
                              onChange={(event) => {
                                setValue(event.target.value);
                                updateDraft();
                              }}
                            >
                              <option value="">Choose a value</option>
                              <option value="true">True</option>
                              <option value="false">False</option>
                            </select>
                          ) : (
                            <input
                              type={field.type === "number" ? "number" : "text"}
                              step={field.type === "number" ? "any" : undefined}
                              maxLength={
                                field.type === "string" ? 200 : undefined
                              }
                              value={value}
                              disabled={busy}
                              onChange={(event) => {
                                setValue(event.target.value);
                                updateDraft();
                              }}
                            />
                          )}
                        </label>
                      )}
                      {preview ? (
                        <div className="watch-review">
                          <p>
                            <Check size={13} />
                            {preview.summary}
                          </p>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              void perform(
                                async () => {
                                  await save({
                                    widgetId,
                                    condition: preview.condition,
                                    expectedRevision: preview.revision,
                                  });
                                  setEditing(false);
                                  resetDraft();
                                },
                                watch
                                  ? "Email watch updated."
                                  : "Check your email and reply CONFIRM to enable alerts.",
                              )
                            }
                          >
                            {busy ? (
                              <LoaderCircle size={13} className="spin" />
                            ) : (
                              <Mail size={13} />
                            )}
                            {watch ? "Save condition" : "Send confirmation"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="submit"
                          className="secondary"
                          disabled={busy || !canReview}
                        >
                          Review condition
                        </button>
                      )}
                      <p>
                        Checks run every 15 minutes. Alerts follow future
                        changes or crossings; stale values are skipped.
                      </p>
                    </form>
                  )}
                  {watch && (
                    <button
                      type="button"
                      className="text-button watch-remove"
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          await remove({ watchId: watch._id });
                          setEditing(false);
                          resetDraft();
                        }, "Email watch removed.")
                      }
                    >
                      Remove email watch
                    </button>
                  )}
                </>
              )}
              {error && (
                <p className="watch-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="watch-notice" role="status">
                  {notice}
                </p>
              )}
            </div>
          </div>
        </dialog>,
        document.body,
      )}
    </div>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "convex/react";
import { LoaderCircle, Mail, Pause, Play, Plus, Trash2, X } from "lucide-react";
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
  iconOnly = false,
  triggerLabel = "Email notifications",
}: {
  widgetId: Id<"widgets"> | null;
  fields: DataField[];
  onSaveWidget: () => Promise<Id<"widgets">>;
  disabled: boolean;
  iconOnly?: boolean;
  triggerLabel?: string;
}) {
  const data = useQuery(api.watches.get, widgetId ? { widgetId } : "skip");
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const save = useMutation(api.watches.save);
  const setEnabled = useMutation(api.watches.setEnabled);
  const remove = useMutation(api.watches.remove);
  const [fieldId, setFieldId] = useState("");
  const [operator, setOperator] = useState<WatchCondition["operator"] | "">("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = fields.find((item) => item.id === fieldId);
  const needsValue = operator !== "" && operator !== "changed";
  const canAdd = !!field && !!operator && (!needsValue || !!value.trim());
  const watches = data?.watches ?? [];

  function resetDraft() {
    setFieldId("");
    setOperator("");
    setValue("");
  }

  function updateDraft() {
    setError(null);
  }

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function perform(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function addCondition(event: FormEvent) {
    event.preventDefault();
    if (!widgetId || !field || !operator) return;
    const condition: WatchCondition = {
      fieldId: field.id,
      operator,
      target:
        operator === "changed"
          ? null
          : field.type === "number"
            ? Number(value)
            : field.type === "boolean"
              ? value === "true"
              : value.trim(),
    };
    try {
      validateCondition(condition, fields);
      void perform(async () => {
        await save({ widgetId, condition });
        resetDraft();
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="email-watch">
      <button
        type="button"
        className={iconOnly ? "library-card-action" : "watch-trigger"}
        aria-haspopup="dialog"
        aria-label={iconOnly ? triggerLabel : undefined}
        title={iconOnly ? "Email notifications" : undefined}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Mail size={iconOnly ? 16 : 14} />
        {!iconOnly && <span>Notifications</span>}
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
              <div className="watch-dialog-title">
                <h2 id={titleId}>Email notifications</h2>
                {data?.recipient && (
                  <p className="watch-recipient">Sending to {data.recipient}</p>
                )}
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close notifications"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="watch-content">
              {!widgetId ? (
                <>
                  <p>Save this widget before adding notifications.</p>
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
              ) : !data.recipient ? (
                <p>Your account needs an email address to use notifications.</p>
              ) : (
                <>
                  {!data.configured && (
                    <p className="watch-delivery-note">
                      Email delivery is unavailable. Conditions remain active
                      and will be checked with each data refresh.
                    </p>
                  )}
                  <section
                    className="watch-list"
                    aria-label="Notification conditions"
                  >
                    <div className="watch-list-heading">
                      <h3>Conditions</h3>
                      <span>
                        {watches.length}{" "}
                        {watches.length === 1 ? "condition" : "conditions"}
                      </span>
                    </div>
                    {watches.length ? (
                      watches.map((watch) => (
                        <article key={watch._id} className="watch-item">
                          <div className="watch-item-copy">
                            <p className="watch-condition">
                              {describeCondition(watch.condition, fields)}
                            </p>
                            {(watch.lastNotifiedAt || watch.deliveryError) && (
                              <p
                                className={
                                  watch.deliveryError
                                    ? "watch-error"
                                    : "watch-meta"
                                }
                                role={watch.deliveryError ? "alert" : undefined}
                              >
                                {watch.deliveryError ??
                                  `Last alert ${timeLabel(watch.lastNotifiedAt)}`}
                              </p>
                            )}
                          </div>
                          <span
                            className={`watch-state ${watch.enabled ? "watch-active" : ""}`}
                          >
                            {watch.enabled ? "Active" : "Paused"}
                          </span>
                          <div className="watch-actions">
                            <button
                              type="button"
                              className="watch-icon-action"
                              aria-label={
                                watch.enabled
                                  ? "Pause notification"
                                  : "Resume notification"
                              }
                              title={watch.enabled ? "Pause" : "Resume"}
                              disabled={busy}
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
                            </button>
                            <button
                              type="button"
                              className="watch-icon-action watch-remove"
                              aria-label="Remove notification"
                              title="Remove"
                              disabled={busy}
                              onClick={() =>
                                void perform(() =>
                                  remove({ watchId: watch._id }),
                                )
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="watch-empty">
                        No conditions yet. Add one below.
                      </p>
                    )}
                  </section>
                  <form className="watch-composer" onSubmit={addCondition}>
                    <h3>Add condition</h3>
                    <div className="watch-composer-row">
                      <span className="watch-composer-word">When</span>
                      <select
                        aria-label="Data field"
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
                      <select
                        aria-label="Condition"
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
                      {needsValue &&
                        field &&
                        (field.type === "boolean" ? (
                          <select
                            aria-label="Value"
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
                            aria-label={
                              field.unit ? `Value in ${field.unit}` : "Value"
                            }
                            type={field.type === "number" ? "number" : "text"}
                            step={field.type === "number" ? "any" : undefined}
                            maxLength={
                              field.type === "string" ? 200 : undefined
                            }
                            placeholder={
                              field.unit ? `Value (${field.unit})` : "Value"
                            }
                            value={value}
                            disabled={busy}
                            onChange={(event) => {
                              setValue(event.target.value);
                              updateDraft();
                            }}
                          />
                        ))}
                      <button
                        type="submit"
                        className="watch-add"
                        disabled={busy || !canAdd}
                      >
                        {busy ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : (
                          <Plus size={13} />
                        )}
                        Add
                      </button>
                    </div>
                  </form>
                  <p className="watch-hint">
                    New conditions are active immediately and checked every 15
                    minutes.
                  </p>
                </>
              )}
              {error && (
                <p role="alert" className="watch-error">
                  {error}
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

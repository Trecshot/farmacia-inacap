import { X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { translateChoiceLabel } from "../../lib/choiceLabels";
import "./ui.module.css";

export type ActionFieldOption = {
  value: string;
  label: string;
};

export type ActionField = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "email" | "password" | "select" | "textarea" | "checkbox";
  placeholder?: string;
  hint?: string;
  required?: boolean;
  min?: number;
  step?: number;
  options?: ActionFieldOption[];
  disabled?: boolean;
};

const isRutField = (field: ActionField) =>
  field.name.toLowerCase().endsWith("rut");

const formatRut = (value: string, finalize = false) => {
  const cleaned = value.toUpperCase().replace(/[^0-9K]/g, "");
  const digits = cleaned.replace(/K/g, "");
  const rut = `${digits}${cleaned.includes("K") ? "K" : ""}`.slice(0, 9);

  if (rut.length >= 7 || (finalize && rut.length >= 2)) {
    return `${rut.slice(0, -1)}-${rut.slice(-1)}`;
  }

  return rut;
};

type Props = {
  open: boolean;
  title: string;
  description?: string;
  fields: ActionField[];
  initialValues?: Record<string, unknown>;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (values: Record<string, string | number | boolean>) => void | Promise<void>;
};

const normalizeInitial = (
  fields: ActionField[],
  initialValues?: Props["initialValues"],
) => {
  const result: Record<string, string | number | boolean> = {};

  fields.forEach((field) => {
    const value = initialValues?.[field.name];

    if (field.type === "checkbox") {
      result[field.name] = Boolean(value);
    } else if (field.type === "number") {
      result[field.name] = value === null || value === undefined ? "" : Number(value);
    } else if (field.type === "date") {
      const stringValue = value === null || value === undefined ? "" : String(value);
      result[field.name] = stringValue ? stringValue.slice(0, 10) : "";
    } else {
      const stringValue = value === null || value === undefined ? "" : String(value);
      result[field.name] = isRutField(field)
        ? formatRut(stringValue, true)
        : stringValue;
    }
  });

  return result;
};

const ActionModalDialog = ({
  title,
  description,
  fields,
  initialValues,
  confirmLabel = "Guardar",
  busy = false,
  error,
  onClose,
  onSubmit,
}: Omit<Props, "open">) => {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    () => normalizeInitial(fields, initialValues),
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSubmit(values);
  };

  return (
    <div className="action-modal__backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="action-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="action-modal__header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="action-modal__body">
            {fields.map((field) => {
              const value = values[field.name];
              const fieldHint =
                field.hint ??
                (title === "Nueva orden de compra" && field.name === "code"
                  ? "Debe tener al menos 3 caracteres. Ejemplo: OC-2026-001."
                  : undefined);

              if (field.type === "checkbox") {
                return (
                  <label className="action-field action-field--checkbox" key={field.name}>
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      disabled={field.disabled}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.checked,
                        }))
                      }
                    />
                    <span>{field.label}</span>
                  </label>
                );
              }

              const rutField = isRutField(field);
              const hintId = `${field.name}-hint`;
              const allowNegativeAdjustment =
                field.name === "amount" && values.type === "ADJUSTMENT";

              return (
                <label
                  className={`action-field${field.type === "textarea" ? " action-field--wide" : ""}`}
                  key={field.name}
                >
                  <span className="action-field__label">
                    {field.label}
                    {field.required ? <span className="action-field__required" aria-hidden="true"> *</span> : null}
                  </span>
                  {field.type === "textarea" ? (
                    <textarea
                      value={String(value ?? "")}
                      placeholder={field.placeholder}
                      required={field.required}
                      disabled={field.disabled}
                      aria-describedby={fieldHint || rutField ? hintId : undefined}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                    />
                  ) : field.type === "select" ? (
                    <select
                      value={String(value ?? "")}
                      required={field.required}
                      disabled={field.disabled}
                      aria-describedby={field.hint ? hintId : undefined}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]: event.target.value,
                        }))
                      }
                    >
                      <option value="">{field.required ? "Selecciona una opción..." : "Sin selección"}</option>
                      {(field.options ?? []).map((option) => (
                        <option value={option.value} key={option.value}>
                          {translateChoiceLabel(option.label)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={field.type ?? "text"}
                      inputMode={rutField ? "text" : undefined}
                      value={String(value ?? "")}
                      placeholder={
                        field.placeholder ??
                        (rutField
                          ? "18588388-6"
                          : title === "Nueva orden de compra" && field.name === "code"
                            ? "OC-2026-001"
                            : undefined)
                      }
                      required={field.required}
                      disabled={field.disabled}
                      min={allowNegativeAdjustment ? undefined : field.min}
                      step={field.step}
                      maxLength={rutField ? 10 : undefined}
                      autoComplete={rutField ? "off" : undefined}
                      aria-describedby={fieldHint || rutField ? hintId : undefined}
                      onBlur={
                        rutField
                          ? () =>
                              setValues((current) => ({
                                ...current,
                                [field.name]: formatRut(
                                  String(current[field.name] ?? ""),
                                  true,
                                ),
                              }))
                          : undefined
                      }
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [field.name]:
                            rutField
                              ? formatRut(event.target.value)
                              : field.type === "number"
                              ? event.target.value === ""
                                ? ""
                                : Number(event.target.value)
                              : event.target.value,
                        }))
                      }
                    />
                  )}
                  {fieldHint || rutField ? (
                    <span className="action-field__hint" id={hintId}>
                      {fieldHint ?? "Formato: 18588388-6. Ingresa el RUT sin puntos."}
                    </span>
                  ) : null}
                </label>
              );
            })}

            {error ? <div className="alert alert--error">{error}</div> : null}
          </div>

          <footer className="action-modal__footer">
            <button type="button" className="button button--secondary" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button type="submit" className="button button--primary" disabled={busy}>
              {busy ? "Guardando..." : confirmLabel}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
};

export const ActionModal = (props: Props) => {
  if (!props.open) return null;

  const entityKey = String(
    props.initialValues?.id ??
      props.initialValues?.key ??
      props.initialValues?.code ??
      "new",
  );

  return <ActionModalDialog key={`${props.title}:${entityKey}`} {...props} />;
};

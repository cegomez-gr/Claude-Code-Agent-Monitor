/**
 * @file WebhookSettings.tsx
 * @description Settings-page panel for universal webhook notifications across 14
 * first-class providers (Slack, Discord, Teams, Google Chat, Mattermost,
 * Rocket.Chat, Telegram, PagerDuty, Opsgenie, Splunk On-Call, Zapier, Make, n8n,
 * Pipedream) plus a generic endpoint. The form is driven by provider metadata
 * fetched from the server (`/api/webhooks/providers`): each provider declares
 * whether it needs a URL and which credential fields to render, so adding a
 * provider server-side surfaces here with no UI change. Secrets are never
 * returned by the API — URLs are masked and re-entered to change.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Webhook,
  Plus,
  Trash2,
  X,
  Pencil,
  Zap,
  Check,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import type {
  AlertRule,
  WebhookProvider,
  WebhookTarget,
  WebhookType,
  WebhookTestResult,
} from "../lib/types";

// Brand-ish accent per provider type; anything unmapped falls back to neutral.
const TYPE_STYLES: Partial<Record<WebhookType, string>> = {
  slack: "text-[#E01E5A] bg-[#E01E5A]/10 border-[#E01E5A]/20",
  discord: "text-[#5865F2] bg-[#5865F2]/10 border-[#5865F2]/20",
  teams: "text-[#6264A7] bg-[#6264A7]/10 border-[#6264A7]/20",
  google_chat: "text-[#1A73E8] bg-[#1A73E8]/10 border-[#1A73E8]/20",
  mattermost: "text-[#0058CC] bg-[#0058CC]/10 border-[#0058CC]/20",
  rocketchat: "text-[#F5455C] bg-[#F5455C]/10 border-[#F5455C]/20",
  telegram: "text-[#26A5E4] bg-[#26A5E4]/10 border-[#26A5E4]/20",
  pagerduty: "text-[#06AC38] bg-[#06AC38]/10 border-[#06AC38]/20",
  opsgenie: "text-[#2684FF] bg-[#2684FF]/10 border-[#2684FF]/20",
  splunk_oncall: "text-[#F99D1C] bg-[#F99D1C]/10 border-[#F99D1C]/20",
};
const NEUTRAL_STYLE = "text-gray-300 bg-surface-2 border-border";

interface HeaderRow {
  key: string;
  value: string;
}

interface FormState {
  id: string | null;
  name: string;
  type: WebhookType;
  url: string;
  secret: string;
  headerRows: HeaderRow[];
  replaceHeaders: boolean;
  config: Record<string, string>;
  scopeAll: boolean;
  ruleIds: string[];
  enabled: boolean;
}

function defaultsFor(provider: WebhookProvider | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!provider) return out;
  for (const f of provider.fields) if (f.default != null) out[f.key] = f.default;
  return out;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-blue-500" : "bg-surface-4"
      }`}
    >
      <span
        className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
        style={{ transform: checked ? "translateX(18px)" : "translateX(3px)" }}
      />
    </button>
  );
}

export function WebhookSettings() {
  const { t } = useTranslation("settings");
  const [targets, setTargets] = useState<WebhookTarget[]>([]);
  const [providers, setProviders] = useState<WebhookProvider[]>([]);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, WebhookTestResult>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const providerOf = useCallback(
    (type: WebhookType) => providers.find((p) => p.type === type),
    [providers]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.webhooks.list();
      setTargets(res.targets);
    } catch (err) {
      console.error("Failed to load webhook targets:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.webhooks
      .providers()
      .then((res) => setProviders(res.providers))
      .catch(() => setProviders([]));
    api.alerts.rules
      .list()
      .then((res) => setRules(res.rules))
      .catch(() => setRules([]));
  }, []);

  const set = (patch: Partial<FormState>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const openCreate = () => {
    const first = providers[0];
    setForm({
      id: null,
      name: "",
      type: (first?.type as WebhookType) || "slack",
      url: "",
      secret: "",
      headerRows: [],
      replaceHeaders: true,
      config: defaultsFor(first),
      scopeAll: true,
      ruleIds: [],
      enabled: true,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (target: WebhookTarget) => {
    const provider = providerOf(target.type);
    // Prefill non-secret config (region, chat_id, severity, …); leave secret
    // fields blank — they're redacted and re-entered only to change.
    const config: Record<string, string> = {};
    for (const f of provider?.fields || []) {
      if (f.secret) continue;
      const v = target.config?.[f.key];
      config[f.key] = v != null ? String(v) : (f.default ?? "");
    }
    setForm({
      id: target.id,
      name: target.name,
      type: target.type,
      url: "",
      secret: "",
      headerRows: [],
      replaceHeaders: false,
      config,
      scopeAll: !target.rule_ids || target.rule_ids.length === 0,
      ruleIds: target.rule_ids || [],
      enabled: target.enabled,
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setForm(null);
    setFormError(null);
  };

  const provider = form ? providerOf(form.type) : undefined;
  const isEdit = !!form?.id;
  const showUrl = !!provider && (provider.url_required || provider.has_default_url);
  const urlOptional = !!provider && !provider.url_required;

  const canSubmit = useMemo(() => {
    if (!form || !provider) return false;
    if (!form.name.trim()) return false;
    if (isEdit) return true; // server merge — existing values fill the gaps
    if (provider.url_required && !form.url.trim()) return false;
    for (const f of provider.fields) {
      if (f.required && f.type !== "enum" && !(form.config[f.key] || "").trim()) return false;
    }
    return true;
  }, [form, provider, isEdit]);

  const buildConfigObj = (): Record<string, string> | undefined => {
    if (!form || !provider || provider.fields.length === 0) return undefined;
    const out: Record<string, string> = {};
    for (const f of provider.fields) {
      const v = (form.config[f.key] ?? "").toString();
      if (f.type === "enum") {
        if (v) out[f.key] = v;
      } else if (v.trim()) {
        out[f.key] = v.trim();
      }
    }
    return out;
  };

  const buildHeaders = (): Record<string, string> => {
    if (!form) return {};
    const out: Record<string, string> = {};
    for (const r of form.headerRows) if (r.key.trim()) out[r.key.trim()] = r.value;
    return out;
  };

  const onSubmit = async () => {
    if (!form || !provider || saving || !canSubmit) return;
    setSaving(true);
    setFormError(null);
    try {
      const ruleIds = form.scopeAll ? [] : form.ruleIds;
      const config = buildConfigObj();
      const genericFamily = provider.supports_secret || provider.supports_headers;
      if (isEdit && form.id) {
        const patch: Parameters<typeof api.webhooks.update>[1] = {
          name: form.name.trim(),
          enabled: form.enabled,
          rule_ids: ruleIds,
        };
        if (form.url.trim()) patch.url = form.url.trim();
        if (config) patch.config = config;
        if (genericFamily && form.secret.trim()) patch.secret = form.secret.trim();
        if (provider.supports_headers && form.replaceHeaders) patch.headers = buildHeaders();
        await api.webhooks.update(form.id, patch);
      } else {
        await api.webhooks.create({
          name: form.name.trim(),
          type: form.type,
          url: form.url.trim() || undefined,
          enabled: form.enabled,
          secret: genericFamily && form.secret.trim() ? form.secret.trim() : undefined,
          headers: provider.supports_headers ? buildHeaders() : undefined,
          config,
          rule_ids: ruleIds.length ? ruleIds : undefined,
        });
      }
      closeForm();
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onToggle = async (target: WebhookTarget) => {
    try {
      await api.webhooks.update(target.id, { enabled: !target.enabled });
      load();
    } catch (err) {
      console.error("Failed to toggle webhook:", err);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.webhooks.remove(id);
      setConfirmDelete(null);
      load();
    } catch (err) {
      console.error("Failed to delete webhook:", err);
    }
  };

  const onTest = async (id: string) => {
    setTesting(id);
    setTestResult((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await api.webhooks.test(id);
      setTestResult((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, status: null, attempts: 0, error: String(err) },
      }));
    } finally {
      setTesting(null);
      load();
    }
  };

  const labelOf = (type: WebhookType) => providerOf(type)?.label || type;

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Webhook className="w-3.5 h-3.5" />
          {t("webhooks.count", { count: targets.length })}
        </div>
        {!formOpen && (
          <button
            onClick={openCreate}
            disabled={providers.length === 0}
            className="btn-ghost border border-border inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("webhooks.add")}
          </button>
        )}
      </div>

      {/* Target list */}
      {loading ? (
        <p className="text-xs text-gray-500">{t("webhooks.loading")}</p>
      ) : targets.length === 0 && !formOpen ? (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Webhook className="w-3.5 h-3.5" />
          {t("webhooks.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {targets.map((target) => {
            const result = testResult[target.id];
            return (
              <div
                key={target.id}
                className="bg-surface-2 border border-border rounded-lg px-3.5 py-3 space-y-2"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                      TYPE_STYLES[target.type] || NEUTRAL_STYLE
                    }`}
                  >
                    {labelOf(target.type)}
                  </span>
                  <span className="text-sm text-gray-200 font-medium">{target.name}</span>
                  <code className="text-[11px] text-gray-500 font-mono truncate max-w-[220px]">
                    {target.url_preview}
                  </code>
                  {target.rule_ids && target.rule_ids.length > 0 && (
                    <span className="text-[10px] text-amber-400/80">
                      {t("webhooks.scopedTo", { count: target.rule_ids.length })}
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    {target.last_delivery && (
                      <span
                        title={target.last_delivery.error || undefined}
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                          target.last_delivery.status === "success"
                            ? "text-emerald-400 bg-emerald-500/10"
                            : "text-red-400 bg-red-500/10"
                        }`}
                      >
                        {target.last_delivery.status === "success" ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {timeAgo(target.last_delivery.created_at)}
                      </span>
                    )}
                    <Toggle
                      checked={target.enabled}
                      onChange={() => onToggle(target)}
                      label={t("webhooks.enabled")}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => onTest(target.id)}
                    disabled={testing === target.id}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-4 border border-border transition-colors disabled:opacity-50"
                  >
                    {testing === target.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    {t("webhooks.test")}
                  </button>
                  <button
                    onClick={() => openEdit(target)}
                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md text-gray-400 hover:text-gray-200 hover:bg-surface-4 border border-border transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    {t("webhooks.edit")}
                  </button>
                  {confirmDelete === target.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => onDelete(target.id)}
                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                      >
                        <Check className="w-3 h-3" />
                        {t("webhooks.confirmDelete")}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="inline-flex items-center text-[11px] px-2 py-1 rounded-md text-gray-400 hover:text-gray-200 border border-border transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(target.id)}
                      className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-border transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t("webhooks.delete")}
                    </button>
                  )}
                  {result && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] ${
                        result.ok ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {result.ok ? (
                        <CheckCircle className="w-3 h-3" />
                      ) : (
                        <AlertTriangle className="w-3 h-3" />
                      )}
                      {result.ok
                        ? t("webhooks.testOk", { status: result.status ?? 200 })
                        : t("webhooks.testFail", {
                            error: result.error || `HTTP ${result.status ?? "?"}`,
                          })}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / edit form */}
      {formOpen && form && provider && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-surface-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
              {isEdit ? t("webhooks.editTitle") : t("webhooks.addTitle")}
            </h4>
            <button onClick={closeForm} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[11px] text-gray-500">{t("webhooks.fieldName")}</span>
              <input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder={t("webhooks.fieldNamePlaceholder")}
                className="input w-full mt-1 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] text-gray-500">{t("webhooks.fieldType")}</span>
              <select
                value={form.type}
                disabled={isEdit}
                onChange={(e) => {
                  const type = e.target.value as WebhookType;
                  set({
                    type,
                    config: defaultsFor(providerOf(type)),
                    url: "",
                    secret: "",
                    headerRows: [],
                  });
                }}
                className="input w-full mt-1 text-sm disabled:opacity-60"
              >
                {providers.map((p) => (
                  <option key={p.type} value={p.type}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* URL (hidden for providers that derive their own URL) */}
          {showUrl && (
            <label className="block">
              <span className="text-[11px] text-gray-500">
                {t("webhooks.fieldUrl")}
                {isEdit ? (
                  <span className="text-gray-600"> — {t("webhooks.urlKeepHint")}</span>
                ) : urlOptional ? (
                  <span className="text-gray-600"> — {t("webhooks.urlOptional")}</span>
                ) : null}
              </span>
              <input
                value={form.url}
                onChange={(e) => set({ url: e.target.value })}
                placeholder={
                  isEdit ? t("webhooks.urlKeepPlaceholder") : provider.url_hint || "https://…"
                }
                className="input w-full mt-1 text-sm font-mono"
              />
            </label>
          )}
          {!showUrl && (
            <p className="text-[11px] text-gray-600 flex items-center gap-1.5">
              <Webhook className="w-3 h-3" />
              {t("webhooks.urlAuto")}
            </p>
          )}

          {/* Provider-specific config fields */}
          {provider.fields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border">
              {provider.fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="text-[11px] text-gray-500">
                    {f.label}
                    {f.required && <span className="text-red-400"> *</span>}
                  </span>
                  {f.type === "enum" && f.options ? (
                    <select
                      value={form.config[f.key] ?? f.default ?? ""}
                      onChange={(e) => set({ config: { ...form.config, [f.key]: e.target.value } })}
                      className="input w-full mt-1 text-sm"
                    >
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.secret ? "password" : "text"}
                      value={form.config[f.key] ?? ""}
                      onChange={(e) => set({ config: { ...form.config, [f.key]: e.target.value } })}
                      placeholder={f.secret && isEdit ? t("webhooks.secretKeepPlaceholder") : ""}
                      className="input w-full mt-1 text-sm font-mono"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          {/* Generic family: HMAC secret + custom headers */}
          {provider.supports_secret && (
            <div className="space-y-3 pt-1 border-t border-border">
              <label className="block">
                <span className="text-[11px] text-gray-500">{t("webhooks.fieldSecret")}</span>
                <input
                  type="password"
                  value={form.secret}
                  onChange={(e) => set({ secret: e.target.value })}
                  placeholder={
                    isEdit ? t("webhooks.secretKeepPlaceholder") : t("webhooks.secretPlaceholder")
                  }
                  className="input w-full mt-1 text-sm font-mono"
                />
                <span className="text-[10px] text-gray-600">{t("webhooks.secretHint")}</span>
              </label>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">{t("webhooks.fieldHeaders")}</span>
                  {isEdit && (
                    <label className="inline-flex items-center gap-1.5 text-[10px] text-gray-500 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.replaceHeaders}
                        onChange={(e) => set({ replaceHeaders: e.target.checked })}
                      />
                      {t("webhooks.replaceHeaders")}
                    </label>
                  )}
                </div>
                {(!isEdit || form.replaceHeaders) && (
                  <div className="space-y-1.5 mt-1.5">
                    {form.headerRows.map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <input
                          value={row.key}
                          onChange={(e) =>
                            set({
                              headerRows: form.headerRows.map((r, j) =>
                                j === i ? { ...r, key: e.target.value } : r
                              ),
                            })
                          }
                          placeholder={t("webhooks.headerKey")}
                          className="input flex-1 text-xs font-mono"
                        />
                        <input
                          value={row.value}
                          onChange={(e) =>
                            set({
                              headerRows: form.headerRows.map((r, j) =>
                                j === i ? { ...r, value: e.target.value } : r
                              ),
                            })
                          }
                          placeholder={t("webhooks.headerValue")}
                          className="input flex-1 text-xs font-mono"
                        />
                        <button
                          onClick={() =>
                            set({ headerRows: form.headerRows.filter((_, j) => j !== i) })
                          }
                          className="text-gray-600 hover:text-red-400 p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        set({ headerRows: [...form.headerRows, { key: "", value: "" }] })
                      }
                      className="inline-flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300"
                    >
                      <Plus className="w-3 h-3" />
                      {t("webhooks.addHeader")}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Optional per-rule scoping */}
          {rules.length > 0 && (
            <div className="pt-1 border-t border-border">
              <label className="inline-flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.scopeAll}
                  onChange={(e) => set({ scopeAll: e.target.checked })}
                />
                {t("webhooks.scopeAll")}
              </label>
              {!form.scopeAll && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {rules.map((rule) => (
                    <label
                      key={rule.id}
                      className="inline-flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.ruleIds.includes(rule.id)}
                        onChange={(e) =>
                          set({
                            ruleIds: e.target.checked
                              ? [...form.ruleIds, rule.id]
                              : form.ruleIds.filter((id) => id !== rule.id),
                          })
                        }
                      />
                      <span className="truncate">{rule.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-1">
            <label className="inline-flex items-center gap-2 text-[11px] text-gray-400 cursor-pointer">
              <Toggle checked={form.enabled} onChange={(v) => set({ enabled: v })} />
              {t("webhooks.enabledOnSave")}
            </label>
          </div>

          {formError && (
            <div className="flex items-center gap-1.5 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {formError}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={onSubmit}
              disabled={!canSubmit || saving}
              className="btn-primary inline-flex items-center gap-1.5 text-xs disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              {isEdit ? t("webhooks.save") : t("webhooks.create")}
            </button>
            <button onClick={closeForm} className="btn-ghost border border-border text-xs">
              {t("webhooks.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

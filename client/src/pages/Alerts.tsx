/**
 * @file Alerts.tsx
 * @description Rules-based alerting page: manage alert rules (create, toggle,
 * delete) and review the fired-alert feed with acknowledge controls. The feed
 * refetches on alert_triggered / alert_updated WebSocket messages so multiple
 * open dashboards stay in sync.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BellRing,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { EmptyState } from "../components/EmptyState";
import { Skeleton } from "../components/Skeleton";
import { timeAgo } from "../lib/format";
import type { AlertEvent, AlertRule, AlertRuleType, WSMessage } from "../lib/types";

const PAGE_SIZE = 50;

const RULE_TYPES: AlertRuleType[] = [
  "event_pattern",
  "inactivity",
  "status_duration",
  "token_threshold",
];

interface RuleFormState {
  name: string;
  rule_type: AlertRuleType;
  event_type: string;
  tool_name: string;
  summary_contains: string;
  count: string;
  window_minutes: string;
  minutes: string;
  status: "working" | "waiting";
  total_tokens: string;
  cooldown_seconds: string;
}

const EMPTY_FORM: RuleFormState = {
  name: "",
  rule_type: "event_pattern",
  event_type: "",
  tool_name: "",
  summary_contains: "",
  count: "1",
  window_minutes: "5",
  minutes: "10",
  status: "working",
  total_tokens: "1000000",
  cooldown_seconds: "300",
};

function buildConfig(form: RuleFormState): AlertRule["config"] {
  switch (form.rule_type) {
    case "event_pattern": {
      const config: AlertRule["config"] = {};
      if (form.event_type.trim()) config.event_type = form.event_type.trim();
      if (form.tool_name.trim()) config.tool_name = form.tool_name.trim();
      if (form.summary_contains.trim()) config.summary_contains = form.summary_contains.trim();
      const count = parseInt(form.count, 10);
      config.count = Number.isFinite(count) && count > 0 ? count : 1;
      if (config.count > 1) {
        const window = parseFloat(form.window_minutes);
        config.window_minutes = Number.isFinite(window) && window > 0 ? window : 5;
      }
      return config;
    }
    case "inactivity":
      return { minutes: parseFloat(form.minutes) };
    case "status_duration":
      return { status: form.status, minutes: parseFloat(form.minutes) };
    case "token_threshold":
      return { total_tokens: parseInt(form.total_tokens, 10) };
  }
}

function describeRule(rule: AlertRule, t: (key: string, opts?: Record<string, unknown>) => string) {
  const c = rule.config;
  switch (rule.rule_type) {
    case "event_pattern": {
      const parts = [
        c.event_type && `event=${c.event_type}`,
        c.tool_name && `tool=${c.tool_name}`,
        c.summary_contains && `summary~"${c.summary_contains}"`,
      ].filter(Boolean);
      const base = parts.join(" · ");
      return (c.count ?? 1) > 1
        ? t("ruleDesc.eventPatternCount", {
            pattern: base,
            count: c.count,
            window: c.window_minutes,
          })
        : t("ruleDesc.eventPattern", { pattern: base });
    }
    case "inactivity":
      return t("ruleDesc.inactivity", { minutes: c.minutes });
    case "status_duration":
      return t("ruleDesc.statusDuration", { status: c.status, minutes: c.minutes });
    case "token_threshold":
      return t("ruleDesc.tokenThreshold", { tokens: (c.total_tokens ?? 0).toLocaleString() });
  }
}

export function Alerts() {
  const { t } = useTranslation("alerts");
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [unacked, setUnacked] = useState(0);
  const [unackedOnly, setUnackedOnly] = useState(false);
  const [loadingAlerts, setLoadingAlerts] = useState(true);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // First page replaces the list; loadMore() appends the next slice. Live
  // refreshes always reload the first page so the newest alerts surface.
  const loadAlerts = useCallback(async () => {
    setLoadingAlerts(true);
    try {
      const res = await api.alerts.list({
        unacked: unackedOnly || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setAlerts(res.alerts);
      setTotal(res.total);
      setUnacked(res.unacked);
    } catch (err) {
      console.error("Failed to load alerts:", err);
    } finally {
      setLoadingAlerts(false);
    }
  }, [unackedOnly]);

  const loadMore = useCallback(async () => {
    try {
      const res = await api.alerts.list({
        unacked: unackedOnly || undefined,
        limit: PAGE_SIZE,
        offset: alerts.length,
      });
      setAlerts((prev) => [...prev, ...res.alerts]);
      setTotal(res.total);
      setUnacked(res.unacked);
    } catch (err) {
      console.error("Failed to load more alerts:", err);
    }
  }, [unackedOnly, alerts.length]);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await api.alerts.rules.list();
      setRules(res.rules);
    } catch (err) {
      console.error("Failed to load alert rules:", err);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  // Live updates: any fired/acked alert refetches the current view. Alerts
  // are low-volume by design (cooldown dedup), so no debounce is needed.
  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (msg.type === "alert_triggered" || msg.type === "alert_updated") {
        loadAlerts();
      }
    });
  }, [loadAlerts]);

  const onAck = async (id: number) => {
    try {
      await api.alerts.ack(id);
      loadAlerts();
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const onAckAll = async () => {
    try {
      await api.alerts.ackAll();
      loadAlerts();
    } catch (err) {
      console.error("Failed to acknowledge alerts:", err);
    }
  };

  const onToggleRule = async (rule: AlertRule) => {
    try {
      await api.alerts.rules.update(rule.id, { enabled: !rule.enabled });
      loadRules();
    } catch (err) {
      console.error("Failed to toggle alert rule:", err);
    }
  };

  const onDeleteRule = async (rule: AlertRule) => {
    if (!window.confirm(t("rules.confirmDelete", { name: rule.name }))) return;
    try {
      await api.alerts.rules.remove(rule.id);
      loadRules();
      loadAlerts();
    } catch (err) {
      console.error("Failed to delete alert rule:", err);
    }
  };

  const onCreateRule = async () => {
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const cooldown = parseInt(form.cooldown_seconds, 10);
      await api.alerts.rules.create({
        name: form.name.trim(),
        rule_type: form.rule_type,
        config: buildConfig(form),
        cooldown_seconds: Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 300,
      });
      setForm(EMPTY_FORM);
      setFormOpen(false);
      loadRules();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (patch: Partial<RuleFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const canSubmit =
    form.name.trim().length > 0 &&
    (form.rule_type !== "event_pattern" ||
      Boolean(form.event_type.trim() || form.tool_name.trim() || form.summary_contains.trim()));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAlerts()}
            className="btn-ghost border border-border inline-flex items-center gap-2 text-sm"
            title={t("refresh")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t("refresh")}
          </button>
          {unacked > 0 && (
            <button
              onClick={onAckAll}
              className="btn-primary inline-flex items-center gap-2 text-sm"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t("ackAll", { count: unacked })}
            </button>
          )}
        </div>
      </div>

      {/* Rules manager */}
      <section className="card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">{t("rules.title")}</h2>
          <button
            onClick={() => {
              setFormOpen((open) => !open);
              setFormError(null);
            }}
            className="btn-ghost border border-border inline-flex items-center gap-1.5 text-xs"
          >
            {formOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {formOpen ? t("rules.cancel") : t("rules.add")}
          </button>
        </div>

        {formOpen && (
          <div className="rounded-lg border border-border bg-surface-2 p-3 mb-3 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-xs text-gray-400">
                {t("rules.form.name")}
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder={t("rules.form.namePlaceholder")}
                  className="input mt-1 w-full"
                />
              </label>
              <label className="block text-xs text-gray-400">
                {t("rules.form.type")}
                <div className="relative mt-1">
                  <select
                    value={form.rule_type}
                    onChange={(e) => set({ rule_type: e.target.value as AlertRuleType })}
                    className="input w-full appearance-none pr-8"
                  >
                    {RULE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`ruleTypes.${type}`)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
              </label>
            </div>

            <p className="text-[11px] text-gray-500">{t(`ruleTypeHints.${form.rule_type}`)}</p>

            {form.rule_type === "event_pattern" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-xs text-gray-400">
                  {t("rules.form.eventType")}
                  <input
                    type="text"
                    value={form.event_type}
                    onChange={(e) => set({ event_type: e.target.value })}
                    placeholder="APIError"
                    className="input mt-1 w-full"
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t("rules.form.toolName")}
                  <input
                    type="text"
                    value={form.tool_name}
                    onChange={(e) => set({ tool_name: e.target.value })}
                    placeholder="Bash"
                    className="input mt-1 w-full"
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t("rules.form.summaryContains")}
                  <input
                    type="text"
                    value={form.summary_contains}
                    onChange={(e) => set({ summary_contains: e.target.value })}
                    placeholder="error"
                    className="input mt-1 w-full"
                  />
                </label>
                <label className="block text-xs text-gray-400">
                  {t("rules.form.count")}
                  <input
                    type="number"
                    min={1}
                    value={form.count}
                    onChange={(e) => set({ count: e.target.value })}
                    className="input mt-1 w-full"
                  />
                </label>
                {parseInt(form.count, 10) > 1 && (
                  <label className="block text-xs text-gray-400">
                    {t("rules.form.windowMinutes")}
                    <input
                      type="number"
                      min={1}
                      value={form.window_minutes}
                      onChange={(e) => set({ window_minutes: e.target.value })}
                      className="input mt-1 w-full"
                    />
                  </label>
                )}
              </div>
            )}

            {(form.rule_type === "inactivity" || form.rule_type === "status_duration") && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {form.rule_type === "status_duration" && (
                  <label className="block text-xs text-gray-400">
                    {t("rules.form.agentStatus")}
                    <div className="relative mt-1">
                      <select
                        value={form.status}
                        onChange={(e) => set({ status: e.target.value as "working" | "waiting" })}
                        className="input w-full appearance-none pr-8"
                      >
                        <option value="working">working</option>
                        <option value="waiting">waiting</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </label>
                )}
                <label className="block text-xs text-gray-400">
                  {t("rules.form.minutes")}
                  <input
                    type="number"
                    min={1}
                    value={form.minutes}
                    onChange={(e) => set({ minutes: e.target.value })}
                    className="input mt-1 w-full"
                  />
                </label>
              </div>
            )}

            {form.rule_type === "token_threshold" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block text-xs text-gray-400">
                  {t("rules.form.totalTokens")}
                  <input
                    type="number"
                    min={1}
                    value={form.total_tokens}
                    onChange={(e) => set({ total_tokens: e.target.value })}
                    className="input mt-1 w-full"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="block text-xs text-gray-400">
                {t("rules.form.cooldown")}
                <input
                  type="number"
                  min={0}
                  value={form.cooldown_seconds}
                  onChange={(e) => set({ cooldown_seconds: e.target.value })}
                  className="input mt-1 w-40"
                />
              </label>
              <button
                onClick={onCreateRule}
                disabled={!canSubmit || saving}
                className="btn-primary inline-flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? t("rules.saving") : t("rules.create")}
              </button>
            </div>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
          </div>
        )}

        {loadingRules ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">{t("rules.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-medium truncate ${rule.enabled ? "text-gray-200" : "text-gray-500 line-through"}`}
                    >
                      {rule.name}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 border border-accent/20 rounded px-1.5 py-0.5 flex-shrink-0">
                      {t(`ruleTypes.${rule.rule_type}`)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {describeRule(rule, t)} ·{" "}
                    {t("rules.cooldown", { seconds: rule.cooldown_seconds })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onToggleRule(rule)}
                    className={`text-xs px-2.5 py-1.5 rounded-md border transition-colors ${
                      rule.enabled
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        : "border-border text-gray-500 hover:text-gray-300 hover:bg-surface-3"
                    }`}
                    title={rule.enabled ? t("rules.disable") : t("rules.enable")}
                  >
                    {rule.enabled ? t("rules.enabled") : t("rules.disabled")}
                  </button>
                  <button
                    onClick={() => onDeleteRule(rule)}
                    className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    title={t("rules.delete")}
                    aria-label={t("rules.delete")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Alert feed */}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-200">
            {t("feed.title")}
            {unacked > 0 && (
              <span className="ml-2 text-[10px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                {t("feed.unackedCount", { count: unacked })}
              </span>
            )}
          </h2>
          <label className="inline-flex items-center gap-2 text-xs text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unackedOnly}
              onChange={(e) => setUnackedOnly(e.target.checked)}
              className="accent-current"
            />
            {t("feed.unackedOnly")}
          </label>
        </div>

        {loadingAlerts && alerts.length === 0 ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={unackedOnly ? BellOff : BellRing}
            title={t("feed.emptyTitle")}
            description={unackedOnly ? t("feed.emptyUnacked") : t("feed.emptyDescription")}
          />
        ) : (
          <>
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li
                  key={alert.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                    alert.acknowledged_at
                      ? "border-border bg-surface-2 opacity-70"
                      : "border-amber-500/30 bg-amber-500/5"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <BellRing
                        className={`w-3.5 h-3.5 flex-shrink-0 ${alert.acknowledged_at ? "text-gray-500" : "text-amber-400"}`}
                      />
                      <span className="text-sm text-gray-200 truncate">{alert.message}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 font-mono">
                      {timeAgo(alert.triggered_at)} · {alert.rule_name}
                      {alert.session_id && (
                        <>
                          {" · "}
                          <Link
                            to={`/sessions/${encodeURIComponent(alert.session_id)}`}
                            className="text-accent hover:underline"
                          >
                            {t("feed.viewSession")}
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  {!alert.acknowledged_at && (
                    <button
                      onClick={() => onAck(alert.id)}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border text-gray-300 hover:text-gray-100 hover:bg-surface-3 transition-colors flex-shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {t("feed.ack")}
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {alerts.length < total && (
              <div className="flex justify-center mt-4">
                <button onClick={loadMore} className="btn-ghost border border-border text-sm">
                  {t("feed.loadMore", { shown: alerts.length, total })}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

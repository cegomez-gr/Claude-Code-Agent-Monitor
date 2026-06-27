/**
 * @file DocumentViewerModal.tsx
 * @description In-page viewer opened from the terminal's clickable file links.
 * Fetches a file (sandboxed to the session cwd) and renders markdown via
 * MarkdownContent or source via CodeBlock. Click-outside and Escape close.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, FileText, AlertTriangle, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { CodeBlock } from "./conversation/CodeBlock";
import { MarkdownContent } from "./conversation/MarkdownContent";

interface FilePayload {
  path: string;
  relPath: string;
  content: string;
  ext: string;
  kind: "markdown" | "code";
}

export function DocumentViewerModal({
  sessionId,
  path,
  onClose,
}: {
  sessionId: string;
  /** Absolute or session-relative path to open; null closes the modal. */
  path: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("common");
  const [data, setData] = useState<FilePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    setData(null);
    setError(null);
    setLoading(true);
    api.sessions
      .file(sessionId, path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, path]);

  useEffect(() => {
    if (!path) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [path, onClose]);

  if (!path) return null;

  const title = data?.relPath || path.split("/").pop() || path;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-surface-1 shadow-xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <FileText className="h-4 w-4 flex-shrink-0 text-gray-500" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-200" title={title}>
            {title}
          </span>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-300"
            aria-label={t("close", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading", "Loading…")}
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 py-6 text-sm text-amber-400">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {data &&
            (data.kind === "markdown" ? (
              <MarkdownContent text={data.content} />
            ) : (
              <CodeBlock
                code={data.content}
                lang={data.ext.replace(/^\./, "")}
                showLineNumbers
                maxHeight="100%"
              />
            ))}
        </div>
      </div>
    </div>
  );
}

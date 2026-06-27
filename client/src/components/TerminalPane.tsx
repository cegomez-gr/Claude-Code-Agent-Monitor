import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Maximize2, Minimize2 } from "lucide-react";
import {
  getTerminalPrefs,
  resolveFontStack,
  resolveXtermTheme,
  useDashboardThemeAttr,
  useTerminalPrefs,
} from "../hooks/useTerminalPrefs";
import { findFilePaths } from "../lib/terminalLinks";
import { DocumentViewerModal } from "./DocumentViewerModal";
// xterm needs its stylesheet to lay out the row grid; without it the hidden
// helper textarea renders as a stray white box. Static side-effect import
// matches how the rest of the app loads CSS (see main.tsx, Tabby.tsx).
import "@xterm/xterm/css/xterm.css";

type Props = {
  sessionId: string;
  tmuxSession: string;
  /**
   * When true the parent hides the surrounding chrome (session metadata + tabs)
   * so the terminal grows upward to just under the page title. The pane itself
   * always fills the available height down to the viewport; this flag only
   * drives the toggle icon and re-measures when the chrome collapses.
   */
  expanded?: boolean;
  onToggleExpanded?: () => void;
};

// Gap (px) left between the terminal body and the viewport edge.
const VIEWPORT_GAP = 16;
// Floor so the pane never collapses to nothing on short viewports.
const MIN_HEIGHT = 240;

function getWsUrl(sessionId: string) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/terminal/${sessionId}`;
}

export function TerminalPane({
  sessionId,
  tmuxSession,
  expanded = false,
  onToggleExpanded,
}: Props) {
  const { t } = useTranslation("common");
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<import("@xterm/xterm").Terminal | null>(null);
  const fitRef = useRef<import("@xterm/addon-fit").FitAddon | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [bodyHeight, setBodyHeight] = useState(400);
  // Path of the file opened in the in-page viewer (null = closed).
  const [openFile, setOpenFile] = useState<string | null>(null);

  // Appearance prefs + the active dashboard theme (the latter only matters in
  // "sync" mode, where the xterm palette is derived from the live CSS vars).
  const prefs = useTerminalPrefs();
  const dashboardTheme = useDashboardThemeAttr();

  // Fill the available vertical space: from the body's top down to the viewport
  // bottom. When `expanded` collapses the chrome above, the body's top moves up
  // and this re-measures to grow into the reclaimed space (hence the dep).
  const recomputeHeight = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const fillBelow = window.innerHeight - top - VIEWPORT_GAP;
    setBodyHeight(Math.round(Math.max(MIN_HEIGHT, fillBelow)));
  }, [expanded]);

  useLayoutEffect(() => {
    recomputeHeight();
    window.addEventListener("resize", recomputeHeight);
    return () => window.removeEventListener("resize", recomputeHeight);
  }, [recomputeHeight]);

  // After the chrome collapses/expands the box changes, so refit next frame.
  // While expanded, Escape restores (unless the file viewer is open).
  useEffect(() => {
    const id = requestAnimationFrame(() => fitRef.current?.fit());
    if (!expanded) return () => cancelAnimationFrame(id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !openFile) onToggleExpanded?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, openFile, onToggleExpanded]);

  useEffect(() => {
    if (!containerRef.current) return;
    let term: import("@xterm/xterm").Terminal | null = null;
    let ws: WebSocket | null = null;
    let disposed = false;
    let linkDisposable: { dispose: () => void } | null = null;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");
      const { WebLinksAddon } = await import("@xterm/addon-web-links");

      if (disposed || !containerRef.current) return;

      // Read prefs from the store (not a stale closure) so a fresh terminal
      // always opens with the user's current choice.
      const p = getTerminalPrefs();
      term = new Terminal({
        theme: resolveXtermTheme(p.themeMode),
        fontFamily: resolveFontStack(p.fontFamily),
        fontSize: p.fontSize,
        cursorBlink: true,
      });
      termRef.current = term;

      const fitAddon = new FitAddon();
      fitRef.current = fitAddon;
      term.loadAddon(fitAddon);

      // Web URLs → open in a new tab.
      term.loadAddon(
        new WebLinksAddon((_event, uri) => window.open(uri, "_blank", "noopener,noreferrer"))
      );

      // File/document paths → open in the in-page viewer. The provider scans
      // each buffer line for path-like tokens (see lib/terminalLinks).
      const activeTerm = term;
      linkDisposable = term.registerLinkProvider({
        provideLinks(lineNumber, callback) {
          const buf = activeTerm.buffer.active.getLine(lineNumber - 1);
          const text = buf?.translateToString(true) ?? "";
          const matches = findFilePaths(text);
          if (matches.length === 0) {
            callback(undefined);
            return;
          }
          callback(
            matches.map((mt) => ({
              text: mt.path,
              range: {
                start: { x: mt.startIndex + 1, y: lineNumber },
                end: { x: mt.endIndex, y: lineNumber },
              },
              activate: () => setOpenFile(mt.path),
            }))
          );
        },
      });

      term.open(containerRef.current);
      fitAddon.fit();

      ws = new WebSocket(getWsUrl(sessionId));

      ws.onopen = () => {
        if (disposed) {
          ws?.close();
          return;
        }
        setConnected(true);
        // Send initial terminal size
        ws?.send(JSON.stringify({ type: "resize", cols: term!.cols, rows: term!.rows }));
      };

      ws.onmessage = (e) =>
        term?.write(e.data instanceof ArrayBuffer ? new Uint8Array(e.data) : e.data);

      ws.onclose = (e) => {
        if (!disposed) {
          setConnected(false);
          if (e.code === 4404) setError("Sesión tmux no disponible (puede haber finalizado).");
          else if (e.code !== 1000) setError(`Conexión cerrada (${e.code}).`);
        }
      };

      ws.onerror = () => {
        if (!disposed) setError("Error de conexión al terminal.");
      };

      term.onData((data) => {
        if (ws?.readyState === WebSocket.OPEN) ws.send(data);
      });
      term.onResize(({ cols, rows }) => {
        if (ws?.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ type: "resize", cols, rows }));
      });

      const ro = new ResizeObserver(() => fitAddon.fit());
      ro.observe(containerRef.current!);
      (containerRef.current as any)._ro = ro;
    })().catch((err) => {
      if (!disposed) setError(`Error al inicializar terminal: ${err.message}`);
    });

    return () => {
      disposed = true;
      linkDisposable?.dispose();
      ws?.close(1000);
      term?.dispose();
      (containerRef.current as any)?._ro?.disconnect();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

  // Apply appearance prefs to the live terminal without recreating it (which
  // would drop the WebSocket and scrollback). In "sync" mode, dashboardTheme
  // changes re-derive the palette from the now-current CSS variables. Re-fitting
  // after a font change recomputes cols/rows and fires onResize → PTY resize.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = resolveXtermTheme(prefs.themeMode);
    term.options.fontFamily = resolveFontStack(prefs.fontFamily);
    term.options.fontSize = prefs.fontSize;
    fitRef.current?.fit();
  }, [prefs.themeMode, prefs.fontFamily, prefs.fontSize, dashboardTheme]);

  return (
    <>
      <div className="rounded-lg overflow-hidden border border-border bg-surface-3">
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
          <span className="text-[11px] text-gray-500 font-mono">tmux: {tmuxSession}</span>
          {onToggleExpanded && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="ml-auto text-gray-500 hover:text-gray-300 transition-colors"
              aria-label={
                expanded
                  ? t("terminal.collapse", "Restore terminal height")
                  : t("terminal.expand", "Expand terminal")
              }
              title={
                expanded
                  ? t("terminal.collapse", "Restore terminal height")
                  : t("terminal.expand", "Expand terminal")
              }
            >
              {expanded ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <span
            className={`${onToggleExpanded ? "" : "ml-auto"} w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400" : "bg-gray-600"
            }`}
          />
        </div>
        {error ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-amber-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        ) : (
          <div ref={containerRef} className="w-full" style={{ height: bodyHeight }} />
        )}
      </div>
      <DocumentViewerModal
        sessionId={sessionId}
        path={openFile}
        onClose={() => setOpenFile(null)}
      />
    </>
  );
}

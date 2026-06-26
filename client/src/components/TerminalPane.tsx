import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
// xterm needs its stylesheet to lay out the row grid; without it the hidden
// helper textarea renders as a stray white box. Static side-effect import
// matches how the rest of the app loads CSS (see main.tsx, Tabby.tsx).
import "@xterm/xterm/css/xterm.css";

type Props = {
  sessionId: string;
  tmuxSession: string;
};

function getWsUrl(sessionId: string) {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${proto}//${host}/terminal/${sessionId}`;
}

export function TerminalPane({ sessionId, tmuxSession }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    let term: import("@xterm/xterm").Terminal | null = null;
    let ws: WebSocket | null = null;
    let disposed = false;

    (async () => {
      const { Terminal } = await import("@xterm/xterm");
      const { FitAddon } = await import("@xterm/addon-fit");

      if (disposed || !containerRef.current) return;

      term = new Terminal({
        theme: { background: "#0d0d0d", foreground: "#e2e8f0" },
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 13,
        cursorBlink: true,
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
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
      ws?.close(1000);
      term?.dispose();
      (containerRef.current as any)?._ro?.disconnect();
    };
  }, [sessionId]);

  return (
    <div className="rounded-lg overflow-hidden border border-border bg-[#0d0d0d]">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-surface-2">
        <span className="text-[11px] text-gray-500 font-mono">tmux: {tmuxSession}</span>
        <span
          className={`ml-auto w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-gray-600"}`}
        />
      </div>
      {error ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-amber-400">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      ) : (
        <div ref={containerRef} className="w-full" style={{ height: 400 }} />
      )}
    </div>
  );
}

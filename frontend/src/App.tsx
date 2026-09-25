import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Server,
  Layers,
  Cpu,
  Database,
  ExternalLink,
} from 'lucide-react';

interface HealthData {
  status: string;
  timestamp?: string;
  uptime?: number;
  environment?: string;
}

export default function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Use relative /api/health which proxies through Vite in dev, or fallback to localhost:5000
      const apiUrl = import.meta.env.VITE_API_BASE_URL
        ? `${import.meta.env.VITE_API_BASE_URL}/api/health`
        : '/api/health';

      const res = await fetch(apiUrl);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data: HealthData = await res.json();
      setHealth(data);
      setLastChecked(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to backend service');
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const isConnected = health && health.status === 'ok';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">
                InsightForge-AI
              </span>
              <span className="ml-2 text-xs uppercase px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-mono">
                v0.1.0 Scaffolding
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border ${
                isConnected
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                  : loading
                    ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isConnected
                    ? 'bg-emerald-400 animate-pulse'
                    : loading
                      ? 'bg-amber-400 animate-pulse'
                      : 'bg-rose-400'
                }`}
              />
              <span>
                {isConnected
                  ? 'Backend Connected'
                  : loading
                    ? 'Connecting...'
                    : 'Backend Disconnected'}
              </span>
            </div>
            <button
              onClick={fetchHealth}
              disabled={loading}
              title="Refresh connection status"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 transition-colors disabled:opacity-50 text-slate-300 hover:text-white"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 space-y-8">
        {/* Hero Section */}
        <section className="text-center md:text-left md:flex md:items-center md:justify-between py-4">
          <div className="space-y-2 max-w-2xl">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white">
              Full-Stack Agentic AI Research Platform
            </h1>
            <p className="text-slate-400 text-sm md:text-base leading-relaxed">
              Monorepo architecture with Vite frontend, Express backend, MCP tool integration, and
              multi-service containerization ready for autonomous research agent orchestration.
            </p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-3 justify-center md:justify-end">
            <a
              href="http://localhost:5000/api/health"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg transition-colors"
            >
              <span>Raw Health JSON</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        {/* Health Check Wiring Card */}
        <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 shadow-xl relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-40 h-40 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-200">
                End-to-End System Health Verification
              </h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              GET /api/health →{' '}
              <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {isConnected ? '200 OK' : 'Checking...'}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Status Item */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Status</div>
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-base font-semibold text-emerald-400 uppercase">
                      {health?.status}
                    </span>
                  </>
                ) : loading ? (
                  <span className="text-sm font-medium text-amber-400">Pinging...</span>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                    <span className="text-base font-semibold text-rose-400">Offline</span>
                  </>
                )}
              </div>
            </div>

            {/* Response Time / Uptime */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Backend Uptime</div>
              <div className="text-base font-semibold text-slate-200 font-mono">
                {health?.uptime !== undefined ? `${health.uptime.toFixed(1)}s` : '—'}
              </div>
            </div>

            {/* Environment */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Environment</div>
              <div className="text-base font-semibold text-indigo-300 font-mono">
                {health?.environment || 'development'}
              </div>
            </div>

            {/* Last Checked */}
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-4">
              <div className="text-xs text-slate-400 mb-1">Last Heartbeat</div>
              <div className="text-xs font-mono text-slate-300">
                {lastChecked ? lastChecked.toLocaleTimeString() : '—'}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error} — ensure the backend server is running on port 5000.</span>
            </div>
          )}
        </section>

        {/* Monorepo Architecture Overview */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-200">Scaffolded Monorepo Modules</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 border border-slate-800/70 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-800/50 flex items-center justify-center text-cyan-400 mb-3">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-200">/frontend</h3>
              <p className="text-xs text-slate-400 mt-1">
                React 19, TypeScript, Vite, Tailwind CSS with API proxy configuration and health
                status tracker.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/70 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-indigo-950/80 border border-indigo-800/50 flex items-center justify-center text-indigo-400 mb-3">
                <Server className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-200">/backend</h3>
              <p className="text-xs text-slate-400 mt-1">
                Node.js, Express, TypeScript with clean modular layers: routes, controllers,
                services, agents, models, config, and websocket.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/70 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-800/50 flex items-center justify-center text-emerald-400 mb-3">
                <Cpu className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-200">/mcp-servers</h3>
              <p className="text-xs text-slate-400 mt-1">
                Dedicated tool servers for Model Context Protocol: web-search and doc-retrieval
                connectors.
              </p>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/70 rounded-xl p-5 hover:border-slate-700 transition-colors">
              <div className="w-8 h-8 rounded-lg bg-amber-950/80 border border-amber-800/50 flex items-center justify-center text-amber-400 mb-3">
                <Database className="w-4 h-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-200">/docker & /docs</h3>
              <p className="text-xs text-slate-400 mt-1">
                Docker Compose orchestration (frontend, backend, mongo, redis) and comprehensive
                documentation.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-400">
        InsightForge-AI &bull; Full-Stack Agentic AI Research Platform Scaffolding
      </footer>
    </div>
  );
}

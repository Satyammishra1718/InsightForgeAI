import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Server,
  Database,
  Cpu,
  Globe,
  FileSearch,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  Layers,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ServiceCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'offline';
  latencyMs?: number;
  details?: string;
  url?: string;
}

interface SystemStatusResponse {
  status: 'operational' | 'degraded' | 'partial';
  timestamp: string;
  services: ServiceCheck[];
}

interface SystemStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SystemStatusModal({ isOpen, onClose }: SystemStatusModalProps) {
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/system/status');
      if (res.ok) {
        const json: SystemStatusResponse = await res.json();
        setData(json);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  if (!isOpen) return null;

  const getServiceIcon = (name: string) => {
    if (name.includes('MongoDB')) return <Database className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />;
    if (name.includes('Redis')) return <Layers className="w-4 h-4 text-rose-500 dark:text-rose-400" />;
    if (name.includes('Python')) return <Cpu className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />;
    if (name.includes('Web Search')) return <Globe className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />;
    return <FileSearch className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
  };

  const getStatusBadge = (status: ServiceCheck['status']) => {
    if (status === 'healthy') {
      return (
        <Badge variant="success" className="text-[10px] gap-1 px-2 py-0.5">
          <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Operational</span>
        </Badge>
      );
    }
    if (status === 'degraded') {
      return (
        <Badge variant="warning" className="text-[10px] gap-1 px-2 py-0.5">
          <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Degraded</span>
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="text-[10px] gap-1 px-2 py-0.5">
        <X className="w-3 h-3 text-rose-600 dark:text-rose-400" />
        <span>Offline</span>
      </Badge>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in-50 duration-200">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400">
              <Server className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">System Architecture Status</h2>
                {data && (
                  <Badge
                    variant={data.status === 'operational' ? 'success' : 'warning'}
                    className="text-[10px] font-mono capitalize"
                  >
                    {data.status}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Live healthcheck across polyglot microservices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchStatus}
              disabled={loading}
              title="Refresh services"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Services List */}
        <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 space-y-2">
              <Activity className="w-6 h-6 animate-pulse text-indigo-500 dark:text-indigo-400 mx-auto" />
              <p>Pinging services...</p>
            </div>
          ) : !data || !data.services ? (
            <div className="text-center py-6 text-xs text-rose-500 dark:text-rose-400">
              Failed to query backend system status endpoint.
            </div>
          ) : (
            data.services.map((svc, i) => (
              <div
                key={i}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800/90 bg-slate-50/80 dark:bg-slate-950/60 flex items-center justify-between gap-3 text-left shadow-sm dark:shadow-none"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    {getServiceIcon(svc.name)}
                  </div>
                  <div className="space-y-0.5">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{svc.name}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{svc.details || 'Operational'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {svc.latencyMs !== undefined && (
                    <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400">
                      {svc.latencyMs}ms
                    </span>
                  )}
                  {getStatusBadge(svc.status)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-mono text-[11px]">
            {data?.timestamp ? `Checked at ${new Date(data.timestamp).toLocaleTimeString()}` : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

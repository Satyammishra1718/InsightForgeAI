import { useState, useEffect, useCallback, type MouseEvent } from 'react';
import {
  X,
  History,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  Trash2,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import type { ResearchSession } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface SessionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (sessionId: string) => void;
  currentSessionId?: string;
}

export function SessionHistoryModal({
  isOpen,
  onClose,
  onSelectSession,
  currentSessionId,
}: SessionHistoryModalProps) {
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sessions?limit=50');
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.warn('Failed to load session history:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSessions();
    }
  }, [isOpen, fetchSessions]);

  const handleDelete = async (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this research session and its associated report?')) return;

    setDeletingId(id);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s._id !== id));
      }
    } catch (err) {
      console.warn('Failed to delete session:', err);
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  const filteredSessions = sessions.filter((s) => {
    const matchesSearch = s.query.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || s.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="success" className="text-[10px] gap-1 px-2 py-0.5">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Completed</span>
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="cyan" className="text-[10px] gap-1 px-2 py-0.5 animate-pulse">
            <Clock className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
            <span>In Progress</span>
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0.5">
            <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
            <span>Queued</span>
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="text-[10px] gap-1 px-2 py-0.5">
            <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            <span>Failed</span>
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 dark:bg-slate-950/80 backdrop-blur-md animate-in fade-in-50 duration-200">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Research Session History</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Revisit past reports and reasoning traces</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchSessions}
              disabled={loading}
              title="Refresh sessions"
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

        {/* Filter & Search Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-950/40 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search past research queries..."
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1 text-xs">
            {['all', 'completed', 'in_progress', 'failed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-2.5 py-1 rounded-lg capitalize transition-colors cursor-pointer ${
                  filterStatus === st
                    ? 'bg-indigo-600 text-white font-medium shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-xs space-y-2">
              <Sparkles className="w-6 h-6 text-slate-400 dark:text-slate-600 mx-auto" />
              <p>No research sessions found matching your filter.</p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const isSelected = session._id === currentSessionId;

              return (
                <div
                  key={session._id}
                  onClick={() => {
                    onSelectSession(session._id);
                    onClose();
                  }}
                  className={`group p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-left ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/80 dark:bg-indigo-950/40 ring-1 ring-indigo-500/50 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/40 hover:bg-white dark:hover:bg-slate-850 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none'
                  }`}
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(session.status)}
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {new Date(session.createdAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-cyan-300 transition-colors truncate">
                      {session.query}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, session._id)}
                      disabled={deletingId === session._id}
                      title="Delete session"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>{filteredSessions.length} sessions listed</span>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  BrainCircuit,
  Search,
  ShieldCheck,
  FileCheck,
  Clock,
  Layers,
} from 'lucide-react';
import type { AgentTrace } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ReasoningTraceViewerProps {
  traces: AgentTrace[];
}

export function ReasoningTraceViewer({ traces }: ReasoningTraceViewerProps) {
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [expandedTraceIds, setExpandedTraceIds] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Group or filter traces
  const filteredTraces = traces.filter((t) => {
    if (selectedAgent === 'all') return true;
    return t.agentName.toLowerCase() === selectedAgent.toLowerCase();
  });

  const toggleExpand = (traceId: string) => {
    setExpandedTraceIds((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedTraceIds(new Set(filteredTraces.map((t, i) => t._id || `trace-${i}`)));
  };

  const collapseAll = () => {
    setExpandedTraceIds(new Set());
  };

  const copyToClipboard = (text: unknown, key: string) => {
    const content = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
    navigator.clipboard.writeText(content);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getAgentBadge = (agentName: string) => {
    const name = agentName.toLowerCase();
    if (name.includes('planner')) {
      return (
        <Badge variant="default" className="gap-1 font-mono text-[10px]">
          <BrainCircuit className="w-3 h-3 text-indigo-200" />
          <span>Planner</span>
        </Badge>
      );
    }
    if (name.includes('researcher')) {
      return (
        <Badge variant="cyan" className="gap-1 font-mono text-[10px]">
          <Search className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
          <span>{agentName}</span>
        </Badge>
      );
    }
    if (name.includes('critic')) {
      return (
        <Badge variant="warning" className="gap-1 font-mono text-[10px]">
          <ShieldCheck className="w-3 h-3 text-amber-600 dark:text-amber-400" />
          <span>Critic / Verifier</span>
        </Badge>
      );
    }
    if (name.includes('synthesizer')) {
      return (
        <Badge variant="success" className="gap-1 font-mono text-[10px]">
          <FileCheck className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
          <span>Synthesizer</span>
        </Badge>
      );
    }
    return <Badge variant="secondary">{agentName}</Badge>;
  };

  const formatPayload = (data: unknown): string => {
    if (data === null || data === undefined) return 'null';
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return data;
      }
    }
    return JSON.stringify(data, null, 2);
  };

  return (
    <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-sm dark:shadow-xl space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Agent Reasoning & Observability Trace
            </h2>
            <Badge variant="purple" className="font-mono text-xs">
              {traces.length} Telemetry Steps
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Inspect the exact prompt inputs, retrieved context chunks, and LLM thoughts at each step.
          </p>
        </div>

        {/* Trace Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={expandAll}
            className="text-xs text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Expand All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={collapseAll}
            className="text-xs text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Collapse All
          </Button>
        </div>
      </div>

      {/* Filter Tabs by Agent */}
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-950/70 rounded-xl border border-slate-200 dark:border-slate-800/80">
        {['all', 'planner', 'researcher_1', 'researcher_2', 'critic', 'synthesizer'].map((agent) => {
          const isSelected = selectedAgent === agent;
          const count =
            agent === 'all'
              ? traces.length
              : traces.filter((t) => t.agentName.toLowerCase() === agent).length;

          return (
            <button
              key={agent}
              type="button"
              onClick={() => setSelectedAgent(agent)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="capitalize">{agent.replace('_', ' ')}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  isSelected ? 'bg-indigo-700/60 text-indigo-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Trace Items List */}
      <div className="space-y-3">
        {filteredTraces.length === 0 ? (
          <div className="text-center py-12 text-slate-500 dark:text-slate-400 text-sm border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
            <Layers className="w-8 h-8 text-slate-400 dark:text-slate-600 mx-auto" />
            <p>No traces recorded for the selected filter.</p>
          </div>
        ) : (
          filteredTraces.map((trace, index) => {
            const traceId = trace._id || `trace-${index}`;
            const isExpanded = expandedTraceIds.has(traceId);

            return (
              <div
                key={traceId}
                className="border border-slate-200 dark:border-slate-800/80 bg-slate-50/70 dark:bg-slate-950/60 rounded-xl overflow-hidden transition-all hover:border-slate-300 dark:hover:border-slate-700 shadow-sm dark:shadow-none"
              >
                {/* Collapsible Header */}
                <div
                  onClick={() => toggleExpand(traceId)}
                  className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-900/50 transition-colors select-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </span>

                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400 font-semibold">
                      #{String(index + 1).padStart(2, '0')}
                    </span>

                    <div className="flex items-center gap-2">
                      {getAgentBadge(trace.agentName)}
                      <span className="font-mono font-medium text-xs text-slate-800 dark:text-slate-200">
                        {trace.step}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>
                        {trace.timestamp ? new Date(trace.timestamp).toLocaleTimeString() : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Collapsible Content */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-slate-200 dark:border-slate-800/70 p-4 space-y-4 bg-white dark:bg-slate-900/30"
                    >
                      {/* Grid for Input & Output */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Input Block */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-indigo-600 dark:text-indigo-300 font-mono">
                              AGENT INPUT / PROMPT
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(trace.input, `${traceId}-in`)}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {copiedKey === `${traceId}-in` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-300 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                            {formatPayload(trace.input)}
                          </pre>
                        </div>

                        {/* Output Block */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                              AGENT OUTPUT / REASONING
                            </span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(trace.output, `${traceId}-out`)}
                              className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {copiedKey === `${traceId}-out` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                  <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <pre className="p-3 rounded-lg bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-800 dark:text-slate-300 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                            {formatPayload(trace.output)}
                          </pre>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

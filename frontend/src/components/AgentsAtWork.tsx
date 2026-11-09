import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BrainCircuit,
  Search,
  BookOpen,
  ShieldCheck,
  FileCheck2,
  CheckCircle2,
  Clock,
  Loader2,
  AlertCircle,
  Radio,
  Terminal,
} from 'lucide-react';
import type { AgentCardInfo } from '@/types';
import { Badge } from '@/components/ui/badge';

interface AgentsAtWorkProps {
  agents: AgentCardInfo[];
  isRunning: boolean;
  query: string;
  isCachedHit?: boolean;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  planner: <BrainCircuit className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />,
  researcher_1: <Search className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />,
  researcher_2: <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
  critic: <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
  synthesizer: <FileCheck2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />,
};

export const AgentsAtWork: React.FC<AgentsAtWorkProps> = ({
  agents,
  isRunning,
  query,
  isCachedHit = false,
}) => {
  // Calculate completed percentage
  const completedCount = agents.filter((a) => a.status === 'done').length;
  const activeCount = agents.filter((a) => a.status === 'active').length;
  const totalAgents = agents.length;
  const progressPercent = Math.round((completedCount / totalAgents) * 100);

  return (
    <div className="w-full space-y-6">
      {/* Header with Title & Overall Progress */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-sm dark:shadow-none">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  isRunning ? 'bg-cyan-500' : isCachedHit ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}
              />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>Multi-Agent Swarm Orchestration</span>
              {isCachedHit && (
                <Badge variant="cyan" className="font-mono text-[10px]">
                  Redis Semantic Cache Hit
                </Badge>
              )}
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-xl">
            Query: <span className="text-slate-800 dark:text-slate-200 font-medium italic">"{query}"</span>
          </p>
        </div>

        {/* Progress Bar & Status Pill */}
        <div className="flex items-center gap-4 sm:min-w-[240px]">
          <div className="flex-1 space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
              <span>{completedCount === totalAgents ? 'Pipeline Completed' : 'Pipeline Progress'}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{progressPercent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
          </div>

          <Badge
            variant={
              completedCount === totalAgents
                ? 'success'
                : activeCount > 0
                ? 'default'
                : 'secondary'
            }
            className="shrink-0 font-mono"
          >
            {completedCount === totalAgents
              ? 'Complete'
              : activeCount > 0
              ? `${activeCount} Active`
              : 'Standby'}
          </Badge>
        </div>
      </div>

      {/* Agents Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <AnimatePresence>
          {agents.map((agent, index) => {
            const isWaiting = agent.status === 'waiting';
            const isActive = agent.status === 'active';
            const isDone = agent.status === 'done';
            const isFailed = agent.status === 'failed';

            return (
              <motion.div
                key={agent.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                className={`relative rounded-2xl border p-4 transition-all duration-300 flex flex-col justify-between ${
                  isActive
                    ? 'border-cyan-500/70 bg-gradient-to-b from-indigo-50/80 to-white dark:from-indigo-950/60 dark:to-slate-900/90 shadow-xl shadow-cyan-500/10 ring-1 ring-cyan-500/40'
                    : isDone
                    ? 'border-emerald-500/40 bg-emerald-50/50 dark:bg-slate-900/70 text-slate-800 dark:text-slate-200 shadow-sm'
                    : isFailed
                    ? 'border-rose-500/40 bg-rose-50/60 dark:bg-rose-950/20 text-slate-800 dark:text-slate-200 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/30 text-slate-700 dark:text-slate-300 shadow-sm opacity-90 hover:opacity-100'
                }`}
              >
                {/* Active Pulsing Indicator Glow */}
                {isActive && (
                  <div className="absolute top-0 right-0 -mr-1 -mt-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping pointer-events-none" />
                )}

                {/* Card Top: Icon & Status Badge */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div
                      className={`p-2.5 rounded-xl border transition-colors ${
                        isActive
                          ? 'bg-cyan-50 dark:bg-cyan-950/80 border-cyan-300 dark:border-cyan-700/60 shadow-md shadow-cyan-500/20'
                          : isDone
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800/60'
                          : isFailed
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800/60'
                          : 'bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50'
                      }`}
                    >
                      {AGENT_ICONS[agent.id] || <BrainCircuit className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />}
                    </div>

                    {/* Status Indicator */}
                    {isWaiting && (
                      <Badge variant="secondary" className="text-[10px] gap-1 px-2 py-0.5">
                        <Clock className="w-3 h-3 text-slate-500 dark:text-slate-400" />
                        <span>Waiting</span>
                      </Badge>
                    )}
                    {isActive && (
                      <Badge
                        variant="cyan"
                        className="text-[10px] gap-1 px-2 py-0.5 animate-pulse font-mono"
                      >
                        <Loader2 className="w-3 h-3 animate-spin text-cyan-600 dark:text-cyan-400" />
                        <span>Active</span>
                      </Badge>
                    )}
                    {isDone && (
                      <Badge variant="success" className="text-[10px] gap-1 px-2 py-0.5">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                        <span>Done</span>
                      </Badge>
                    )}
                    {isFailed && (
                      <Badge variant="destructive" className="text-[10px] gap-1 px-2 py-0.5">
                        <AlertCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                        <span>Failed</span>
                      </Badge>
                    )}
                  </div>

                  {/* Name & Role */}
                  <div className="space-y-0.5">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight flex items-center justify-between">
                      <span>{agent.name}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">0{index + 1}</span>
                    </h3>
                    <p className="text-[11px] text-indigo-600 dark:text-indigo-300 font-medium leading-tight">
                      {agent.role}
                    </p>
                  </div>
                </div>

                {/* Card Bottom: Live Summary / Description */}
                <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800/80 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="uppercase tracking-wider font-mono">Status Feed</span>
                    {agent.lastUpdated && (
                      <span className="font-mono text-slate-500 dark:text-slate-400">{agent.lastUpdated}</span>
                    )}
                  </div>

                  <p
                    className={`text-xs leading-relaxed transition-colors ${
                      isActive
                        ? 'text-cyan-900 dark:text-cyan-200 font-medium'
                        : isDone
                        ? 'text-slate-700 dark:text-slate-300'
                        : isFailed
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {agent.summary || agent.description}
                  </p>

                  {/* Sub-progress bar for active state */}
                  {isActive && (
                    <div className="w-full h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-2">
                      <div className="w-full h-full bg-cyan-500 dark:bg-cyan-400 animate-pulse" />
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Live WebSocket Event Ticker */}
      <div className="bg-slate-100/90 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800/90 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 font-mono backdrop-blur-md">
        <div className="flex items-center gap-2 overflow-hidden">
          <Terminal className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <span className="text-slate-500 dark:text-slate-400 shrink-0">Redis Stream:</span>
          <span className="text-slate-800 dark:text-slate-300 truncate">
            {isRunning
              ? agents.find((a) => a.status === 'active')?.summary ||
                'Orchestration loop active in LangGraph microservice...'
              : completedCount === totalAgents
              ? 'Multi-agent synthesis graph execution completed. Final report generated.'
              : 'Idle. Ready to dispatch research pipeline.'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 text-[10px]">
          <Radio className="w-3 h-3 text-cyan-600 dark:text-cyan-400 animate-pulse" />
          <span className="text-slate-500 dark:text-slate-400">session:progress</span>
        </div>
      </div>
    </div>
  );
};

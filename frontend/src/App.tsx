import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  Activity,
  Bot,
  AlertCircle,
  RefreshCw,
  Sparkles,
  ArrowLeft,
  Share2,
  Check,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { HeroSection } from '@/components/HeroSection';
import { AgentsAtWork } from '@/components/AgentsAtWork';
import { ReportViewer } from '@/components/ReportViewer';
import { ReasoningTraceViewer } from '@/components/ReasoningTraceViewer';
import { SessionHistoryModal } from '@/components/SessionHistoryModal';
import { SystemStatusModal } from '@/components/SystemStatusModal';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useResearchSession } from '@/hooks/useResearchSession';

export default function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('insightforge_theme');
    return saved ? saved === 'dark' : true; // Dark mode first
  });

  const [activeTab, setActiveTab] = useState<'report' | 'traces' | 'agents'>('report');
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isStatusOpen, setIsStatusOpen] = useState<boolean>(false);
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  const {
    currentSession,
    agents,
    report,
    traces,
    isRunning,
    error,
    isCachedHit,
    wsConnected,
    startResearch,
    loadExistingSession,
    resetState,
  } = useResearchSession();

  // Dark mode effect
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('insightforge_theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('insightforge_theme', 'light');
    }
  }, [darkMode]);

  // Fetch session count for navbar badge
  const fetchSessionCount = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions?limit=1');
      if (res.ok) {
        const data = await res.json();
        if (data.pagination) {
          setHistoryCount(data.pagination.total);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchSessionCount();
  }, [fetchSessionCount, currentSession]);

  // Handle URL hash or query param if session ID was provided
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    if (sessionId) {
      loadExistingSession(sessionId);
    }
  }, [loadExistingSession]);

  // Auto-switch to report tab when report becomes available
  useEffect(() => {
    if (report && activeTab === 'agents') {
      setActiveTab('report');
    }
  }, [report, activeTab]);

  const handleShareLink = () => {
    if (!currentSession) return;
    const url = `${window.location.origin}${window.location.pathname}?session=${currentSession._id}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleBackToLanding = () => {
    window.history.replaceState({}, '', window.location.pathname);
    resetState();
  };

  const hasActiveSession = Boolean(currentSession || isRunning);

  return (
    <div
      className={`min-h-screen transition-colors duration-300 flex flex-col ${
        darkMode ? 'dark bg-slate-950 text-slate-100' : 'light bg-slate-50 text-slate-900'
      }`}
    >
      {/* Background Subtle Grid Pattern */}
      <div className="fixed inset-0 bg-grid-pattern pointer-events-none opacity-40 -z-20" />

      {/* Navbar */}
      <Navbar
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenStatus={() => setIsStatusOpen(true)}
        historyCount={historyCount}
        wsConnected={wsConnected}
        isRunning={isRunning}
        onReset={handleBackToLanding}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col justify-between">
        <AnimatePresence mode="wait">
          {!hasActiveSession ? (
            /* Landing View / Hero Section */
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="space-y-12"
            >
              <HeroSection onStartResearch={startResearch} isRunning={isRunning} />
            </motion.div>
          ) : (
            /* Active Research / Results View */
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35 }}
              className="space-y-6"
            >
              {/* Session Top Navigation & Query Breadcrumb */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleBackToLanding}
                    className="text-xs text-slate-300 hover:text-white gap-1.5 p-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">New Query</span>
                  </Button>

                  <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-400">RESEARCH SESSION</span>
                      {currentSession?.status && (
                        <Badge
                          variant={
                            currentSession.status === 'completed'
                              ? 'success'
                              : currentSession.status === 'in_progress'
                              ? 'cyan'
                              : currentSession.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                          }
                          className="text-[10px] capitalize font-mono"
                        >
                          {currentSession.status.replace('_', ' ')}
                        </Badge>
                      )}
                      {isCachedHit && (
                        <Badge variant="cyan" className="text-[10px] font-mono">
                          Cached (35ms)
                        </Badge>
                      )}
                    </div>
                    <h2 className="text-sm sm:text-base font-semibold text-white line-clamp-1">
                      {currentSession?.query}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleShareLink}
                    className="text-xs text-slate-300 border-slate-700 hover:bg-slate-800 gap-1.5"
                  >
                    {shareCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Share</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {/* Error State Banner */}
              {error && (
                <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-800/80 text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                    <div>
                      <h4 className="font-semibold text-sm text-rose-100">Research Failed</h4>
                      <p className="text-xs text-rose-300">{error}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {currentSession && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => startResearch(currentSession.query)}
                        className="text-xs gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Research</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleBackToLanding}
                      className="text-xs text-rose-300 hover:text-white"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}

              {/* Live Agents At Work Panel (always visible during run, or expandable) */}
              <AgentsAtWork
                agents={agents}
                isRunning={isRunning}
                query={currentSession?.query || ''}
                isCachedHit={isCachedHit}
              />

              {/* View Tabs: Report | Reasoning Traces | Swarm Status */}
              <Tabs
                value={activeTab}
                onValueChange={(val) => setActiveTab(val as 'report' | 'traces' | 'agents')}
                className="w-full space-y-4 pt-4"
              >
                <div className="flex items-center justify-between flex-wrap gap-3 border-b border-slate-800 pb-3">
                  <TabsList className="bg-slate-900 border border-slate-800">
                    <TabsTrigger value="report" className="gap-2">
                      <FileText className="w-4 h-4" />
                      <span>Executive Report</span>
                      {report && (
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      )}
                    </TabsTrigger>

                    <TabsTrigger value="traces" className="gap-2">
                      <Activity className="w-4 h-4" />
                      <span>Reasoning Traces</span>
                      {traces.length > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono">
                          {traces.length}
                        </span>
                      )}
                    </TabsTrigger>

                    <TabsTrigger value="agents" className="gap-2">
                      <Bot className="w-4 h-4" />
                      <span>Agent Overview</span>
                    </TabsTrigger>
                  </TabsList>

                  <div className="text-xs text-slate-400 font-mono hidden md:block">
                    {isRunning
                      ? 'Generating insights with LangGraph & RAG...'
                      : report
                      ? 'Synthesis complete & cited.'
                      : 'Awaiting pipeline dispatch.'}
                  </div>
                </div>

                {/* Tab 1: Final Report */}
                <TabsContent value="report">
                  {report ? (
                    <ReportViewer report={report} query={currentSession?.query || ''} />
                  ) : isRunning ? (
                    /* Loading State Skeletons */
                    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 space-y-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                          <Sparkles className="w-4 h-4 animate-spin" />
                        </div>
                        <div className="space-y-1">
                          <div className="font-semibold text-sm text-slate-200">
                            Synthesizing Cross-Verified Intelligence Briefing...
                          </div>
                          <p className="text-xs text-slate-400">
                            The Synthesizer agent is currently assembling verified claims and citations into markdown.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 pt-4">
                        <Skeleton className="h-6 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <Skeleton className="h-4 w-2/3" />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                        <Skeleton className="h-28 rounded-xl" />
                        <Skeleton className="h-28 rounded-xl" />
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl space-y-3">
                      <FileText className="w-10 h-10 text-slate-600 mx-auto" />
                      <h3 className="font-semibold text-sm text-slate-300">No report generated yet</h3>
                      <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        Start a research query to let the multi-agent swarm generate a deep intelligence report.
                      </p>
                    </div>
                  )}
                </TabsContent>

                {/* Tab 2: Reasoning Traces (Observability) */}
                <TabsContent value="traces">
                  <ReasoningTraceViewer traces={traces} />
                </TabsContent>

                {/* Tab 3: Detailed Agents Overview */}
                <TabsContent value="agents">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 space-y-4">
                    <h3 className="font-bold text-base text-white">Multi-Agent Swarm Hierarchy</h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">
                      Each agent in InsightForge-AI is specialized and bound by specific orchestration contracts.
                      The Planner maps the information space, Researchers mine vector embeddings and Tavily web results via MCP,
                      the Critic validates claims against source snippets, and the Synthesizer outputs publication-grade markdown.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                        <span className="text-xs font-bold text-indigo-400 font-mono">01. DECOMPOSITION</span>
                        <h4 className="font-semibold text-sm text-slate-200">Query Planner</h4>
                        <p className="text-xs text-slate-400">
                          Breaks the prompt into mutually exclusive, collectively exhaustive sub-questions.
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                        <span className="text-xs font-bold text-cyan-400 font-mono">02. RETRIEVAL & MINING</span>
                        <h4 className="font-semibold text-sm text-slate-200">Parallel Researchers</h4>
                        <p className="text-xs text-slate-400">
                          Utilizes ChromaDB dense embeddings, BM25 rank fusion, and external web APIs.
                        </p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1.5">
                        <span className="text-xs font-bold text-emerald-400 font-mono">03. VERIFICATION</span>
                        <h4 className="font-semibold text-sm text-slate-200">Critic & Synthesizer</h4>
                        <p className="text-xs text-slate-400">
                          Guarantees that no claim in the briefing lacks an anchor to a retrieved source chunk.
                        </p>
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/60 py-6 mt-16 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-300">InsightForge AI</span>
            <span>&bull;</span>
            <span>Autonomous Multi-Agent Deep Research Platform</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span>LangGraph</span>
            <span>&bull;</span>
            <span>ChromaDB Hybrid RAG</span>
            <span>&bull;</span>
            <span>Model Context Protocol</span>
            <span>&bull;</span>
            <span>Redis Pub/Sub & BullMQ</span>
          </div>
        </div>
      </footer>

      {/* Past Sessions History Modal */}
      <SessionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onSelectSession={(id) => {
          window.history.replaceState({}, '', `?session=${id}`);
          loadExistingSession(id);
        }}
        currentSessionId={currentSession?._id}
      />

      {/* Live System Architecture Status Modal */}
      <SystemStatusModal
        isOpen={isStatusOpen}
        onClose={() => setIsStatusOpen(false)}
      />
    </div>
  );
}

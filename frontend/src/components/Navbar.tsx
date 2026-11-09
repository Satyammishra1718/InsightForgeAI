import React from 'react';
import { Layers, History, Sun, Moon, Radio, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavbarProps {
  darkMode: boolean;
  setDarkMode: (val: boolean | ((prev: boolean) => boolean)) => void;
  onOpenHistory: () => void;
  onOpenStatus: () => void;
  historyCount?: number;
  wsConnected: boolean;
  isRunning: boolean;
  onReset: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  setDarkMode,
  onOpenHistory,
  onOpenStatus,
  historyCount = 0,
  wsConnected,
  isRunning,
  onReset,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-colors dark:border-slate-800/80 dark:bg-slate-950/80 light:bg-white/80 light:border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and Brand */}
        <div
          onClick={onReset}
          className="flex items-center gap-3 cursor-pointer group transition-transform active:scale-95"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-shadow">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-indigo-400 via-purple-300 to-cyan-400 bg-clip-text text-transparent">
                InsightForge
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded-md bg-indigo-950/80 text-indigo-400 border border-indigo-800/60 font-mono">
                AI
              </span>
            </div>
            <p className="text-[10px] text-slate-400 -mt-0.5 hidden sm:block">
              Autonomous Multi-Agent Deep Research
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* System Status Modal Trigger */}
          <button
            onClick={onOpenStatus}
            title="Inspect system architecture health"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border bg-slate-900/80 hover:bg-slate-850 text-slate-300 hover:text-white border-slate-800 transition-colors cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden sm:inline">System Status</span>
          </button>

          {/* WebSocket Streaming Indicator */}
          <div
            className={`hidden md:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              wsConnected
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${wsConnected && isRunning ? 'animate-pulse text-cyan-400' : ''}`} />
            <span>{wsConnected ? (isRunning ? 'Streaming Live' : 'Pub/Sub Ready') : isRunning ? 'Polling' : 'Idle'}</span>
          </div>

          {/* New Research Button (if active or viewing report) */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="text-xs sm:text-sm text-slate-300 hover:text-white"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
            New Research
          </Button>

          {/* Session History Modal Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenHistory}
            className="text-xs sm:text-sm relative text-slate-200 border-slate-700 hover:bg-slate-800"
          >
            <History className="w-3.5 h-3.5 mr-1.5 text-cyan-400" />
            <span>History</span>
            {historyCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30">
                {historyCount}
              </span>
            )}
          </Button>

          {/* Light / Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode((prev) => !prev)}
            aria-label="Toggle theme"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/70 border border-slate-800 transition-colors"
          >
            {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
          </button>
        </div>
      </div>
    </header>
  );
};

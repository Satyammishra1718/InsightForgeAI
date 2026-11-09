import React, { useState, type FormEvent, type KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Search, ArrowRight, Sparkles, Cpu, GitBranch, ShieldCheck, Zap, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeroSectionProps {
  onStartResearch: (query: string) => void;
  isRunning: boolean;
}

const SAMPLE_PROMPTS = [
  'Post-Quantum Cryptography: Lattice vs Hash-based Algorithms in 2026',
  'Autonomous Multi-Agent Architectures: LangGraph vs AutoGen vs CrewAI',
  'Solid-State Battery Breakthroughs: Commercial Viability of Silicon Anodes',
  'Neuromorphic Computing: Spiking Neural Networks for Edge Robotics',
];

export const HeroSection: React.FC<HeroSectionProps> = ({ onStartResearch, isRunning }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim() || isRunning) return;
    onStartResearch(query.trim());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative overflow-hidden py-12 md:py-20 lg:py-24">
      {/* Background Gradients & Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-cyan-500/20 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-12 right-10 w-72 h-72 bg-cyan-500/10 blur-[90px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-8">
        {/* Top Tagline Badge */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-200 bg-indigo-50/80 text-indigo-700 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-indigo-300 backdrop-blur-md text-xs sm:text-sm"
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-cyan-400 animate-pulse" />
          <span>Next-Generation Autonomous Multi-Agent Synthesis</span>
          <span className="hidden sm:inline-block text-slate-400 dark:text-slate-500">•</span>
          <span className="hidden sm:inline-block text-slate-500 dark:text-slate-400 font-mono text-xs">LangGraph + RAG + MCP</span>
        </motion.div>

        {/* Main Headline */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="space-y-4"
        >
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-[1.15]">
            Turn Complex Questions into{' '}
            <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-cyan-600 dark:from-indigo-400 dark:via-purple-300 dark:to-cyan-400 bg-clip-text text-transparent">
              Verified Deep Intelligence
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-slate-600 dark:text-slate-300 text-base sm:text-lg leading-relaxed">
            Decompose hard topics with specialized AI agents. Researchers search hybrid vector
            embeddings & web sources, while a Critic verifier guarantees hallucination-free citations.
          </p>
        </motion.div>

        {/* Query Input Container */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative max-w-3xl mx-auto"
        >
          <form
            onSubmit={handleSubmit}
            className="group relative rounded-2xl p-1.5 sm:p-2 bg-white/95 border border-slate-300 shadow-xl shadow-slate-200/50 backdrop-blur-xl focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all dark:bg-slate-900/90 dark:border-slate-700/80 dark:shadow-indigo-950/40"
          >
            <div className="relative flex flex-col sm:flex-row items-stretch gap-2">
              <div className="relative flex-1 flex items-center pl-3.5">
                <Search className="w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400 transition-colors shrink-0" />
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask any research question (e.g. state of quantum computing vs RSA encryption)..."
                  rows={2}
                  disabled={isRunning}
                  className="w-full bg-transparent border-0 resize-none py-2.5 px-3 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none text-sm sm:text-base leading-snug"
                />
              </div>

              <div className="flex items-center justify-end sm:justify-center p-1 sm:p-0">
                <Button
                  type="submit"
                  variant="gradient"
                  size="lg"
                  disabled={!query.trim() || isRunning}
                  className="w-full sm:w-auto h-12 px-6 rounded-xl font-semibold gap-2 shadow-lg"
                >
                  {isRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <span>Start Research</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Input Footer / Quick Tips */}
            <div className="hidden sm:flex items-center justify-between px-3 pt-2 pb-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800/60 mt-1">
              <span className="flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-500 dark:text-cyan-400" />
                Instant responses for recurring topics via Redis Semantic Caching (TTL 24h)
              </span>
              <span className="font-mono text-slate-500 dark:text-slate-400">Press ↵ Enter to run</span>
            </div>
          </form>
        </motion.div>

        {/* Example Prompt Chips */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="space-y-2 pt-2"
        >
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Explore Example Deep Research Briefings
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {SAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setQuery(prompt);
                }}
                className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 px-3 py-1.5 rounded-lg transition-all text-left flex items-center gap-1.5 cursor-pointer active:scale-95 dark:bg-slate-900/60 dark:hover:bg-slate-800 dark:border-slate-800 dark:hover:border-slate-700 dark:text-slate-300 dark:hover:text-white"
              >
                <span className="text-indigo-600 dark:text-indigo-400">#</span>
                <span>{prompt}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Feature Highlights Grid */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-6 max-w-3xl mx-auto"
        >
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 text-left dark:bg-slate-900/40 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 mb-1">
              <Bot className="w-4 h-4" />
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-200">5-Agent Crew</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              Planner, 2x Researchers, Fact-Checking Critic, and Synthesizer.
            </p>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 text-left dark:bg-slate-900/40 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 mb-1">
              <GitBranch className="w-4 h-4" />
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-200">Hybrid RAG</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              BM25 keyword search fused with ChromaDB dense semantic vectors.
            </p>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 text-left dark:bg-slate-900/40 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
              <Cpu className="w-4 h-4" />
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-200">MCP Tool Protocol</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              Standardized Model Context Protocol for web & local document tools.
            </p>
          </div>

          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-3 text-left dark:bg-slate-900/40 dark:border-slate-800/80">
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span className="font-semibold text-xs text-slate-900 dark:text-slate-200">Fact-Verified</span>
            </div>
            <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-tight">
              Strict claim verification against raw source chunks with inline citations.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

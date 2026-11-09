import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  ExternalLink,
  Copy,
  Check,
  Download,
  BookOpen,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type { Report, Source } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ReportViewerProps {
  report: Report;
  query: string;
}

export const ReportViewer: React.FC<ReportViewerProps> = ({ report, query }) => {
  const [copied, setCopied] = useState(false);
  const [highlightedSourceIndex, setHighlightedSourceIndex] = useState<number | null>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(report.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([report.content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `InsightForge-Research-${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const scrollToSource = (index: number) => {
    setHighlightedSourceIndex(index);
    const element = document.getElementById(`source-card-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedSourceIndex(null), 3000);
  };

  // Helper to extract clean domain from url
  const getDomain = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname.replace('www.', '');
    } catch {
      return 'external source';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Report Header Bar */}
      <div className="bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-sm dark:shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="cyan" className="font-mono text-xs gap-1">
              <Sparkles className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
              {(report.sources?.length || 0) > 0 ? 'Verified Synthesis' : 'Unverified: no sources found'}
            </Badge>
            <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(report.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {query}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {(report.sources?.length || 0) > 0
              ? `Synthesized by multi-agent pipeline with ${report.sources?.length} cross-verified citations.`
              : 'No sources were retrieved for this query, so no claims could be verified. Configure a search provider (TAVILY_API_KEY) or upload documents.'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="text-xs text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 gap-1.5"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                <span>Copy Markdown</span>
              </>
            )}
          </Button>

          <Button
            variant="gradient"
            size="sm"
            onClick={handleDownload}
            className="text-xs gap-1.5 font-semibold"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report (.md)</span>
          </Button>
        </div>
      </div>

      {/* Main Grid: Markdown Document (Left) + Sources Sidebar (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Markdown Document Content */}
        <div className="lg:col-span-8 bg-white/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-md shadow-sm dark:shadow-lg space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
            <div className="flex items-center gap-2 text-slate-800 dark:text-slate-300 font-semibold text-sm">
              <FileText className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
              <span>Executive Briefing</span>
            </div>
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400">Grounded Citations</span>
          </div>

          {/* Styled Markdown Rendering */}
          <article className="prose dark:prose-invert max-w-none space-y-4 text-slate-800 dark:text-slate-200 leading-relaxed text-sm sm:text-base">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mt-6 mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="text-xl font-bold tracking-tight text-indigo-900 dark:text-indigo-200 mt-5 mb-2.5">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="text-lg font-semibold text-cyan-800 dark:text-cyan-200 mt-4 mb-2">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-4 text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 mb-4 space-y-1.5 text-slate-700 dark:text-slate-300">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 mb-4 space-y-1.5 text-slate-700 dark:text-slate-300">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="text-slate-700 dark:text-slate-300 leading-relaxed text-sm sm:text-base">
                    {children}
                  </li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 border-indigo-500 pl-4 py-1 italic bg-indigo-50/70 dark:bg-indigo-950/20 rounded-r-lg text-slate-700 dark:text-slate-300 my-4">
                    {children}
                  </blockquote>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code
                      className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-mono text-xs border border-slate-200 dark:border-slate-700/60"
                      {...props}
                    >
                      {children}
                    </code>
                  ) : (
                    <pre className="p-4 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 overflow-x-auto text-xs font-mono text-slate-200 my-4">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-left text-xs border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="bg-slate-100 dark:bg-slate-800/80 p-3 font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="p-3 border-b border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                    {children}
                  </td>
                ),
                a: ({ href, children }) => {
                  const citationMatch = href?.match(/#source-(\d+)/) || String(children).match(/\[(\d+)\]/);
                  if (citationMatch) {
                    const idx = parseInt(citationMatch[1], 10) - 1;
                    return (
                      <button
                        type="button"
                        onClick={() => scrollToSource(idx)}
                        className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-300 dark:border-indigo-700/60 text-indigo-700 dark:text-indigo-300 text-xs font-mono font-bold hover:bg-indigo-600 hover:text-white transition-all cursor-pointer"
                        title={`Jump to Source [${idx + 1}]`}
                      >
                        [{idx + 1}]
                      </button>
                    );
                  }

                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline underline-offset-4 font-medium transition-colors"
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {report.content}
            </ReactMarkdown>
          </article>
        </div>

        {/* Sources & Citations Sidebar */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">
          <div className="bg-white/90 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-sm dark:shadow-lg space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">Grounded Citations</h3>
              </div>
              <Badge variant="cyan" className="font-mono text-xs">
                {report.sources?.length || 0} Sources
              </Badge>
            </div>

            {/* Sources List */}
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {(!report.sources || report.sources.length === 0) ? (
                <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400 space-y-2">
                  <p>No external citations recorded for this briefing.</p>
                </div>
              ) : (
                report.sources.map((src: Source, idx: number) => {
                  const isHighlighted = highlightedSourceIndex === idx;
                  return (
                    <div
                      key={idx}
                      id={`source-card-${idx}`}
                      className={`rounded-xl border p-3.5 transition-all duration-300 text-left space-y-2 ${
                        isHighlighted
                          ? 'border-indigo-400 bg-indigo-50/90 dark:bg-indigo-950/60 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm'
                      }`}
                    >
                      {/* Top: Index badge & domain */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-indigo-100 dark:bg-indigo-600/30 border border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono font-bold">
                          [{idx + 1}]
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                          {getDomain(src.url)}
                        </span>
                      </div>

                      {/* Title */}
                      <h4 className="font-semibold text-xs text-slate-900 dark:text-slate-100 line-clamp-2 leading-tight">
                        {src.title || 'Untitled Source'}
                      </h4>

                      {/* Snippet */}
                      {src.snippet && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed bg-white/80 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-slate-800/60 italic font-sans">
                          "{src.snippet}"
                        </p>
                      )}

                      {/* Visit link button */}
                      {src.url && (
                        <div className="pt-1">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
                          >
                            <span>Open Source URL</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

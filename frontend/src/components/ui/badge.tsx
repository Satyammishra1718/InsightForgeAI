import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'purple' | 'cyan';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  const variantClasses = {
    default: 'border-transparent bg-indigo-600 text-white shadow hover:bg-indigo-500',
    secondary: 'border-transparent bg-slate-800 text-slate-200 hover:bg-slate-700',
    destructive: 'border-transparent bg-rose-500/20 border-rose-500/30 text-rose-300',
    outline: 'border-slate-700 text-slate-300',
    success: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
    warning: 'border-amber-500/30 bg-amber-500/15 text-amber-400',
    purple: 'border-purple-500/30 bg-purple-500/15 text-purple-300',
    cyan: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-400',
  };

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

export { Badge };

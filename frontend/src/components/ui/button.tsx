import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'gradient';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    const baseClasses =
      'inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-[0.98]';

    const variantClasses = {
      default:
        'bg-indigo-600 text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-500 hover:shadow-indigo-600/30',
      gradient:
        'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-500 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:opacity-95 hover:shadow-cyan-500/20',
      destructive:
        'bg-rose-600 text-white shadow-sm hover:bg-rose-500 focus-visible:ring-rose-500',
      outline:
        'border border-slate-700 bg-transparent hover:bg-slate-800 hover:text-slate-100 dark:border-slate-800 dark:hover:bg-slate-800/80',
      secondary:
        'bg-slate-800 text-slate-100 shadow-sm hover:bg-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:hover:bg-slate-700',
      ghost:
        'hover:bg-slate-800/60 hover:text-slate-100 dark:hover:bg-slate-800 dark:text-slate-300 dark:hover:text-slate-100',
      link: 'text-indigo-400 underline-offset-4 hover:underline',
    };

    const sizeClasses = {
      default: 'h-10 px-4 py-2',
      sm: 'h-8 rounded-lg px-3 text-xs',
      lg: 'h-12 rounded-xl px-6 text-base font-semibold',
      icon: 'h-10 w-10',
    };

    return (
      <button
        className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };

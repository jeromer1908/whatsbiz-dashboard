import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 px-4 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed';
  const variants: Record<Variant, string> = {
    primary: 'bg-[#25D366] text-white hover:bg-[#1EBE5A] shadow-sm hover:shadow-md',
    secondary: 'bg-white text-black border border-[#E5E7EB] hover:bg-gray-50',
    destructive: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
    ghost: 'text-gray-600 hover:bg-gray-100 hover:text-black',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

interface JeopardyTitleProps {
  size?:
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | '7xl'
    | '8xl';
  className?: string;
}

const sizeClasses = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl',
  '4xl': 'text-4xl',
  '5xl': 'text-5xl',
  '6xl': 'text-6xl',
  '7xl': 'text-7xl',
  '8xl': 'text-8xl',
};

export function JeopardyTitle({
  size = '8xl',
  className = '',
}: JeopardyTitleProps) {
  return (
    <h1
      className={`jeopardy-title ${sizeClasses[size]} font-bold uppercase tracking-wider text-white ${className}`}
    >
      JEOP<span className="text-red-500">AI</span>RDY!
    </h1>
  );
}

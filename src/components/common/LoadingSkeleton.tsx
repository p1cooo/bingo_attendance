import React from 'react';

export const LoadingSkeleton: React.FC<{ count?: number; type?: 'card' | 'row' | 'stat' }> = ({
  count = 3,
  type = 'row',
}) => {
  const items = Array.from({ length: count }, (_, i) => i);

  if (type === 'stat') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((i) => (
          <div
            key={i}
            className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 animate-pulse"
          >
            <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-800 rounded mb-3" />
            <div className="h-7 w-14 bg-neutral-200 dark:bg-neutral-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'card') {
    return (
      <div className="space-y-3">
        {items.map((i) => (
          <div
            key={i}
            className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 animate-pulse flex items-center justify-between"
          >
            <div className="space-y-2">
              <div className="h-4 w-32 bg-neutral-200 dark:bg-neutral-800 rounded" />
              <div className="h-3 w-48 bg-neutral-200 dark:bg-neutral-800 rounded" />
            </div>
            <div className="h-8 w-24 bg-neutral-200 dark:bg-neutral-800 rounded-lg" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div
          key={i}
          className="h-12 w-full rounded-xl bg-neutral-100 dark:bg-neutral-800/60 animate-pulse"
        />
      ))}
    </div>
  );
};

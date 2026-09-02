import React from 'react';
import { Coach } from '../../types.js';

interface CoachBadgeProps {
  coach?: Coach | { name: string; color: string };
  size?: 'sm' | 'md';
  variant?: 'dot' | 'badge' | 'bar';
}

export const CoachBadge: React.FC<CoachBadgeProps> = ({
  coach,
  size = 'md',
  variant = 'badge',
}) => {
  if (!coach) return null;

  const color = coach.color || '#3b82f6';
  const name = coach.name;

  if (variant === 'dot') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-neutral-700 dark:text-neutral-300 font-medium">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        {name}
      </span>
    );
  }

  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2">
        <div
          className="w-1 self-stretch rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Coach {name}
        </span>
      </div>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-md ${
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'
      }`}
      style={{
        backgroundColor: `${color}18`, // ~10% opacity pastel bg
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      Coach {name}
    </span>
  );
};

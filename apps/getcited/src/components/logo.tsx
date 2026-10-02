import { useId } from "react";

/**
 * GetCited "Quotecast" logo mark — a solid quotation-mark emitter broadcasting
 * two radiating arcs: your quote, picked up by AI engines. Inline SVG so it
 * ships with zero image requests and stays crisp at any size.
 * Gradient: aurora violet → cyan, flowing outward along the broadcast direction.
 * The gradient id is namespaced per instance with useId (RSC-safe) — a static
 * id collides when the mark renders more than once on a page, and duplicate
 * SVG ids make every mark resolve to whichever <defs> the browser finds first.
 */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  const gradientId = useId();
  const paint = `url(#${gradientId})`;
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="32"
          x2="32"
          y2="0"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path
        d="M4 17H12V21.3C12 25.7 9.6 28.2 5.3 29V25.7C7.6 25.1 8.7 23.5 8.8 21.3H4Z"
        fill={paint}
      />
      <path
        d="M5 11A16 16 0 0 1 21 27"
        stroke={paint}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M5 4.5A22.5 22.5 0 0 1 27.5 27"
        stroke={paint}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      {withWordmark && <span className="font-semibold tracking-tight">GetCited</span>}
    </span>
  );
}

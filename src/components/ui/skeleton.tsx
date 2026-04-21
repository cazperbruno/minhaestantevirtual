import { cn } from "@/lib/utils";

/**
 * Skeleton com shimmer suave (gradient varrendo da esquerda p/ direita).
 * Em `prefers-reduced-motion`, vira um pulse simples (já tratado pelo CSS global).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md", className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export { Skeleton };

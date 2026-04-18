import { BookStatus, STATUS_LABEL, STATUS_COLOR } from "@/types/book";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: BookStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border backdrop-blur-sm",
        STATUS_COLOR[status],
        className,
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

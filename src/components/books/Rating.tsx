import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
}

export function Rating({ value, onChange, size = 20, readOnly = false }: Props) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  return (
    <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Avaliação">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          onClick={() => onChange?.(n === value ? 0 : n)}
          className={cn("transition-transform", !readOnly && "hover:scale-110 cursor-pointer")}
          aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
        >
          <Star
            style={{ width: size, height: size }}
            className={cn(
              "transition-colors",
              n <= display ? "fill-primary text-primary" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

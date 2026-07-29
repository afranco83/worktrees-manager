import { Loader2, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function IconButton({
  label,
  icon: Icon,
  variant = "outline",
  size = "icon-sm",
  loading = false,
  disabled,
  ...props
}: {
  label: string;
  icon: LucideIcon;
  loading?: boolean;
} & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={variant}
            size={size}
            aria-label={label}
            disabled={disabled || loading}
            {...props}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Icon />}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

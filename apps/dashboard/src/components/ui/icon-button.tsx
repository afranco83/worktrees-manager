import type { LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function IconButton({
  label,
  icon: Icon,
  variant = "outline",
  size = "icon-sm",
  ...props
}: {
  label: string;
  icon: LucideIcon;
} & Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button variant={variant} size={size} aria-label={label} {...props}>
            <Icon />
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

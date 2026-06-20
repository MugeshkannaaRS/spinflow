import React from "react";
import { useColumnConfig } from "@/hooks/useColumnConfig";
import { cn } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FormFieldProps {
  columnKey: string;
  tableName: string;
  error?: string;
  children: React.ReactElement;
  className?: string;
}

export function FormField({ columnKey, tableName, error, children, className }: FormFieldProps) {
  const { getLabel, getConfig, isRequired } = useColumnConfig(tableName);
  const config = getConfig(columnKey);
  const helpText = config?.helpText;

  const childProps: Record<string, any> = {};

  if (config?.placeholder) childProps.placeholder = config.placeholder;
  if (config?.minValue != null) childProps.min = config.minValue;
  if (config?.maxValue != null) childProps.max = config.maxValue;

  const child = React.cloneElement(children, childProps);

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="text-xs font-medium text-foreground flex items-center gap-1">
        {getLabel(columnKey)}
        {isRequired(columnKey) && <span className="text-destructive">*</span>}
        {helpText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="size-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs max-w-[200px]">
                {helpText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </label>
      {child}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

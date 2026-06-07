import * as React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

const FieldGroup = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="field-group" className={cn("grid gap-6", className)} {...props} />
));
FieldGroup.displayName = "FieldGroup";

const Field = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} data-slot="field" className={cn("grid gap-2", className)} {...props} />
));
Field.displayName = "Field";

const FieldLabel = React.forwardRef(({ className, ...props }, ref) => (
  <label
    ref={ref}
    data-slot="field-label"
    className={cn("text-sm font-medium leading-none", className)}
    {...props}
  />
));
FieldLabel.displayName = "FieldLabel";

const FieldDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} data-slot="field-description" className={cn("text-sm text-muted-foreground", className)} {...props} />
));
FieldDescription.displayName = "FieldDescription";

const FieldSeparator = React.forwardRef(({ className, children, ...props }, ref) => (
  <div ref={ref} data-slot="field-separator" className={cn("relative", className)} {...props}>
    <div className="absolute inset-0 flex items-center">
      <Separator className="w-full" />
    </div>
    <div data-slot="field-separator-content" className="relative z-10 flex justify-center text-xs">
      <span className="bg-background px-2 text-muted-foreground">{children}</span>
    </div>
  </div>
));
FieldSeparator.displayName = "FieldSeparator";

export {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
};

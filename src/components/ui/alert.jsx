import * as React from "react";

import { cn } from "../../lib/utils";

const Alert = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(
      "relative w-full rounded-lg border border-gray-200 bg-white p-4 text-gray-900",
      className
    )}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-sm", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };

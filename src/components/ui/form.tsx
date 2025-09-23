import * as React from "react"
import { cn } from "@/lib/utils"

interface FormProps extends React.FormHTMLAttributes<HTMLFormElement> {}

const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ className, ...props }, ref) => {
    return (
      <form
        ref={ref}
        className={cn("space-y-4", className)}
        {...props}
      />
    )
  }
)
Form.displayName = "Form"

interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
  error?: string
  required?: boolean
}

const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  ({ className, label, error, required, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {label && (
          <label className={cn(
            "block text-sm font-medium text-gray-700",
            required && "after:content-['*'] after:text-red-500 after:ml-1"
          )}>
            {label}
          </label>
        )}
        {children}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    )
  }
)
FormField.displayName = "FormField"

interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {}

const FormActions = React.forwardRef<HTMLDivElement, FormActionsProps>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 space-y-2 space-y-reverse sm:space-y-0 pt-4",
          className
        )}
        {...props}
      />
    )
  }
)
FormActions.displayName = "FormActions"

export { Form, FormField, FormActions }
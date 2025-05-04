"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => {
    // Ensure value is always an array, even if defaultValue is used.
    // Radix Slider expects `value` prop to be an array for controlled component behavior.
    // For uncontrolled with defaultValue, we can let Radix handle it internally,
    // but for controlled, we must pass an array.
    const value = props.value !== undefined ? props.value : undefined; // Use value if provided
    const defaultValue = props.defaultValue !== undefined && props.value === undefined ? props.defaultValue : undefined; // Use defaultValue only if value is not provided

    return (
        <SliderPrimitive.Root
            ref={ref}
            className={cn(
            "relative flex w-full touch-none select-none items-center",
            className
            )}
             // Pass value or defaultValue, but not both to the Root element directly
             // Radix manages the internal state based on which prop is provided.
             {...(value !== undefined ? { value } : {})}
             {...(defaultValue !== undefined ? { defaultValue } : {})}
            {...props} // Pass remaining props like onValueChange, max, step, etc.
        >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            {/* Render one thumb if value/defaultValue is a single-element array or undefined/null */}
            {( (Array.isArray(value) && value.length === 1) || (Array.isArray(defaultValue) && defaultValue.length === 1) || (!value && !defaultValue) ) && (
                 <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer" />
            )}
             {/* Render multiple thumbs if value/defaultValue is an array with multiple elements */}
             { ( (Array.isArray(value) && value.length > 1) || (Array.isArray(defaultValue) && defaultValue.length > 1) ) &&
                (value || defaultValue)?.map((_, index) => (
                     <SliderPrimitive.Thumb key={index} className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer" />
                ))
            }
        </SliderPrimitive.Root>
    )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

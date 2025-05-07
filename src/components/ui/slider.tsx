// src/components/ui/slider.tsx
"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, step = 1, ...props }, ref) => {
    const value = props.value;
    const defaultValue = props.defaultValue !== undefined && props.value === undefined ? props.defaultValue : undefined;

    // Ensure value is an array for controlled component behavior
    const sliderValue = value !== undefined ? (Array.isArray(value) ? value : [value]) : undefined;
    const sliderDefaultValue = defaultValue !== undefined ? (Array.isArray(defaultValue) ? defaultValue : [defaultValue]) : undefined;

    return (
        <SliderPrimitive.Root
            ref={ref}
            className={cn(
            "relative flex w-full touch-none select-none items-center",
            className
            )}
             step={step}
             {...(sliderValue !== undefined ? { value: sliderValue } : {})}
             {...(sliderDefaultValue !== undefined ? { defaultValue: sliderDefaultValue } : {})}
            {...props} 
        >
            <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-secondary">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
            </SliderPrimitive.Track>
            {( (sliderValue && sliderValue.length > 0) || (sliderDefaultValue && sliderDefaultValue.length > 0) ) &&
                (sliderValue || sliderDefaultValue)?.map((_, index) => (
                     <SliderPrimitive.Thumb 
                        key={index} 
                        className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer" />
                ))
            }
             {/* Fallback for when neither value nor defaultValue is provided or they are empty arrays */}
            { (!sliderValue || sliderValue.length === 0) && (!sliderDefaultValue || sliderDefaultValue.length === 0) && (
                 <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer" />
            )}
        </SliderPrimitive.Root>
    )
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }

"use client"

import { HttpTypes } from "@medusajs/types"
import { clx } from "@medusajs/ui"
import React, { useEffect } from "react"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const filteredOptions = option.values?.map((v) => v.value).filter(Boolean)

  const displayLabel =
    option.title?.toLowerCase() === "size"
      ? "Size"
      : option.title || title || "Option"

  // Automatically select the only option if there's just one
  useEffect(() => {
    if (
      filteredOptions &&
      filteredOptions.length === 1 &&
      current !== filteredOptions[0]
    ) {
      updateOption(option.title ?? "", filteredOptions[0]!)
    }
  }, [filteredOptions, current, updateOption, option.title])

  if (!filteredOptions || filteredOptions.length === 0) return null

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm font-medium tracking-wide uppercase">{displayLabel}</span>
      <div
        className="flex flex-wrap justify-between gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => (
          <button
            key={v}
            onClick={() => updateOption(option.title ?? "", v ?? "")}
            className={clx(
              "border-ui-border-base bg-ui-bg-subtle border text-small-regular h-10 rounded-rounded p-2 flex-1",
              {
                "border-ui-border-interactive": v === current,
                "hover:shadow-elevation-card-rest transition-shadow ease-in-out duration-150":
                  v !== current,
              }
            )}
            disabled={disabled}
            data-testid="option-button"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  )
}

export default OptionSelect

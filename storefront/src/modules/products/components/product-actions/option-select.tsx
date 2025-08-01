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
  const filteredOptions = option.values?.map((v) => v.value).filter(Boolean) || []

  // Автоматически выбираем значение, если оно единственное
  useEffect(() => {
    if (filteredOptions.length === 1 && current !== filteredOptions[0]) {
      updateOption(option.title ?? "", filteredOptions[0])
    }
  }, [filteredOptions, current, updateOption, option.title])

  // Не рендерим блок вообще, если только один вариант
  if (filteredOptions.length === 1) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm">Select {title}</span>
      <div
        className="flex flex-wrap justify-between gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => (
          <button
            onClick={() => updateOption(option.title ?? "", v ?? "")}
            key={v}
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

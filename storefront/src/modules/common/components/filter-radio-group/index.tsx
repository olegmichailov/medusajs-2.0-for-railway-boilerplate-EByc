"use client"

import { RadioGroup } from "@headlessui/react"

type FilterRadioGroupProps = {
  title?: string
  items: {
    value: string
    label: string
  }[]
  value: string
  handleChange: (value: string) => void
  "data-testid"?: string
}

const FilterRadioGroup = ({
  items,
  value,
  handleChange,
  "data-testid": dataTestId,
}: FilterRadioGroupProps) => {
  return (
    <RadioGroup
      value={value}
      onChange={handleChange}
      className="flex flex-col gap-1 font-sans text-sm tracking-wider"
      data-testid={dataTestId}
    >
      {items.map((item) => (
        <RadioGroup.Option key={item.value} value={item.value}>
          {({ checked }) => (
            <span
              className={`cursor-pointer hover:underline ${
                checked ? "font-semibold" : "text-gray-600"
              }`}
            >
              {item.label}
            </span>
          )}
        </RadioGroup.Option>
      ))}
    </RadioGroup>
  )
}

export default FilterRadioGroup

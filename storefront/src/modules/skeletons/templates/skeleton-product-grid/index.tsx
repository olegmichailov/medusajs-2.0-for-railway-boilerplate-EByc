import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

type Props = {
  columns?: number
}

const SkeletonProductGrid = ({ columns = 2 }: Props) => {
  const totalItems = columns * 4 // 4 строки

  const gridColsClass =
    columns === 1
      ? "grid-cols-1"
      : columns === 2
      ? "grid-cols-2"
      : columns === 3
      ? "grid-cols-3"
      : "grid-cols-4"

  return (
    <ul
      className={`grid ${gridColsClass} gap-x-4 gap-y-10 px-6 sm:px-0`}
      data-testid="products-list-loader"
    >
      {repeat(totalItems).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid

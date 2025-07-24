import repeat from "@lib/util/repeat"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

const SkeletonProductGrid = () => {
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-10 px-6 sm:px-0"
      data-testid="products-list-loader"
    >
      {repeat(8).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid

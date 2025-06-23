import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"
import ProductPreview from "@modules/products/components/product-preview"
import { HttpTypes } from "@medusajs/types"

const StoreTemplate = ({
  products,
  region,
  countryCode,
}: {
  products: HttpTypes.StoreProduct[]
  region: HttpTypes.StoreRegion
  countryCode: string
}) => {
  const sortBy: SortOptions = "created_at" // можно заменить, если нужно другое значение

  return (
    <div
      className="flex flex-col small:flex-row small:items-start py-6 content-container"
      data-testid="category-container"
    >
      <RefinementList sortBy={sortBy} />
      <div className="w-full px-6 sm:px-0">
        <h1
          data-testid="store-page-title"
          className="text-4xl font-medium tracking-wider uppercase text-left mb-6"
        >
          All Products
        </h1>
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">
          {products.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default StoreTemplate

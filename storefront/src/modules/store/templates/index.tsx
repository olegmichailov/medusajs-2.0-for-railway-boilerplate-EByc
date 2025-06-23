import RefinementList from "@modules/store/components/refinement-list"
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
  return (
    <div
      className="flex flex-col small:flex-row small:items-start content-container py-6"
      data-testid="category-container"
    >
      <aside className="w-full small:w-[260px] small:mr-10 mb-6 small:mb-0 shrink-0">
        <RefinementList countryCode={countryCode} />
      </aside>

      <section className="w-full">
        <h1
          data-testid="store-page-title"
          className="text-4xl font-medium tracking-wider uppercase mb-6"
        >
          All Products
        </h1>

        {products && products.length > 0 ? (
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
            {products.map((product) => (
              <li key={product.id}>
                <ProductPreview product={product} region={region} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-lg text-gray-500 mt-4">No products found.</p>
        )}
      </section>
    </div>
  )
}

export default StoreTemplate

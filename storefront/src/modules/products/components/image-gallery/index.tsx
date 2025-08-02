// storefront/src/modules/products/components/image-gallery/index.tsx

import { HttpTypes } from "@medusajs/types"
import { Container } from "@medusajs/ui"

type ImageGalleryProps = {
  images: HttpTypes.StoreProductImage[]
}

const ImageGallery = ({ images }: ImageGalleryProps) => {
  return (
    <div className="flex items-start relative">
      <div className="flex flex-col flex-1 small:mx-16 gap-y-4">
        {images.map((image, index) => (
          <Container
            key={image.id}
            className="relative aspect-[29/34] w-full overflow-hidden bg-ui-bg-subtle"
            id={image.id}
          >
            {!!image.url && (
              <img
                src={image.url}
                alt={`Product image ${index + 1}`}
                loading={index === 0 ? "eager" : "lazy"}
                className="object-cover w-full h-full"
              />
            )}
          </Container>
        ))}
      </div>
    </div>
  )
}

export default ImageGallery

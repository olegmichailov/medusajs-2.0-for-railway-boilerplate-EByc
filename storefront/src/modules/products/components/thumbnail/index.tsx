import { Container, clx } from "@medusajs/ui"
import Image from "next/image"
import React from "react"
import PlaceholderImage from "@modules/common/icons/placeholder-image"

type ThumbnailProps = {
  thumbnail?: string | null
  images?: any[] | null
  size?: "small" | "medium" | "large" | "full" | "square"
  isFeatured?: boolean
  className?: string
  "data-testid"?: string
  priority?: boolean
  index?: number
}

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured,
  className,
  "data-testid": dataTestid,
  priority = false,
  index = 0,
}) => {
  const imageUrl = thumbnail || images?.[0]?.url || "/placeholder.png"

  const localPath = imageUrl.includes("products/")
    ? `/${imageUrl.split("products/")[1]}`
    : undefined

  const useLocal = !!localPath

  return (
    <Container
      className={clx(
        "relative w-full max-w-none overflow-hidden bg-ui-bg-subtle shadow-elevation-card-rest transition-shadow duration-300 group",
        className,
        {
          "aspect-[3/4]": !isFeatured && size !== "square",
          "aspect-[11/14]": isFeatured,
          "aspect-[1/1]": size === "square",
        }
      )}
      data-testid={dataTestid}
    >
      <ImageOrPlaceholder
        image={useLocal ? localPath : imageUrl}
        size={size}
        priority={priority}
        index={index}
      />
    </Container>
  )
}

const safeLoader = ({ src }: { src: string }) => {
  if (src.startsWith("http") || src.startsWith("/")) return src
  return `/${src}`
}

const ImageOrPlaceholder = ({
  image,
  size,
  priority,
  index,
}: {
  image?: string
  size?: string
  priority?: boolean
  index?: number
}) => {
  if (!image || typeof image !== "string" || image.trim() === "") {
    return (
      <div className="w-full h-full absolute inset-0 flex items-center justify-center">
        <PlaceholderImage size={size === "small" ? 16 : 24} />
      </div>
    )
  }

  return (
    <Image
      src={image}
      alt="Thumbnail"
      loader={safeLoader}
      unoptimized
      className="absolute inset-0 object-cover object-center transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:scale-[1.015]"
      draggable={false}
      quality={70}
      loading={priority ? "eager" : "lazy"}
      priority={priority}
      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
      fill
    />
  )
}

export default Thumbnail

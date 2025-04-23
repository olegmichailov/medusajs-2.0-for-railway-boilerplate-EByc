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
  index?: number
}

const Thumbnail: React.FC<ThumbnailProps> = ({
  thumbnail,
  images,
  size = "small",
  isFeatured,
  className,
  "data-testid": dataTestid,
  index = 0,
}) => {
  const initialImage = thumbnail || images?.[0]?.url

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
      <ImageOrPlaceholder image={initialImage} size={size} index={index} />
    </Container>
  )
}

const ImageOrPlaceholder = ({
  image,
  size,
  index,
}: Pick<ThumbnailProps, "size"> & { image?: string; index: number }) => {
  return image ? (
    <Image
      src={image}
      alt="Thumbnail"
      className="absolute inset-0 object-cover object-center transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:scale-[1.015]"
      draggable={false}
      loading={index < 4 ? "eager" : "lazy"}
      placeholder="blur"
      blurDataURL="/placeholder.png" // 🔽 заглушка (нужно добавить в public)
      quality={65} // 🔽 понижение до 65 для AVIF даст прирост
      priority={index < 4}
      sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
      fill
    />
  ) : (
    <div className="w-full h-full absolute inset-0 flex items-center justify-center">
      <PlaceholderImage size={size === "small" ? 16 : 24} />
    </div>
  )
}

export default Thumbnail

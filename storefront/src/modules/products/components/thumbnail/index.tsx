import { Container, clx } from "@medusajs/ui"
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
  const imageUrl = thumbnail || images?.[0]?.url

  // 👉 локальный путь
  const localPath = imageUrl?.includes("products/")
    ? `/${imageUrl.split("products/")[1]}`
    : undefined

  const useLocal = localPath ? true : false
  const finalSrc = useLocal ? localPath : imageUrl

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
      {finalSrc ? (
        <img
          src={finalSrc}
          alt="Thumbnail"
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-[1200ms] ease-[cubic-bezier(0.25,0.1,0.25,1)] group-hover:scale-[1.015]"
          draggable={false}
          loading={index < 4 ? "eager" : "lazy"}
        />
      ) : (
        <div className="w-full h-full absolute inset-0 flex items-center justify-center">
          <PlaceholderImage size={size === "small" ? 16 : 24} />
        </div>
      )}
    </Container>
  )
}

export default Thumbnail

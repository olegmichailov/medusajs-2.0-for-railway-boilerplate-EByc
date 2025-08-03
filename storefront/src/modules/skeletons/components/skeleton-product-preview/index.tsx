
import { Container } from "@medusajs/ui"

const SkeletonProductPreview = () => {
  return (
    <div className="animate-pulse">
      <Container className="aspect-[9/13.5] w-full bg-gray-100" />
      <div className="flex justify-between text-base-regular mt-2 px-1">
        <div className="w-3/5 h-5 bg-gray-100" />
        <div className="w-1/5 h-5 bg-gray-100" />
      </div>
    </div>
  )
}

export default SkeletonProductPreview

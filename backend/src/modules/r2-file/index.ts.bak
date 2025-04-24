import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { FileServiceUploadResult } from "@medusajs/types"
import type { Readable } from "stream"

class R2FileService {
  protected client_: S3Client
  protected bucket_: string

  constructor(_, options) {
    this.bucket_ = options.bucket
    this.client_ = new S3Client({
      region: "auto", // Cloudflare не использует регион, но нужно что-то указать
      endpoint: options.endPoint,
      credentials: {
        accessKeyId: options.accessKey,
        secretAccessKey: options.secretKey,
      },
    })
  }

  async upload(file: Express.Multer.File): Promise<FileServiceUploadResult> {
    await this.client_.send(
      new PutObjectCommand({
        Bucket: this.bucket_,
        Key: file.originalname,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    )

    return {
      url: `${this.client_.config.endpoint}/${this.bucket_}/${file.originalname}`,
    }
  }

  async delete(fileData: { fileKey: string }): Promise<void> {
    await this.client_.send(
      new DeleteObjectCommand({
        Bucket: this.bucket_,
        Key: fileData.fileKey,
      })
    )
  }

  async getUploadStreamDescriptor(fileData: {
    name: string
    ext: string
    mimeType: string
  }): Promise<{
    writeStream: NodeJS.WritableStream
    promise: Promise<any>
    url: string
    fileKey: string
  }> {
    throw new Error("Stream uploads are not supported in R2FileService.")
  }

  async getDownloadStream(fileData: { fileKey: string }): Promise<Readable> {
    const response = await this.client_.send(
      new GetObjectCommand({
        Bucket: this.bucket_,
        Key: fileData.fileKey,
      })
    )
    return response.Body as Readable
  }
}

export default R2FileService

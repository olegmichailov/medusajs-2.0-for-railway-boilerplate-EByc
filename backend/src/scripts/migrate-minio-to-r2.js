import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { Client } from "minio"
import dotenv from "dotenv"
import path from "path"
import fs from "fs"

dotenv.config()

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT || "443"),
  useSSL: true,
  accessKey: process.env.MINIO_USE_SSL !== "false",
  accessKey: process.env.MINIO_ACCESS_KEY || "",
  secretKey: process.env.MINIO_SECRET_KEY || "",
})

const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY || "",
    secretAccessKey: process.env.R2_SECRET_KEY || "",
  },
})

const BUCKET = process.env.MINIO_BUCKET
const R2_BUCKET = process.env.R2_BUCKET

async function migrate() {
  const stream = await minioClient.listObjectsV2(BUCKET, "", true)

  stream.on("data", async function (obj) {
    const fileName = obj.name
    const fileStream = await minioClient.getObject(BUCKET, fileName)

    const buffers = []
    fileStream.on("data", (chunk) => buffers.push(chunk))
    fileStream.on("end", async () => {
      const fileBuffer = Buffer.concat(buffers)

      try {
        await s3Client.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: fileName,
            Body: fileBuffer,
          })
        )
        console.log(`Migrated: ${fileName}`)
      } catch (err) {
        console.error(`Error uploading ${fileName}:`, err)
      }
    })
  })

  stream.on("error", function (err) {
    console.error("MinIO stream error:", err)
  })
}

migrate()
// scripts/migrate-minio-to-r2.js

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"

const minioClient = new S3Client({
  region: "us-east-1",
  endpoint: "http://bucket.railway.internal:9000",
  credentials: {
    accessKeyId: "u9hw73jx7hugeb0s02h1iwf3p4h245m7",
    secretAccessKey: "f5t0e4av4asi1s",
  },
  forcePathStyle: true,
})

const r2Client = new S3Client({
  region: "auto",
  endpoint: "https://d3b184b7dc1ebedfb3f84326447eabbc.r2.cloudflarestorage.com",
  credentials: {
    accessKeyId: "u9hw73jx7hugeb0s02h1iwf3p4h245m7",
    secretAccessKey: "f5t0e4av4asi1s",
  },
})

const BUCKET = "medusa-media"
const R2_BUCKET = "gmorklstorage"

async function migrate() {
  try {
    const list = await minioClient.send(new ListObjectsV2Command({ Bucket: BUCKET }))

    if (!list.Contents || list.Contents.length === 0) {
      console.log("No files found in MinIO bucket.")
      return
    }

    for (const obj of list.Contents) {
      const key = obj.Key
      const getObject = await minioClient.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key })
      )
      const body = getObject.Body

      await r2Client.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: getObject.ContentType || "application/octet-stream",
        })
      )

      console.log(`✅ Copied: ${key}`)
    }

    console.log("✔️ Migration complete.")
  } catch (err) {
    console.error("❌ Migration failed:", err)
  }
}

migrate()

// scripts/migrate-minio-to-r2.js
import { S3Client as MinioClient, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { S3Client as R2Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import stream from 'stream';
import { promisify } from 'util';

dotenv.config();

const pipeline = promisify(stream.pipeline);

// 🟠 Подключение к MinIO
const minio = new MinioClient({
  region: 'us-east-1',
  forcePathStyle: true,
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY
  }
});

// 🔵 Подключение к Cloudflare R2
const r2 = new R2Client({
  region: 'auto',
  endpoint: 'https://07a4e4a5bc7906ff13bb7b90ab146baf.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY
  }
});

const migrate = async () => {
  const Bucket = process.env.MINIO_BUCKET;
  const R2Bucket = 'gmorklstrage';

  const list = await minio.send(new ListObjectsV2Command({ Bucket }));

  if (!list.Contents) return console.log('Нет файлов для миграции');

  for (const item of list.Contents) {
    const key = item.Key;
    const object = await minio.send(new GetObjectCommand({ Bucket, Key: key }));

    console.log(`Копируем: ${key}`);

    await r2.send(
      new PutObjectCommand({
        Bucket: R2Bucket,
        Key: key,
        Body: object.Body,
        ContentType: object.ContentType || 'application/octet-stream',
      })
    );
  }

  console.log('✅ Все изображения перенесены в Cloudflare R2');
};

migrate().catch((err) => {
  console.error('❌ Ошибка миграции:', err);
});

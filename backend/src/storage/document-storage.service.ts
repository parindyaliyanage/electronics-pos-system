import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * FR7/FR8 — stores generated PDFs and report files in S3-compatible object storage (MinIO in
 * development). Objects are private; downloads are streamed through the API
 * so access control stays in one place.
 */
@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady?: Promise<void>;

  constructor(config: ConfigService) {
    this.bucket = config.get("S3_BUCKET") ?? "smartretail";
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT") ?? "http://localhost:9000",
      region: config.get("S3_REGION") ?? "us-east-1",
      forcePathStyle: true, // required by MinIO
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY") ?? "minioadmin",
        secretAccessKey: config.get("S3_SECRET_KEY") ?? "minioadmin",
      },
    });
  }

  async put(key: string, body: Buffer, contentType = "application/pdf") {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  }

  async get(key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error(`Stored document ${key} is empty`);
    return Buffer.from(await result.Body.transformToByteArray());
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  private ensureBucket() {
    if (!this.bucketReady) {
      this.bucketReady = this.client.send(new HeadBucketCommand({ Bucket: this.bucket }))
        .then(() => undefined)
        .catch(async () => {
          this.logger.log(`Creating storage bucket "${this.bucket}"`);
          await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        });
      this.bucketReady.catch(() => {
        this.bucketReady = undefined; // retry on the next call
      });
    }
    return this.bucketReady;
  }
}

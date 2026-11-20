import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // forbidNonWhitelisted: a misspelt field (e.g. "sellingprice") is a 400
  // instead of being silently dropped and returning 200 with nothing changed.
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));
  app.enableCors();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();

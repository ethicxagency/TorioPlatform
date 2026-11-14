import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Public } from '../../common/decorators';
import { ImagesService } from './images.service';

/**
 * Serves stored pictures (avatars and logos) to <img> tags, which cannot send an Authorization header. The address is an
 * unguessable id that changes on every upload, the bytes are always a server-made WebP, and the response is locked down so a
 * picture can never be interpreted as anything else.
 */
@ApiExcludeController()
@Public()
@Controller('images')
export class ImagesController {
  constructor(private readonly images: ImagesService) {}

  @Get(':id')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; sandbox")
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const img = await this.images.get(id);
    const etag = `"${createHash('sha1').update(img.bytes).digest('hex')}"`;
    res.set({ 'Content-Type': img.contentType, ETag: etag });
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      return;
    }
    return new StreamableFile(Buffer.from(img.bytes));
  }
}

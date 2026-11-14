import { Controller, Get, Header } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../../common/decorators';
import { TorioTrackingService } from './torio-tracking.service';

/** What the public website needs to know about tracking: just the Pixel id, and only while browser tracking is switched on. */
@ApiExcludeController()
@Public()
@Controller('public/tracking')
export class TrackingController {
  constructor(private readonly tracking: TorioTrackingService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  config() {
    return this.tracking.publicConfig();
  }
}

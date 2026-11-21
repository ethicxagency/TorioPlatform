import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { publicPlanListSchema } from '@torio/contracts';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { PlansService } from './plans.service';

class PublicPlanListDto extends createZodDto(publicPlanListSchema) {}

/** The public pricing feed. No session; read-only; only published plans and only public fields. */
@ApiTags('Public')
@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly plans: PlansService) {}

  @Public()
  @Get()
  @Header('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  @ApiOkResponse({ type: PublicPlanListDto })
  async list() {
    return { data: await this.plans.publicList() };
  }
}

import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({ controllers: [TeamController, InvitationsController], providers: [TeamService] })
export class TeamModule {}

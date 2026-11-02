import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { WhatsAppGraph, type Fetch } from './whatsapp.api';

/** Holds the Graph client so tests can swap the network layer without patching globals. */
@Injectable()
export class WhatsAppGraphProvider {
  private client: WhatsAppGraph;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new WhatsAppGraph(config.META_GRAPH_VERSION);
  }
  get() {
    return this.client;
  }
  useFetch(f: Fetch, version = 'v21.0') {
    this.client = new WhatsAppGraph(version, f);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import type { Fetch } from '../whatsapp/whatsapp.api';
import { MetaGraph } from './meta.graph';

/** Holds the Graph client so tests can swap the network layer without patching globals. */
@Injectable()
export class MetaGraphProvider {
  private client: MetaGraph;
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new MetaGraph(config.META_GRAPH_VERSION);
  }
  get() {
    return this.client;
  }
  useFetch(f: Fetch, version = 'v27.0') {
    this.client = new MetaGraph(version, f);
  }
}

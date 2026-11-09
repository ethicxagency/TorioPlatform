import { Injectable } from '@nestjs/common';
import type { Fetch } from '../whatsapp/whatsapp.api';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { MetaGraph } from './meta.graph';

/**
 * Holds the Graph client. The API version always follows the saved configuration (changes apply on the next call);
 * tests can swap the network layer without patching globals.
 */
@Injectable()
export class MetaGraphProvider {
  private fetchImpl?: Fetch;
  private client?: MetaGraph;
  constructor(private readonly config: MetaConfigService) {}
  get() {
    const version = this.config.current.apiVersion;
    if (!this.client || this.client.version !== version)
      this.client = new MetaGraph(version, this.fetchImpl);
    return this.client;
  }
  useFetch(f: Fetch, version?: string) {
    this.fetchImpl = f;
    this.client = new MetaGraph(version ?? this.config.current.apiVersion, f);
    void version;
  }
}

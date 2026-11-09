import { Injectable } from '@nestjs/common';
import { MetaConfigService } from '../meta-config/meta-config.service';
import { WhatsAppGraph, type Fetch } from './whatsapp.api';

/** Holds the WhatsApp Graph client; the API version follows the saved Meta configuration. */
@Injectable()
export class WhatsAppGraphProvider {
  private fetchImpl?: Fetch;
  private client?: WhatsAppGraph;
  constructor(private readonly config: MetaConfigService) {}
  get() {
    const version = this.config.current.apiVersion;
    if (!this.client || this.client.version !== version)
      this.client = new WhatsAppGraph(version, this.fetchImpl);
    return this.client;
  }
  useFetch(f: Fetch, version?: string) {
    this.fetchImpl = f;
    this.client = new WhatsAppGraph(version ?? this.config.current.apiVersion, f);
  }
}

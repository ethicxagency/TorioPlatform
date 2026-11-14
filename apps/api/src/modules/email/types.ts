import type { z } from 'zod';
import type { emailDeliveryQuerySchema } from '@torio/contracts';

export type EmailDeliveryQuery = z.infer<typeof emailDeliveryQuerySchema>;

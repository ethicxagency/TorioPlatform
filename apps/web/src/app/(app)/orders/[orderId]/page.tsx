import type { Metadata } from 'next';
import { OrderDetailsRoute } from '@/features/orders/components/order-details-route';

export const metadata: Metadata = { title: 'Order' };

export default function Page() {
  return <OrderDetailsRoute />;
}

'use client';

import { useParams } from 'next/navigation';
import { OrderDetailsPage } from './order-details-page';

/** Reads the order id from the URL, so direct links and refreshes work like any other page. */
export function OrderDetailsRoute() {
  const { orderId } = useParams<{ orderId: string }>();
  return <OrderDetailsPage orderId={orderId} />;
}

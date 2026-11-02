import type { ApiSchemas } from '@torio/api-client';

export type Overview = ApiSchemas['BillingOverviewDto'];
export type Plan = ApiSchemas['BillingPlanListDto']['data'][number];
export type Usage = ApiSchemas['BillingUsageDto'];
export type Profile = ApiSchemas['BillingProfileDto'];
export type SavedCard = ApiSchemas['SavedPaymentMethodListDto']['data'][number];
export type InvoiceItem = ApiSchemas['InvoiceListDto']['data'][number];
export type InvoiceDetail = ApiSchemas['InvoiceDetailDto'];
export type Preview = ApiSchemas['PlanPreviewDto'];
export type Interval = 'MONTH' | 'YEAR';
export type InvoiceStatus = InvoiceItem['status'];

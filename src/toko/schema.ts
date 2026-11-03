import { z } from 'zod';

export const Customer = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  verified: z.boolean(),
});
export type Customer = z.infer<typeof Customer>;

export const OrderItem = z.object({
  sku: z.string(),
  qty: z.number().int().positive(),
  price: z.number().int(),
});
export type OrderItem = z.infer<typeof OrderItem>;

export const Order = z.object({
  id: z.string(),
  customer_id: z.string(),
  items: z.array(OrderItem),
  total: z.number().int(),
  status: z.enum(['diproses', 'dikirim', 'diterima', 'dibatalkan']),
  // Tanggal sengaja string bebas format ("2026-10-12", "12/10/2026", "12 Okt 2026").
  order_date: z.string(),
  delivered_date: z.string().nullable(),
  shipping_address: z.string(),
  source: z.enum(['toko', 'p3']),
});
export type Order = z.infer<typeof Order>;

export const Product = z.object({
  sku: z.string(),
  name: z.string(),
  price: z.number().int(),
  stock: z.number().int(),
});
export type Product = z.infer<typeof Product>;

export const Supplier = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string(),
  address: z.string(),
  source: z.enum(['toko', 'p3']),
});
export type Supplier = z.infer<typeof Supplier>;

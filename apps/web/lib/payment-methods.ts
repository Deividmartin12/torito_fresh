import { api } from "./api";

export type PaymentMethod = { id: string; nombre: string; requiereOperacion: boolean; estado: boolean };
export type PaymentMethodPayload = Omit<PaymentMethod, "id">;

export function getPaymentMethods() { return api<PaymentMethod[]>("/payment-methods"); }
export function createPaymentMethod(payload: PaymentMethodPayload) { return api<PaymentMethod>("/payment-methods", { method: "POST", body: JSON.stringify(payload) }); }
export function updatePaymentMethod(id: string, payload: PaymentMethodPayload) { return api<PaymentMethod>(`/payment-methods/${id}`, { method: "PATCH", body: JSON.stringify(payload) }); }

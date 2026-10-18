import { http } from "@/lib/http";
import type { PhoneCatalogue, PhoneNumber, PhoneNumberInput } from "./types";

/** Caller numbers the AI voice agent dials out on. */
export const phoneNumbersApi = {
  catalogue: () => http.get<PhoneCatalogue>("/phone-numbers/catalogue"),
  list: () => http.get<PhoneNumber[]>("/phone-numbers"),
  create: (data: PhoneNumberInput) => http.post<PhoneNumber>("/phone-numbers", data),
  update: (id: string, data: PhoneNumberInput) => http.put<PhoneNumber>(`/phone-numbers/${id}`, data),
  remove: (id: string) => http.delete(`/phone-numbers/${id}`),
  verify: (id: string) => http.post<PhoneNumber>(`/phone-numbers/${id}/verify`),
  setDefault: (id: string) => http.post<PhoneNumber>(`/phone-numbers/${id}/default`),
};

import { z } from "zod";
export const addressSchema = z.object({
  type: z.enum(["PERSONAL", "BILLING", "SHIPPING", "OFFICE", "OTHER"]),
  label: z.string().trim().min(1).max(100),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  postalCode: z.string().trim().min(1).max(20),
  city: z.string().trim().min(1).max(100),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().max(254).pipe(z.email()), password: z.string().min(1).max(128) });
export const verificationCodeSchema = z.string().regex(/^\d{6}$/, "Le code doit contenir six chiffres.");
export type AddressInput = z.infer<typeof addressSchema>;

export const accountTypeSchema = z.enum(["INDIVIDUAL", "BUSINESS"]);
const registrationBaseSchema = loginSchema.extend({
  password: z.string().min(12, "Utilisez au moins 12 caractères.").max(128),
  name: z.string().trim().min(2).max(100),
});
export const registrationSchema = z.discriminatedUnion("accountType", [
  registrationBaseSchema.extend({ accountType: z.literal("INDIVIDUAL") }),
  registrationBaseSchema.extend({
    accountType: z.literal("BUSINESS"),
    organizationName: z.string().trim().min(2).max(120),
  }),
]);

export const forgotPasswordSchema = loginSchema.pick({ email: true });
export const newPasswordSchema = z.string().min(12, "Utilisez au moins 12 caractères.").max(128);
export const resetPasswordSchema = z.object({
  token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/),
  password: newPasswordSchema,
  confirmation: newPasswordSchema,
}).refine(input => input.password === input.confirmation, {
  message: "Les mots de passe ne correspondent pas.", path: ["confirmation"],
});

import { z } from "zod";

// Shared zod fields (API.md conventions)
export const name = z.string().trim().min(2, "Name is required").max(150, "Too long");
export const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{7,20}$/, "Enter a valid phone")
  .optional()
  .or(z.literal(""));

// Drop empty optional strings so PATCH bodies only carry real values
export const clean = (values) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v === "" ? null : v]));

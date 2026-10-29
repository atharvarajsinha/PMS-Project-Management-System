import { z } from "zod";

export const email = z.string().trim().min(1, "Email is required").email("Enter a valid email");

// Mirrors the server policy (API.md §2); the server stays the source of truth.
export const newPassword = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/[0-9]/, "Include at least one number");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: newPassword,
    confirm_password: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords don't match",
  });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({
    new_password: newPassword,
    confirm_password: z.string().min(1, "Confirm your new password"),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords don't match",
  });

// import { useState } from "react";
// import { Link, useLocation, useNavigate } from "react-router-dom";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
// import { Input } from "@/components/ui/input";
// import FormActions from "@/components/common/FormActions";
// import FormError from "@/components/common/FormError";
// import PasswordInput from "@/components/common/PasswordInput";
// import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";
// import { loginSchema } from "@/features/auth/schemas";
// import { applyApiErrors } from "@/lib/forms";

// const MESSAGES = {
//   INVALID_CREDENTIALS: "Incorrect email or password.",
//   ACCOUNT_INACTIVE: "Your account isn't active yet. Contact your administrator.",
//   COLLEGE_INACTIVE: "Your college's access is currently disabled. Contact your administrator.",
// };

// export default function LoginPage() {
//   const { login } = useAuth();
//   const navigate = useNavigate();
//   const location = useLocation();
//   const [formError, setFormError] = useState(null);
//   const form = useForm({ resolver: zodResolver(loginSchema), mode: "onTouched", defaultValues: { email: "", password: "" } });

//   const onSubmit = async (values) => {
//     setFormError(null);
//     try {
//       const me = await login(values);
//       if (me.must_change_password) return navigate("/change-password", { replace: true });
//       const from = location.state?.from?.pathname;
//       navigate(from && from !== "/" ? from : HOME_BY_ROLE[me.role], { replace: true });
//     } catch (error) {
//       if (error.code === "RATE_LIMITED") return setFormError("Too many attempts. Please wait a minute and try again.");
//       setFormError(MESSAGES[error.code] || applyApiErrors(form, error, ["email", "password"]));
//     }
//   };

//   return (
//     <div>
//       <h1 className="mb-2 text-center text-3xl font-bold tracking-tight md:text-4xl">Sign in</h1>
//       <p className="mb-8 text-center text-sm text-muted-foreground">Use the email and password sent to you.</p>
//       <Form {...form}>
//         <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
//           <FormError message={formError} />
//           <FormField
//             control={form.control}
//             name="email"
//             render={({ field }) => (
//               <FormItem className="space-y-3">
//                 <FormLabel>Email</FormLabel>
//                 <FormControl>
//                   <Input type="email" autoComplete="email" autoFocus {...field} />
//                 </FormControl>
//                 <FormMessage />
//               </FormItem>
//             )}
//           />
//           <FormField
//             control={form.control}
//             name="password"
//             render={({ field }) => (
//               <FormItem className="space-y-3">
//                 <div className="flex items-center justify-between">
//                   <FormLabel>Password</FormLabel>
//                   <Link to="/forgot-password" className="text-sm text-primary underline-offset-4 hover:underline">
//                     Forgot password?
//                   </Link>
//                 </div>
//                 <FormControl>
//                   <PasswordInput autoComplete="current-password" {...field} />
//                 </FormControl>
//                 <FormMessage />
//               </FormItem>
//             )}
//           />
//           <div className="[&_button]:w-full">
//             <FormActions submitLabel="Sign in" pending={form.formState.isSubmitting} />
//           </div>
//         </form>
//       </Form>
//     </div>
//   );
// }



import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import FormActions from "@/components/common/FormActions";
import FormError from "@/components/common/FormError";
import PasswordInput from "@/components/common/PasswordInput";
import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";
import { loginSchema } from "@/features/auth/schemas";
import { applyApiErrors } from "@/lib/forms";

const MESSAGES = {
  INVALID_CREDENTIALS: "Incorrect email or password.",
  ACCOUNT_INACTIVE: "Your account isn't active yet. Contact your administrator.",
  COLLEGE_INACTIVE: "Your college's access is currently disabled. Contact your administrator.",
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState(null);
  const form = useForm({ resolver: zodResolver(loginSchema), mode: "onTouched", defaultValues: { email: "", password: "" } });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const me = await login(values);
      if (me.must_change_password) return navigate("/change-password", { replace: true });
      const from = location.state?.from?.pathname;
      navigate(from && from !== "/" ? from : HOME_BY_ROLE[me.role], { replace: true });
    } catch (error) {
      if (error.code === "RATE_LIMITED") return setFormError("Too many attempts. Please wait a minute and try again.");
      setFormError(MESSAGES[error.code] || applyApiErrors(form, error, ["email", "password"]));
    }
  };

  return (
    <div className="w-full">
      {/* Card: uses theme tokens only, so it follows light/dark automatically.
          In dark mode the shadow is invisible, so the border carries the edge. */}
      <div className="rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8 dark:shadow-none">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-muted-foreground">Use the email and password sent to you.</p>
        </header>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5 [&_input]:h-11"
            noValidate
          >
            <FormError message={formError} />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" autoFocus placeholder="you@college.edu" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <FormLabel>Password</FormLabel>
                    <Link
                      to="/forgot-password"
                      className="rounded-sm text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-1 [&_button]:h-11 [&_button]:w-full">
              <FormActions submitLabel="Sign in" pending={form.formState.isSubmitting} />
            </div>
          </form>
        </Form>
      </div>

      
    </div>
  );
}
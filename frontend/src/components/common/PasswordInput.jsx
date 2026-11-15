import { forwardRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PasswordInput = forwardRef(({ className, revealLabel = "password", ...props }, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-11", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
        aria-label={visible ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export default PasswordInput;

// Minimum rules hint shown under new-password fields
export function PasswordRules({ value = "" }) {
  const rules = [
    ["At least 8 characters", value.length >= 8],
    ["A letter", /[A-Za-z]/.test(value)],
    ["A number", /[0-9]/.test(value)],
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Password requirements">
      {rules.map(([label, ok]) => (
        <li key={label} className={ok ? "text-success" : "text-muted-foreground"}>
          {ok ? "✓" : "•"} {label}
        </li>
      ))}
    </ul>
  );
}

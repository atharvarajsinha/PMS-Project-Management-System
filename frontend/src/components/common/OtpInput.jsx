import { useRef } from "react";
import { cn } from "@/lib/utils";

const LENGTH = 6;

// Six single-digit boxes with auto-advance, backspace-to-previous and paste support.
export default function OtpInput({ value = "", onChange, disabled, invalid, autoFocus }) {
  const refs = useRef([]);
  const digits = Array.from({ length: LENGTH }, (_, i) => value[i] || "");

  const setAt = (index, digit) => {
    const next = digits.slice();
    next[index] = digit;
    onChange(next.join("").slice(0, LENGTH));
  };

  const handleChange = (index, e) => {
    const input = e.target.value.replace(/\D/g, "");
    if (!input) return setAt(index, "");
    if (input.length > 1) return handlePasteText(input, index);
    setAt(index, input);
    if (index < LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setAt(index - 1, "");
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    else if (e.key === "ArrowRight" && index < LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handlePasteText = (text, start = 0) => {
    const clean = text.replace(/\D/g, "").slice(0, LENGTH - start);
    const next = digits.slice();
    clean.split("").forEach((d, i) => (next[start + i] = d));
    onChange(next.join(""));
    refs.current[Math.min(start + clean.length, LENGTH - 1)]?.focus();
  };

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="One-time code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={LENGTH}
          disabled={disabled}
          autoFocus={autoFocus && i === 0}
          aria-label={`Digit ${i + 1}`}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => {
            e.preventDefault();
            handlePasteText(e.clipboardData.getData("text"), i);
          }}
          onFocus={(e) => e.target.select()}
          className={cn(
            "size-11 rounded-md border border-input bg-transparent text-center font-mono text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            invalid && "border-destructive",
          )}
        />
      ))}
    </div>
  );
}

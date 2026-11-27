import { Laptop, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PALETTES, useTheme } from "@/context/ThemeContext";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
];

export default function ThemeToggle() {
  const { theme, setTheme, palette, setPalette } = useTheme();
  const Current = options.find((o) => o.value === theme)?.icon || Laptop;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="size-10 rounded-xl text-primary" aria-label="Change theme" title="Theme">
          <Current className="size-5" strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>
              <o.icon className="mr-2 size-4" /> {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Colour</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={palette} onValueChange={setPalette}>
          {Object.entries(PALETTES).map(([value, p]) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <span className="mr-2 size-4 rounded-full ring-1 ring-border" style={{ backgroundColor: p.swatch }} aria-hidden />
              {p.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

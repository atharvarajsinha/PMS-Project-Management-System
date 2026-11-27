# PMS Frontend Design Guide

The design system and build conventions for the PMS web app and PWA. The frontend team can build against this guide while the backend team works on Phase 1.

**Stack:** React 18 · Vite · Tailwind CSS 3.4 · shadcn/ui (JSX) · lucide-react · vite-plugin-pwa · react-router-dom 6 · axios · react-hook-form + zod · sonner
**Language:** JavaScript/JSX only. Do not add TypeScript or `.tsx` files.

---

## Table of contents
1. [Design principles](#1-design-principles)
2. [Color and theme tokens](#2-color-and-theme-tokens)
3. [Theme context (light / dark / system)](#3-theme-context-light--dark--system)
4. [Typography](#4-typography)
5. [Spacing, radius, shadow](#5-spacing-radius-shadow)
6. [Icons](#6-icons)
7. [Layout and responsiveness](#7-layout-and-responsiveness)
8. [Common footer](#8-common-footer)
9. [Components and usage rules](#9-components-and-usage-rules)
10. [Role-based layouts and navigation (Phase 1)](#10-role-based-layouts-and-navigation-phase-1)
11. [Routing and lazy loading](#11-routing-and-lazy-loading)
12. [API client (cookies, CSRF, refresh)](#12-api-client-cookies-csrf-refresh)
13. [Folder structure](#13-folder-structure)
14. [Config snippets](#14-config-snippets)
15. [PWA](#15-pwa)
16. [Accessibility checklist](#16-accessibility-checklist)

---

## 1. Design principles

The look is **dark orange with gradient accents**. Dark is the default theme; light stays available.

- **Warm dark, quiet surfaces.** Use warm near-black surfaces (dark theme) or white (light theme), 1px subtle borders and almost no shadow. Separate areas with borders and whitespace, not color blocks.
- **Orange gradient as the accent.** The brand gradient (orange → red-orange, §2) appears only on primary actions, the logo, the avatar, the active nav bar and small highlights such as the stat-tile strip. Links, focus rings and badges use the flat `--primary`. **Use no more than one gradient button per view.**
- **Ambient glow.** The page background carries a soft orange radial glow (top-center, fainter bottom-right). It's the only background decoration; cards stay solid so text sits on a flat surface.
- **Generous whitespace.** Use 24px padding inside cards on desktop (16px on mobile) and 24–32px between page sections.
- **One accent hue.** Grays are neutral in light mode and slightly warm in dark mode, so orange stays the only hue on the page.
- **Content first.** Use no decorative illustrations or background images. Gradients are limited to the uses above. Empty states use a single lucide icon and short text.
- **Predictable layout.** Every page has the same header, title row, content and footer.

---

## 2. Color and theme tokens

Colors are shadcn CSS variables in HSL format (`H S% L%`, without the `hsl()` wrapper). Components use only the tokens and never raw hex values or Tailwind palette colors such as `bg-orange-500`.

### Light theme: orange and white (`:root`)

| Token | HSL | Hex | Use |
|---|---|---|---|
| `--background` | `0 0% 100%` | `#FFFFFF` | Page background |
| `--foreground` | `0 0% 9%` | `#171717` | Body text |
| `--card` | `0 0% 100%` | `#FFFFFF` | Cards |
| `--card-foreground` | `0 0% 9%` | `#171717` | |
| `--popover` | `0 0% 100%` | `#FFFFFF` | Menus, popovers |
| `--popover-foreground` | `0 0% 9%` | `#171717` | |
| `--primary` | `17 88% 40%` | `#C2410C` | Buttons, active nav, links |
| `--primary-foreground` | `0 0% 100%` | `#FFFFFF` | Text on primary |
| `--secondary` | `0 0% 96%` | `#F5F5F5` | Secondary buttons |
| `--secondary-foreground` | `0 0% 9%` | `#171717` | |
| `--muted` | `0 0% 96%` | `#F5F5F5` | Table header, subtle fills |
| `--muted-foreground` | `0 0% 45%` | `#737373` | Helper text, captions |
| `--accent` | `33 100% 96%` | `#FFF7ED` | Hover rows, active nav background |
| `--accent-foreground` | `15 75% 28%` | `#7C2D12` | Text on accent |
| `--destructive` | `0 72% 51%` | `#DC2626` | Delete, errors |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--success` | `142 72% 29%` | `#15803D` | ACTIVE, success |
| `--success-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--warning` | `32 95% 44%` | `#D97706` | PENDING, warnings (use as text only on light backgrounds) |
| `--warning-foreground` | `0 0% 9%` | `#171717` | |
| `--info` | `224 76% 48%` | `#1D4ED8` | Info banners |
| `--info-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--border` | `0 0% 90%` | `#E5E5E5` | All borders |
| `--input` | `0 0% 90%` | `#E5E5E5` | Input borders |
| `--ring` | `17 88% 40%` | `#C2410C` | Focus ring |
| `--gradient-from` | `21 90% 41%` | `#C74C0A` | Brand gradient start |
| `--gradient-to` | `12 80% 36%` | `#A53012` | Brand gradient end |
| `--glow` | `21 90% 48%` | `#E9590C` | Background glow (used at 5–10% alpha) |

### Dark theme: dark orange (`.dark`, default)

| Token | HSL | Hex | Use |
|---|---|---|---|
| `--background` | `20 18% 4%` | `#0C0A08` | Page background (warm near-black) |
| `--foreground` | `30 20% 97%` | `#F9F7F6` | Body text |
| `--card` | `20 16% 7%` | `#15110F` | Cards |
| `--card-foreground` | `30 20% 97%` | `#F9F7F6` | |
| `--popover` | `20 16% 8%` | `#181311` | |
| `--popover-foreground` | `30 20% 97%` | `#F9F7F6` | |
| `--primary` | `25 95% 53%` | `#F97316` | Links, focus, badges, checkboxes |
| `--primary-foreground` | `0 0% 4%` | `#0A0A0A` | Text on primary and on the gradient (**black**, not white) |
| `--secondary` | `20 12% 12%` | `#221D1B` | |
| `--secondary-foreground` | `30 20% 97%` | `#F9F7F6` | |
| `--muted` | `20 12% 12%` | `#221D1B` | |
| `--muted-foreground` | `25 8% 64%` | `#ABA29C` | |
| `--accent` | `22 65% 11%` | `#2E170A` | Hover rows, active nav background |
| `--accent-foreground` | `31 97% 72%` | `#FDBA74` | |
| `--destructive` | `0 72% 51%` | `#DC2626` | |
| `--destructive-foreground` | `0 0% 100%` | `#FFFFFF` | |
| `--success` | `142 71% 45%` | `#22C55E` | |
| `--success-foreground` | `0 0% 4%` | `#0A0A0A` | |
| `--warning` | `38 92% 50%` | `#F59E0B` | |
| `--warning-foreground` | `0 0% 4%` | `#0A0A0A` | |
| `--info` | `213 94% 68%` | `#60A5FA` | |
| `--info-foreground` | `0 0% 4%` | `#0A0A0A` | |
| `--border` | `20 14% 15%` | `#2C2421` | |
| `--input` | `20 14% 17%` | `#312925` | |
| `--ring` | `25 95% 53%` | `#F97316` | |
| `--gradient-from` | `33 98% 58%` | `#FD9E2B` | Brand gradient start |
| `--gradient-to` | `18 90% 50%` | `#F2520D` | Brand gradient end |
| `--glow` | `22 95% 50%` | `#F95F06` | Background glow (used at 10–22% alpha) |

### Brand gradient and glow

Two utilities in `src/index.css` (`@layer utilities`) wrap the tokens:

| Class | Value | Use |
|---|---|---|
| `bg-brand-gradient` | `linear-gradient(135deg, hsl(var(--gradient-from)), hsl(var(--gradient-to)))` | Primary button, logo mark, avatar, active nav bar, stat-tile strip |
| `text-brand-gradient` | Same gradient clipped to text | Rare display accents only; never body text |

The body background layers two radial `--glow` gradients (top-center and bottom-right) with `background-attachment: fixed`. Header and mobile bottom nav are translucent (`bg-background/75`–`/85` + `backdrop-blur-md`) and the sidebar is `bg-background/40` so the glow shows through; cards, dialogs and popovers stay opaque.

Both gradient stops are chosen so the button text passes AA at **every** point of the gradient: white in light mode, black in dark mode.

### Contrast check (WCAG 2.1 AA: 4.5:1 for normal text, 3:1 for large text and UI elements)

| Pair | Ratio | Result |
|---|---|---|
| White on `#C74C0A` (light gradient start) | **4.7 : 1** | Pass |
| White on `#A53012` (light gradient end) | **6.9 : 1** | Pass |
| `#0A0A0A` on `#FD9E2B` (dark gradient start) | **9.5 : 1** | Pass |
| `#0A0A0A` on `#F2520D` (dark gradient end) | **5.6 : 1** | Pass |
| White on `#C2410C` (light primary) | **5.2 : 1** | Pass |
| `#0A0A0A` on `#F97316` (dark primary) | **7.0 : 1** | Pass |
| White on `#F97316` | 2.8 : 1 | **Fail.** This is why dark mode uses black text on orange. |
| White on `#EA580C` | 3.6 : 1 | **Fail.** This is why light mode uses `#C2410C`, not orange-600. |
| `#C2410C` link on `#FFFFFF` | 5.2 : 1 | Pass |
| `#F97316` link on `#0A0A0A` | 7.0 : 1 | Pass |
| `#737373` muted text on `#FFFFFF` | 4.7 : 1 | Pass |
| `#ABA29C` muted text on `#0C0A08` | 7.9 : 1 | Pass |
| White on `#15803D` (success) | 5.0 : 1 | Pass |
| White on `#DC2626` (destructive) | 4.8 : 1 | Pass |

Rules:
- **Never put white text on any orange lighter than `#C74C0A`**, and never black text on any orange darker than `#F2520D`.
- If you change a gradient stop, re-check both ends against the text color for that theme.

---

## 3. Theme context (light / dark / system)

- Theme switching uses Tailwind's class strategy: the `dark` class on `<html>` turns on dark mode.
- The stored preference is `light`, `dark` or `system`, under the localStorage key `pms-theme`. Every storage access is wrapped in try/catch because it can throw in private mode.
- **The default is `dark`** (the dark orange theme) when nothing is stored. Users can switch to `light` or `system`.
- In `system` mode the app follows `prefers-color-scheme` and updates live when the OS setting changes.
- The theme toggle is a dropdown in the header with three options: Sun (Light), Moon (Dark) and Laptop (System).

```jsx
// src/context/ThemeContext.jsx
import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "pms-theme";
const ThemeContext = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", isDark ? "#0B0907" : "#FFFFFF");
    };
    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme]);

  const setTheme = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable: keep in memory only */
    }
    setThemeState(value);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
```

To avoid a flash of the wrong theme, add this inline script to `index.html` before the app bundle loads:

```html
<script>
  (function () {
    var t = "dark";
    try { t = localStorage.getItem("pms-theme") || "dark"; } catch (e) {}
    var d = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    if (d) document.documentElement.classList.add("dark");
  })();
</script>
```

---

## 4. Typography

- **UI font:** **Inter** (variable). Self-host it with `@fontsource-variable/inter` so it also works offline in the PWA.
- **Mono font:** **JetBrains Mono**, via `@fontsource/jetbrains-mono` (weights 400 and 500). Use it only for roll numbers, subject codes, college codes, OTPs and IDs.

```bash
npm i @fontsource-variable/inter @fontsource/jetbrains-mono
```

```js
// src/main.jsx
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
```

### Type scale (mobile-first; `md:` values apply at ≥ 768px)

| Style | Size / line height | Weight | Tailwind classes | Use |
|---|---|---|---|---|
| Display | 30/36 → 36/40 | 700 | `text-3xl md:text-4xl font-bold tracking-tight` | Login and landing heading only |
| H1 | 24/32 → 30/36 | 600 | `text-2xl md:text-3xl font-semibold tracking-tight` | Page title (one per page) |
| H2 | 20/28 | 600 | `text-xl font-semibold` | Section title |
| H3 | 18/28 | 600 | `text-lg font-semibold` | Card title |
| H4 | 16/24 | 600 | `text-base font-semibold` | Sub-section, dialog title |
| Body | 14/20 → 16/24 | 400 | `text-sm md:text-base` | Default text |
| Small | 14/20 | 400 | `text-sm` | Table cells, form inputs |
| Caption | 12/16 | 400 | `text-xs text-muted-foreground` | Helper text, timestamps |
| Label | 14/20 | 500 | `text-sm font-medium` | Form labels, column headers |
| Mono | 13/20 | 500 | `font-mono text-[13px]` | Roll no., codes, OTP |

Rules:
- Body text is `text-foreground`, and secondary text is `text-muted-foreground`.
- Never use more than three font sizes in one card.
- Line length stays at 75 characters or fewer (`max-w-prose`) for paragraphs.
- Numbers in tables use `tabular-nums`.

---

## 5. Spacing, radius, shadow

**Spacing:** Tailwind's 4px scale. Use only these values:

| Token | px | Tailwind | Use |
|---|---|---|---|
| xs | 4 | `1` | Icon-to-text gap inside badges |
| sm | 8 | `2` | Icon-to-text gap in buttons, tight stacks |
| md | 12 | `3` | Form field gap (label → input) |
| base | 16 | `4` | Mobile page padding, card padding (mobile), gaps in grids |
| lg | 24 | `6` | Desktop page padding, card padding (desktop), form row gap |
| xl | 32 | `8` | Between page sections |
| 2xl | 48 | `12` | Empty-state vertical padding |

**Radius:** `--radius: 0.5rem` (8px).
- Inputs and buttons use `rounded-md` (6px).
- Cards and dialogs use `rounded-lg` (8px).
- Badges and avatars use `rounded-full`.

**Shadow:** kept to a minimum.

| Token | Value | Use |
|---|---|---|
| none | none | Cards, tables, page sections (use a border instead) |
| `shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Sticky header after scroll, buttons (optional) |
| `shadow-md` | `0 4px 12px -2px rgb(0 0 0 / 0.08)` | Dropdowns, popovers |
| `shadow-lg` | `0 12px 32px -8px rgb(0 0 0 / 0.16)` | Dialogs and sheets only |

In dark mode, rely on borders and lighter surface colors to show depth, because shadows are barely visible.

---

## 6. Icons

The icon set is **lucide-react**. Import icons individually so they tree-shake: `import { Users } from "lucide-react"`.

| Size | Class | Use |
|---|---|---|
| 16 | `size-4` | Inside buttons, badges, inputs, table actions |
| 20 | `size-5` | Sidebar nav, header actions, tabs |
| 24 | `size-6` | Page header icon, mobile bottom nav |
| 40 | `size-10` | Empty states only (`text-muted-foreground`) |

- Stroke is `strokeWidth={1.75}` by default and `2` at 16px.
- Icons inherit `currentColor`. Never color an icon orange unless its parent is active or primary.
- An icon-only button **must** have `aria-label` and a `Tooltip`.
- Icon map:

| Concept | Icon |
|---|---|
| Dashboard | `LayoutDashboard` |
| Colleges | `Building2` |
| College Admins | `ShieldCheck` |
| Faculty | `GraduationCap` |
| Students | `Users` |
| Semesters | `CalendarRange` |
| Subjects | `BookOpen` |
| Sections | `LayoutGrid` |
| Subject mapping | `Network` |
| Class coordinator | `UserCheck` |
| Settings | `Settings` |
| Profile | `UserRound` |
| Logout | `LogOut` |
| Add | `Plus` |
| Edit | `Pencil` |
| Delete | `Trash2` |
| Activate | `Power` |
| Search | `Search` |
| Filter | `ListFilter` |
| Menu | `Menu` |
| Theme | `Sun` / `Moon` / `Laptop` |
| Audit | `History` |
| Switch college | `ArrowLeftRight` |

---

## 7. Layout and responsiveness

### Breakpoints (Tailwind defaults, mobile-first)

| Name | Min width | Target | Shell |
|---|---|---|---|
| base | 0 | Phones (320–639px) | Top bar, bottom nav, plus a "More" sheet |
| `sm` | 640px | Large phones | Same as base |
| `md` | 768px | Tablets | Top bar, drawer sidebar (Sheet) |
| `lg` | 1024px | Laptops | Fixed sidebar, 256px wide, collapsible to 72px |
| `xl` | 1280px | Desktops | Same; content max width 1280px |
| `2xl` | 1536px | Large screens | Same; content centered |

### App shell

```
┌─────────────── Header (h-14, sticky, border-b) ────────────────┐
│ [≡ mobile] Logo · College switcher (SA) · ⌕ · theme · avatar   │
├──────────┬──────────────────────────────────────────────────────┤
│ Sidebar  │  Page title row  (H1 + primary action, right-aligned)│
│ 256px    │  ──────────────────────────────────────────────────  │
│ (lg+)    │  Content  (max-w-7xl mx-auto px-4 md:px-6 py-6)      │
│          │                                                      │
│          ├──────────────────────────────────────────────────────┤
│          │  Footer (border-t, text-xs, centered)                │
└──────────┴──────────────────────────────────────────────────────┘
 Mobile (< md): bottom nav h-16, 4 primary items + "More"
```

- **Header:** `sticky top-0 border-b bg-background/75 backdrop-blur-md`, so the page glow shows through. The avatar uses `bg-brand-gradient` with `text-primary-foreground` initials.
- **Sidebar (lg and up):** the background is `bg-background/40` with `border-r`.
  - Item: `h-10 px-3 rounded-md text-sm`.
  - Active item: `bg-accent text-accent-foreground font-medium`, with a 2px `bg-brand-gradient` bar on the left.
  - The collapse state is stored in localStorage (`pms-sidebar`, wrapped in try/catch). When collapsed, show icons only with tooltips.
- **Drawer (md to lg):** a shadcn `Sheet` with `side="left"`, opened from the header `Menu` button. It closes on navigation.
- **Bottom nav (< md):** `fixed bottom-0 inset-x-0 h-16 border-t bg-background/85 backdrop-blur-md`, with up to four items plus "More", which opens a bottom `Sheet` with the remaining items. Each item is an icon at `size-6` with a `text-[11px]` label. Pad the content with `pb-20` so it isn't hidden behind the bar.
- **Page title row:** `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`. On mobile the primary action becomes full width (`w-full sm:w-auto`).

### Responsive rules
- **Tables become cards below `md`.** Render a `<Table>` at `md` and above, and a stacked list of `Card`s below `md`, each showing 2–4 key fields plus an actions menu. Use one data source for both views (see `DataView` in §9).
- **Forms:** one column on mobile; `md:grid-cols-2` for short fields (name, phone); long fields span `md:col-span-2`.
- **Dialogs:** on mobile, a large form uses a bottom `Sheet` (`side="bottom"`, `max-h-[90dvh]`) instead of a `Dialog`.
- **Touch targets:** at least **44 × 44px** on touch devices. Buttons are `h-10` (40px) with `min-h-11` (44px) below `md`; icon buttons are `size-11` below `md`.
- **Viewport height:** use `dvh` units (`min-h-dvh`), not `vh`.
- **Safe areas (PWA):** the viewport meta includes `viewport-fit=cover`, and these utilities are applied:
  - Header: `pt-[env(safe-area-inset-top)]`
  - Bottom nav: `pb-[env(safe-area-inset-bottom)]` (total height `h-[calc(4rem+env(safe-area-inset-bottom))]`)
  - Sheets: the same insets on their edge
- **No horizontal page scroll at 320px.** Wide tables scroll inside their own `overflow-x-auto` container only.
- **Test widths:** 320, 375, 414, 768, 1024, 1280 and 1536px.

---

## 8. Common footer

The footer appears on **every** page, both authenticated and public (login, forgot password), as the last element of each layout. The year is computed at runtime.

```jsx
// src/components/common/Footer.jsx
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground md:px-6">
      © {year} PMS. All rights are reserved.
    </footer>
  );
}
```

In the app shell, the footer sits in the main column under the content, which uses `flex-1` so the footer stays at the bottom on short pages. On mobile it sits above the bottom-nav padding.

---

## 9. Components and usage rules

Install shadcn/ui components in JSX mode (see §14 for `components.json`):

```bash
npx shadcn@2.3.0 add button input label textarea select checkbox switch form card table dialog sheet dropdown-menu tooltip badge skeleton tabs avatar separator alert alert-dialog popover command pagination sonner breadcrumb scroll-area
```

### Buttons

| Variant | Use | Limit |
|---|---|---|
| `default` (orange gradient) | The single primary action of a view (Create, Save, Login). `bg-brand-gradient text-primary-foreground` with a soft orange shadow; hover is `brightness-110` | 1 per view |
| `outline` | Secondary actions (Cancel, Export, Filter) | |
| `secondary` | Tertiary actions in toolbars | |
| `ghost` | Table row actions, icon buttons, nav | |
| `destructive` | Delete and deactivate confirmations, **inside an AlertDialog only** | |
| `link` | Inline navigation | |

- Sizes: `default` (h-10), `sm` (h-9) for tables and toolbars, `icon` (size-10, or size-11 on mobile).
- Loading state: disable the button and replace the icon with `<Loader2 className="size-4 animate-spin" />`. Keep the label.
- Button order: the primary action is on the right on desktop. On mobile, buttons stack with the primary on top (`flex-col-reverse sm:flex-row`).

### Forms (react-hook-form + zod)

```bash
npm i react-hook-form zod @hookform/resolvers
```

- Use the shadcn `<Form>` primitives: `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`.
- Validate on blur, then on change after the first error (`mode: "onTouched"`).
- Map API field errors (normalized `details: { field: ["msg"] }`, see API.md §3; `details.non_field_errors` goes in the top alert) to fields with `form.setError(field, { message })`. Errors that aren't tied to a field go in an `Alert variant="destructive"` at the top of the form.
- Required fields have a label ending in `*`, using `<span className="text-destructive">*</span>`.
- The email field in the profile is **read-only** (`disabled`), with helper text "Email cannot be changed."
- Passwords have a show/hide toggle (`Eye` / `EyeOff`) and a strength hint showing the minimum rules.
- OTP input: six inputs styled `font-mono text-lg text-center size-11`, with auto-advance and paste support.

```jsx
const schema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().regex(/^[0-9+\-\s]{7,20}$/, "Enter a valid phone").optional().or(z.literal("")),
});
```

### Tables and lists

- Table header: `bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground`.
- Rows are `h-12`, with `hover:bg-accent/50` on hover and a border between rows. Don't use zebra stripes.
- Toolbar above the table: a search input (debounced 300ms, with a `Search` icon), filters (`Select`), and a primary action on the right.
- Pagination is server-side: show "Showing 1–20 of 134" plus previous/next. Page size is 20.
- The row actions menu is a ghost icon button (`MoreHorizontal`) that opens a `DropdownMenu` (Edit, Activate/Deactivate, Delete).
- Keep filters, search and page in the URL query string (`useSearchParams`) so pages can be bookmarked.
- `DataView` pattern: `<DataView columns rows renderCard loading error empty />` renders a `Table` at `md` and above and `renderCard(row)` below `md`.

### Status badges

| Status | Style |
|---|---|
| `ACTIVE` | `bg-success/10 text-success border-success/20` |
| `INACTIVE` | `bg-muted text-muted-foreground border-border` |
| `PENDING` | `bg-warning/10 text-warning border-warning/20` |
| `LOCKED` | `bg-secondary text-foreground` + `Lock` icon (size-3) |
| `OPEN` | `bg-primary/10 text-primary border-primary/20` |
| `FAILED` / `REJECTED` | `bg-destructive/10 text-destructive border-destructive/20` |

All badges are `rounded-full px-2.5 py-0.5 text-xs font-medium border`. Status text is uppercase-first in the UI ("Active"); the API value stays uppercase.

### Dialogs and confirmations

- Create and edit forms use a `Dialog` (`max-w-lg`) on desktop and a bottom `Sheet` on mobile.
- Destructive actions use an `AlertDialog` that names the entity: "Delete faculty *Priya Sharma*? This permanently removes the account and all related data. This cannot be undone." The confirm button is `destructive`.
- **Hard delete** additionally requires typing the entity's name or email to enable the button, because the system has no soft delete.

### Toasts (sonner)

- `<Toaster position="top-right" richColors closeButton />`. On mobile, the position is `top-center`.
- Success: short past-tense text ("Faculty created"), shown for 3s.
- Error: the API `message`, shown for 5s. Never show stack traces or raw JSON.
- Don't show a toast for validation errors; those appear inline.

### Empty, loading and error states

- **Empty:** centered `py-12`, a 40px muted icon, an H4 title ("No students yet"), one line of caption text, and the primary action if the user can create.
- **Loading:**
  - Skeletons that match the final layout: table rows as `Skeleton h-12`, cards as `Skeleton h-28`.
  - Never use a full-page spinner after the first load.
  - The route-level fallback is `PageSkeleton` (title bar plus three rows).
- **Error:**
  - An inline `Alert variant="destructive"` with the message and a "Try again" button that refetches.
  - Network offline: a persistent top banner, "You're offline. Changes will not be saved."
  - 403: a "You don't have access to this page" page.
  - 404: a "Page not found" page with a link to the dashboard.

### Cards and dashboard stats

- Card: `rounded-lg border bg-card p-4 md:p-6`, with no shadow.
- Card surfaces stay opaque (`bg-card`) so text never sits directly on the glow.
- Stat tile: a 2px `bg-brand-gradient` strip along the top edge, a caption label, a `text-2xl font-semibold tabular-nums` value, and an optional muted 16px icon top-right. Arrange tiles in `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`.

---

## 10. Role-based layouts and navigation (Phase 1)

There are two layouts. `AuthLayout` (centered card, max-w-sm, logo, footer) is used for all public pages. `AppLayout` is the shell from §7. The nav list comes from the user's `role`, returned by `GET /api/v1/auth/me/`.

### Public / auth (AuthLayout)
| Route | Page |
|---|---|
| `/login` | Email + password |
| `/forgot-password` | Email, then send OTP |
| `/reset-password` | OTP + new password |
| `/change-password` | Forced on first login (`must_change_password = true`); user cannot leave until done |

### Super Admin (`SUPER_ADMIN`)
| Nav item | Route | Icon |
|---|---|---|
| Dashboard | `/sa` | `LayoutDashboard` |
| Colleges | `/sa/colleges` | `Building2` |
| College Admins | `/sa/admins` | `ShieldCheck` |
| Profile | `/profile` | `UserRound` |

The header has a **college switcher** (`Command` combobox, `ArrowLeftRight` icon). When a college is selected:
- The selected `college_id` is kept in context and sent as the `X-College-Id` header.
- The College Admin nav below appears under a "Managing: *College name*" label.
- A persistent `bg-accent` strip appears under the header with an "Exit" link.

### College Admin (`ADMIN`)
| Nav item | Route | Icon |
|---|---|---|
| Dashboard | `/admin` | `LayoutDashboard` |
| Faculty | `/admin/faculty` | `GraduationCap` |
| Students | `/admin/students` | `Users` |
| Semesters | `/admin/semesters` | `CalendarRange` |
| Subjects | `/admin/subjects` | `BookOpen` |
| Sections & Class Coordinators | `/admin/sections` | `LayoutGrid` |
| Subject Mapping | `/admin/mapping` | `Network` (tabs: Semester subjects · Section subjects · Faculty assignment) |
| Settings | `/admin/settings` | `Settings` (team size, mentor capacity, team formation, team lock, cross-section evaluation) |
| Profile | `/profile` | `UserRound` |

Mobile bottom nav: Dashboard, Faculty, Students, Semesters, and More.

### Faculty (`FACULTY`)
| Nav item | Route | Icon |
|---|---|---|
| Dashboard | `/faculty` | `LayoutDashboard` (class-teacher sections, teaching assignments) |
| Profile | `/profile` | `UserRound` |

### Student (`STUDENT`)
| Nav item | Route | Icon |
|---|---|---|
| Dashboard | `/student` | `LayoutDashboard` (current semester, section) |
| Profile | `/profile` | `UserRound` |

Phase 2 adds Teams, Phases, Mentoring, Evaluations and Submissions. Phase 3 adds Notifications, Imports, Reports, Promotion and Audit. Keep the nav config data-driven (`src/config/nav.js`) so these become new entries rather than layout changes.

**Route guards:**
- `<RequireAuth>` redirects to `/login`.
- `<RequireRole roles={[...]}>` shows the 403 page if the role doesn't match.
- `<RequirePasswordChanged>` redirects to `/change-password` while `must_change_password` is true.
- After login, users are redirected by role: SA → `/sa`, ADMIN → `/admin`, FACULTY → `/faculty`, STUDENT → `/student`.

---

## 11. Routing and lazy loading

Every page is lazy-loaded at route level. Layouts, guards and the footer are loaded eagerly.

```jsx
// src/routes/index.jsx
import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import AuthLayout from "@/layouts/AuthLayout";
import PageSkeleton from "@/components/common/PageSkeleton";
import { RequireAuth, RequireRole } from "@/routes/guards";

const Login = lazy(() => import("@/features/auth/pages/LoginPage"));
const Colleges = lazy(() => import("@/features/colleges/pages/CollegesPage"));
const Faculty = lazy(() => import("@/features/faculty/pages/FacultyPage"));
// ...

const page = (Component) => (
  <Suspense fallback={<PageSkeleton />}>
    <Component />
  </Suspense>
);

export const router = createBrowserRouter([
  { element: <AuthLayout />, children: [{ path: "/login", element: page(Login) }] },
  {
    element: <RequireAuth><AppLayout /></RequireAuth>,
    children: [
      { path: "/sa/colleges", element: <RequireRole roles={["SUPER_ADMIN"]}>{page(Colleges)}</RequireRole> },
      { path: "/admin/faculty", element: <RequireRole roles={["ADMIN", "SUPER_ADMIN"]}>{page(Faculty)}</RequireRole> },
      // ...
    ],
  },
]);
```

- Heavy libraries (charts, CSV parsing in Phase 3) are imported dynamically inside the feature that uses them.
- Prefetch on hover: nav links call the page's `import()` in `onMouseEnter`.
- `manualChunks` in Vite splits out `react`, `react-router-dom`, `@radix-ui/*` and `lucide-react` (see §14).

---

## 12. API client (cookies, CSRF, refresh)

The full endpoint reference is in [`docs/API.md`](API.md). Authentication uses **JWT in httpOnly cookies** set by the backend; the frontend never reads or stores tokens.

The frontend (Vercel) and backend (Render) are different domains, so the frontend **proxies `/api` through its own origin** (Vercel rewrite in production, Vite proxy in development; snippets in API.md §2). The cookies are then first-party, and JavaScript can read the non-httpOnly `csrftoken` cookie:
1. On app start, call `GET /api/v1/auth/csrf/` (sets the `csrftoken` cookie).
2. Read the cookie and send it as the `X-CSRFToken` header on every unsafe method (POST, PUT, PATCH, DELETE).

```js
// src/lib/api.js
import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1", // always relative: proxied to Django
  withCredentials: true,
  timeout: 20000,
});

export const loadCsrf = () => api.get("/auth/csrf/");

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

let collegeId = null; // Super Admin "managing a college" context
export const setCollegeContext = (id) => { collegeId = id; };

api.interceptors.request.use((config) => {
  const method = (config.method || "get").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const token = getCookie("csrftoken");
    if (token) config.headers["X-CSRFToken"] = token;
  }
  if (collegeId) config.headers["X-College-Id"] = collegeId;
  return config;
});

// Refresh once on TOKEN_EXPIRED; concurrent requests share one refresh call
let refreshing = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.error?.code;
    if (code === "TOKEN_EXPIRED" && !original._retry) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh/").finally(() => { refreshing = null; });
        await refreshing;
        return api(original);
      } catch {
        window.dispatchEvent(new Event("pms:logout")); // AuthContext clears state, goes to /login
      }
    } else if (code === "REFRESH_INVALID" || code === "NOT_AUTHENTICATED") {
      window.dispatchEvent(new Event("pms:logout"));
    } else if (code === "PASSWORD_CHANGE_REQUIRED") {
      window.dispatchEvent(new Event("pms:password-change-required")); // router goes to /change-password
    }
    return Promise.reject(normalizeError(error));
  }
);

// API error body: { error: { code, message, details? } } (API.md §3)
// Normalized to:  { status, code, message, details }
function normalizeError(error) {
  if (!error.response) {
    return { status: 0, code: "NETWORK_ERROR", message: "Network error. Check your connection.", details: {} };
  }
  const e = error.response.data?.error || {};
  return {
    status: error.response.status,
    code: e.code || "SERVER_ERROR",
    message: e.message || "Something went wrong.",
    details: e.details || {},
  };
}

export default api;
```

- Feature API modules live in `src/features/<feature>/api.js` and export plain functions (`listFaculty(params)`, `createFaculty(body)`). Components never call axios directly.
- Server state uses **@tanstack/react-query**:
  - `staleTime: 30_000`, `retry: 1`, `refetchOnWindowFocus: false`.
  - Mutations invalidate their list query and show a sonner toast.

---

## 13. Folder structure

```
frontend/
├── index.html
├── components.json
├── jsconfig.json                 # "@/*" -> "src/*"
├── tailwind.config.js
├── postcss.config.js
├── vite.config.js
├── public/
│   ├── icons/                    # PWA icons 192, 512, maskable-512, apple-touch-180
│   └── favicon.svg
└── src/
    ├── main.jsx                  # fonts, providers, RouterProvider
    ├── index.css                 # Tailwind layers + theme tokens
    ├── components/
    │   ├── ui/                   # shadcn generated components (.jsx) — do not hand-edit except variants
    │   └── common/               # Footer, PageHeader, PageSkeleton, DataView, EmptyState,
    │                             # ErrorState, StatusBadge, ConfirmDialog, ThemeToggle, CollegeSwitcher
    ├── context/
    │   ├── ThemeContext.jsx
    │   ├── AuthContext.jsx       # current user, role, login/logout, must_change_password
    │   └── CollegeContext.jsx    # Super Admin managed-college selection
    ├── layouts/
    │   ├── AppLayout.jsx         # header + sidebar/drawer/bottom-nav + <Outlet/> + Footer
    │   ├── AuthLayout.jsx
    │   ├── Sidebar.jsx
    │   ├── MobileNav.jsx
    │   └── Header.jsx
    ├── routes/
    │   ├── index.jsx             # router with lazy pages
    │   └── guards.jsx            # RequireAuth, RequireRole, RequirePasswordChanged
    ├── config/
    │   └── nav.js                # role -> nav items
    ├── features/
    │   ├── auth/                 # pages/, components/, api.js, schemas.js
    │   ├── profile/
    │   ├── colleges/             # Super Admin
    │   ├── college-admins/       # Super Admin
    │   ├── dashboard/
    │   ├── faculty/
    │   ├── students/
    │   ├── semesters/
    │   ├── subjects/
    │   ├── sections/
    │   ├── mapping/
    │   └── settings/
    ├── hooks/                    # useMediaQuery, useDebounce, useOnlineStatus
    └── lib/
        ├── api.js
        ├── queryClient.js
        └── utils.js              # cn(), formatDate()
```

Naming:
- Components use `PascalCase.jsx`; hooks and utilities use `camelCase.js`.
- Each feature contains `pages/`, `components/`, `api.js` and `schemas.js` (zod).
- Dates display as `DD MMM YYYY` ("01 Sep 2026") using `Intl.DateTimeFormat("en-IN")`, and times use 12-hour format with the local timezone.

---

## 14. Config snippets

### `components.json` (shadcn, JSX)
Use the Tailwind v3-compatible shadcn CLI (`shadcn@2.3.0`), because this project uses `tailwind.config.js`.

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": false,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### `jsconfig.json`
```json
{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }
```

### `tailwind.config.js`
```js
import animate from "tailwindcss-animate";

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1rem", md: "1.5rem" }, screens: { "2xl": "1280px" } },
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', "Inter", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        md: "0 4px 12px -2px rgb(0 0 0 / 0.08)",
        lg: "0 12px 32px -8px rgb(0 0 0 / 0.16)",
      },
    },
  },
  plugins: [animate],
};
```

### `src/index.css`
This is the source of truth for the tokens in §2; keep the two in sync.
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 9%;
    --primary: 17 88% 40%;
    --primary-foreground: 0 0% 100%;
    --secondary: 0 0% 96%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96%;
    --muted-foreground: 0 0% 45%;
    --accent: 33 100% 96%;
    --accent-foreground: 15 75% 28%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 72% 29%;
    --success-foreground: 0 0% 100%;
    --warning: 32 95% 44%;
    --warning-foreground: 0 0% 9%;
    --info: 224 76% 48%;
    --info-foreground: 0 0% 100%;
    --border: 0 0% 90%;
    --input: 0 0% 90%;
    --ring: 17 88% 40%;
    --radius: 0.5rem;
    /* Brand gradient: both stops keep white text ≥ 4.5:1 */
    --gradient-from: 21 90% 41%;
    --gradient-to: 12 80% 36%;
    --glow: 21 90% 48%;
  }

  /* Dark orange: warm near-black surfaces under an orange glow */
  .dark {
    --background: 20 18% 4%;
    --foreground: 30 20% 97%;
    --card: 20 16% 7%;
    --card-foreground: 30 20% 97%;
    --popover: 20 16% 8%;
    --popover-foreground: 30 20% 97%;
    --primary: 25 95% 53%;
    --primary-foreground: 0 0% 4%;
    --secondary: 20 12% 12%;
    --secondary-foreground: 30 20% 97%;
    --muted: 20 12% 12%;
    --muted-foreground: 25 8% 64%;
    --accent: 22 65% 11%;
    --accent-foreground: 31 97% 72%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 100%;
    --success: 142 71% 45%;
    --success-foreground: 0 0% 4%;
    --warning: 38 92% 50%;
    --warning-foreground: 0 0% 4%;
    --info: 213 94% 68%;
    --info-foreground: 0 0% 4%;
    --border: 20 14% 15%;
    --input: 20 14% 17%;
    --ring: 25 95% 53%;
    /* Black text on both stops ≥ 5:1 */
    --gradient-from: 33 98% 58%;
    --gradient-to: 18 90% 50%;
    --glow: 22 95% 50%;
  }

  * { @apply border-border; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    @apply bg-background text-foreground font-sans antialiased;
    font-feature-settings: "cv11", "ss01";
    background-image:
      radial-gradient(ellipse 80% 50% at 50% -10%, hsl(var(--glow) / 0.10), transparent 70%),
      radial-gradient(ellipse 50% 40% at 100% 100%, hsl(var(--glow) / 0.05), transparent 70%);
    background-attachment: fixed;
  }
  .dark body {
    background-image:
      radial-gradient(ellipse 80% 55% at 50% -10%, hsl(var(--glow) / 0.22), transparent 70%),
      radial-gradient(ellipse 50% 40% at 100% 100%, hsl(var(--glow) / 0.10), transparent 70%);
  }
}

@layer utilities {
  .bg-brand-gradient {
    background-image: linear-gradient(135deg, hsl(var(--gradient-from)), hsl(var(--gradient-to)));
  }
  .text-brand-gradient {
    background-image: linear-gradient(135deg, hsl(var(--gradient-from)), hsl(var(--gradient-to)));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  /* Global focus ring, except inside menus/lists/dialogs: Radix and cmdk move focus onto the
     container and its items, which style their own highlight (bg-accent). */
  :focus-visible:not(
      [role="menu"], [role^="menuitem"], [role="listbox"], [role="option"],
      [role="dialog"], [role="alertdialog"], [cmdk-root], [cmdk-input], [cmdk-item]
    ) {
    @apply outline-none ring-2 ring-ring ring-offset-2 ring-offset-background;
  }
  [role="menu"]:focus-visible, [role="listbox"]:focus-visible, [role="dialog"]:focus-visible,
  [role="alertdialog"]:focus-visible, [cmdk-input]:focus-visible {
    @apply outline-none;
  }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

### `vite.config.js`
```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/apple-touch-180.png"],
      manifest: {
        name: "PMS — Project Management System",
        short_name: "PMS",
        start_url: "/",
        display: "standalone",
        background_color: "#0B0907",
        theme_color: "#F97316",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [], // never cache API responses (auth cookies, tenant data)
      },
    }),
  ],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          radix: ["@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-select", "@radix-ui/react-popover", "@radix-ui/react-tooltip"],
          icons: ["lucide-react"],
        },
      },
    },
  },
});
```

### `index.html` head
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0B0907" />
<link rel="apple-touch-icon" href="/icons/apple-touch-180.png" />
<title>PMS</title>
```

### API proxy (no API URL env var needed)
The app always calls `/api/v1/...` on its own origin.
```js
// vite.config.js (dev)
server: { proxy: { "/api": { target: "http://localhost:8000", changeOrigin: true } } }
```
```json
// vercel.json (prod)
{ "rewrites": [
  { "source": "/api/:path*", "destination": "https://<render-service>.onrender.com/api/:path*" },
  { "source": "/(.*)", "destination": "/index.html" }
] }
```
The PWA service worker must **not** cache `/api/*` (`navigateFallbackDenylist: [/^\/api\//]`).

---

## 15. PWA

- Use `registerType: "prompt"`. When an update is available, show a sonner toast, "A new version is available", with a "Reload" action.
- Cache only the app shell and static assets. **Never cache `/api/*`**, because responses are user- and college-specific.
- When offline, show the offline banner (§9). Mutating actions are disabled while offline.
- Install prompt: capture `beforeinstallprompt` and offer "Install app" in the profile menu. Don't show a pop-up on first visit.
- Push notifications arrive in Phase 3. Don't request notification permission before then.

---

## 16. Accessibility checklist

- [ ] All text and controls meet the contrast pairs in §2. Never use white on orange lighter than `#C74C0A` or black on orange darker than `#F2520D`, including anywhere along a gradient.
- [ ] Every interactive element is reachable by keyboard and has a visible `focus-visible` ring (2px `ring`, 2px offset).
- [ ] Icon-only buttons have `aria-label` and a tooltip.
- [ ] Form inputs have a `<Label htmlFor>`, and errors are linked via `aria-describedby` (shadcn `FormMessage` handles this).
- [ ] Never use color alone for status: badges always include text, and locked states include an icon.
- [ ] Each page has one `<h1>`, with headings in order. Use landmarks: `<header>`, `<nav aria-label="Main">`, `<main id="main">`, `<footer>`.
- [ ] A "Skip to content" link is the first focusable element (`sr-only focus:not-sr-only`).
- [ ] Dialogs trap focus and return it to the trigger on close (Radix default). `Esc` closes non-destructive dialogs.
- [ ] Touch targets are at least 44 × 44px below `md`.
- [ ] Animations respect `prefers-reduced-motion`, and no essential information is conveyed through animation.
- [ ] Tables use `<th scope="col">`. The mobile card view keeps label–value pairs as `<dl>`.
- [ ] Toasts use `aria-live="polite"` (sonner default). Errors that block a form also appear inline.
- [ ] Pages are usable at 200% browser zoom and 320px width with no horizontal page scroll.

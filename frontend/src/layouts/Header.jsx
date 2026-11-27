import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CollegeSwitcher from "@/components/common/CollegeSwitcher";
import Logo from "@/components/common/Logo";
import RefreshButton from "@/components/common/RefreshButton";
import ThemeToggle from "@/components/common/ThemeToggle";
import NavGroups from "@/layouts/NavGroups";
import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { labelOf } from "@/config/choices";

export default function Header({ groups }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canInstall, install } = useInstallPrompt();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-card/85 shadow-[0_8px_28px_-20px_hsl(var(--glow)/0.55)] pt-[env(safe-area-inset-top)] backdrop-blur-xl supports-[backdrop-filter]:bg-card/75">
      <div className="flex h-[4.25rem] items-center gap-2 px-4 md:px-6">
        {/* Drawer trigger: md to lg only (bottom nav covers < md, sidebar covers lg+) */}
        <Button
          variant="outline"
          size="icon"
          className="hidden size-10 rounded-xl md:inline-flex lg:hidden"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link to={HOME_BY_ROLE[user?.role] || "/"} className="shrink-0 rounded-md" aria-label="PMS home">
          {/* Super Admin's header also carries the college switcher, so phones show the emblem alone there */}
          <Logo compact className={user?.role === "SUPER_ADMIN" ? "sm:hidden" : "min-[360px]:hidden"} />
          <Logo size="responsive" className={user?.role === "SUPER_ADMIN" ? "hidden sm:inline-flex" : "hidden min-[360px]:inline-flex"} />
        </Link>
        {user?.college && (
          <div className="ml-3 hidden min-w-0 items-center gap-3 md:flex">
            <span className="h-8 w-px bg-border" aria-hidden />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">{user.college.name}</p>
              {user.college.code && <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{user.college.code}</p>}
            </div>
          </div>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {user?.role === "SUPER_ADMIN" && <CollegeSwitcher />}
          <RefreshButton />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Account menu"
                className="group inline-flex h-10 min-w-0 items-center gap-2.5 rounded-full border border-border bg-card p-1 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/40 data-[state=open]:border-primary/30 sm:pr-3"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-primary/10">
                  <UserRound className="size-4" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                  <span className="max-w-[10rem] truncate text-[13px] font-semibold text-foreground">{user?.name}</span>
                  <span className="max-w-[10rem] truncate font-mono text-[10.5px] text-muted-foreground">{user?.email}</span>
                </span>
                <ChevronDown className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 sm:block" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex items-center gap-3 px-2.5 py-2.5 font-normal">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-primary/10">
                  <UserRound className="size-[18px]" strokeWidth={1.9} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{user?.name}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">{user?.email}</span>
                  <span className="mt-1 inline-block rounded-full border border-border px-2 py-px font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
                    {labelOf("Role", user?.role)}
                  </span>
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/profile")}>
                <UserRound className="size-4" /> Profile
              </DropdownMenuItem>
              {canInstall && <DropdownMenuItem onSelect={install}>Install app</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="hidden h-10 rounded-xl px-4 lg:inline-flex" onClick={handleLogout}>
            <LogOut className="size-4" /> Sign Out
          </Button>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>
              <Logo size="short" />
            </SheetTitle>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
          </SheetHeader>
          <nav aria-label="Main">
            <NavGroups groups={groups} onNavigate={() => setDrawerOpen(false)} />
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

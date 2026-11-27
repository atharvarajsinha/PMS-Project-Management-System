import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { ChevronRight, Download, LogOut, Menu, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import CollegeSwitcher from "@/components/common/CollegeSwitcher";
import Logo from "@/components/common/Logo";
import RefreshButton from "@/components/common/RefreshButton";
import ThemeToggle from "@/components/common/ThemeToggle";
import NavGroups from "@/layouts/NavGroups";
import { HOME_BY_ROLE, useAuth } from "@/context/AuthContext";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

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
          {canInstall && (
            <Button variant="outline" size="icon" className="size-10 rounded-xl" aria-label="Install app" title="Install app" onClick={install}>
              <Download className="size-4" />
            </Button>
          )}
          <NavLink
            to="/profile"
            aria-label="Profile"
            title="Profile"
            className={({ isActive }) =>
              cn(
                "group inline-flex h-10 min-w-0 items-center gap-2.5 rounded-full border border-border bg-card p-1 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-accent/40 sm:pr-3",
                isActive && "border-primary/30 bg-accent/40",
              )
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary ring-1 ring-primary/10">
              <UserRound className="size-4" strokeWidth={1.9} aria-hidden />
            </span>
            <span className="hidden min-w-0 flex-col leading-tight sm:flex">
              <span className="max-w-[10rem] truncate text-[13px] font-semibold text-foreground">{user?.name}</span>
              <span className="max-w-[10rem] truncate font-mono text-[10.5px] text-muted-foreground">{user?.email}</span>
            </span>
            <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block" aria-hidden />
          </NavLink>
          {/* Icon-only below lg so it fits on phones and tablets */}
          <Button variant="outline" className="size-10 rounded-xl p-0 lg:w-auto lg:px-4" aria-label="Sign out" onClick={handleLogout}>
            <LogOut className="size-4" />
            <span className="hidden lg:inline">Sign Out</span>
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

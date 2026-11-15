import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

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
    <header className="sticky top-0 z-40 border-b bg-background/75 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex h-14 items-center gap-2 px-4 md:px-6">
        {/* Drawer trigger: md to lg only (bottom nav covers < md, sidebar covers lg+) */}
        <Button
          variant="ghost"
          size="icon"
          className="hidden md:inline-flex lg:hidden"
          aria-label="Open menu"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link to={HOME_BY_ROLE[user?.role] || "/"} className="shrink-0 rounded-md" aria-label="PMS home">
          <Logo compact className="sm:hidden" />
          <Logo className="hidden sm:inline-flex" />
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-1">
          {user?.role === "SUPER_ADMIN" && <CollegeSwitcher />}
          <RefreshButton />
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-brand-gradient text-xs font-semibold text-primary-foreground">
                    {initials(user?.name)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="font-normal">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {labelOf("Role", user?.role)}
                  {user?.college ? ` · ${user.college.name}` : ""}
                </p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate("/profile")}>
                <UserRound className="size-4" /> Profile
              </DropdownMenuItem>
              {canInstall && <DropdownMenuItem onSelect={install}>Install app</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleLogout}>
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-72 p-4">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle>
              <Logo />
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

import { Outlet } from "react-router-dom";
import Footer from "@/components/common/Footer";
import ThemeToggle from "@/components/common/ThemeToggle";
import Logo from "@/components/common/Logo";

export default function AuthLayout() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-28 top-4 size-80 rounded-full bg-primary/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative z-10 flex justify-end p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <main id="main" className="relative z-10 flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>
          <Outlet />
        </div>
      </main>
      <Footer />
    </div>
  );
}

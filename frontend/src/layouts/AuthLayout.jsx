import { Outlet } from "react-router-dom";
import Footer from "@/components/common/Footer";
import ThemeToggle from "@/components/common/ThemeToggle";
import Logo from "@/components/common/Logo";

export default function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex justify-end p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-12 pt-4 sm:items-center">
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

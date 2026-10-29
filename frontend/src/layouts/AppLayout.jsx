import { Suspense } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import Footer from "@/components/common/Footer";
import OfflineBanner from "@/components/common/OfflineBanner";
import PageSkeleton from "@/components/common/PageSkeleton";
import Header from "@/layouts/Header";
import MobileNav from "@/layouts/MobileNav";
import Sidebar from "@/layouts/Sidebar";
import { getNav } from "@/config/nav";
import { useAuth } from "@/context/AuthContext";
import { useCollege } from "@/context/CollegeContext";

function ManagingStrip() {
  const { college, setCollege } = useCollege();
  const navigate = useNavigate();
  if (!college) return null;
  const exit = () => {
    setCollege(null);
    navigate("/sa/colleges");
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-accent px-4 py-2 text-sm text-accent-foreground md:px-6">
      <p className="min-w-0 truncate">
        Managing <span className="font-medium">{college.name}</span>
      </p>
      <button type="button" onClick={exit} className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline">
        <X className="size-4" aria-hidden /> Exit
      </button>
    </div>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const { college } = useCollege();
  const groups = getNav(user?.role, college);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md"
      >
        Skip to content
      </a>
      <OfflineBanner />
      <Header groups={groups} />
      <ManagingStrip />
      <div className="flex flex-1">
        <Sidebar groups={groups} />
        <div className="flex min-w-0 flex-1 flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6">
            <Suspense fallback={<PageSkeleton />}>
              <Outlet />
            </Suspense>
          </main>
          <Footer />
        </div>
      </div>
      <MobileNav groups={groups} />
    </div>
  );
}

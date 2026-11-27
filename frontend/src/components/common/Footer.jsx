export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground md:px-6">
      © {year} Project Portal<span className="hidden sm:inline"> · PBL team management</span>
    </footer>
  );
}

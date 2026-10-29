import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useCollege } from "@/context/CollegeContext";
import { useDebounce } from "@/hooks/useDebounce";
import { listColleges } from "@/features/colleges/api";
import { idStr, sameId } from "@/lib/ids";
import { cn } from "@/lib/utils";

// Super Admin: pick a college to manage (sent as X-College-Id).
export default function CollegeSwitcher() {
  const { college, setCollege } = useCollege();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("");
  const debounced = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "colleges", "switcher", debounced],
    queryFn: () => listColleges({ search: debounced || undefined, page_size: 50, ordering: "name" }),
    enabled: open,
    placeholderData: keepPreviousData, // keep the list while the next search loads
  });

  // Search runs on the server (shouldFilter=false), so cmdk can't track the highlight itself:
  // keep it on a visible row, else Enter does nothing after the list changes.
  useEffect(() => {
    const ids = data?.results.map((c) => idStr(c.id)) || [];
    if (!ids.includes(active)) setActive(ids[0] || "");
  }, [data, active]);

  const choose = (c) => {
    setOpen(false);
    setCollege(c);
    navigate("/admin");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="max-w-[44vw] gap-2 sm:max-w-xs" aria-label="Switch college">
          <ArrowLeftRight className="size-4 shrink-0" />
          <span className="truncate">{college ? college.name : "Manage college"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command shouldFilter={false} value={active} onValueChange={setActive}>
          <CommandInput placeholder="Search colleges…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{isLoading ? "Loading…" : "No colleges found."}</CommandEmpty>
            <CommandGroup>
              {data?.results.map((c) => (
                <CommandItem key={c.id} value={idStr(c.id)} onSelect={() => choose(c)}>
                  <Check className={cn("size-4", sameId(college?.id, c.id) ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto font-mono text-[13px] text-muted-foreground">{c.code}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

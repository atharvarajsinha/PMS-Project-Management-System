import { forwardRef, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/*
 * A small Markdown subset, rendered to React elements (never raw HTML, so nothing can be injected):
 *   **bold**   *italic* / _italic_   [text](https://link)
 *   "- item" / "* item" bullet lists, "1. item" numbered lists, blank line = new paragraph.
 * Plain text written before this existed renders as it always did (line breaks kept).
 */

const INLINE = /(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_|\[[^\]\n]+\]\([^)\s]+\))/g;
const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function inline(text, keyPrefix) {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*")) || (part.startsWith("_") && part.endsWith("_"))) {
      if (part.length > 2) return <em key={key}>{part.slice(1, -1)}</em>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      return SAFE_URL.test(link[2]) ? (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    return part;
  });
}

const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function blocks(source) {
  const out = [];
  let para = [];
  let list = null; // { ordered, items }
  const flushPara = () => {
    if (para.length) out.push({ type: "p", lines: para });
    para = [];
  };
  const flushList = () => {
    if (list) out.push({ type: list.ordered ? "ol" : "ul", items: list.items });
    list = null;
  };
  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const b = BULLET.exec(line);
    const n = !b && NUMBERED.exec(line);
    if (b || n) {
      flushPara();
      const ordered = !!n;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((b || n)[1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out;
}

/** Renders `children` (a Markdown string). */
export function Markdown({ children, className }) {
  if (!children) return null;
  return (
    <div className={cn("space-y-2 break-words text-sm leading-relaxed", className)}>
      {blocks(String(children)).map((b, i) => {
        if (b.type === "p") {
          return (
            <p key={i}>
              {b.lines.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {inline(l, `${i}-${j}`)}
                </span>
              ))}
            </p>
          );
        }
        const ListTag = b.type;
        return (
          <ListTag key={i} className={cn("space-y-1 pl-5", b.type === "ul" ? "list-disc" : "list-decimal")}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item, `${i}-${j}`)}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}

/**
 * Textarea with a formatting toolbar (bold, italic, bullets, numbers, link) that writes Markdown.
 * Drop-in for a controlled textarea: `value` + `onChange(event-like)` as react-hook-form's field gives.
 */
export const MarkdownEditor = forwardRef(function MarkdownEditor(
  { value, onChange, onBlur, name, id, rows = 6, placeholder, disabled, ...rest },
  outerRef,
) {
  const ref = useRef(null);
  const setRef = (el) => {
    ref.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) outerRef.current = el;
  };
  const text = value ?? "";

  const commit = (next, selStart, selEnd) => {
    onChange({ target: { name, value: next } });
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  };

  const wrap = (marker, fallback) => {
    const el = ref.current;
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    const picked = text.slice(s, e) || fallback;
    const next = text.slice(0, s) + marker + picked + marker + text.slice(e);
    commit(next, s + marker.length, s + marker.length + picked.length);
  };

  const prefixLines = (ordered) => {
    const el = ref.current;
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    const lineStart = text.lastIndexOf("\n", s - 1) + 1;
    const nl = text.indexOf("\n", e);
    const lineEnd = nl === -1 ? text.length : nl;
    const lines = text.slice(lineStart, lineEnd).split("\n");
    const isList = lines.every((l) => (ordered ? NUMBERED : BULLET).test(l));
    const changed = lines
      .map((l, i) => {
        if (isList) return l.replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, "");
        const bare = l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "");
        return (ordered ? `${i + 1}. ` : "- ") + bare;
      })
      .join("\n");
    const next = text.slice(0, lineStart) + changed + text.slice(lineEnd);
    commit(next, lineStart, lineStart + changed.length);
  };

  const link = () => {
    const el = ref.current;
    const s = el?.selectionStart ?? text.length;
    const e = el?.selectionEnd ?? text.length;
    const label = text.slice(s, e) || "link text";
    const md = `[${label}](https://)`;
    const next = text.slice(0, s) + md + text.slice(e);
    const urlStart = s + label.length + 3;
    commit(next, urlStart, urlStart + "https://".length);
  };

  const onKeyDown = (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    const k = ev.key.toLowerCase();
    if (k === "b") {
      ev.preventDefault();
      wrap("**", "bold text");
    } else if (k === "i") {
      ev.preventDefault();
      wrap("*", "italic text");
    }
  };

  const tools = [
    { label: "Bold (Ctrl+B)", icon: Bold, run: () => wrap("**", "bold text") },
    { label: "Italic (Ctrl+I)", icon: Italic, run: () => wrap("*", "italic text") },
    { label: "Bulleted list", icon: List, run: () => prefixLines(false) },
    { label: "Numbered list", icon: ListOrdered, run: () => prefixLines(true) },
    { label: "Link", icon: Link2, run: link },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-input bg-card shadow-sm focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-ring">
      <div className="flex items-center gap-0.5 border-b bg-muted/40 px-1 py-1" role="toolbar" aria-label="Formatting">
        {tools.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            title={t.label}
            aria-label={t.label}
            disabled={disabled}
            onMouseDown={(ev) => ev.preventDefault()} /* keep the textarea selection */
            onClick={t.run}
          >
            <t.icon className="size-4" aria-hidden="true" />
          </Button>
        ))}
      </div>
      <Textarea
        ref={setRef}
        id={id}
        name={name}
        rows={rows}
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onChange={onChange}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        className="rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        {...rest}
      />
    </div>
  );
});

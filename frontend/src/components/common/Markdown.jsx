import { forwardRef, useRef, useState } from "react";
import {
  Bold,
  Eye,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  PencilLine,
  Pilcrow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/*
 * A small Markdown subset, rendered to React elements (never raw HTML, so nothing can be injected):
 *   "## Heading"  "### Subheading"  ("# " also works, shown like "## ")
 *   **bold**   *italic* / _italic_   [text](https://link)
 *   "- item" / "* item" bullets, "1. item" numbers; indent a line by 2 spaces (or a tab) for a
 *   sub-list, as deep as needed. Blank line = new paragraph.
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

const HEADING = /^\s{0,3}(#{1,3})\s+(.*)$/;
const LIST_ITEM = /^([ \t]*)([-*]|\d+[.)])\s+(.*)$/;
const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const PREFIX = /^\s*(?:#{1,3}\s+|[-*]\s+|\d+[.)]\s+)/; // heading or list marker, with its indent

const indentOf = (ws) => ws.replace(/\t/g, "    ").length;

/** Parse into blocks: {type:"h", level, text} | {type:"p", lines} | {type:"list", list}. */
function blocks(source) {
  const out = [];
  let para = [];
  let stack = []; // open lists, outermost first: { indent, list: { ordered, items: [{ text, lists: [] }] } }

  const flushPara = () => {
    if (para.length) out.push({ type: "p", lines: para });
    para = [];
  };
  const flushList = () => {
    if (stack.length) out.push({ type: "list", list: stack[0].list });
    stack = [];
  };

  for (const line of source.replace(/\r\n?/g, "\n").split("\n")) {
    const h = HEADING.exec(line);
    const li = !h && LIST_ITEM.exec(line);
    if (h) {
      flushPara();
      flushList();
      out.push({ type: "h", level: Math.max(2, h[1].length), text: h[2] });
    } else if (li) {
      flushPara();
      const indent = indentOf(li[1]);
      const ordered = /\d/.test(li[2]);
      while (stack.length && indent < stack[stack.length - 1].indent) stack.pop();
      if (!stack.length) stack = [{ indent, list: { ordered, items: [] } }]; // a new top-level list
      let top = stack[stack.length - 1];
      const parentItem = top.list.items[top.list.items.length - 1];
      if (indent > top.indent && parentItem) {
        // deeper than the open list: a sub-list under its last item
        const sub = { ordered, items: [] };
        parentItem.lists.push(sub);
        stack.push({ indent, list: sub });
      } else if (top.list.ordered !== ordered && top.list.items.length) {
        // same depth, other kind: a new list right after this one
        if (stack.length === 1) {
          flushList();
          stack = [{ indent, list: { ordered, items: [] } }];
        } else {
          const parent = stack[stack.length - 2].list;
          const owner = parent.items[parent.items.length - 1];
          const sub = { ordered, items: [] };
          owner.lists.push(sub);
          stack[stack.length - 1] = { indent, list: sub };
        }
      }
      top = stack[stack.length - 1];
      top.list.items.push({ text: li[3], lists: [] });
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

function ListView({ list, depth, keyPrefix }) {
  const Tag = list.ordered ? "ol" : "ul";
  const marker = list.ordered
    ? ["list-decimal", "list-[lower-alpha]", "list-[lower-roman]"][depth % 3]
    : ["list-disc", "list-[circle]", "list-[square]"][depth % 3];
  return (
    <Tag className={cn("space-y-1 pl-5", marker, depth > 0 && "mt-1")}>
      {list.items.map((item, j) => (
        <li key={j}>
          {inline(item.text, `${keyPrefix}-${j}`)}
          {item.lists.map((sub, k) => (
            <ListView key={k} list={sub} depth={depth + 1} keyPrefix={`${keyPrefix}-${j}-${k}`} />
          ))}
        </li>
      ))}
    </Tag>
  );
}

/** Renders `children` (a Markdown string). */
export function Markdown({ children, className }) {
  if (!children) return null;
  return (
    <div className={cn("space-y-2 break-words text-sm leading-relaxed", className)}>
      {blocks(String(children)).map((b, i) => {
        if (b.type === "h") {
          return b.level === 2 ? (
            <h3 key={i} className="pt-2 text-base font-semibold tracking-tight text-foreground first:pt-0">
              {inline(b.text, `h${i}`)}
            </h3>
          ) : (
            <h4 key={i} className="pt-1 text-sm font-semibold text-foreground first:pt-0">
              {inline(b.text, `h${i}`)}
            </h4>
          );
        }
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
        return <ListView key={i} list={b.list} depth={0} keyPrefix={`${i}`} />;
      })}
    </div>
  );
}

const INDENT = "  ";

/**
 * Textarea with a formatting toolbar that writes Markdown: heading, subheading, paragraph, bold,
 * italic, bullets, numbers, indent / outdent (sub-lists), link, plus a Preview tab.
 * Keys: Ctrl+B / Ctrl+I; Tab / Shift+Tab indent or outdent list lines; Enter continues a list
 * (Enter on an empty item ends it, or moves it out one level).
 * Drop-in for a controlled textarea: `value` + `onChange(event-like)` as react-hook-form's field gives.
 */
export const MarkdownEditor = forwardRef(function MarkdownEditor(
  { value, onChange, onBlur, name, id, rows = 6, placeholder, disabled, ...rest },
  outerRef,
) {
  const ref = useRef(null);
  const [mode, setMode] = useState("write");
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

  const selection = () => {
    const el = ref.current;
    return [el?.selectionStart ?? text.length, el?.selectionEnd ?? text.length];
  };

  /** The whole lines touched by the selection: [start, end, lines[]]. */
  const selectedLines = () => {
    const [s, e] = selection();
    const lineStart = text.lastIndexOf("\n", s - 1) + 1;
    const nl = text.indexOf("\n", e > s && text[e - 1] === "\n" ? e - 1 : e);
    const lineEnd = nl === -1 ? text.length : nl;
    return [lineStart, lineEnd, text.slice(lineStart, lineEnd).split("\n")];
  };

  const replaceLines = (mapper) => {
    const [lineStart, lineEnd, lines] = selectedLines();
    const changed = mapper(lines).join("\n");
    commit(text.slice(0, lineStart) + changed + text.slice(lineEnd), lineStart, lineStart + changed.length);
  };

  const wrap = (marker, fallback) => {
    const [s, e] = selection();
    const picked = text.slice(s, e) || fallback;
    const next = text.slice(0, s) + marker + picked + marker + text.slice(e);
    commit(next, s + marker.length, s + marker.length + picked.length);
  };

  const heading = (level) => {
    const mark = `${"#".repeat(level)} `;
    replaceLines((lines) => {
      const already = lines.every((l) => l.startsWith(mark) && !l.startsWith(`${mark.trim()}#`));
      return lines.map((l) => (already ? l.slice(mark.length) : l.trim() ? mark + l.replace(PREFIX, "") : l));
    });
  };

  const paragraph = () => replaceLines((lines) => lines.map((l) => l.replace(PREFIX, "").replace(/^\s+/, "")));

  const listLines = (ordered) =>
    replaceLines((lines) => {
      const isList = lines.every((l) => !l.trim() || (ordered ? NUMBERED : BULLET).test(l));
      let n = 0;
      return lines.map((l) => {
        if (!l.trim()) return l;
        const indent = /^[ \t]*/.exec(l)[0];
        const bare = l.replace(PREFIX, "");
        if (isList) return indent + bare;
        n += 1;
        return indent + (ordered ? `${n}. ` : "- ") + bare;
      });
    });

  const indentLines = (outdent) =>
    replaceLines((lines) =>
      lines.map((l) => {
        if (!l.trim()) return l;
        if (!outdent) return INDENT + l;
        return l.startsWith("\t") ? l.slice(1) : l.replace(/^ {1,2}/, "");
      }),
    );

  const link = () => {
    const [s, e] = selection();
    const label = text.slice(s, e) || "link text";
    const md = `[${label}](https://)`;
    const next = text.slice(0, s) + md + text.slice(e);
    const urlStart = s + label.length + 3;
    commit(next, urlStart, urlStart + "https://".length);
  };

  /** Enter inside a list item: continue the list, or end it on an empty item. */
  const continueList = (ev) => {
    const [s, e] = selection();
    if (s !== e) return;
    const lineStart = text.lastIndexOf("\n", s - 1) + 1;
    const nl = text.indexOf("\n", s);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, lineEnd);
    const m = LIST_ITEM.exec(line);
    if (!m) return;
    const prefixLen = m[1].length + m[2].length + 1;
    if (s - lineStart < prefixLen) return; // caret inside the marker itself
    ev.preventDefault();
    if (!m[3].trim()) {
      // empty item: step out one level, or end the list
      const stripped = m[1] ? line.replace(/^( {1,2}|\t)/, "") : "";
      commit(text.slice(0, lineStart) + stripped + text.slice(lineEnd), lineStart + stripped.length, lineStart + stripped.length);
      return;
    }
    const marker = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2];
    const insert = `\n${m[1]}${marker} `;
    commit(text.slice(0, s) + insert + text.slice(s), s + insert.length, s + insert.length);
  };

  const onKeyDown = (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      continueList(ev);
      return;
    }
    if (ev.key === "Tab" && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      // Only on list lines; elsewhere Tab keeps moving focus as usual
      const [, , lines] = selectedLines();
      if (lines.some((l) => LIST_ITEM.test(l))) {
        ev.preventDefault();
        indentLines(ev.shiftKey);
      }
      return;
    }
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

  const groups = [
    [
      { label: "Heading", icon: Heading2, run: () => heading(2) },
      { label: "Subheading", icon: Heading3, run: () => heading(3) },
      { label: "Paragraph (plain text)", icon: Pilcrow, run: paragraph },
    ],
    [
      { label: "Bold (Ctrl+B)", icon: Bold, run: () => wrap("**", "bold text") },
      { label: "Italic (Ctrl+I)", icon: Italic, run: () => wrap("*", "italic text") },
      { label: "Link", icon: Link2, run: link },
    ],
    [
      { label: "Bulleted list", icon: List, run: () => listLines(false) },
      { label: "Numbered list", icon: ListOrdered, run: () => listLines(true) },
      { label: "Indent: make a sub-list (Tab)", icon: IndentIncrease, run: () => indentLines(false) },
      { label: "Outdent (Shift+Tab)", icon: IndentDecrease, run: () => indentLines(true) },
    ],
  ];

  const writing = mode === "write";
  const minHeight = `${rows * 1.5 + 1}rem`;

  return (
    <div className="overflow-hidden rounded-xl border border-input bg-card shadow-sm focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-ring">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 px-1 py-1" role="toolbar" aria-label="Formatting">
        {groups.map((group, gi) => (
          <div key={gi} className={cn("flex items-center gap-0.5", gi > 0 && "border-l border-border/70 pl-0.5")}>
            {group.map((t) => (
              <Button
                key={t.label}
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                title={t.label}
                aria-label={t.label}
                disabled={disabled || !writing}
                onMouseDown={(ev) => ev.preventDefault()} /* keep the textarea selection */
                onClick={t.run}
              >
                <t.icon className="size-4" aria-hidden="true" />
              </Button>
            ))}
          </div>
        ))}
        <div className="ml-auto flex items-center rounded-lg bg-background/60 p-0.5" role="group" aria-label="Editor view">
          {[
            { key: "write", label: "Write", icon: PencilLine },
            { key: "preview", label: "Preview", icon: Eye },
          ].map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={mode === m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors",
                mode === m.key && "bg-card text-foreground shadow-sm",
              )}
            >
              <m.icon className="size-3.5" aria-hidden="true" />
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {writing ? (
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
          className="rounded-none border-0 bg-transparent font-mono text-[13px] shadow-none focus-visible:ring-0"
          {...rest}
        />
      ) : (
        <div className="px-3 py-2" style={{ minHeight }}>
          {text.trim() ? <Markdown>{text}</Markdown> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      )}
    </div>
  );
});

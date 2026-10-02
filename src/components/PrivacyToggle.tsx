import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "gastoscontrol-hide-values";

function shouldMask(text: string) {
  const value = text.trim();
  if (!value) return false;
  return /R\$\s*[\d.,]+/.test(value) || /^\$\s*[\d.,]+/.test(value);
}

function maskedText(text: string) {
  return text
    .replace(/R\$\s*[\d.,]+/g, "R$ ••••")
    .replace(/^\$\s*[\d.,]+/, "$ ••••");
}

export function PrivacyToggle() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(STORAGE_KEY);
    setHidden(stored === null ? true : stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(STORAGE_KEY, String(hidden));
    document.documentElement.dataset.hideValues = hidden ? "true" : "false";
  }, [hidden]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const originals = new WeakMap<Text, string>();

    const applyMask = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode() as Text | null;
      while (node) {
        const parent = node.parentElement;
        if (
          parent &&
          !["SCRIPT", "STYLE", "TEXTAREA", "INPUT"].includes(parent.tagName) &&
          !parent.closest('[data-privacy-toggle="true"]')
        ) {
          const original = originals.get(node) ?? node.nodeValue ?? "";
          if (!originals.has(node) && shouldMask(original)) originals.set(node, original);

          const saved = originals.get(node);
          if (saved) node.nodeValue = hidden ? maskedText(saved) : saved;
        }
        node = walker.nextNode() as Text | null;
      }
    };

    applyMask();
    const observer = new MutationObserver(applyMask);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });

    return () => observer.disconnect();
  }, [hidden]);

  return (
    <button
      type="button"
      data-privacy-toggle="true"
      onClick={() => setHidden((value) => !value)}
      className="fixed right-4 top-4 z-[70] inline-flex h-10 w-10 items-center justify-center rounded-full border bg-background/95 shadow-sm backdrop-blur sm:right-6 sm:top-5"
      aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

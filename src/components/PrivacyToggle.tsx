import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "gastoscontrol-hide-values";
const PRIVATE_CLASS = "gc-private-value";

function hasCurrency(text: string) {
  return /R\$\s*[\d.,]+/.test(text) || /^\$\s*[\d.,]+/.test(text.trim());
}

function isSafeTarget(element: HTMLElement) {
  if (["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(element.tagName)) return false;
  if (element.closest('[data-privacy-toggle="true"]')) return false;

  const ownText = Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");

  return hasCurrency(ownText);
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

    const scan = () => {
      document.querySelectorAll<HTMLElement>("body *").forEach((element) => {
        if (isSafeTarget(element)) element.classList.add(PRIVATE_CLASS);
      });
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        html[data-hide-values="true"] .${PRIVATE_CLASS} {
          filter: blur(7px);
          user-select: none;
          transition: filter 160ms ease;
        }
        html[data-hide-values="false"] .${PRIVATE_CLASS} {
          filter: none;
          transition: filter 160ms ease;
        }
      `}</style>

      <button
        type="button"
        data-privacy-toggle="true"
        onClick={() => setHidden((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        aria-label={hidden ? "Mostrar valores" : "Ocultar valores"}
        title={hidden ? "Mostrar valores" : "Ocultar valores"}
      >
        {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </>
  );
}

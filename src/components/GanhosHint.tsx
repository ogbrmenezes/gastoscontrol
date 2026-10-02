import { useEffect } from "react";

export function GanhosHint() {
  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") return;

    let mounted: HTMLElement | null = null;

    const attach = () => {
      const title = Array.from(document.querySelectorAll("h1")).find(
        (el) => el.textContent?.trim() === "Meus Gastos",
      ) as HTMLElement | undefined;

      if (!title || title.parentElement?.querySelector('[data-ganhos-hint="true"]')) return;

      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-ganhos-hint", "true");
      wrapper.style.display = "flex";
      wrapper.style.flexDirection = "column";
      wrapper.style.gap = "2px";
      wrapper.style.marginLeft = "8px";

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "+ Ganhos";
      button.setAttribute("aria-label", "Abrir Ganhos");
      button.style.fontSize = "12px";
      button.style.fontWeight = "600";
      button.style.lineHeight = "1";
      button.style.padding = "5px 8px";
      button.style.border = "1px solid hsl(var(--border))";
      button.style.borderRadius = "9999px";
      button.style.background = "hsl(var(--background))";
      button.style.color = "hsl(var(--foreground))";
      button.style.cursor = "pointer";
      button.style.width = "fit-content";

      const note = document.createElement("span");
      note.textContent = "Toque para definir salário e limites";
      note.style.fontSize = "10px";
      note.style.color = "hsl(var(--muted-foreground))";
      note.style.whiteSpace = "nowrap";

      const openGanhos = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        title.click();
      };

      button.addEventListener("click", openGanhos);
      wrapper.append(button, note);
      title.insertAdjacentElement("afterend", wrapper);
      mounted = wrapper;
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mounted?.remove();
    };
  }, []);

  return null;
}

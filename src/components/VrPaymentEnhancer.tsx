import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function VrPaymentEnhancer() {
  const [vrSelected, setVrSelected] = useState(false);
  const vrSelectedRef = useRef(false);
  const cashButtonRef = useRef<HTMLButtonElement | null>(null);
  const vrButtonRef = useRef<HTMLButtonElement | null>(null);
  const suppressResetRef = useRef(false);

  useEffect(() => {
    vrSelectedRef.current = vrSelected;
    const button = vrButtonRef.current;
    if (!button) return;
    button.dataset.selected = vrSelected ? "true" : "false";
    button.style.background = vrSelected ? "hsl(var(--primary))" : "hsl(var(--background))";
    button.style.color = vrSelected ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))";
    button.style.borderColor = vrSelected ? "hsl(var(--primary))" : "hsl(var(--input))";
  }, [vrSelected]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const paymentListeners = new WeakSet<HTMLButtonElement>();

    const markLatestExpenseAsVr = async (startedAt: number) => {
      for (const delay of [500, 1200, 2200, 3500]) {
        await new Promise((resolve) => setTimeout(resolve, delay));

        const { data, error } = await supabase
          .from("expenses")
          .select("id,created_at,payment_method")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !data) continue;

        const createdAt = new Date((data as any).created_at).getTime();
        if (createdAt < startedAt - 3000) continue;

        if ((data as any).payment_method !== "vr") {
          const { error: updateError } = await supabase
            .from("expenses")
            .update({ payment_method: "vr", is_credit_card: false, card_id: null } as any)
            .eq("id", (data as any).id);

          if (!updateError) {
            toast.success("Gasto salvo como VR / benefício");
            setVrSelected(false);
            return;
          }
        } else {
          setVrSelected(false);
          return;
        }
      }

      toast.error("O gasto foi salvo, mas não consegui marcar como VR. Tente novamente.");
      setVrSelected(false);
    };

    const attach = () => {
      const labels = Array.from(document.querySelectorAll("label"));
      const label = labels.find((item) => item.textContent?.trim() === "Forma de pagamento");
      if (!label) return;

      const container = label.parentElement;
      if (!container) return;

      const group = Array.from(container.children).find((child) =>
        child.className?.toString().includes("grid"),
      ) as HTMLElement | undefined;
      if (!group) return;

      const buttons = Array.from(group.querySelectorAll("button")) as HTMLButtonElement[];
      const cashButton = buttons.find((button) => button.textContent?.includes("Dinheiro/Pix"));
      if (cashButton) cashButtonRef.current = cashButton;

      buttons.forEach((button) => {
        if (paymentListeners.has(button)) return;
        paymentListeners.add(button);
        button.addEventListener("click", () => {
          if (suppressResetRef.current) return;
          setVrSelected(false);
        });
      });

      if (!group.querySelector('[data-vr-payment="true"]')) {
        const vrButton = document.createElement("button");
        vrButton.type = "button";
        vrButton.textContent = "VR";
        vrButton.setAttribute("data-vr-payment", "true");
        vrButton.setAttribute("aria-label", "Pagar com VR ou benefício");
        vrButton.title = "VR / benefício";
        vrButton.className = cashButton?.className ?? "";
        vrButton.style.border = "1px solid hsl(var(--input))";
        vrButton.style.borderRadius = "6px";
        vrButton.style.padding = "8px 12px";
        vrButton.style.fontSize = "14px";
        vrButton.style.fontWeight = "500";

        vrButton.addEventListener("click", () => {
          suppressResetRef.current = true;
          cashButtonRef.current?.click();
          queueMicrotask(() => {
            suppressResetRef.current = false;
          });
          setVrSelected(true);
        });

        group.classList.remove("grid-cols-3");
        group.classList.add("grid-cols-4");
        group.appendChild(vrButton);
        vrButtonRef.current = vrButton;
      }

      const saveButtons = Array.from(document.querySelectorAll("button")) as HTMLButtonElement[];
      const saveButton = saveButtons.find((button) => button.textContent?.trim() === "Salvar gasto");
      if (saveButton && !saveButton.dataset.vrHooked) {
        saveButton.dataset.vrHooked = "true";
        saveButton.addEventListener(
          "click",
          () => {
            if (!vrSelectedRef.current) return;
            void markLatestExpenseAsVr(Date.now());
          },
          true,
        );
      }
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeDollarSign, Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type ExpenseRow = {
  amount: number | string;
  payment_method: string | null;
};

type BudgetRow = {
  budget_type: string;
  limit_amount: number | string;
};

export function VrDashboardSummary() {
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [ownMount, setOwnMount] = useState<HTMLElement | null>(null);
  const [vrMount, setVrMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") return;

    let originalCard: HTMLElement | null = null;
    let createdOwn: HTMLElement | null = null;
    let createdVr: HTMLElement | null = null;

    const attach = () => {
      const label = Array.from(document.querySelectorAll("div")).find(
        (el) => el.textContent?.trim() === "Este mês",
      ) as HTMLElement | undefined;
      if (!label) return;

      const card = label.closest(".rounded-xl") as HTMLElement | null;
      const grid = card?.parentElement;
      if (!card || !grid) return;

      originalCard = card;
      originalCard.style.display = "none";

      if (!grid.querySelector('[data-own-spend-card="true"]')) {
        createdOwn = document.createElement("div");
        createdOwn.setAttribute("data-own-spend-card", "true");
        grid.insertBefore(createdOwn, originalCard);
        setOwnMount(createdOwn);
      }

      if (!grid.querySelector('[data-vr-summary-card="true"]')) {
        createdVr = document.createElement("div");
        createdVr.setAttribute("data-vr-summary-card", "true");
        createdVr.className = "col-span-2";
        grid.appendChild(createdVr);
        setVrMount(createdVr);
      }
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (originalCard) originalCard.style.display = "";
      createdOwn?.remove();
      createdVr?.remove();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    const load = async () => {
      const now = new Date();
      const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const nextStart = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;

      const [{ data: expenseData }, { data: budgetData }] = await Promise.all([
        supabase
          .from("expenses")
          .select("amount,payment_method")
          .gte("spent_at", start)
          .lt("spent_at", nextStart),
        supabase.from("budgets").select("budget_type,limit_amount"),
      ]);

      if (cancelled) return;
      setExpenses((expenseData ?? []) as ExpenseRow[]);
      setBudgets((budgetData ?? []) as BudgetRow[]);
    };

    void load();
    const interval = window.setInterval(load, 5000);
    window.addEventListener("focus", load);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", load);
    };
  }, []);

  const { ownTotal, vrTotal, salaryLimit } = useMemo(() => {
    const vr = expenses
      .filter((e) => e.payment_method === "vr")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const own = expenses
      .filter((e) => e.payment_method !== "vr")
      .reduce((sum, e) => sum + Number(e.amount), 0);

    const salary = Number(
      budgets.find((b) => b.budget_type === "monthly")?.limit_amount ?? 0,
    );

    return { ownTotal: own, vrTotal: vr, salaryLimit: salary };
  }, [expenses, budgets]);

  const pct = salaryLimit > 0 ? Math.min(100, (ownTotal / salaryLimit) * 100) : 0;
  const remaining = salaryLimit - ownTotal;

  return (
    <>
      {ownMount &&
        createPortal(
          <Card className="p-4 h-full">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <BadgeDollarSign className="h-3 w-3" /> Gastos próprios
            </div>
            <div className="mt-1 text-2xl font-semibold">{fmt(ownTotal)}</div>
            {salaryLimit > 0 ? (
              <div className="mt-2 space-y-1">
                <Progress value={pct} />
                <div className="text-[11px] text-muted-foreground">
                  de {fmt(salaryLimit)} · {remaining >= 0 ? `Disponível ${fmt(remaining)}` : `Acima ${fmt(Math.abs(remaining))}`}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">Salário não definido</div>
            )}
          </Card>,
          ownMount,
        )}

      {vrMount &&
        createPortal(
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Gift className="h-3 w-3" /> Benefício (VR)
                </div>
                <div className="mt-1 text-2xl font-semibold">{fmt(vrTotal)}</div>
              </div>
              <div className="max-w-[180px] text-right text-[11px] text-muted-foreground">
                Não reduz seu salário disponível
              </div>
            </div>
          </Card>,
          vrMount,
        )}
    </>
  );
}

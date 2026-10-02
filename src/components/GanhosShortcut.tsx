import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BadgeDollarSign, CreditCard, BellRing } from "lucide-react";

function normalizeMoney(value: string) {
  return Number(value.replace(/\./g, "").replace(",", "."));
}

function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) return `55${digits.replace(/^0+/, "")}`;
  return digits;
}

export function GanhosShortcut() {
  const [open, setOpen] = useState(false);
  const [salary, setSalary] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || window.location.pathname !== "/") return;

    let current: HTMLElement | null = null;

    const handleClick = () => setOpen(true);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setOpen(true);
      }
    };

    const bindTitle = () => {
      const title = Array.from(document.querySelectorAll("h1")).find(
        (el) => el.textContent?.trim() === "Meus Gastos",
      ) as HTMLElement | undefined;

      if (!title || title === current) return;

      if (current) {
        current.removeEventListener("click", handleClick);
        current.removeEventListener("keydown", handleKeyDown);
        current.style.cursor = "";
        current.removeAttribute("role");
        current.removeAttribute("tabindex");
        current.removeAttribute("title");
      }

      current = title;
      title.style.cursor = "pointer";
      title.setAttribute("role", "button");
      title.setAttribute("tabindex", "0");
      title.setAttribute("title", "Abrir Ganhos");
      title.addEventListener("click", handleClick);
      title.addEventListener("keydown", handleKeyDown);
    };

    bindTitle();
    const observer = new MutationObserver(bindTitle);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (current) {
        current.removeEventListener("click", handleClick);
        current.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const load = async () => {
      setLoading(true);
      try {
        const [{ data: budgets, error: budgetError }, { data: settings, error: settingsError }] =
          await Promise.all([
            supabase.from("budgets").select("budget_type,limit_amount"),
            supabase
              .from("user_settings")
              .select("alert_threshold_pct,whatsapp_number")
              .maybeSingle(),
          ]);

        if (budgetError) throw budgetError;
        if (settingsError) throw settingsError;

        const monthly = (budgets ?? []).find((b: any) => b.budget_type === "monthly");
        const credit = (budgets ?? []).find((b: any) => b.budget_type === "credit_card");

        setSalary(monthly ? String(Number(monthly.limit_amount)).replace(".", ",") : "");
        setCreditLimit(credit ? String(Number(credit.limit_amount)).replace(".", ",") : "");
        setThreshold(String((settings as any)?.alert_threshold_pct ?? 80));
        setPhone((settings as any)?.whatsapp_number ?? "");
      } catch (error: any) {
        toast.error(error?.message ?? "Não foi possível carregar Ganhos");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open]);

  const save = async () => {
    const salaryValue = normalizeMoney(salary);
    const creditValue = normalizeMoney(creditLimit);
    const thresholdValue = Math.min(100, Math.max(1, Number(threshold) || 80));

    if (!salaryValue || salaryValue <= 0) {
      toast.error("Informe seu salário total mensal");
      return;
    }
    if (!creditValue || creditValue <= 0) {
      toast.error("Informe seu limite total de crédito");
      return;
    }

    setSaving(true);
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (authError || !userId) throw new Error("Sessão expirada. Entre novamente.");

      const { error: budgetError } = await supabase.from("budgets").upsert(
        [
          { user_id: userId, budget_type: "monthly", limit_amount: salaryValue },
          { user_id: userId, budget_type: "credit_card", limit_amount: creditValue },
        ] as any,
        { onConflict: "user_id,budget_type" },
      );
      if (budgetError) throw budgetError;

      const { error: settingsError } = await supabase.from("user_settings").upsert(
        {
          user_id: userId,
          alert_threshold_pct: thresholdValue,
          whatsapp_number: normalizePhone(phone),
        } as any,
        { onConflict: "user_id" },
      );
      if (settingsError) throw settingsError;

      toast.success("Ganhos e limites atualizados");
      setOpen(false);
      window.location.reload();
    } catch (error: any) {
      toast.error(error?.message ?? "Erro ao salvar Ganhos");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeDollarSign className="h-5 w-5" /> Ganhos
          </DialogTitle>
          <DialogDescription>
            Defina sua renda mensal e seu limite de crédito para o app avisar quando seus gastos estiverem chegando perto do máximo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <BadgeDollarSign className="h-4 w-4 text-primary" />
                <Label htmlFor="salary">Salário total mensal</Label>
              </div>
              <Input
                id="salary"
                inputMode="decimal"
                placeholder="Ex: 5.000,00"
                value={salary}
                onChange={(e) => setSalary(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O total gasto no mês será comparado com este valor.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <Label htmlFor="credit-limit">Limite total de crédito</Label>
              </div>
              <Input
                id="credit-limit"
                inputMode="decimal"
                placeholder="Ex: 3.000,00"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Os gastos marcados como crédito serão comparados com este limite.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <BellRing className="h-4 w-4 text-primary" />
                <Label htmlFor="threshold">Avisar a partir de (%)</Label>
              </div>
              <Input
                id="threshold"
                inputMode="numeric"
                min={1}
                max={100}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value.replace(/\D/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: com 80%, você recebe um aviso ao chegar perto do limite e outro ao ultrapassar.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ganhos-phone">WhatsApp para alertas</Label>
              <Input
                id="ganhos-phone"
                inputMode="tel"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Os alertas automáticos por WhatsApp usam o webhook configurado em ⚙️ Configurações.
              </p>
            </div>

            <Button className="w-full" onClick={save} disabled={saving}>
              {saving ? "Salvando..." : "Salvar Ganhos"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable as _lovable } from "@/integrations/lovable";
import { useServerFn } from "@tanstack/react-start";
import { analyzeReceipt, createExpense, updateExpense, analyzePayslip } from "@/lib/expenses.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Camera,
  Plus,
  LogOut,
  Settings as SettingsIcon,
  Loader2,
  Wallet,
  TrendingUp,
  CreditCard,
  Trash2,
  Pencil,
  DollarSign,
  Download,
  Mic,
  Square,
  FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

type Category = { id: string; name: string; color: string; icon: string };
type Card_ = { id: string; name: string; bank: string | null; last4: string | null; color: string };
type Expense = {
  id: string;
  amount: number;
  description: string | null;
  merchant: string | null;
  spent_at: string;
  is_credit_card: boolean;
  category_id: string | null;
  card_id: string | null;
  receipt_url: string | null;
};
type Budget = { id: string; budget_type: "monthly" | "credit_card"; limit_amount: number };
type Settings = {
  zapier_webhook_url: string | null;
  alert_threshold_pct: number;
  whatsapp_number: string | null;
  notify_each_expense: boolean;
};

type VoicePaymentMethod = "cash" | "debit" | "credit" | null;
type VoiceExpenseDraft = {
  amount: number | null;
  merchant: string | null;
  spent_at: string | null;
  suggested_category: string | null;
  description: string | null;
  payment_method: VoicePaymentMethod;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onresult: ((event: { results: ArrayLike<{ isFinal?: boolean; 0?: { transcript?: string } }> }) => void) | null;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

const portugueseSmallNumbers: Record<string, number> = {
  zero: 0,
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  treze: 13,
  catorze: 14,
  quatorze: 14,
  quinze: 15,
  dezesseis: 16,
  dezassete: 17,
  dezessete: 17,
  dezoito: 18,
  dezenove: 19,
  vinte: 20,
  trinta: 30,
  quarenta: 40,
  cinquenta: 50,
  sessenta: 60,
  setenta: 70,
  oitenta: 80,
  noventa: 90,
  cem: 100,
  cento: 100,
  duzentos: 200,
  trezentos: 300,
  quatrocentos: 400,
  quinhentos: 500,
  seiscentos: 600,
  setecentos: 700,
  oitocentos: 800,
  novecentos: 900,
};

const ignoredMerchantWords = new Set([
  "no",
  "na",
  "em",
  "de",
  "do",
  "da",
  "com",
  "gastei",
  "paguei",
  "comprei",
  "foi",
  "reais",
  "real",
]);

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const stripAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Datas sempre no fuso local (evita "voltar 1 dia" por causa de UTC)
const toLocalISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const todayISO = () => toLocalISODate(new Date());

const parseISODate = (value: string) => {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

const formatDateBR = (value: string) => parseISODate(value).toLocaleDateString("pt-BR");

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function parsePortugueseNumberWords(input: string): number | null {
  const normalized = stripAccents(input).replace(/\be\b/g, " ");
  const tokens = normalized.split(/\s+/).filter(Boolean);
  let total = 0;
  let found = false;

  for (const token of tokens) {
    if (token === "mil") {
      total = Math.max(total, 1) * 1000;
      found = true;
      continue;
    }
    const value = portugueseSmallNumbers[token];
    if (typeof value === "number") {
      total += value;
      found = true;
    }
  }

  return found ? total : null;
}

function extractSpokenAmount(text: string): number | null {
  const numeric = text.match(/(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:reais|real|rs|r\$)?/i);
  if (numeric) return Number(numeric[1].replace(",", "."));

  const normalized = stripAccents(text);
  const amountWords = normalized.match(
    /((?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|catorze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta|quarenta|cinquenta|sessenta|setenta|oitenta|noventa|cem|cento|duzentos|trezentos|quatrocentos|quinhentos|seiscentos|setecentos|oitocentos|novecentos|mil|e)\s+)+(?:reais|real)/,
  );
  if (!amountWords) return null;
  return parsePortugueseNumberWords(amountWords[1]);
}

function extractSpokenDate(text: string): string | null {
  const normalized = stripAccents(text);
  const now = new Date();
  const date = new Date(now);
  if (/\bontem\b/.test(normalized)) {
    date.setDate(date.getDate() - 1);
    return toLocalISODate(date);
  }
  if (/\banteontem\b/.test(normalized)) {
    date.setDate(date.getDate() - 2);
    return toLocalISODate(date);
  }
  const explicit = normalized.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (explicit) {
    const day = explicit[1].padStart(2, "0");
    const month = explicit[2].padStart(2, "0");
    const year = explicit[3]
      ? explicit[3].length === 2
        ? `20${explicit[3]}`
        : explicit[3]
      : String(now.getFullYear());
    return `${year}-${month}-${day}`;
  }
  return todayISO();
}

function extractPaymentMethod(text: string): VoicePaymentMethod {
  const normalized = stripAccents(text);
  if (/\b(debito|debito automatico)\b/.test(normalized)) return "debit";
  if (/\b(credito|cartao de credito|fatura)\b/.test(normalized)) return "credit";
  if (/\b(pix|dinheiro|especie|cash)\b/.test(normalized)) return "cash";
  return null;
}

function extractMerchant(text: string): string | null {
  const direct = text.match(/(?:no|na|em|do|da)\s+([^,.]+?)(?:\s+(?:de|por|com|no|na|ontem|hoje|credito|crédito|debito|débito|pix|dinheiro)\b|$)/i);
  const raw = direct?.[1]?.trim() ?? null;
  if (!raw) return null;
  const cleaned = raw
    .split(/\s+/)
    .filter((word) => !ignoredMerchantWords.has(stripAccents(word)))
    .join(" ")
    .trim();
  return cleaned || null;
}

function guessCategory(text: string, categoryNames: string[]): string | null {
  const normalized = stripAccents(text);
  const direct = categoryNames.find((name) => normalized.includes(stripAccents(name)));
  if (direct) return direct;

  const rules: Array<{ words: string[]; labels: string[] }> = [
    { words: ["uber", "99", "taxi", "onibus", "metro", "gasolina", "posto", "transporte"], labels: ["transporte"] },
    { words: ["ifood", "lanche", "burger", "hamburguer", "pizza", "restaurante", "fast food", "mercado", "padaria", "comida", "almoco", "janta"], labels: ["alimentacao", "fast food", "comida"] },
    { words: ["aluguel", "agua", "luz", "energia", "internet", "condominio", "casa"], labels: ["casa", "moradia", "contas"] },
    { words: ["cinema", "bar", "show", "lazer", "netflix", "spotify"], labels: ["lazer", "lifestyle"] },
    { words: ["farmacia", "remedio", "consulta", "medico", "saude"], labels: ["saude"] },
  ];

  for (const rule of rules) {
    if (!rule.words.some((word) => normalized.includes(word))) continue;
    const match = categoryNames.find((name) => rule.labels.some((label) => stripAccents(name).includes(label)));
    if (match) return match;
  }

  return null;
}

function parseVoiceExpense(transcript: string, categoryNames: string[]): VoiceExpenseDraft {
  const clean = transcript.trim();
  const merchant = extractMerchant(clean);
  return {
    amount: extractSpokenAmount(clean),
    merchant,
    spent_at: extractSpokenDate(clean),
    suggested_category: guessCategory(clean, categoryNames),
    description: clean,
    payment_method: extractPaymentMethod(clean),
  };
}

export default function Dashboard() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [cards, setCards] = useState<Card_[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [settings, setSettings] = useState<Settings>({
    zapier_webhook_url: null,
    alert_threshold_pct: 80,
    whatsapp_number: null,
    notify_each_expense: true,
  });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showPayslip, setShowPayslip] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());

  const reload = async () => {
    setLoading(true);
    const [c, cd, e, b, s] = await Promise.all([
      supabase.from("categories").select("*").order("name"),
      (supabase.from as any)("cards").select("*").order("created_at"),
      supabase
        .from("expenses")
        .select("*")
        .gte("spent_at", `${year}-01-01`)
        .lte("spent_at", `${year}-12-31`)
        .order("spent_at", { ascending: false }),
      supabase.from("budgets").select("*"),
      supabase.from("user_settings").select("*").maybeSingle(),
    ]);
    setCategories((c.data ?? []) as any);
    setCards((cd.data ?? []) as any);
    setExpenses(((e.data ?? []) as any).map((x: any) => ({ ...x, amount: Number(x.amount) })));
    setBudgets(((b.data ?? []) as any).map((x: any) => ({ ...x, limit_amount: Number(x.limit_amount) })));
    if (s.data)
      setSettings({
        zapier_webhook_url: s.data.zapier_webhook_url,
        alert_threshold_pct: s.data.alert_threshold_pct,
        whatsapp_number: (s.data as any).whatsapp_number ?? null,
        notify_each_expense: (s.data as any).notify_each_expense ?? true,
      });
    setLoading(false);
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.spent_at.startsWith(thisMonth)),
    [expenses, thisMonth],
  );
  const monthTotal = monthExpenses.reduce((s, e) => s + e.amount, 0);
  const cardMonthTotal = monthExpenses.filter((e) => e.is_credit_card).reduce((s, e) => s + e.amount, 0);
  const yearTotal = expenses.reduce((s, e) => s + e.amount, 0);

  const monthlyBudget = budgets.find((b) => b.budget_type === "monthly");
  const cardBudget = budgets.find((b) => b.budget_type === "credit_card");

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      const key = e.category_id ?? "none";
      map.set(key, (map.get(key) ?? 0) + e.amount);
    }
    return Array.from(map.entries()).map(([id, value]) => {
      const cat = categories.find((c) => c.id === id);
      return { name: cat?.name ?? "Sem categoria", value, color: cat?.color ?? "#94a3b8" };
    });
  }, [monthExpenses, categories]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of monthExpenses) {
      map.set(e.spent_at, (map.get(e.spent_at) ?? 0) + e.amount);
    }
    return Array.from(map.entries())
      .sort()
      .map(([d, v]) => ({ day: d.slice(8), total: v }));
  }, [monthExpenses]);

  const monthlyBars = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, i) => ({
      month: new Date(year, i, 1).toLocaleString("pt-BR", { month: "short" }),
      total: 0,
    }));
    for (const e of expenses) {
      const m = parseInt(e.spent_at.slice(5, 7)) - 1;
      arr[m].total += e.amount;
    }
    return arr;
  }, [expenses, year]);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Excluir este gasto?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    reload();
  };

  const exportExcel = (scope: "month" | "year") => {
    const list = scope === "month" ? monthExpenses : expenses;
    if (list.length === 0) {
      toast.error("Nenhum gasto para exportar");
      return;
    }
    const rows = [...list]
      .sort((a, b) => a.spent_at.localeCompare(b.spent_at))
      .map((e) => {
        const cat = categories.find((c) => c.id === e.category_id);
        const card = cards.find((cc) => cc.id === e.card_id);
        const pagamento = e.is_credit_card
          ? "Crédito"
          : e.card_id
            ? "Débito"
            : "Dinheiro/Pix";
        return {
          Data: formatDateBR(e.spent_at),
          Descrição: e.description ?? "",
          Estabelecimento: e.merchant ?? "",
          Categoria: cat?.name ?? "Sem categoria",
          Pagamento: pagamento,
          Cartão: card ? `${card.name}${card.last4 ? ` •${card.last4}` : ""}` : "",
          Banco: card?.bank ?? "",
          Valor: Number(e.amount),
        };
      });
    const total = rows.reduce((s, r) => s + r.Valor, 0);
    rows.push({
      Data: "",
      Descrição: "",
      Estabelecimento: "",
      Categoria: "",
      Pagamento: "",
      Cartão: "",
      Banco: "TOTAL",
      Valor: total,
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 30 }, { wch: 22 }, { wch: 16 },
      { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 12 },
    ];

    // Aba resumo por categoria
    const catMap = new Map<string, number>();
    for (const e of list) {
      const name = categories.find((c) => c.id === e.category_id)?.name ?? "Sem categoria";
      catMap.set(name, (catMap.get(name) ?? 0) + e.amount);
    }
    const resumo = Array.from(catMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([Categoria, Total]) => ({ Categoria, Total }));
    resumo.push({ Categoria: "TOTAL", Total: total });
    const ws2 = XLSX.utils.json_to_sheet(resumo);
    ws2["!cols"] = [{ wch: 24 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gastos");
    XLSX.utils.book_append_sheet(wb, ws2, "Por categoria");

    const label =
      scope === "month"
        ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
        : String(year);
    XLSX.writeFile(wb, `gastos-${label}.xlsx`);
    toast.success("Excel gerado");
  };


  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Wallet className="h-5 w-5 text-primary shrink-0" />
            <h1 className="text-base font-semibold truncate">Meus Gastos</h1>
          </div>
          <div className="flex items-center gap-1">
            <UsdTicker />
            <Button variant="ghost" size="icon" onClick={() => setShowPayslip(true)} title="Holerite">
              <FileText className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
              <SettingsIcon className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" /> Este mês
            </div>
            <div className="mt-1 text-2xl font-semibold">{fmt(monthTotal)}</div>
            {monthlyBudget ? (
              <div className="mt-2 space-y-1">
                <Progress value={Math.min(100, (monthTotal / monthlyBudget.limit_amount) * 100)} />
                <div className="text-[11px] text-muted-foreground">
                  de {fmt(monthlyBudget.limit_amount)}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">Sem limite</div>
            )}
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CreditCard className="h-3 w-3" /> Cartão (mês)
            </div>
            <div className="mt-1 text-2xl font-semibold">{fmt(cardMonthTotal)}</div>
            {cardBudget ? (
              <div className="mt-2 space-y-1">
                <Progress value={Math.min(100, (cardMonthTotal / cardBudget.limit_amount) * 100)} />
                <div className="text-[11px] text-muted-foreground">
                  de {fmt(cardBudget.limit_amount)}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">Sem limite</div>
            )}
          </Card>
        </div>

        <Tabs defaultValue="month" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="year">Ano</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>

          <TabsContent value="month" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportExcel("month")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar mês (Excel)
              </Button>
            </div>
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Por categoria</h3>
              {byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem gastos neste mês.</p>
              ) : (
                <div className="h-52">
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={70} label>
                        {byCategory.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-3">Evolução diária</h3>
              <div className="h-48">
                <ResponsiveContainer>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Line type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="year" className="space-y-4">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => exportExcel("year")}>
                <Download className="h-3.5 w-3.5 mr-1" /> Exportar ano (Excel)
              </Button>
            </div>
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium">Total {year}: {fmt(yearTotal)}</h3>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => setYear(year - 1)}>◀</Button>
                  <Button size="sm" variant="outline" onClick={() => setYear(year + 1)}>▶</Button>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={monthlyBars}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip formatter={(v: any) => fmt(Number(v))} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="list" className="space-y-2">
            {expenses.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Nenhum gasto ainda. Toque no + para adicionar.
              </p>
            )}
            {expenses.map((e) => {
              const cat = categories.find((c) => c.id === e.category_id);
              const card = cards.find((cc) => cc.id === e.card_id);
              return (
                <Card key={e.id} className="p-3 flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-xs font-semibold text-white"
                    style={{ backgroundColor: cat?.color ?? "#94a3b8" }}
                  >
                    {(cat?.name ?? "?").slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {e.description || e.merchant || cat?.name || "Gasto"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateBR(e.spent_at)} · {cat?.name ?? "—"}
                      {e.is_credit_card
                        ? ` · Crédito${card ? ` ${card.name}${card.last4 ? ` •${card.last4}` : ""}` : ""}`
                        : e.card_id
                          ? ` · Débito${card ? ` ${card.name}${card.last4 ? ` •${card.last4}` : ""}` : ""}`
                          : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmt(e.amount)}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => setEditingExpense(e)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteExpense(e.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        {loading && (
          <div className="text-center text-xs text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        )}
      </main>

      {/* Floating add */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20">
        <Button size="lg" className="rounded-full h-14 shadow-lg gap-2 px-6" onClick={() => setShowAdd(true)}>
          <Plus className="h-5 w-5" />
          Algum gasto hoje?
        </Button>
      </div>

      <AddExpenseDialog
        open={showAdd || !!editingExpense}
        expense={editingExpense}
        onOpenChange={(v) => {
          if (!v) { setShowAdd(false); setEditingExpense(null); }
        }}
        categories={categories}
        cards={cards}
        onSaved={() => {
          setShowAdd(false);
          setEditingExpense(null);
          reload();
        }}
        onCardsChanged={reload}
      />

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        budgets={budgets}
        settings={settings}
        cards={cards}
        onCardsChanged={reload}
        onSaved={() => {
          setShowSettings(false);
          reload();
        }}
      />

      <PayslipDialog open={showPayslip} onOpenChange={setShowPayslip} />
    </div>
  );
}

function AddExpenseDialog({
  open,
  onOpenChange,
  categories,
  cards,
  onSaved,
  onCardsChanged,
  expense,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: Category[];
  cards: Card_[];
  onSaved: () => void;
  onCardsChanged: () => void;
  expense?: Expense | null;
}) {
  const analyze = useServerFn(analyzeReceipt);
  const create = useServerFn(createExpense);
  const update = useServerFn(updateExpense);
  const isEdit = !!expense;
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [merchant, setMerchant] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [spentAt, setSpentAt] = useState(() => todayISO());
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "debit" | "credit">("cash");
  const [cardId, setCardId] = useState<string>("");
  const [showNewCard, setShowNewCard] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [newCardBank, setNewCardBank] = useState("");
  const [newCardLast4, setNewCardLast4] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (open && expense) {
      setAmount(String(expense.amount).replace(".", ","));
      setDescription(expense.description ?? "");
      setMerchant(expense.merchant ?? "");
      setCategoryId(expense.category_id ?? "");
      setSpentAt(expense.spent_at);
      setPaymentMethod(
        expense.is_credit_card ? "credit" : expense.card_id ? "debit" : "cash",
      );
      setCardId(expense.card_id ?? "");
      setReceiptPath(expense.receipt_url ?? null);
    } else if (open && !expense) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expense?.id]);

  const reset = () => {
    setAmount(""); setDescription(""); setMerchant(""); setCategoryId("");
    setSpentAt(todayISO()); setPaymentMethod("cash"); setReceiptPath(null);
    setCardId(""); setShowNewCard(false); setNewCardName(""); setNewCardBank(""); setNewCardLast4("");
  };

  const addCard = async () => {
    if (!newCardName.trim()) { toast.error("Dê um nome ao cartão"); return; }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data, error } = await (supabase.from as any)("cards").insert({
      user_id: uid,
      name: newCardName.trim(),
      bank: newCardBank.trim() || null,
      last4: newCardLast4.trim() || null,
    }).select("id").single();
    if (error) { toast.error(error.message); return; }
    setShowNewCard(false);
    setNewCardName(""); setNewCardBank(""); setNewCardLast4("");
    onCardsChanged();
    setCardId(data.id);
    toast.success("Cartão adicionado");
  };

  const handlePhoto = async (file: File) => {
    setAnalyzing(true);
    try {
      // Upload to storage
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sem sessão");
      const path = `${uid}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("receipts").upload(path, file);
      if (up.error) throw up.error;
      setReceiptPath(path);

      // Base64 for AI
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const result = await analyze({
        data: {
          imageBase64: base64,
          mimeType: file.type || "image/jpeg",
          categoryNames: categories.map((c) => c.name),
        },
      });
      if (result.amount) setAmount(String(result.amount));
      if (result.merchant) setMerchant(result.merchant);
      if (result.description) setDescription(result.description);
      if (result.spent_at) setSpentAt(result.spent_at);
      if (result.suggested_category) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === result.suggested_category!.toLowerCase(),
        );
        if (match) setCategoryId(match.id);
      }
      toast.success("Comprovante lido! Revise e salve.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao ler foto");
    } finally {
      setAnalyzing(false);
    }
  };

  const startRecording = async () => {
    try {
      const Recognition = getSpeechRecognition();
      if (!Recognition) {
        toast.error("Seu navegador não liberou ditado por voz. No iPhone, use o Safari atualizado ou preencha manualmente.");
        return;
      }

      let heardText = "";
      const recognition = new Recognition();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => setRecording(true);
      recognition.onerror = (event) => {
        setRecording(false);
        recognitionRef.current = null;
        if (event.error === "not-allowed") {
          toast.error("Permissão do microfone negada. Libere o microfone no navegador.");
          return;
        }
        toast.error("Não consegui ouvir. Tente falar de novo mais perto do microfone.");
      };
      recognition.onresult = (event) => {
        const transcripts: string[] = [];
        for (let i = 0; i < event.results.length; i += 1) {
          const transcript = event.results[i]?.[0]?.transcript;
          if (transcript) transcripts.push(transcript);
        }
        heardText = transcripts.join(" ").trim();
        if (!heardText) return;

        const result = parseVoiceExpense(heardText, categories.map((c) => c.name));
        if (result.amount) setAmount(String(result.amount).replace(".", ","));
        if (result.merchant) setMerchant(result.merchant);
        if (result.description) setDescription(result.description);
        if (result.spent_at) setSpentAt(result.spent_at);
        if (result.payment_method) setPaymentMethod(result.payment_method);
        if (result.suggested_category) {
          const match = categories.find(
            (c) => stripAccents(c.name) === stripAccents(result.suggested_category ?? ""),
          );
          if (match) setCategoryId(match.id);
        }
        toast.success(`Ouvi: "${heardText}"`);
      };
      recognition.onend = () => {
        setRecording(false);
        recognitionRef.current = null;
        if (!heardText) toast.info("Não peguei nenhum áudio. Toque e fale o gasto novamente.");
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e: any) {
      toast.error("Não consegui acessar o microfone. Verifique a permissão.");
    }
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
  };

  const handleSave = async () => {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        amount: value,
        category_id: categoryId || null,
        description: description || null,
        merchant: merchant || null,
        spent_at: spentAt,
        is_credit_card: paymentMethod === "credit",
        card_id: paymentMethod === "cash" ? null : (cardId || null),
        receipt_url: receiptPath,
      };
      if (isEdit && expense) {
        await update({ data: { ...payload, id: expense.id } });
        toast.success("Gasto atualizado!");
      } else {
        await create({ data: payload });
        toast.success("Gasto lançado!");
      }
      reset();
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar gasto" : "Novo gasto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block">
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])}
            />
            <div className="border-2 border-dashed border-primary/40 rounded-lg p-4 text-center hover:bg-primary/5 cursor-pointer transition">
              {analyzing ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Lendo comprovante...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <Camera className="h-4 w-4" /> Tirar foto do comprovante
                </div>
              )}
            </div>
          </label>

          <Button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            variant="outline"
            className={`h-auto w-full border-2 border-dashed p-4 text-center transition ${
              recording
                ? "border-red-500 bg-red-500/10 text-red-600 animate-pulse"
                : "border-primary/40 hover:bg-primary/5 text-primary"
            }`}
          >
            {recording ? (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Square className="h-4 w-4 fill-current" /> Toque para parar de gravar
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2 text-sm">
                <Mic className="h-4 w-4" /> Falar o gasto (ex: "gastei 45 reais no Uber")
              </div>
            )}
          </Button>


          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2">
              <Label>Valor (R$)</Label>
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Categoria</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>Descrição</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Data</Label>
              <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Estabelecimento</Label>
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
            </div>
            <div className="space-y-2 col-span-2 rounded-md border p-3">
              <Label>Forma de pagamento</Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "cash", label: "Dinheiro/Pix" },
                  { v: "debit", label: "Débito" },
                  { v: "credit", label: "Crédito" },
                ] as const).map((opt) => (
                  <Button
                    key={opt.v}
                    type="button"
                    variant={paymentMethod === opt.v ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setPaymentMethod(opt.v);
                      if (opt.v === "cash") { setCardId(""); setShowNewCard(false); }
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
            {paymentMethod !== "cash" && (
              <div className="space-y-2 col-span-2 rounded-md border p-3 bg-muted/30">
                <Label>Qual cartão? ({paymentMethod === "credit" ? "Crédito" : "Débito"})</Label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Select value={cardId} onValueChange={setCardId}>
                      <SelectTrigger><SelectValue placeholder={cards.length ? "Selecione o cartão" : "Nenhum cartão cadastrado"} /></SelectTrigger>
                      <SelectContent>
                        {cards.map((cc) => (
                          <SelectItem key={cc.id} value={cc.id}>
                            <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: cc.color }} />
                            {cc.name}{cc.bank ? ` · ${cc.bank}` : ""}{cc.last4 ? ` •${cc.last4}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCard((s) => !s)}>
                    {showNewCard ? "Cancelar" : "Novo"}
                  </Button>
                </div>
                {showNewCard && (
                  <div className="space-y-2 pt-2">
                    <Input placeholder="Nome (ex: Nubank Roxinho)" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} />
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Banco" value={newCardBank} onChange={(e) => setNewCardBank(e.target.value)} />
                      <Input placeholder="Últimos 4" maxLength={4} value={newCardLast4} onChange={(e) => setNewCardLast4(e.target.value.replace(/\D/g, ""))} />
                    </div>
                    <Button type="button" size="sm" className="w-full" onClick={addCard}>Adicionar cartão</Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : isEdit ? "Salvar alterações" : "Salvar gasto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsDialog({
  open,
  onOpenChange,
  budgets,
  settings,
  cards,
  onCardsChanged,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  budgets: Budget[];
  settings: Settings;
  cards: Card_[];
  onCardsChanged: () => void;
  onSaved: () => void;
}) {
  const [monthly, setMonthly] = useState("");
  const [card, setCard] = useState("");
  const [webhook, setWebhook] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [phone, setPhone] = useState("");
  const [notifyEach, setNotifyEach] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newCardName, setNewCardName] = useState("");
  const [newCardBank, setNewCardBank] = useState("");
  const [newCardLast4, setNewCardLast4] = useState("");

  const addCard = async () => {
    if (!newCardName.trim()) { toast.error("Dê um nome ao cartão"); return; }
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { error } = await (supabase.from as any)("cards").insert({
      user_id: uid,
      name: newCardName.trim(),
      bank: newCardBank.trim() || null,
      last4: newCardLast4.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    setNewCardName(""); setNewCardBank(""); setNewCardLast4("");
    onCardsChanged();
    toast.success("Cartão adicionado");
  };

  const removeCard = async (id: string) => {
    if (!confirm("Remover este cartão? Os gastos existentes ficarão sem cartão vinculado.")) return;
    const { error } = await (supabase.from as any)("cards").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    onCardsChanged();
  };


  useEffect(() => {
    setMonthly(String(budgets.find((b) => b.budget_type === "monthly")?.limit_amount ?? ""));
    setCard(String(budgets.find((b) => b.budget_type === "credit_card")?.limit_amount ?? ""));
    setWebhook(settings.zapier_webhook_url ?? "");
    setThreshold(String(settings.alert_threshold_pct ?? 80));
    setPhone(settings.whatsapp_number ?? "");
    setNotifyEach(settings.notify_each_expense ?? true);
  }, [budgets, settings, open]);

  const save = async () => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user!.id;

      const budgetRows: any[] = [];
      const m = parseFloat(monthly.replace(",", "."));
      const c = parseFloat(card.replace(",", "."));
      if (!isNaN(m) && m > 0) budgetRows.push({ user_id: uid, budget_type: "monthly", limit_amount: m });
      if (!isNaN(c) && c > 0) budgetRows.push({ user_id: uid, budget_type: "credit_card", limit_amount: c });
      if (budgetRows.length) {
        await supabase.from("budgets").upsert(budgetRows, { onConflict: "user_id,budget_type" });
      }
      await supabase.from("user_settings").upsert({
        user_id: uid,
        zapier_webhook_url: webhook || null,
        alert_threshold_pct: Math.min(100, Math.max(1, parseInt(threshold) || 80)),
        whatsapp_number: normalizePhone(phone),
        notify_each_expense: notifyEach,
      } as any);
      toast.success("Configurações salvas");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Limite mensal geral (R$)</Label>
            <Input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
            <p className="text-xs text-muted-foreground">Valor livre de uso no mês.</p>
          </div>
          <div className="space-y-1">
            <Label>Limite da fatura do cartão (R$)</Label>
            <Input inputMode="decimal" value={card} onChange={(e) => setCard(e.target.value)} />
          </div>
          <div className="space-y-2 rounded-md border p-3">
            <Label>Meus cartões</Label>
            {cards.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum cartão cadastrado.</p>
            )}
            <div className="space-y-1">
              {cards.map((cc) => (
                <div key={cc.id} className="flex items-center justify-between text-sm border rounded px-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cc.color }} />
                    <span className="truncate">{cc.name}{cc.bank ? ` · ${cc.bank}` : ""}{cc.last4 ? ` •${cc.last4}` : ""}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeCard(cc.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="space-y-2 pt-1">
              <Input placeholder="Nome (ex: Nubank Roxinho)" value={newCardName} onChange={(e) => setNewCardName(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Banco" value={newCardBank} onChange={(e) => setNewCardBank(e.target.value)} />
                <Input placeholder="Últimos 4" maxLength={4} value={newCardLast4} onChange={(e) => setNewCardLast4(e.target.value.replace(/\D/g, ""))} />
              </div>
              <Button type="button" variant="outline" size="sm" className="w-full" onClick={addCard}>Adicionar cartão</Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Avisar quando atingir (%)</Label>
            <Input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Webhook do Zapier (para WhatsApp)</Label>
            <Input
              placeholder="https://hooks.zapier.com/hooks/catch/..."
              value={webhook}
              onChange={(e) => setWebhook(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Crie um Zap com trigger "Webhooks → Catch Hook" e ação "Send WhatsApp Message". Cole a URL aqui.
            </p>
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsdTicker() {
  const [rate, setRate] = useState<number | null>(null);
  const [pct, setPct] = useState<number | null>(null);

  const fetchRate = async () => {
    try {
      const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL");
      const json = await res.json();
      const q = json.USDBRL;
      if (q) {
        setRate(Number(q.bid));
        setPct(Number(q.pctChange));
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchRate();
    const id = setInterval(fetchRate, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (rate === null) {
    return (
      <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
        <DollarSign className="h-3 w-3" />
        <span>—</span>
      </div>
    );
  }
  const up = (pct ?? 0) >= 0;
  return (
    <button
      onClick={fetchRate}
      title="Cotação USD/BRL (clique para atualizar)"
      className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent transition"
    >
      <DollarSign className="h-3 w-3 text-primary" />
      <span className="font-medium tabular-nums">
        {rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
      </span>
      {pct !== null && (
        <span className={`tabular-nums ${up ? "text-emerald-600" : "text-red-600"}`}>
          {up ? "▲" : "▼"}
          {Math.abs(pct).toFixed(2)}%
        </span>
      )}
    </button>
  );
}

type PayslipRow = {
  id: string;
  period: string | null;
  employer: string | null;
  gross: number | null;
  net: number | null;
  deductions: number | null;
  summary: string | null;
  file_name: string | null;
  created_at: string;
};

function PayslipDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const analyze = useServerFn(analyzePayslip);
  const [list, setList] = useState<PayslipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase.from as any)("payslips")
      .select("*")
      .order("created_at", { ascending: false });
    setList(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        gross: r.gross !== null ? Number(r.gross) : null,
        net: r.net !== null ? Number(r.net) : null,
        deductions: r.deductions !== null ? Number(r.deductions) : null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Envie um arquivo PDF");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sem sessão");
      const path = `${uid}/${Date.now()}-${file.name}`;
      const up = await supabase.storage.from("payslips").upload(path, file);
      if (up.error) throw up.error;

      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(",")[1]);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      await analyze({
        data: {
          fileBase64: base64,
          fileName: file.name,
          mimeType: file.type || "application/pdf",
          filePath: path,
        },
      });
      toast.success("Holerite analisado!");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao analisar holerite");
    } finally {
      setUploading(false);
    }
  };

  const removePayslip = async (row: PayslipRow) => {
    if (!confirm("Remover este holerite?")) return;
    if (row.file_name) {
      // best-effort: try to delete stored file if we saved path
      try {
        const { data } = await (supabase.from as any)("payslips")
          .select("file_url")
          .eq("id", row.id)
          .maybeSingle();
        if (data?.file_url) await supabase.storage.from("payslips").remove([data.file_url]);
      } catch {
        /* ignore */
      }
    }
    await (supabase.from as any)("payslips").delete().eq("id", row.id);
    load();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Holerites</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <div className="border-2 border-dashed border-primary/40 rounded-lg p-4 text-center hover:bg-primary/5 cursor-pointer transition">
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" /> Analisando holerite...
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-primary">
                  <FileText className="h-4 w-4" /> Anexar holerite em PDF
                </div>
              )}
            </div>
          </label>

          <div className="space-y-2">
            {loading && (
              <div className="text-center text-xs text-muted-foreground">
                <Loader2 className="mx-auto h-4 w-4 animate-spin" />
              </div>
            )}
            {!loading && list.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhum holerite enviado ainda.
              </p>
            )}
            {list.map((p) => (
              <Card key={p.id} className="p-3 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.period ?? "Sem período"} {p.employer ? `· ${p.employer}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{p.file_name}</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removePayslip(p)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                  <div>
                    <div className="text-muted-foreground">Bruto</div>
                    <div className="font-semibold">{p.gross !== null ? fmt(p.gross) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Descontos</div>
                    <div className="font-semibold text-red-600">
                      {p.deductions !== null ? fmt(p.deductions) : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Líquido</div>
                    <div className="font-semibold text-emerald-600">
                      {p.net !== null ? fmt(p.net) : "—"}
                    </div>
                  </div>
                </div>
                {p.summary && (
                  <p className="text-xs text-muted-foreground pt-1">{p.summary}</p>
                )}
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

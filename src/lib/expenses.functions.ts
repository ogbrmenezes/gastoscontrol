import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AnalyzeInput = z.object({
  imageBase64: z.string().min(20),
  mimeType: z.string().default("image/jpeg"),
  categoryNames: z.array(z.string()).default([]),
});

const TranscribeInput = z.object({
  audioBase64: z.string().min(20),
  format: z.enum(["webm", "mp3", "wav", "m4a", "ogg", "aac", "flac"]).default("webm"),
  categoryNames: z.array(z.string()).default([]),
});

const PayslipInput = z.object({
  fileBase64: z.string().min(20),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().default("application/pdf"),
  filePath: z.string().nullable().optional(),
});

export const transcribeExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => TranscribeInput.parse(v))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const today = new Date().toISOString().slice(0, 10);
    const sys = `Você extrai dados de um GASTO falado em português do Brasil. Data de hoje: ${today}.
Retorne SOMENTE JSON válido com estas chaves:
{"amount": number, "merchant": string|null, "spent_at": "YYYY-MM-DD"|null, "suggested_category": string|null, "description": string|null, "payment_method": "cash"|"debit"|"credit"|null, "transcript": string}
- amount: valor em reais (ponto decimal). Se a pessoa disser "cinquenta reais" -> 50.
- payment_method: "cash" para dinheiro/pix, "debit" para débito, "credit" para crédito/cartão de crédito. null se não mencionar.
- spent_at: se não disser data, use ${today}.
- suggested_category: escolha exatamente uma das disponíveis (${data.categoryNames.join(", ") || "nenhuma"}) ou null.
- transcript: transcrição literal do áudio.
Nada fora do JSON.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva o áudio e extraia os dados do gasto." },
              { type: "input_audio", input_audio: { data: data.audioBase64, format: data.format } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI ${res.status}: ${body}`);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const p = JSON.parse(raw);
      return {
        amount: typeof p.amount === "number" ? p.amount : Number(p.amount) || 0,
        merchant: p.merchant ?? null,
        spent_at: p.spent_at ?? null,
        suggested_category: p.suggested_category ?? null,
        description: p.description ?? null,
        payment_method: (p.payment_method ?? null) as "cash" | "debit" | "credit" | null,
        transcript: p.transcript ?? null,
      };
    } catch {
      return {
        amount: 0,
        merchant: null,
        spent_at: null,
        suggested_category: null,
        description: null,
        payment_method: null,
        transcript: null,
      };
    }
  });

export const analyzePayslip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => PayslipInput.parse(v))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const sys = `Você extrai dados de um HOLERITE / contracheque brasileiro. Retorne SOMENTE JSON:
{"period": "YYYY-MM"|null, "employer": string|null, "gross": number|null, "net": number|null, "deductions": number|null, "summary": string}
- gross: salário bruto (total de vencimentos) em reais.
- net: salário líquido (valor a receber).
- deductions: total de descontos.
- period: mês de referência.
- summary: resumo curto em 1-2 frases em português.`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados deste holerite." },
              {
                type: "file",
                file: {
                  filename: data.fileName,
                  file_data: `data:${data.mimeType};base64,${data.fileBase64}`,
                },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI ${res.status}: ${body}`);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    let p: any = {};
    try {
      p = JSON.parse(raw);
    } catch {
      p = {};
    }
    const { supabase, userId } = context;
    const { data: inserted, error } = await (supabase.from("payslips") as any)
      .insert({
        user_id: userId,
        period: p.period ?? null,
        employer: p.employer ?? null,
        gross: p.gross ?? null,
        net: p.net ?? null,
        deductions: p.deductions ?? null,
        summary: p.summary ?? null,
        file_name: data.fileName,
        file_url: data.filePath ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return {
      id: inserted.id,
      period: p.period ?? null,
      employer: p.employer ?? null,
      gross: p.gross ?? null,
      net: p.net ?? null,
      deductions: p.deductions ?? null,
      summary: p.summary ?? null,
    };
  });

export const analyzeReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => AnalyzeInput.parse(v))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const sys = `Você é um extrator de dados de comprovantes/cupons/telas de pagamento em português do Brasil.
Retorne SOMENTE um JSON válido com as chaves:
{"amount": number, "merchant": string|null, "spent_at": "YYYY-MM-DD"|null, "suggested_category": string|null, "description": string|null}
- amount: valor total pago em reais (número, use ponto).
- merchant: nome do estabelecimento.
- spent_at: data no formato ISO. Se não achar, null.
- suggested_category: escolha exatamente uma das categorias disponíveis se fizer sentido, senão null.
- description: uma frase curta descrevendo a compra.
Categorias disponíveis: ${data.categoryNames.join(", ") || "nenhuma"}.
Nada de texto fora do JSON.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: sys },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados deste comprovante." },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI ${res.status}: ${body}`);
    }
    const json = await res.json();
    const raw = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(raw);
      return {
        amount: typeof parsed.amount === "number" ? parsed.amount : Number(parsed.amount) || 0,
        merchant: parsed.merchant ?? null,
        spent_at: parsed.spent_at ?? null,
        suggested_category: parsed.suggested_category ?? null,
        description: parsed.description ?? null,
      };
    } catch {
      return { amount: 0, merchant: null, spent_at: null, suggested_category: null, description: null };
    }
  });

const CreateExpenseInput = z.object({
  amount: z.number().positive(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().max(500).optional().nullable(),
  merchant: z.string().max(200).optional().nullable(),
  spent_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_credit_card: z.boolean().default(false),
  card_id: z.string().uuid().nullable().optional(),
  receipt_url: z.string().optional().nullable(),
});

const UpdateExpenseInput = CreateExpenseInput.extend({ id: z.string().uuid() });

export const updateExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => UpdateExpenseInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;
    const { error } = await (supabase.from("expenses") as any)
      .update({
        amount: fields.amount,
        category_id: fields.category_id ?? null,
        description: fields.description ?? null,
        merchant: fields.merchant ?? null,
        spent_at: fields.spent_at,
        is_credit_card: fields.is_credit_card,
        card_id: fields.card_id ?? null,
        receipt_url: fields.receipt_url ?? null,
      })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { id };
  });

export const createExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => CreateExpenseInput.parse(v))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: inserted, error } = await supabase
      .from("expenses")
      .insert({
        user_id: userId,
        amount: data.amount,
        category_id: data.category_id ?? null,
        description: data.description ?? null,
        merchant: data.merchant ?? null,
        spent_at: data.spent_at,
        is_credit_card: data.is_credit_card,
        card_id: data.card_id ?? null,
        receipt_url: data.receipt_url ?? null,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Check budgets and notify
    try {
      const monthStart = data.spent_at.slice(0, 7) + "-01";
      const [{ data: settings }, { data: budgets }, { data: monthSum }, { data: cardSum }] =
        await Promise.all([
          supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
          supabase.from("budgets").select("*").eq("user_id", userId),
          supabase
            .from("expenses")
            .select("amount")
            .eq("user_id", userId)
            .gte("spent_at", monthStart),
          supabase
            .from("expenses")
            .select("amount")
            .eq("user_id", userId)
            .eq("is_credit_card", true)
            .gte("spent_at", monthStart),
        ]);

      const webhook = settings?.zapier_webhook_url;
      const threshold = (settings?.alert_threshold_pct ?? 80) / 100;

      if (webhook) {
        const monthTotal = (monthSum ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
        const cardTotal = (cardSum ?? []).reduce((s, r: any) => s + Number(r.amount), 0);
        const monthly = budgets?.find((b: any) => b.budget_type === "monthly");
        const card = budgets?.find((b: any) => b.budget_type === "credit_card");

        const messages: string[] = [];
        if (monthly && monthTotal >= Number(monthly.limit_amount) * threshold) {
          const pct = Math.round((monthTotal / Number(monthly.limit_amount)) * 100);
          messages.push(
            `⚠️ Gastos do mês: R$ ${monthTotal.toFixed(2)} de R$ ${Number(monthly.limit_amount).toFixed(2)} (${pct}%)`,
          );
        }
        if (card && cardTotal >= Number(card.limit_amount) * threshold) {
          const pct = Math.round((cardTotal / Number(card.limit_amount)) * 100);
          messages.push(
            `💳 Fatura do cartão: R$ ${cardTotal.toFixed(2)} de R$ ${Number(card.limit_amount).toFixed(2)} (${pct}%)`,
          );
        }

        for (const message of messages) {
          await fetch(webhook, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message,
              timestamp: new Date().toISOString(),
            }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("budget check failed", e);
    }

    return { id: inserted.id };
  });

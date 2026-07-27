import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "@/components/Dashboard";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Meus Gastos — dashboard financeiro" },
      {
        name: "description",
        content: "Controle gastos pelo celular com lançamentos por voz, comprovantes, cartões, dashboards mensal e anual.",
      },
      { property: "og:title", content: "Meus Gastos — dashboard financeiro" },
      {
        property: "og:description",
        content: "Controle gastos pelo celular com lançamentos por voz, comprovantes, cartões, dashboards mensal e anual.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Dashboard,
});

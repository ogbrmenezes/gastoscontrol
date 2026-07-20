import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Conta criada! Você já está dentro.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) toast.error("Falha no login com Google");
    if (!result.redirected && !result.error) navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm p-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Meus Gastos</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signin" ? "Entre para continuar" : "Crie sua conta"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogle}>
          Continuar com Google
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "signin" ? "Não tem conta?" : "Já tem conta?"}{" "}
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Criar conta" : "Entrar"}
          </button>
        </p>
      </Card>
    </div>
  );
}

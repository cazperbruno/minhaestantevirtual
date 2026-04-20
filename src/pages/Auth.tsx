import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Mail, ChevronRight } from "lucide-react";
import readifyMark from "@/assets/readify-mark-v8.png";

export default function Auth() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<null | "google" | "apple" | "email">(null);

  if (loading) return <FullPageLoader />;
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("email");
    try {
      if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        // Resgatar convite (se veio via ?ref=CODIGO)
        const refCode = new URLSearchParams(window.location.search).get("ref");
        if (refCode && signUpData.user?.id) {
          await supabase.rpc("redeem_invite", { _code: refCode, _new_user_id: signUpData.user.id });
        }
        toast.success("Conta criada. Bem-vindo ao Readify.");
        navigate("/");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Bem-vindo de volta.");
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro de autenticação");
    } finally {
      setBusy(null);
    }
  };

  const oauth = async (provider: "google" | "apple") => {
    setBusy(provider);
    const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error(`Falha ao entrar com ${provider === "google" ? "Google" : "Apple"}`);
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-10 bg-background">
      <div className="w-full max-w-sm flex flex-col items-center text-center animate-scale-in">
        {/* Logo + brand */}
        <img
          src={readifyMark}
          alt="Readify"
          className="h-28 w-auto select-none mb-6 animate-float-soft"
          draggable={false}
        />
        <h1 className="font-display text-[44px] leading-none tracking-tight text-foreground">Readify</h1>
        <p className="mt-3 text-[15px] text-muted-foreground/90">Descubra, organize e viva a leitura.</p>

        {/* Primary actions */}
        <div className="w-full mt-10 space-y-2.5">
          <Button
            type="button"
            size="lg"
            disabled={busy !== null}
            onClick={() => oauth("google")}
            className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-glow tap-scale gap-2"
          >
            {busy === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
            Começar
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy !== null}
            onClick={() => oauth("google")}
            className="w-full h-12 rounded-full border-border bg-card hover:bg-card/80 text-foreground font-medium gap-2 tap-scale"
          >
            {busy === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
            Continuar com Google
          </Button>

          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy !== null}
            onClick={() => oauth("apple")}
            className="w-full h-12 rounded-full border-border bg-card hover:bg-card/80 text-foreground font-medium gap-2 tap-scale"
          >
            {busy === "apple" ? <Loader2 className="w-4 h-4 animate-spin" /> : <AppleIcon />}
            Continuar com Apple
          </Button>

          <button
            type="button"
            onClick={() => setShowEmail((v) => !v)}
            className="w-full pt-3 text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5" />
            {showEmail ? "Ocultar e-mail" : "Entrar com e-mail"}
          </button>
        </div>

        {/* Email/password collapsed */}
        {showEmail && (
          <div className="w-full mt-4 glass rounded-2xl p-5 text-left animate-fade-in">
            <div className="flex gap-1 p-1 bg-muted/40 rounded-full mb-5">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${
                  mode === "login" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                }`}
              >Entrar</button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-all ${
                  mode === "signup" ? "bg-card text-foreground shadow-card" : "text-muted-foreground"
                }`}
              >Criar conta</button>
            </div>
            <form onSubmit={submit} className="space-y-3">
              {mode === "signup" && (
                <div>
                  <Label htmlFor="name" className="text-xs">Nome</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className="mt-1 h-11 rounded-xl" />
                </div>
              )}
              <div>
                <Label htmlFor="email" className="text-xs">E-mail</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 h-11 rounded-xl" />
              </div>
              <div>
                <Label htmlFor="password" className="text-xs">Senha</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1 h-11 rounded-xl" />
              </div>
              <Button type="submit" disabled={busy !== null} size="lg" className="w-full h-11 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium">
                {busy === "email" && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                {mode === "signup" ? "Criar conta" : "Entrar"}
              </Button>
            </form>
          </div>
        )}

        <p className="mt-10 text-[11px] text-muted-foreground/70 leading-relaxed">
          Ao continuar, você concorda com os Termos e a Política de Privacidade do Readify.
        </p>
      </div>
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.93v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.93A9 9 0 0 0 0 9c0 1.45.35 2.83.93 4.05l3.04-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.58-2.58A9 9 0 0 0 .93 4.95l3.04 2.33C4.68 5.16 6.66 3.58 9 3.58Z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.456 2.241-1.205 3.04-.815.873-2.13 1.528-3.214 1.443-.137-1.114.43-2.276 1.16-3.027C13.97 1.946 15.32 1.27 16.365 1.43Zm3.4 17.005c-.566 1.318-.838 1.905-1.566 3.07-1.018 1.622-2.45 3.643-4.232 3.66-1.583.014-1.99-1.026-4.137-1.014-2.148.013-2.595 1.034-4.18 1.02-1.78-.018-3.137-1.847-4.155-3.47-2.846-4.547-3.142-9.886-1.388-12.722 1.247-2.013 3.214-3.193 5.062-3.193 1.882 0 3.066 1.029 4.62 1.029 1.51 0 2.43-1.03 4.605-1.03 1.643 0 3.385.895 4.625 2.44-4.066 2.226-3.405 8.024.345 10.21Z"/>
    </svg>
  );
}

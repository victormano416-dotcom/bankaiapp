import { useState, type FormEvent } from "react";
import { supabase } from "@/supabase";

type Mode = "in" | "up" | "forgot" | "reset";

const inputClass = "h-12 w-full rounded-2xl bg-surface px-4 text-base outline-none ring-1 ring-line focus:ring-accent";

function friendly(message?: string): string {
  const text = (message ?? "").toLowerCase();
  if (text.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (text.includes("already") || text.includes("registered")) return "Este e-mail já tem conta. Toque em Entrar.";
  if (text.includes("at least") || text.includes("password")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (text.includes("not confirmed")) return "Confirme seu e-mail para entrar: veja o link na sua caixa de entrada.";
  if (text.includes("rate limit") || text.includes("too many")) return "Muitas tentativas. Espere um pouco e tente de novo.";
  if (text.includes("fetch") || text.includes("network")) return "Sem conexão com o servidor. Confira sua internet.";
  if (text.includes("email")) return "Digite um e-mail válido.";
  return "Não deu certo. Tente de novo.";
}

export function AuthScreen({ recovery = false }: { recovery?: boolean }) {
  const [mode, setMode] = useState<Mode>(recovery ? "reset" : "up");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const titles: Record<Mode, string> = {
    up: "Crie seu caixa.",
    in: "Bem-vindo de volta.",
    forgot: "Recuperar senha.",
    reset: "Escolha uma nova senha.",
  };
  const labels: Record<Mode, string> = { up: "Criar conta", in: "Entrar", forgot: "Enviar link", reset: "Salvar nova senha" };

  function go(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setInfo("");
    const needsEmail = mode !== "reset";
    const needsPassword = mode !== "forgot";
    if (needsEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Digite um e-mail válido.");
    if (needsPassword && password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");

    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error: failure } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: name.trim() } },
        });
        if (failure) return setError(friendly(failure.message));
        if (!data.session) {
          if (data.user && data.user.identities?.length === 0) return setError("Este e-mail já tem conta. Toque em Entrar.");
          setInfo(`Conta criada! Enviamos um link de confirmação para ${email.trim()}. Confirme e depois toque em Entrar.`);
          setMode("in");
        }
      } else if (mode === "in") {
        const { error: failure } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (failure) setError(friendly(failure.message));
      } else if (mode === "forgot") {
        const { error: failure } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (failure) return setError(friendly(failure.message));
        setInfo("Se existir uma conta com esse e-mail, enviamos o link para criar uma nova senha.");
      } else {
        const { error: failure } = await supabase.auth.updateUser({ password });
        if (failure) return setError(friendly(failure.message));
        // o Supabase avisa a mudança de sessão e o app abre sozinho
      }
    } catch (failure) {
      setError(friendly(failure instanceof Error ? failure.message : undefined));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <p className="wordmark text-xs text-muted">Bankai</p>
      <h1 className="mt-4 text-4xl font-medium tracking-tight">{titles[mode]}</h1>
      <p className="mt-3 text-sm text-muted">Entradas, gastos e a fatura do cartão no mesmo lugar.</p>
      <form onSubmit={submit} className="mt-8 space-y-3" noValidate>
        {mode === "up" ? (
          <>
            <label htmlFor="auth-name" className="sr-only">Seu nome</label>
            <input id="auth-name" className={inputClass} placeholder="Seu nome" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </>
        ) : null}
        {mode !== "reset" ? (
          <>
            <label htmlFor="auth-email" className="sr-only">E-mail</label>
            <input
              id="auth-email"
              className={inputClass}
              placeholder="E-mail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </>
        ) : null}
        {mode !== "forgot" ? (
          <>
            <label htmlFor="auth-password" className="sr-only">{mode === "reset" ? "Nova senha (mínimo 8 caracteres)" : "Senha (mínimo 8 caracteres)"}</label>
            <input
              id="auth-password"
              className={inputClass}
              placeholder={mode === "reset" ? "Nova senha (mínimo 8 caracteres)" : "Senha (mínimo 8 caracteres)"}
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="text-sm text-muted" role="status">
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="h-12 w-full rounded-full bg-accent text-sm font-medium text-accent-fg transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "Aguarde…" : labels[mode]}
        </button>
      </form>
      {mode !== "reset" ? (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <button type="button" onClick={() => go(mode === "up" ? "in" : "up")}>
            {mode === "up" ? "Já tenho conta" : "Criar uma conta"}
          </button>
          {mode === "in" ? (
            <button type="button" onClick={() => go("forgot")}>
              Esqueci a senha
            </button>
          ) : mode === "forgot" ? (
            <button type="button" onClick={() => go("in")}>
              Voltar
            </button>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

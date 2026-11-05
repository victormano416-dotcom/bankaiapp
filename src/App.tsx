import { AuthScreen } from "@/auth/auth-screen";
import { useSession } from "@/auth/session";
import { AppShell } from "@/components/finance/shell";
import { FinanceProvider } from "@/components/finance/provider";
import { Boot } from "@/components/finance/ui";
import { supabaseReady } from "@/supabase";

function SetupNeeded() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-medium">Falta ligar o banco de dados.</h1>
      <p className="mt-3 text-sm text-muted">
        Crie um arquivo <code>.env</code> com <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> (veja o{" "}
        <code>.env.example</code>) e reinicie. Na Vercel, cadastre as mesmas variáveis e publique de novo.
      </p>
    </main>
  );
}

export default function App() {
  const session = useSession();
  if (!supabaseReady) return <SetupNeeded />;
  if (session.status === "loading") return <Boot />;
  if (session.status === "recovery") return <AuthScreen key="reset" recovery />;
  if (session.status === "out") return <AuthScreen key="login" />;
  return (
    <FinanceProvider key={session.user.id} user={session.user}>
      <AppShell />
    </FinanceProvider>
  );
}

import {
  type FormEvent,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  Check,
  CircleDollarSign,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Home,
  Link2,
  LogIn,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trash2,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Link,
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from "wouter";

type Expense = {
  id: string;
  name: string;
  category: string;
  amount: number;
  date: string;
};
type Resource = {
  id: string;
  title: string;
  detail: string;
  kind: "Link" | "Note";
  createdAt: string;
};
type ProgressRecord = {
  id: string;
  subject: string;
  minutes: number;
  accuracy: number;
  date: string;
};
type Account = {
  syncId: string;
  name: string;
  email: string;
  password: string;
  expenses: Expense[];
  resources: Resource[];
  joinedGroups: string[];
  progress: ProgressRecord[];
};
type AppContextValue = {
  account: Account | null;
  authenticated: boolean;
  createAccount: (name: string, email: string, password: string) => void;
  login: (email: string, password: string) => boolean;
  updateAccount: (updater: (account: Account) => Account) => void;
  logout: () => void;
  reset: () => void;
};

const STORAGE_KEY = "unibuddy-account-v1";
const ACTIVE_KEY = "unibuddy-active-v1";
const LEGACY_STORAGE_KEY = "consigliere-account-v1";
const LEGACY_ACTIVE_KEY = "consigliere-active-v1";
const queryClient = new QueryClient();
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(
  /\/$/,
  "",
);
const API_PREFIX = API_BASE_URL ? "" : "/api";
const apiUrl = (path: string) => `${API_BASE_URL}${API_PREFIX}${path}`;
const localAssistantReply = (text: string) => {
  const lower = text.toLowerCase();
  if (
    lower.includes("budget") ||
    lower.includes("money") ||
    lower.includes("spend")
  )
    return "Start with the essentials, choose a small weekly limit, and leave yourself a little breathing room. I can help turn your recent expenses into a simple plan once AWS is connected.";
  if (
    lower.includes("study") ||
    lower.includes("exam") ||
    lower.includes("focus")
  )
    return "Pick one clear outcome for your next study block, work for 25–45 minutes, then take a short break. Consistency usually beats trying to rescue everything in one sitting.";
  if (
    lower.includes("hard") ||
    lower.includes("conversation") ||
    lower.includes("talk")
  )
    return "Start with what you know, use “I” statements, and ask the other person one honest question. You do not need the perfect opening—just a clear one.";
  return "Let’s make the next step smaller. Tell me what you are trying to decide or finish, and I will help you turn it into something concrete.";
};
const AppContext = createContext<AppContextValue | null>(null);
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);

function useUniBuddy() {
  const context = useContext(AppContext);
  if (!context) throw new Error("UniBuddy context is missing");
  return context;
}

function AppProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<Account>;
      const next = {
        syncId: parsed.syncId ?? crypto.randomUUID(),
        name: parsed.name ?? "",
        email: parsed.email ?? "",
        password: parsed.password ?? "",
        expenses: parsed.expenses ?? [],
        resources: parsed.resources ?? [],
        joinedGroups: parsed.joinedGroups ?? [],
        progress: parsed.progress ?? [],
      } satisfies Account;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    } catch {
      return null;
    }
  });
  const [authenticated, setAuthenticated] = useState(() => {
    const active =
      localStorage.getItem(ACTIVE_KEY) ??
      localStorage.getItem(LEGACY_ACTIVE_KEY);
    if (active && !localStorage.getItem(ACTIVE_KEY))
      localStorage.setItem(ACTIVE_KEY, active);
    return active === "true";
  });

  const syncToAws = async (next: Account) => {
    try {
      await fetch(apiUrl(`/state/${encodeURIComponent(next.syncId)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: next.syncId,
          name: next.name,
          email: next.email,
          expenses: next.expenses,
          resources: next.resources,
          joinedGroups: next.joinedGroups,
          progress: next.progress,
        }),
      });
    } catch {
      // Local state remains available when the network is offline.
    }
  };

  useEffect(() => {
    if (!authenticated || !account?.syncId) return;
    let cancelled = false;
    const hydrate = async () => {
      try {
        const response = await fetch(
          apiUrl(`/state/${encodeURIComponent(account.syncId)}`),
        );
        if (!response.ok) {
          if (response.status === 404) await syncToAws(account);
          return;
        }
        const cloud = (await response.json()) as Omit<Account, "password">;
        if (cancelled) return;
        const next: Account = {
          ...account,
          ...cloud,
          password: account.password,
        };
        setAccount(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Keep the browser copy when AWS is unavailable.
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [authenticated, account?.syncId]);

  const persist = (next: Account | null) => {
    setAccount(next);
    if (next) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      void syncToAws(next);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const value = useMemo<AppContextValue>(
    () => ({
      account,
      authenticated: authenticated && !!account,
      createAccount: (name, email, password) => {
        const next: Account = {
          syncId: crypto.randomUUID(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          expenses: [],
          resources: [],
          joinedGroups: [],
          progress: [],
        };
        persist(next);
        setAuthenticated(true);
        localStorage.setItem(ACTIVE_KEY, "true");
      },
      login: (email, password) => {
        if (
          !account ||
          account.email !== email.trim().toLowerCase() ||
          account.password !== password
        )
          return false;
        setAuthenticated(true);
        localStorage.setItem(ACTIVE_KEY, "true");
        return true;
      },
      updateAccount: (updater) => {
        if (account) persist(updater(account));
      },
      logout: () => {
        setAuthenticated(false);
        localStorage.removeItem(ACTIVE_KEY);
      },
      reset: () => {
        persist(null);
        setAuthenticated(false);
        localStorage.removeItem(ACTIVE_KEY);
      },
    }),
    [account, authenticated],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const navItems: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/budget", label: "Budget", icon: CircleDollarSign },
  { href: "/resources", label: "Resources", icon: BookOpen },
  { href: "/assistant", label: "Ask UniBuddy", icon: Bot },
  { href: "/study-groups", label: "Study groups", icon: Users },
  { href: "/progress", label: "Progress", icon: BarChart3 },
];

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/dashboard"
      className={`flex items-center gap-3 ${compact ? "" : "focus-ring"}`}
      data-testid="link-logo"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-[0_8px_18px_hsl(var(--primary)/.16)]">
        <Compass size={19} strokeWidth={2.5} />
      </span>
      {!compact && (
        <span className="serif text-[1.35rem] font-semibold tracking-[-.03em]">
          UniBuddy
        </span>
      )}
    </Link>
  );
}

function AppShell({ children }: { children: ReactNode }) {
  const { account, logout, reset } = useUniBuddy();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current =
    navItems.find((item) => location === item.href)?.label ?? "Overview";
  const initials =
    account?.name
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "C";
  const handleLogout = () => {
    logout();
    setLocation("/");
  };
  const handleReset = () => {
    if (window.confirm("Reset this local account and all of its data?")) {
      reset();
      setLocation("/");
    }
  };
  return (
    <div className="paper-texture min-h-[100dvh] bg-[hsl(var(--background))]">
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[252px] flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--background)/.92)] px-5 py-6 backdrop-blur-xl transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            className="btn-quiet h-9 w-9 p-0 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            data-testid="button-close-menu"
          >
            <X size={17} />
          </button>
        </div>
        <div className="mt-12">
          <p className="eyebrow px-3">Your command center</p>
          <nav className="mt-3 space-y-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = location === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/.7)] hover:text-[hsl(var(--foreground))]"}`}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
                >
                  <Icon
                    size={17}
                    className={active ? "text-[hsl(var(--primary))]" : ""}
                  />{" "}
                  <span>{item.label}</span>
                  {active && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--accent))]" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="mt-auto rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] p-3.5">
          <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
            A small note
          </p>
          <p className="serif mt-2 text-[1.08rem] leading-tight">
            “The next good decision is enough.”
          </p>
          <div className="mt-3 h-px bg-[hsl(var(--border))]" />
          <button
            onClick={handleReset}
            className="mt-3 flex w-full items-center gap-2 text-left text-xs font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
            data-testid="button-reset-account"
          >
            <RotateCcw size={13} /> Reset local account
          </button>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--accent))] text-sm font-extrabold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">{account?.name}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
              {account?.email}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            aria-label="Log out"
            data-testid="button-logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="fixed inset-0 z-30 bg-[hsl(var(--foreground)/.18)] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close navigation overlay"
          data-testid="button-overlay"
        />
      )}
      <main className="min-h-[100dvh] lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[hsl(var(--border)/.72)] bg-[hsl(var(--background)/.82)] px-5 backdrop-blur-xl sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <button
              className="btn-quiet h-9 w-9 p-0 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              data-testid="button-open-menu"
            >
              <Menu size={18} />
            </button>
            <span className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">
              {current}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:inline">
              Take it one decision at a time
            </span>
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />
          </div>
        </header>
        <div className="mx-auto max-w-[1260px] px-5 py-9 sm:px-8 lg:px-12 lg:py-12">
          {children}
        </div>
      </main>
      <nav className="fixed inset-x-3 bottom-3 z-20 flex justify-around rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.94)] p-2 shadow-[var(--shadow-float)] backdrop-blur-xl lg:hidden">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              href={item.href}
              key={item.href}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ${location === item.href ? "text-[hsl(var(--primary))]" : "text-[hsl(var(--muted-foreground))]"}`}
              data-testid={`mobile-nav-${item.label.toLowerCase().replaceAll(" ", "-")}`}
            >
              <Icon size={16} />
              <span>{item.label === "Ask UniBuddy" ? "Ask" : item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { authenticated } = useUniBuddy();
  const [, setLocation] = useLocation();
  useEffect(() => {
    if (!authenticated) setLocation("/login");
  }, [authenticated, setLocation]);
  return authenticated ? (
    <AppShell>{children}</AppShell>
  ) : (
    <div className="min-h-[100dvh] bg-[hsl(var(--background))]" />
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        <p className="eyebrow animate-rise-in">{eyebrow}</p>
        <h1 className="serif mt-2 text-4xl font-semibold tracking-[-.045em] text-[hsl(var(--foreground))] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-[.94rem] leading-7 text-[hsl(var(--muted-foreground))]">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

function Welcome() {
  const [, setLocation] = useLocation();
  return (
    <div className="paper-texture grid min-h-[100dvh] overflow-hidden lg:grid-cols-[1.1fr_.9fr]">
      <section className="relative flex flex-col justify-between overflow-hidden px-6 py-7 sm:px-12 sm:py-10 lg:px-20 lg:py-12">
        <div>
          <Logo />
        </div>
        <div className="relative z-10 my-20 max-w-2xl lg:my-0">
          <p className="eyebrow animate-rise-in">A place to think clearly</p>
          <h1 className="serif mt-5 max-w-2xl text-[clamp(3.4rem,8vw,7.25rem)] font-semibold leading-[.92] tracking-[-.065em] animate-rise-in delay-1">
            Make room for the{" "}
            <em className="text-[hsl(var(--primary))]">next good decision.</em>
          </h1>
          <p className="mt-7 max-w-md text-base leading-7 text-[hsl(var(--muted-foreground))] animate-rise-in delay-2">
            UniBuddy is a quiet command center for the practical parts of
            student life — money, momentum, people, and the questions in
            between.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row animate-rise-in delay-3">
            <button
              onClick={() => setLocation("/create-account")}
              className="btn-primary"
              data-testid="button-create-account"
            >
              <span>Start with a clean slate</span>
              <ArrowRight size={16} />
            </button>
            <button
              onClick={() => setLocation("/login")}
              className="btn-quiet"
              data-testid="button-login"
            >
              <LogIn size={16} /> Log in
            </button>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-xs font-bold text-[hsl(var(--muted-foreground))] lg:flex">
          <span className="h-px w-9 bg-[hsl(var(--accent))]" /> Built for the
          in-between moments
        </div>
        <div className="pointer-events-none absolute -bottom-28 -right-32 h-[460px] w-[460px] rounded-full border-[46px] border-[hsl(var(--accent)/.28)]" />
      </section>
      <section className="relative flex min-h-[420px] items-center justify-center overflow-hidden bg-[hsl(var(--primary))] px-7 py-14 text-[hsl(var(--primary-foreground))] sm:px-14">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "radial-gradient(circle at 75% 20%, hsl(36 85% 80% / .6), transparent 30%), linear-gradient(125deg, transparent 40%, hsl(43 42% 94% / .08) 40%, transparent 41%)",
          }}
        />
        <div className="relative max-w-md animate-rise-in delay-2">
          <p className="mono text-xs uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            The UniBuddy principle / 01
          </p>
          <p className="serif mt-7 text-[clamp(2.3rem,5vw,4.7rem)] leading-[.98] tracking-[-.05em]">
            “You do not need a perfect plan. You need a place to put the next
            step.”
          </p>
          <div className="mt-10 flex items-center gap-3 text-sm text-[hsl(var(--primary-foreground)/.72)]">
            <span className="h-9 w-9 rounded-full border border-[hsl(var(--accent)/.6)]" />
            <span>
              Private by default.
              <br />
              Yours to shape.
            </span>
          </div>
        </div>
        <div className="absolute -right-20 -top-16 h-56 w-56 rounded-full border border-[hsl(var(--accent)/.35)]" />
      </section>
    </div>
  );
}

function AuthFrame({
  children,
  title,
  detail,
  step,
}: {
  children: ReactNode;
  title: string;
  detail: string;
  step?: string;
}) {
  const [, setLocation] = useLocation();
  return (
    <div className="paper-texture flex min-h-[100dvh] items-center justify-center px-5 py-8 sm:px-8">
      <div className="w-full max-w-[1000px] overflow-hidden rounded-[1.75rem] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] shadow-[var(--shadow-float)] lg:grid lg:grid-cols-[.8fr_1.2fr]">
        <div className="hidden flex-col justify-between bg-[hsl(var(--primary))] p-10 text-[hsl(var(--primary-foreground))] lg:flex">
          <Logo />
          <div>
            <p className="eyebrow text-[hsl(var(--accent))]">
              A quieter starting point
            </p>
            <p className="serif mt-5 text-5xl leading-[.98] tracking-[-.05em]">
              Good systems leave more room for living.
            </p>
          </div>
          <p className="text-xs leading-5 text-[hsl(var(--primary-foreground)/.64)]">
            Your workspace is saved locally and synced to AWS when you are
            online.
          </p>
        </div>
        <div className="p-7 sm:p-12">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setLocation("/")}
              className="flex items-center gap-2 text-sm font-bold text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              data-testid="button-back-home"
            >
              <ArrowLeft size={16} /> Back
            </button>
            {step && (
              <span className="mono text-xs text-[hsl(var(--muted-foreground))]">
                {step}
              </span>
            )}
          </div>
          <div className="mt-14 max-w-md">
            <p className="eyebrow">
              {title === "Welcome back"
                ? "Pick up where you left off"
                : "A clean start"}
            </p>
            <h1 className="serif mt-3 text-4xl font-semibold tracking-[-.045em]">
              {title}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              {detail}
            </p>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateAccount() {
  const { createAccount } = useUniBuddy();
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.includes("@") || password.length < 4) {
      setError(
        "Add your name, a valid email, and a password with at least 4 characters.",
      );
      return;
    }
    createAccount(name, email, password);
    setLocation("/dashboard");
  };
  return (
    <AuthFrame
      title="Create your account"
      detail="Start with an empty room. Add only the things that help you make the next good decision."
      step="01 / 01"
    >
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-bold">
          Your name
          <input
            className="field mt-2"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How should we greet you?"
            data-testid="input-create-name"
          />
        </label>
        <label className="block text-sm font-bold">
          Email
          <input
            className="field mt-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            data-testid="input-create-email"
          />
        </label>
        <label className="block text-sm font-bold">
          Password
          <input
            className="field mt-2"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 4 characters"
            data-testid="input-create-password"
          />
        </label>
        {error && (
          <p
            className="text-sm font-semibold text-[hsl(var(--destructive))]"
            data-testid="status-create-error"
          >
            {error}
          </p>
        )}
        <button
          className="btn-primary mt-2 w-full"
          type="submit"
          data-testid="button-submit-create"
        >
          Create my space <ArrowRight size={16} />
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-[hsl(var(--muted-foreground))]">
        Already have an account?{" "}
        <Link
          className="font-bold text-[hsl(var(--primary))] hover:underline"
          href="/login"
          data-testid="link-to-login"
        >
          Log in
        </Link>
      </p>
    </AuthFrame>
  );
}

function Login() {
  const { login, account } = useUniBuddy();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState(account?.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!login(email, password)) {
      setError("That email and password do not match the local account.");
      return;
    }
    setLocation("/dashboard");
  };
  return (
    <AuthFrame
      title="Welcome back"
      detail={
        account
          ? "Your local space is waiting exactly where you left it."
          : "No local account found yet. Create one and begin with a clean slate."
      }
    >
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm font-bold">
          Email
          <input
            className="field mt-2"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            data-testid="input-login-email"
          />
        </label>
        <label className="block text-sm font-bold">
          Password
          <input
            className="field mt-2"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your local password"
            data-testid="input-login-password"
          />
        </label>
        {error && (
          <p
            className="text-sm font-semibold text-[hsl(var(--destructive))]"
            data-testid="status-login-error"
          >
            {error}
          </p>
        )}
        <button
          className="btn-primary mt-2 w-full"
          type="submit"
          data-testid="button-submit-login"
        >
          <LogIn size={16} /> Log in
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-[hsl(var(--muted-foreground))]">
        New here?{" "}
        <Link
          className="font-bold text-[hsl(var(--primary))] hover:underline"
          href="/create-account"
          data-testid="link-to-create-account"
        >
          Create an account
        </Link>
      </p>
    </AuthFrame>
  );
}

function Dashboard() {
  const { account } = useUniBuddy();
  if (!account) return null;
  const total = account.expenses.reduce((sum, item) => sum + item.amount, 0);
  const quick: {
    href: string;
    label: string;
    detail: string;
    icon: LucideIcon;
    tone: string;
  }[] = [
    {
      href: "/budget",
      label: "Budget",
      detail: total
        ? `${formatCurrency(total)} tracked`
        : "Give your money a place",
      icon: Wallet,
      tone: "bg-[hsl(var(--secondary))]",
    },
    {
      href: "/resources",
      label: "Resources",
      detail: `${account.resources.length} saved for later`,
      icon: BookOpen,
      tone: "bg-[hsl(var(--accent)/.42)]",
    },
    {
      href: "/assistant",
      label: "Ask UniBuddy",
      detail: "Think something through",
      icon: Sparkles,
      tone: "bg-[hsl(var(--primary)/.12)]",
    },
    {
      href: "/study-groups",
      label: "Study groups",
      detail: account.joinedGroups.length
        ? `${account.joinedGroups.length} group${account.joinedGroups.length > 1 ? "s" : ""} joined`
        : "Find your people",
      icon: Users,
      tone: "bg-[hsl(270 42% 24%)]",
    },
    {
      href: "/progress",
      label: "Progress",
      detail: account.progress.length
        ? `${account.progress.reduce((s, p) => s + p.minutes, 0)} minutes logged`
        : "Start when you are ready",
      icon: Target,
      tone: "bg-[hsl(293 45% 24%)]",
    },
  ];
  return (
    <div className="animate-soft-in">
      <div className="flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">
            Good to see you, {account.name.split(" ")[0]}
          </p>
          <h1 className="serif mt-2 text-5xl font-semibold tracking-[-.055em]">
            What needs your attention?
          </h1>
          <p className="mt-3 text-[.94rem] leading-7 text-[hsl(var(--muted-foreground))]">
            A gentle overview of the things you are carrying right now.
          </p>
        </div>
        <span className="mono text-xs text-[hsl(var(--muted-foreground))]">
          AWS-SYNCED SPACE /{" "}
          {new Date()
            .toLocaleDateString(undefined, { month: "short", day: "2-digit" })
            .toUpperCase()}
        </span>
      </div>
      <div className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quick.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              href={item.href}
              key={item.href}
              className={`card-lift group relative overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.72)] p-5 ${index === 0 ? "lg:col-span-2" : ""}`}
              data-testid={`card-quick-${item.label.toLowerCase().replaceAll(" ", "-")}`}
            >
              <span
                className={`mb-12 flex h-10 w-10 items-center justify-center rounded-xl ${item.tone}`}
              >
                <Icon size={19} />
              </span>
              <p className="text-lg font-extrabold tracking-[-.02em]">
                {item.label}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {item.detail}
              </p>
              <span className="absolute bottom-5 right-5 flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] transition-transform group-hover:translate-x-1">
                <ArrowRight size={15} />
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_.7fr]">
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] sm:p-8">
          <p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--accent))]">
            A thought for today
          </p>
          <p className="serif mt-8 max-w-2xl text-3xl leading-tight tracking-[-.035em]">
            You are allowed to make progress that nobody else can see yet.
          </p>
          <Link
            href="/assistant"
            className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))] hover:gap-3"
            data-testid="link-dashboard-assistant"
          >
            Talk it through <ArrowRight size={15} />
          </Link>
        </section>
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.65)] p-6 sm:p-8">
          <p className="eyebrow">At a glance</p>
          <div className="mt-6 space-y-5">
            <Stat
              label="Spent so far"
              value={formatCurrency(total)}
              icon={CircleDollarSign}
            />
            <Stat
              label="Saved resources"
              value={String(account.resources.length)}
              icon={BookOpen}
            />
            <Stat
              label="Study minutes"
              value={String(
                account.progress.reduce((sum, item) => sum + item.minutes, 0),
              )}
              icon={BarChart3}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--secondary))]">
        <Icon size={16} />
      </span>
      <div>
        <p className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
          {label}
        </p>
        <p className="mono mt-0.5 text-lg font-medium">{value}</p>
      </div>
    </div>
  );
}

function Budget() {
  const { account, updateAccount } = useUniBuddy();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Essentials");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  if (!account) return null;
  const total = account.expenses.reduce((sum, item) => sum + item.amount, 0);
  const add = (event: FormEvent) => {
    event.preventDefault();
    const value = Number(amount);
    if (!name.trim() || !value || value < 0) {
      setError("Add an expense name and an amount greater than zero.");
      return;
    }
    updateAccount((current) => ({
      ...current,
      expenses: [
        {
          id: crypto.randomUUID(),
          name: name.trim(),
          category,
          amount: value,
          date: new Date().toISOString(),
        },
        ...current.expenses,
      ],
    }));
    setName("");
    setAmount("");
    setError("");
  };
  const remove = (id: string) =>
    updateAccount((current) => ({
      ...current,
      expenses: current.expenses.filter((item) => item.id !== id),
    }));
  return (
    <div className="animate-soft-in">
      <PageIntro
        eyebrow="Money, without the shame"
        title="Budget"
        description="A simple record of where your money went. No judgment, just a clearer next choice."
      />
      <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8">
          <p className="eyebrow">Add an expense</p>
          <form onSubmit={add} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">
              What was it?
              <input
                className="field mt-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Groceries, train ticket..."
                data-testid="input-expense-name"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Amount in INR
                <input
                  className="field mt-2"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  data-testid="input-expense-amount"
                />
              </label>
              <label className="block text-sm font-bold">
                Category
                <select
                  className="field mt-2"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  data-testid="select-expense-category"
                >
                  <option>Essentials</option>
                  <option>Study</option>
                  <option>Travel</option>
                  <option>Wellbeing</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
            {error && (
              <p
                className="text-sm font-semibold text-[hsl(var(--destructive))]"
                data-testid="status-expense-error"
              >
                {error}
              </p>
            )}
            <button
              type="submit"
              className="btn-primary mt-2 w-full"
              data-testid="button-add-expense"
            >
              <Plus size={16} /> Add expense
            </button>
          </form>
        </section>
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">This space</p>
              <p
                className="mono mt-2 text-4xl font-medium tracking-[-.06em]"
                data-testid="text-budget-total"
              >
                {formatCurrency(total)}
              </p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                {account.expenses.length
                  ? `${account.expenses.length} entr${account.expenses.length === 1 ? "y" : "ies"} recorded`
                  : "Nothing recorded yet"}
              </p>
            </div>
            <CircleDollarSign
              className="text-[hsl(var(--primary))]"
              size={25}
            />
          </div>
          <div className="mt-8 border-t border-[hsl(var(--border))] pt-4">
            {account.expenses.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="Your first entry can be tiny."
                detail="A coffee, a bus ride, or the thing you keep forgetting to count. Start anywhere."
              />
            ) : (
              <div className="space-y-2">
                {account.expenses.map((item) => (
                  <div
                    className="group flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-[hsl(var(--muted)/.5)]"
                    key={item.id}
                    data-testid={`row-expense-${item.id}`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--secondary))]">
                      <Wallet size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">{item.name}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {item.category} ·{" "}
                        {new Date(item.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="mono text-sm">
                      {formatCurrency(item.amount)}
                    </span>
                    <button
                      onClick={() => remove(item.id)}
                      className="ml-2 rounded-lg p-2 text-[hsl(var(--muted-foreground))] opacity-50 hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))] group-hover:opacity-100"
                      aria-label={`Remove ${item.name}`}
                      data-testid={`button-remove-expense-${item.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Resources() {
  const { account, updateAccount } = useUniBuddy();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [kind, setKind] = useState<"Link" | "Note">("Link");
  const [error, setError] = useState("");
  if (!account) return null;
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !detail.trim()) {
      setError(
        kind === "Link"
          ? "Add a title and paste the link."
          : "Add a title and a note.",
      );
      return;
    }
    updateAccount((current) => ({
      ...current,
      resources: [
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          detail: detail.trim(),
          kind,
          createdAt: new Date().toISOString(),
        },
        ...current.resources,
      ],
    }));
    setTitle("");
    setDetail("");
    setError("");
  };
  return (
    <div className="animate-soft-in">
      <PageIntro
        eyebrow="Keep the useful close"
        title="Resources"
        description="Save the link, note, or small piece of context you will be glad to find again."
        action={
          <button
            onClick={() =>
              document
                .getElementById("resource-form")
                ?.scrollIntoView({ behavior: "smooth" })
            }
            className="btn-primary"
            data-testid="button-jump-add-resource"
          >
            <Plus size={16} /> Add resource
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <section
          id="resource-form"
          className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8"
        >
          <p className="eyebrow">Save something</p>
          <form onSubmit={add} className="mt-6 space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-[hsl(var(--muted)/.72)] p-1">
              <button
                type="button"
                onClick={() => setKind("Link")}
                className={`rounded-lg py-2 text-sm font-bold ${kind === "Link" ? "bg-[hsl(var(--card))] shadow-sm" : "text-[hsl(var(--muted-foreground))]"}`}
                data-testid="button-resource-kind-link"
              >
                A link
              </button>
              <button
                type="button"
                onClick={() => setKind("Note")}
                className={`rounded-lg py-2 text-sm font-bold ${kind === "Note" ? "bg-[hsl(var(--card))] shadow-sm" : "text-[hsl(var(--muted-foreground))]"}`}
                data-testid="button-resource-kind-note"
              >
                A note
              </button>
            </div>
            <label className="block text-sm font-bold">
              Title
              <input
                className="field mt-2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What should you remember?"
                data-testid="input-resource-title"
              />
            </label>
            <label className="block text-sm font-bold">
              {kind === "Link" ? "URL" : "Note"}
              {kind === "Link" ? (
                <input
                  className="field mt-2"
                  type="url"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="https://..."
                  data-testid="input-resource-detail"
                />
              ) : (
                <textarea
                  className="field mt-2 min-h-28 resize-y"
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  placeholder="A thought worth keeping..."
                  data-testid="input-resource-detail"
                />
              )}
            </label>
            {error && (
              <p
                className="text-sm font-semibold text-[hsl(var(--destructive))]"
                data-testid="status-resource-error"
              >
                {error}
              </p>
            )}
            <button
              className="btn-primary w-full"
              type="submit"
              data-testid="button-add-resource"
            >
              <Plus size={16} /> Save {kind.toLowerCase()}
            </button>
          </form>
        </section>
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Your shelf</p>
              <p
                className="mt-2 text-sm text-[hsl(var(--muted-foreground))]"
                data-testid="text-resource-count"
              >
                {account.resources.length} saved{" "}
                {account.resources.length === 1 ? "item" : "items"}
              </p>
            </div>
            <BookOpen className="text-[hsl(var(--primary))]" size={24} />
          </div>
          <div className="mt-7 space-y-3">
            {account.resources.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="A shelf waiting for good things."
                detail="Keep one useful article, a professor's advice, or a note to your future self."
              />
            ) : (
              account.resources.map((item) => (
                <div
                  className="group rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.38)] p-4 transition-colors hover:border-[hsl(var(--primary)/.3)]"
                  key={item.id}
                  data-testid={`card-resource-${item.id}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--secondary))]">
                      {item.kind === "Link" ? (
                        <Link2 size={15} />
                      ) : (
                        <FileText size={15} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{item.title}</p>
                      {item.kind === "Link" ? (
                        <a
                          className="mt-1 flex items-center gap-1 truncate text-sm text-[hsl(var(--primary))] hover:underline"
                          href={item.detail}
                          target="_blank"
                          rel="noreferrer"
                          data-testid={`link-resource-${item.id}`}
                        >
                          {item.detail}
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        updateAccount((current) => ({
                          ...current,
                          resources: current.resources.filter(
                            (resource) => resource.id !== item.id,
                          ),
                        }))
                      }
                      className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--destructive)/.1)] hover:text-[hsl(var(--destructive))]"
                      aria-label={`Remove ${item.title}`}
                      data-testid={`button-remove-resource-${item.id}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center px-5 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--primary))]">
        <Icon size={21} />
      </span>
      <p className="serif mt-4 text-xl font-semibold">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[hsl(var(--muted-foreground))]">
        {detail}
      </p>
    </div>
  );
}

type Message = { id: string; from: "you" | "guide"; text: string };
function Assistant() {
  const { account } = useUniBuddy();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      from: "guide",
      text: "I am here. Bring me the knot — a decision, a plan, or the thing you have been avoiding. We can give it a little shape together.",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const prompts = [
    "Help me plan a study week",
    "I need to make a tight budget",
    "How do I start a hard conversation?",
  ];
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || thinking || !account) return;
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), from: "you", text },
    ]);
    setDraft("");
    setThinking(true);
    try {
      if (!API_BASE_URL) {
        await new Promise((resolve) => window.setTimeout(resolve, 320));
        setMessages((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            from: "guide",
            text: localAssistantReply(text),
          },
        ]);
        return;
      }
      const response = await fetch(apiUrl("/assistant"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          context: {
            firstName: account.name.split(" ")[0],
            totalSpent: account.expenses.reduce(
              (sum, item) => sum + item.amount,
              0,
            ),
            recentExpenses: account.expenses
              .slice(0, 5)
              .map(({ name, category, amount }) => ({
                name,
                category,
                amount,
              })),
            savedResourceCount: account.resources.length,
            studyMinutes: account.progress.reduce(
              (sum, item) => sum + item.minutes,
              0,
            ),
          },
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!response.ok || !data.answer)
        throw new Error(data.error ?? "AI request failed");
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), from: "guide", text: data.answer! },
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "AI is temporarily unavailable.";
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), from: "guide", text: message },
      ]);
    } finally {
      setThinking(false);
    }
  };
  return (
    <div className="animate-soft-in">
      <PageIntro
        eyebrow="A second perspective"
        title="Ask UniBuddy"
        description="A private thinking partner for the questions that are easier to ask when nobody is grading the answer."
      />
      <div className="mx-auto max-w-3xl rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.62)] shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4 sm:px-7">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
            <Bot size={18} />
          </span>
          <div>
            <p className="text-sm font-extrabold">UniBuddy guide</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              Powered by Amazon Bedrock
            </p>
          </div>
          <span className="ml-auto flex items-center gap-2 text-xs font-semibold text-[hsl(var(--primary))]">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--primary))]" />{" "}
            Ready
          </span>
        </div>
        <div className="min-h-[390px] space-y-5 px-5 py-7 sm:px-9">
          {messages.map((message) => (
            <div
              className={`flex ${message.from === "you" ? "justify-end" : "justify-start"}`}
              key={message.id}
              data-testid={`message-${message.from}-${message.id}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7 ${message.from === "you" ? "rounded-br-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]" : "rounded-bl-md bg-[hsl(var(--secondary)/.62)]"}`}
              >
                {message.from === "you" ? (
  <p className="whitespace-pre-wrap">{message.text}</p>
) : (
  <ReactMarkdown
  remarkPlugins={[remarkGfm]}
  components={{
    h1: ({ children }) => (
      <h1 className="mt-4 mb-3 text-xl font-bold">
        {children}
      </h1>
    ),

    h2: ({ children }) => (
      <h2 className="mt-4 mb-2 text-lg font-bold">
        {children}
      </h2>
    ),

    h3: ({ children }) => (
      <h3 className="mt-3 mb-2 text-base font-semibold">
        {children}
      </h3>
    ),

    p: ({ children }) => (
      <p className="mb-3 leading-7">
        {children}
      </p>
    ),

    ul: ({ children }) => (
      <ul className="mb-3 list-disc space-y-1 pl-5">
        {children}
      </ul>
    ),

    ol: ({ children }) => (
      <ol className="mb-3 list-decimal space-y-1 pl-5">
        {children}
      </ol>
    ),

    li: ({ children }) => (
      <li className="leading-6">
        {children}
      </li>
    ),

    strong: ({ children }) => (
      <strong className="font-semibold">
        {children}
      </strong>
    ),

    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-4 pl-4 italic">
        {children}
      </blockquote>
    ),

    hr: () => (
      <hr className="my-5" />
    ),

    table: ({ children }) => (
      <div className="my-4 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {children}
        </table>
      </div>
    ),

    th: ({ children }) => (
      <th className="border px-3 py-2 text-left font-semibold">
        {children}
      </th>
    ),

    td: ({ children }) => (
      <td className="border px-3 py-2">
        {children}
      </td>
    ),
  }}
>
  {message.text}
</ReactMarkdown>
)}
              </div>
            </div>
          ))}
          {thinking && (
            <div
              className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"
              data-testid="status-assistant-thinking"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--accent))]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--accent))] [animation-delay:120ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[hsl(var(--accent))] [animation-delay:240ms]" />
            </div>
          )}
        </div>
        <div className="border-t border-[hsl(var(--border))] px-5 py-5 sm:px-7">
          <p className="mb-3 text-xs font-bold text-[hsl(var(--muted-foreground))]">
            Try starting with
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <button
                onClick={() => {
                  setDraft(prompt);
                }}
                className="btn-quiet px-3 py-2 text-xs"
                key={prompt}
                data-testid={`button-prompt-${prompt.slice(0, 8).replaceAll(" ", "-").toLowerCase()}`}
              >
                {prompt}
              </button>
            ))}
          </div>
          <form onSubmit={send} className="flex items-end gap-2">
            <textarea
              className="field min-h-[48px] resize-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="What is on your mind?"
              rows={1}
              data-testid="input-assistant-message"
            />
            <button
              type="submit"
              className="btn-primary h-12 w-12 shrink-0 p-0"
              aria-label="Send message"
              data-testid="button-send-message"
            >
              <Send size={17} />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const groups = [
  {
    id: "calculus",
    subject: "Calculus II",
    detail: "A patient weekly problem set circle.",
    day: "Tuesdays · 18:00",
    people: 6,
    color: "bg-[hsl(195 35% 84%)]",
  },
  {
    id: "writing",
    subject: "Academic writing",
    detail: "Bring a draft, leave with a clearer paragraph.",
    day: "Wednesdays · 17:30",
    people: 8,
    color: "bg-[hsl(var(--accent)/.52)]",
  },
  {
    id: "economics",
    subject: "Intro to economics",
    detail: "Low-pressure review before the next exam.",
    day: "Sundays · 15:00",
    people: 5,
    color: "bg-[hsl(var(--secondary))]",
  },
  {
    id: "languages",
    subject: "Language exchange",
    detail: "Twenty minutes each way. Come as you are.",
    day: "Thursdays · 19:00",
    people: 10,
    color: "bg-[hsl(var(--primary)/.14)]",
  },
];
function StudyGroups() {
  const { account, updateAccount } = useUniBuddy();
  if (!account) return null;
  const toggle = (id: string) =>
    updateAccount((current) => ({
      ...current,
      joinedGroups: current.joinedGroups.includes(id)
        ? current.joinedGroups.filter((group) => group !== id)
        : [...current.joinedGroups, id],
    }));
  const joined = groups.filter((group) =>
    account.joinedGroups.includes(group.id),
  );
  return (
    <div className="animate-soft-in">
      <PageIntro
        eyebrow="Better together, lightly"
        title="Study groups"
        description="Browse a few small rooms built around showing up, not proving yourself."
      />
      <section className="mb-7 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))] sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--accent))]">
              Your circle
            </p>
            <p className="serif mt-3 text-3xl tracking-[-.04em]">
              {joined.length
                ? `${joined.length} place${joined.length > 1 ? "s" : ""} to show up.`
                : "Find a place to show up."}
            </p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[hsl(var(--primary-foreground)/.7)]">
              {joined.length
                ? "These are the rooms you chose. You can change your mind whenever you need."
                : "A little accountability can make a long week feel less solitary."}
            </p>
          </div>
          <Users className="text-[hsl(var(--accent))]" size={26} />
        </div>
        {joined.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {joined.map((group) => (
              <span
                key={group.id}
                className="rounded-full border border-[hsl(var(--primary-foreground)/.22)] px-3 py-1.5 text-xs font-bold"
                data-testid={`badge-joined-${group.id}`}
              >
                {group.subject}
              </span>
            ))}
          </div>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group, index) => {
          const isJoined = account.joinedGroups.includes(group.id);
          return (
            <article
              className="card-lift rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-5"
              key={group.id}
              data-testid={`card-group-${group.id}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${group.color}`}
                >
                  <GraduationCap size={19} />
                </span>
                <span className="mono text-xs text-[hsl(var(--muted-foreground))]">
                  0{index + 1}
                </span>
              </div>
              <h2 className="serif mt-7 text-2xl font-semibold">
                {group.subject}
              </h2>
              <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
                {group.detail}
              </p>
              <div className="mt-6 flex items-center gap-2 text-xs font-semibold text-[hsl(var(--muted-foreground))]">
                <Users size={14} /> {group.people} students{" "}
                <span className="mx-1">·</span> {group.day}
              </div>
              <button
                onClick={() => toggle(group.id)}
                className={`mt-5 w-full ${isJoined ? "btn-quiet" : "btn-primary"}`}
                data-testid={`button-${isJoined ? "leave" : "join"}-group-${group.id}`}
              >
                {isJoined ? (
                  <>
                    <Check size={16} /> Joined — leave group
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Join this group
                  </>
                )}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Progress() {
  const { account, updateAccount } = useUniBuddy();
  const [subject, setSubject] = useState("");
  const [minutes, setMinutes] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [error, setError] = useState("");
  if (!account) return null;
  const total = account.progress.reduce((sum, item) => sum + item.minutes, 0);
  const average = account.progress.length
    ? Math.round(
        account.progress.reduce((sum, item) => sum + item.accuracy, 0) /
          account.progress.length,
      )
    : 0;
  const add = (event: FormEvent) => {
    event.preventDefault();
    const mins = Number(minutes);
    const score = Number(accuracy);
    if (
      !subject.trim() ||
      !mins ||
      mins < 1 ||
      score < 0 ||
      score > 100 ||
      accuracy === ""
    ) {
      setError("Add a subject, minutes, and an accuracy between 0 and 100.");
      return;
    }
    updateAccount((current) => ({
      ...current,
      progress: [
        {
          id: crypto.randomUUID(),
          subject: subject.trim(),
          minutes: mins,
          accuracy: score,
          date: new Date().toISOString(),
        },
        ...current.progress,
      ],
    }));
    setSubject("");
    setMinutes("");
    setAccuracy("");
    setError("");
  };
  return (
    <div className="animate-soft-in">
      <PageIntro
        eyebrow="Notice what is changing"
        title="Progress"
        description="Track time and accuracy as signals, not judgments. A blank page is a valid beginning."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--primary))] p-6 text-[hsl(var(--primary-foreground))]">
          <p className="eyebrow text-[hsl(var(--accent))]">Time invested</p>
          <p className="mono mt-5 text-4xl">
            {total}
            <span className="ml-1 text-base text-[hsl(var(--primary-foreground)/.65)]">
              min
            </span>
          </p>
          <p className="mt-2 text-sm text-[hsl(var(--primary-foreground)/.65)]">
            The minutes you chose to return.
          </p>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6">
          <p className="eyebrow">Average accuracy</p>
          <p className="mono mt-5 text-4xl">
            {average}
            <span className="ml-1 text-base text-[hsl(var(--muted-foreground))]">
              %
            </span>
          </p>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            {account.progress.length
              ? "A useful signal, never the whole story."
              : "It will appear after your first session."}
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[.78fr_1.22fr]">
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8">
          <p className="eyebrow">Log a study session</p>
          <form onSubmit={add} className="mt-6 space-y-4">
            <label className="block text-sm font-bold">
              Subject
              <input
                className="field mt-2"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What did you work on?"
                data-testid="input-progress-subject"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-bold">
                Minutes
                <input
                  className="field mt-2"
                  type="number"
                  min="1"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  placeholder="45"
                  data-testid="input-progress-minutes"
                />
              </label>
              <label className="block text-sm font-bold">
                Accuracy %
                <input
                  className="field mt-2"
                  type="number"
                  min="0"
                  max="100"
                  value={accuracy}
                  onChange={(e) => setAccuracy(e.target.value)}
                  placeholder="78"
                  data-testid="input-progress-accuracy"
                />
              </label>
            </div>
            {error && (
              <p
                className="text-sm font-semibold text-[hsl(var(--destructive))]"
                data-testid="status-progress-error"
              >
                {error}
              </p>
            )}
            <button
              className="btn-primary w-full"
              type="submit"
              data-testid="button-log-progress"
            >
              <Plus size={16} /> Log session
            </button>
          </form>
        </section>
        <section className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.68)] p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">Recent sessions</p>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
                {account.progress.length
                  ? "A record of returning."
                  : "Your first one can be brief."}
              </p>
            </div>
            <BarChart3 className="text-[hsl(var(--primary))]" size={24} />
          </div>
          <div className="mt-7 border-t border-[hsl(var(--border))] pt-3">
            {account.progress.length === 0 ? (
              <EmptyState
                icon={Target}
                title="No score to chase yet."
                detail="When you study, log the shape of the session. Time and accuracy will gather here gently."
              />
            ) : (
              <div className="space-y-1">
                {account.progress.map((item) => (
                  <div
                    className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-[hsl(var(--muted)/.5)]"
                    key={item.id}
                    data-testid={`row-progress-${item.id}`}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[hsl(var(--secondary))]">
                      <Target size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {item.subject}
                      </p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">
                        {new Date(item.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </div>
                    <span className="mono text-sm">{item.minutes}m</span>
                    <span className="rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-xs font-bold">
                      {item.accuracy}%
                    </span>
                    <button
                      onClick={() =>
                        updateAccount((current) => ({
                          ...current,
                          progress: current.progress.filter(
                            (record) => record.id !== item.id,
                          ),
                        }))
                      }
                      className="rounded-lg p-2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                      aria-label={`Remove ${item.subject} session`}
                      data-testid={`button-remove-progress-${item.id}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-8 text-center">
      <div>
        <p className="eyebrow">404</p>
        <h1 className="serif mt-3 text-5xl">This page wandered off.</h1>
        <Link
          href="/"
          className="btn-primary mt-7"
          data-testid="link-not-found-home"
        >
          Return home <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Welcome} />
      <Route path="/create-account" component={CreateAccount} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard">
        <Protected>
          <Dashboard />
        </Protected>
      </Route>
      <Route path="/budget">
        <Protected>
          <Budget />
        </Protected>
      </Route>
      <Route path="/resources">
        <Protected>
          <Resources />
        </Protected>
      </Route>
      <Route path="/assistant">
        <Protected>
          <Assistant />
        </Protected>
      </Route>
      <Route path="/study-groups">
        <Protected>
          <StudyGroups />
        </Protected>
      </Route>
      <Route path="/progress">
        <Protected>
          <Progress />
        </Protected>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AppProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

import { NavLink } from "react-router-dom";
import {
  Building2,
  CalendarRange,
  CheckSquare,
  Film,
  GraduationCap,
  Heart,
  LayoutDashboard,
  Lightbulb,
  Music,
  Settings,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/gigs", label: "GIGs", icon: CalendarRange },
  { to: "/venues", label: "Venues", icon: Building2 },
  { to: "/crm", label: "CRM", icon: Users },
  { to: "/fas", label: "Clube de fãs", icon: Heart },
  { to: "/aulas", label: "Aulas", icon: GraduationCap },
  { to: "/musica", label: "Produção Musical", icon: Music },
  { to: "/conteudo", label: "Conteúdo", icon: Film },
  { to: "/ideias", label: "Ideias", icon: Lightbulb },
  { to: "/identidade", label: "Identidade", icon: Sparkles },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="bg-primary-gradient relative flex h-8 w-8 items-center justify-center rounded-lg text-primary-foreground shadow-md shadow-primary/30">
          <span className="text-base font-black leading-none tracking-tighter">M</span>
          <span
            aria-hidden
            className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-orange-400 shadow-sm"
          />
        </div>
        <div className="text-primary-gradient font-semibold tracking-tight">
          MusicGest
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-4 text-xs text-muted-foreground">
        v0.1.0 · local-first
      </div>
    </aside>
  );
}

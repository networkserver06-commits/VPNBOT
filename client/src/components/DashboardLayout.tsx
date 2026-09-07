import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { Boxes, FileKey2, LayoutDashboard, LogOut, PanelLeft, Send, Wrench } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: FileKey2, label: "Files & configs", path: "/assets" },
  { icon: Wrench, label: "Tech services", path: "/services" },
  { icon: Send, label: "Telegram bot", path: "/telegram" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()), [sidebarWidth]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <div className="flex w-full max-w-md flex-col items-center gap-7 rounded-3xl border border-slate-200 bg-white p-10 shadow-xl shadow-slate-200/50">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white"><Boxes className="h-7 w-7" /></div>
          <div className="text-center"><h1 className="text-2xl font-bold tracking-tight text-slate-950">Admin access</h1><p className="mt-2 text-sm leading-6 text-slate-500">Sign in with your Manus account to manage the TechVault catalog.</p></div>
          <Button onClick={() => startLogin()} size="lg" className="w-full bg-[#e65d45] text-white hover:bg-[#d94e36]">Sign in to manage</Button>
        </div>
      </div>
    );
  }

  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

type DashboardLayoutContentProps = { children: React.ReactNode; setSidebarWidth: (width: number) => void };

function DashboardLayoutContent({ children, setSidebarWidth }: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => { if (isCollapsed) setIsResizing(false); }, [isCollapsed]);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return <>
    <div className="relative" ref={sidebarRef}>
      <Sidebar collapsible="icon" className="border-r border-slate-200 bg-white" disableTransition={isResizing}>
        <SidebarHeader className="h-20 justify-center border-b border-slate-100">
          <div className="flex w-full items-center gap-3 px-2"><button onClick={toggleSidebar} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white transition-transform active:scale-95" aria-label="Toggle navigation"><PanelLeft className="h-4 w-4" /></button>{!isCollapsed && <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-slate-950">TechVault</p><p className="truncate text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Control room</p></div>}</div>
        </SidebarHeader>
        <SidebarContent className="gap-0 py-4"><SidebarMenu className="px-2">
          {menuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl font-medium"><item.icon className="h-4 w-4" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
        </SidebarMenu></SidebarContent>
        <SidebarFooter className="border-t border-slate-100 p-3"><DropdownMenu><DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-slate-50"><Avatar className="h-9 w-9 border border-slate-200"><AvatarFallback className="bg-[#e65d45]/10 text-xs font-bold text-[#b53f2d]">{user?.name?.charAt(0).toUpperCase() || "A"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-sm font-semibold leading-none text-slate-800">{user?.name || "Admin"}</p><p className="mt-1.5 truncate text-xs text-slate-400">{user?.email || "Administrator"}</p></div></button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu></SidebarFooter>
      </Sidebar>
      <div className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[#e65d45]/20 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => !isCollapsed && setIsResizing(true)} style={{ zIndex: 50 }} />
    </div>
    <SidebarInset className="bg-[#f5f7fb]">{isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-2 backdrop-blur"><SidebarTrigger className="h-9 w-9 rounded-lg" /><span className="text-sm font-semibold text-slate-800">{activeMenuItem?.label ?? "Menu"}</span></div>}<main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main></SidebarInset>
  </>;
}

import React from 'react';
import { Link, useLocation } from 'wouter';
import { LayoutDashboard, Server, HardDrive, Key, Receipt, Activity, TerminalSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useGetAgentStatus } from '@workspace/api-client-react';

const NAV_ITEMS = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Virtual Machines', path: '/vms', icon: Server },
  { name: 'OS Images', path: '/images', icon: HardDrive },
  { name: 'SSH Keys', path: '/ssh-keys', icon: Key },
  { name: 'Billing', path: '/billing', icon: Receipt },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: agentStatus } = useGetAgentStatus();

  return (
    <div className="min-h-screen flex w-full bg-background font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shadow-xl z-10 flex-shrink-0">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <TerminalSquare className="w-6 h-6 text-sidebar-accent-foreground mr-3" />
          <span className="font-bold text-lg tracking-wide">Nexus<span className="text-sidebar-accent-foreground">Cloud</span></span>
        </div>
        
        <div className="p-4">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-4 px-2">Core Services</div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = location === item.path || (item.path !== '/' && location.startsWith(item.path));
              return (
                <Link key={item.path} href={item.path} className={cn(
                  "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors group",
                  active 
                    ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}>
                  <item.icon className={cn("w-4 h-4 mr-3", active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto p-4 border-t border-sidebar-border">
          <div className="bg-sidebar-accent/30 rounded-md p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-sidebar-foreground/80">Hypervisor Agent</span>
              {agentStatus?.connected ? (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="h-2 w-2 rounded-full bg-destructive"></span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-sidebar-foreground/50 flex items-center gap-1 font-mono">
              <Activity className="w-3 h-3" />
              {agentStatus?.connected ? 'Online & Syncing' : 'Disconnected'}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-auto p-8 lg:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}

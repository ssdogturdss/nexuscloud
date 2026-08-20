import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { AppLayout } from './components/layout';

import Dashboard from './pages/dashboard';
import VmList from './pages/vms/index';
import VmNew from './pages/vms/new';
import VmDetail from './pages/vms/detail';
import SshKeys from './pages/ssh-keys';
import Images from './pages/images';
import Billing from './pages/billing';
import Login from './pages/login';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        // Don't retry on 401 — the user needs to log in
        if ((error as { status?: number })?.status === 401) return false;
        return failureCount < 2;
      },
    },
  },
});

function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <p className="text-muted-foreground mb-8">The page you're looking for doesn't exist.</p>
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/vms" component={VmList} />
        <Route path="/vms/new" component={VmNew} />
        <Route path="/vms/:id" component={VmDetail} />
        <Route path="/ssh-keys" component={SshKeys} />
        <Route path="/images" component={Images} />
        <Route path="/billing" component={Billing} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading');

  const checkAuth = () => {
    fetch(`${import.meta.env.BASE_URL}api/auth/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        setAuthState(data.authenticated ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => setAuthState('unauthenticated'));
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (authState === 'unauthenticated') {
    return <Login onSuccess={() => setAuthState('authenticated')} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL?.replace(/\/$/, '') || ''}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;

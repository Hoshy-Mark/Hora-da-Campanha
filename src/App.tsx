import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Systems } from './pages/Systems';
import { Bestiary } from './pages/Bestiary';
import { CampaignRoom } from './pages/CampaignRoom';

function PrivateRoutes() {
  const { session, loading } = useAuth();

  if (loading) return <p className="muted center-page">Carregando…</p>;
  if (!session) return <Login />;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/systems" element={<Systems />} />
        <Route path="/bestiary" element={<Bestiary />} />
        <Route path="/campaign/:id" element={<CampaignRoom />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <PrivateRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}

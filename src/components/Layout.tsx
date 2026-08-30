import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Layout() {
  const { user, signOut } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">Hora da Campanha</div>
        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Campanhas
          </NavLink>
          <NavLink to="/systems" className={({ isActive }) => (isActive ? 'active' : '')}>
            Sistemas
          </NavLink>
          <NavLink to="/bestiary" className={({ isActive }) => (isActive ? 'active' : '')}>
            Bestiário
          </NavLink>
          <NavLink to="/catalog" className={({ isActive }) => (isActive ? 'active' : '')}>
            Catálogo
          </NavLink>
          <NavLink to="/roll-tables" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tabelas
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user muted">{user?.email}</span>
          <button className="link-btn" onClick={signOut}>
            Sair
          </button>
        </div>
      </aside>
      <div className="app-content">
        <Outlet />
      </div>
    </div>
  );
}

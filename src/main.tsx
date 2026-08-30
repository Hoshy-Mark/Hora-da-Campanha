import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registrado só pra satisfazer o critério de instalabilidade do
// Chrome/Android (ver public/sw.js) — não muda o comportamento normal
// do app, que sempre precisa de rede pra funcionar de verdade.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

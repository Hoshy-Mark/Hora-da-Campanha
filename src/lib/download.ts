// Baixa um objeto como arquivo .json no navegador do usuário — usado
// pelos botões de exportar/backup (Sistemas, Catálogo, Bestiário,
// Campanha). Puro client-side, sem servidor envolvido.
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

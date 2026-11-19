// Aplica o tema escolhido (claro/escuro) antes da página aparecer, para não piscar.
try { var t = localStorage.getItem('cm-tema'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); } catch (e) { /* sem armazenamento */ }

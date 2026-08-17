# ConsBOT — Assistente de IA

Um aplicativo de chat com inteligência artificial moderno, responsivo e seguro, construído com **React**, **Vite**, **Tailwind CSS v4** e **Vercel AI SDK**.

---

## 🚀 Tecnologias

- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4, Radix UI, Lucide Icons, Sonner.
- **IA & Streaming:** Vercel AI SDK (`ai`, `@ai-sdk/react`), Streamdown (Markdown com suporte a código, matemática e mermaid).
- **Backend:** Nenhum próprio. As chamadas de LLM, listagem de vector stores e afins vão direto para o **Main-Server**, compartilhado com os demais frontends do projeto (`src/lib/main-server.ts`). Este repositório é somente frontend.

---

## 🛠️ Como Rodar Localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e ajuste se necessário — por padrão já aponta
para um Main-Server local em `http://127.0.0.1:8000`:

```env
VITE_MAIN_SERVER_URL=http://127.0.0.1:8000
VITE_ACCESS_LEVEL=0
```

Rode o Main-Server separadamente (veja o repositório dele). `VITE_ACCESS_LEVEL=1`
libera os controles de admin (modelo, effort, verbosity, vector store, max
tokens) sem depender de `localhost`.

### 3. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) no seu navegador.

---

## 📦 Build e Deploy

### Build de Produção

```bash
npm run build
```

### Deploy no Render (Static Site)

1. Crie um novo **Static Site** no [Render Dashboard](https://dashboard.render.com/) conectado a este repositório (ou use o Blueprint automático via `render.yaml`).
2. Configurações:
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`
3. Variáveis de Ambiente (**Environment Variables**):
   - `VITE_MAIN_SERVER_URL`: `https://main-server-vim3.onrender.com`
   - `VITE_ACCESS_LEVEL`: `0` (ou `1` para habilitar opções avançadas de admin)
4. Redirecionamento SPA (**Redirects / Rewrites**):
   - Type: `Rewrite`
   - Source: `/*`
   - Destination: `/index.html`


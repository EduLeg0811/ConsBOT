# ConsBOT — Assistente de IA

Um aplicativo de chat com inteligência artificial moderno, responsivo e seguro, construído com **React**, **Vite**, **Tailwind CSS v4** e **Vercel AI SDK**.

---

## 🚀 Tecnologias

- **Frontend:** React 19, Vite, React Router, Tailwind CSS v4, Radix UI, Lucide Icons, Sonner.
- **IA & Streaming:** Vercel AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`), Streamdown (Markdown com suporte a código, matemática e mermaid).
- **Backend / Deploy:** Rota serverless `/api/chat` compatível com **Vercel** e execução local via Vite.

---

## 🛠️ Como Rodar Localmente

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
OPENAI_API_KEY=sua_chave_openai_aqui
```

### 3. Iniciar o servidor de desenvolvimento

```bash
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173) no seu navegador.

---

## 📦 Build e Deploy na Vercel

### Build de Produção

```bash
npm run build
```

### Deploy na Vercel

1. Conecte este repositório à **Vercel**.
2. Adicione a variável de ambiente `OPENAI_API_KEY` no painel de configurações da Vercel.
3. O deploy configurará automaticamente o frontend SPA e a rota `/api/chat` como serverless function.

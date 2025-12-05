# 👀 Como Visualizar o Projeto

## 📋 Pré-requisitos

Antes de visualizar o projeto, você precisa ter instalado:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **npm** (vem com Node.js)

## 🚀 Passos para Visualizar

### 1. Instalar Dependências

```bash
cd /Users/xandao/Desktop/OCR\ XTRI\ GABARITO/gabaritosxtri
npm install
```

Isso instalará todas as dependências necessárias (pode levar alguns minutos).

### 2. Iniciar o Servidor de Desenvolvimento

```bash
npm run dev
```

O servidor iniciará e você verá uma mensagem como:
```
serving on port 5000
```

### 3. Acessar no Navegador

Abra seu navegador e acesse:
```
http://localhost:5000
```

## 🎨 O que Você Verá

### Interface Principal

A aplicação possui duas abas principais:

1. **Processar Gabaritos** (padrão)
   - Zona de upload para PDFs
   - Preview das páginas
   - Processamento OMR
   - Tabela de resultados editável
   - Estatísticas e gráficos

2. **Gerar Gabaritos**
   - Upload de CSV
   - Preview dos dados
   - Geração de PDFs personalizados

### Funcionalidades Visíveis

- ✅ **Drag & Drop** para upload de arquivos
- ✅ **Preview de PDFs** (até 8 páginas)
- ✅ **Tabela interativa** com dados dos alunos
- ✅ **Gráficos** de distribuição de notas
- ✅ **Indicadores de confiança** coloridos
- ✅ **Exportação para Excel**

## 📁 Estrutura do Projeto

```
gabaritosxtri/
├── client/              # Frontend React
│   ├── src/
│   │   ├── pages/
│   │   │   └── home.tsx    # Página principal (1987 linhas)
│   │   ├── components/ui/  # 40+ componentes UI
│   │   └── ...
│   └── index.html
├── server/              # Backend Express
│   ├── routes.ts        # API endpoints
│   ├── omr.ts           # Processamento OMR
│   └── ...
├── shared/              # Código compartilhado
│   └── schema.ts        # Schemas e tipos
└── README.md            # Documentação completa
```

## 🔍 Arquivos Principais para Visualizar

### Frontend
- `client/src/pages/home.tsx` - Interface principal completa
- `client/index.html` - HTML base
- `client/src/App.tsx` - Componente raiz

### Backend
- `server/routes.ts` - Todos os endpoints da API
- `server/omr.ts` - Lógica de processamento OMR
- `server/index.ts` - Servidor principal

### Configuração
- `package.json` - Dependências e scripts
- `vite.config.ts` - Configuração do Vite
- `tailwind.config.ts` - Configuração do Tailwind

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento (com hot reload)
npm run dev

# Verificar tipos TypeScript
npm run check

# Build para produção
npm run build

# Iniciar produção
npm start
```

## 🌐 Portas e URLs

- **Desenvolvimento**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health
- **Download ZIP**: http://localhost:5000/api/download-project-zip

## 📸 Screenshots

Você pode ver screenshots do projeto em:
- `attached_assets/Captura_de_Tela_*.png`

## ⚠️ Troubleshooting

### Porta já em uso
Se a porta 5000 estiver ocupada, você pode mudar:
```bash
PORT=3000 npm run dev
```

### Erro de dependências
```bash
rm -rf node_modules package-lock.json
npm install
```

### Erro de TypeScript
```bash
npm run check
```

## 🎯 Próximos Passos

1. Instale as dependências: `npm install`
2. Inicie o servidor: `npm run dev`
3. Acesse: http://localhost:5000
4. Teste fazendo upload de um PDF de gabarito!

---

**Dica**: O projeto está completo e funcional. Basta instalar as dependências e iniciar o servidor!


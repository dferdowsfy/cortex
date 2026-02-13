# Complyze - AI Governance Platform

Enterprise-grade AI tool discovery, risk assessment, and compliance reporting platform.

## Overview

Complyze automatically discovers AI tools on employee machines, assesses their risk profile using multi-stage AI analysis, and generates board-ready compliance reports.

## Features

### 🔍 Auto-Discovery
- **Browser-based AI tools**: ChatGPT, Claude, Gemini, Perplexity, etc.
- **IDE Extensions**: GitHub Copilot, Cursor AI, Codeium, Tabnine
- **Desktop Applications**: Zoom AI, Microsoft Copilot, Grammarly
- **Running processes** and network connections

### 🎯 Risk Assessment Pipeline
5-stage AI-powered analysis:
1. **Extract** - Intelligence gathering on tool capabilities
2. **Classify** - Risk tier classification (Low/Medium/High/Critical)
3. **Flag** - Security, privacy, and compliance concerns
4. **Recommend** - Actionable mitigation strategies
5. **Report** - Executive-ready board summaries

### 📊 Governance Dashboard
- Assessed tools inventory with risk badges
- Discovered tools awaiting assessment
- One-click scan wizard
- Board report generator (print/PDF ready)

## Quick Start

### Prerequisites
- Node.js 18+
- OpenRouter API key ([get one here](https://openrouter.ai))

### Installation

```bash
# Clone the repository
git clone https://github.com/dferdowsfy/cortex.git
cd cortex

# Install dependencies
cd web
npm install

# Configure environment
echo 'OPENROUTER_API_KEY=your_key_here' > .env.local

# Start development server
npm run dev
```

The platform will be available at **http://localhost:3737**

## Project Structure

```
cortex/
├── web/                          # Next.js web application
│   ├── app/
│   │   ├── page.tsx             # Dashboard
│   │   ├── scan/page.tsx        # 4-step scan wizard
│   │   ├── report/page.tsx      # Board report generator
│   │   ├── layout.tsx           # Root layout with navigation
│   │   ├── globals.css          # Tailwind + custom styles
│   │   └── api/                 # API routes
│   │       ├── extract/         # P1: Intelligence extraction
│   │       ├── assess/          # P2-P4: Risk assessment
│   │       ├── report/          # P5: Board summary
│   │       ├── discover/        # External agent endpoint
│   │       └── discover-local/  # Server-side scanner
│   ├── lib/
│   │   ├── openrouter.ts        # LLM API client
│   │   └── prompts.ts           # 5-stage prompt pipeline
│   └── package.json
├── scanner/
│   └── discover.ts              # Standalone discovery agent
└── README.md
```

## Configuration

### Environment Variables

Create `web/.env.local`:

```env
OPENROUTER_API_KEY=your_key_here
```

### Customize AI Model

Edit [web/lib/openrouter.ts](web/lib/openrouter.ts) to change the model:

```typescript
model: 'google/gemini-2.0-flash-exp',  // or any OpenRouter model
```

## Usage

### 1. Auto-Discover AI Tools

Click **"Auto-Discover AI Tools"** on the dashboard to scan your machine for:
- Installed applications
- Running processes  
- Browser extensions (Chrome, Edge, Brave, Arc)
- IDE extensions (VS Code, Cursor, Windsurf)

### 2. Assess a Tool

From the discovered tools panel, click **"Assess"** to run the 5-stage pipeline:
- Tool intelligence extraction
- Risk classification
- Security flag generation
- Recommendations
- Results displayed with risk tier badge

Or use the manual scan wizard at `/scan`

### 3. Generate Board Report

Navigate to `/report` and:
1. Enter organization details
2. Click **"Generate Report"**
3. Preview executive summary with findings table
4. Use browser print (⌘+P) to save as PDF

## API Endpoints

### `POST /api/extract`
Extract tool intelligence profile
```json
{
  "toolName": "ChatGPT",
  "vendor": "OpenAI", 
  "description": "...",
  "website": "https://chatgpt.com"
}
```

### `POST /api/assess`
Full risk assessment (P2+P3+P4)
```json
{
  "toolProfile": { /* extraction result */ }
}
```

### `POST /api/report`
Generate board summary
```json
{
  "assessedTools": [ /* array of assessments */ ],
  "organizationName": "Acme Corp",
  "reportDate": "2026-02-12"
}
```

### `POST /api/discover-local`
Server-side local machine scan (no body required)

### `POST /api/discover`
External agent push endpoint
```json
{
  "tools": [ /* discovered tools */ ],
  "timestamp": "2026-02-12T10:30:00Z"
}
```

## Standalone Discovery Agent

Run the CLI scanner:

```bash
cd scanner
npx tsx discover.ts

# Push results to platform
npx tsx discover.ts --push http://localhost:3737/api/discover
```

## Development

### Run Tests (once implemented)
```bash
npm test
npm run test:coverage
```

### Build for Production
```bash
npm run build
npm start
```

### Lint & Format
```bash
npm run lint
```

## Tech Stack

- **Framework**: Next.js 15.1 (App Router)
- **UI**: React 19 + Tailwind CSS 3.4
- **Language**: TypeScript 5.7
- **AI**: OpenRouter API (Gemini 2.0 Flash)
- **Deployment**: Vercel-ready

## Roadmap

- [ ] User-level activity tracking (browser extension + desktop agent)
- [ ] Real-time DLP enforcement
- [ ] Integration with IdP (Okta/Azure AD)
- [ ] SIEM connector
- [ ] Anomaly detection ML model
- [ ] Multi-tenant architecture
- [ ] Comprehensive test coverage (≥80%)

## Contributing

Contributions welcome! Please:
1. Write tests for new features (TDD)
2. Follow TypeScript strict mode
3. Maintain ≥80% code coverage
4. Update documentation

## Support

For issues or questions, open a GitHub issue at https://github.com/dferdowsfy/cortex/issues

## License

MIT

Proprietary — Complyze

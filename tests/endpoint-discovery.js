'use strict';

/**
 * endpoint-discovery.js
 * Maintains a JSON registry of known LLM API endpoints.
 * Compares live proxy logs against the registry to flag new/unknown domains.
 * Outputs an updated registry with discovery metadata.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1';
const PROXY_PORT = process.env.PROXY_PORT || '8080';
const PROXY_LOG_URL = process.env.PROXY_LOG_URL || 'http://localhost:3737/logs';

const REGISTRY_PATH = path.join(__dirname, '..', 'artifacts', 'endpoint-registry.json');
const REPORTS_DIR = path.join(__dirname, '..', 'reports');

// Known LLM-related domains and patterns
const KNOWN_LLM_PROVIDERS = {
  openai: {
    domains: [
      'api.openai.com',
      'chat.openai.com',
      'platform.openai.com',
      'files.openai.com',
      'oaiusercontent.com',
      'openaiusercontent.com',
    ],
    patterns: [/openai/i, /gpt/i],
    risk: 'high',
  },
  anthropic: {
    domains: [
      'api.anthropic.com',
      'claude.ai',
      'www.claude.ai',
      'cdn.jsdelivr.net',
    ],
    patterns: [/anthropic/i, /claude\.ai/i],
    risk: 'high',
  },
  google: {
    domains: [
      'generativelanguage.googleapis.com',
      'gemini.google.com',
      'bard.google.com',
      'aistudio.google.com',
      'vertex.googleapis.com',
      'ml.googleapis.com',
    ],
    patterns: [/gemini/i, /generativelanguage/i, /vertexai/i],
    risk: 'high',
  },
  perplexity: {
    domains: [
      'perplexity.ai',
      'api.perplexity.ai',
      'www.perplexity.ai',
    ],
    patterns: [/perplexity/i],
    risk: 'high',
  },
  grok: {
    domains: [
      'grok.x.ai',
      'api.x.ai',
      'x.ai',
    ],
    patterns: [/grok/i, /x\.ai/i],
    risk: 'high',
  },
  poe: {
    domains: [
      'poe.com',
      'api.poe.com',
      'creator.poe.com',
    ],
    patterns: [/poe\.com/i],
    risk: 'medium',
  },
  openrouter: {
    domains: [
      'openrouter.ai',
      'api.openrouter.ai',
    ],
    patterns: [/openrouter/i],
    risk: 'high',
  },
  huggingface: {
    domains: [
      'huggingface.co',
      'api-inference.huggingface.co',
      'huggingface.co',
    ],
    patterns: [/huggingface/i],
    risk: 'medium',
  },
  cohere: {
    domains: [
      'api.cohere.ai',
      'dashboard.cohere.com',
    ],
    patterns: [/cohere/i],
    risk: 'medium',
  },
  mistral: {
    domains: [
      'api.mistral.ai',
      'console.mistral.ai',
    ],
    patterns: [/mistral/i],
    risk: 'medium',
  },
  together: {
    domains: [
      'api.together.xyz',
      'api.together.ai',
    ],
    patterns: [/together\.xyz/i, /together\.ai/i],
    risk: 'medium',
  },
  groq: {
    domains: [
      'api.groq.com',
      'console.groq.com',
    ],
    patterns: [/groq\.com/i],
    risk: 'medium',
  },
  replicate: {
    domains: [
      'api.replicate.com',
      'replicate.com',
    ],
    patterns: [/replicate\.com/i],
    risk: 'medium',
  },
  elevenlabs: {
    domains: [
      'api.elevenlabs.io',
      'elevenlabs.io',
    ],
    patterns: [/elevenlabs/i],
    risk: 'medium',
  },
  stability: {
    domains: [
      'api.stability.ai',
      'dreamstudio.ai',
    ],
    patterns: [/stability\.ai/i, /dreamstudio/i],
    risk: 'medium',
  },
  azure_openai: {
    domains: [],
    patterns: [/openai\.azure\.com/i, /cognitive\.microsoft\.com/i],
    risk: 'high',
  },
  bedrock: {
    domains: [],
    patterns: [/bedrock\.amazonaws\.com/i, /bedrock-runtime/i],
    risk: 'high',
  },
};

function loadRegistry() {
  if (fs.existsSync(REGISTRY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
    } catch (_) {}
  }
  return {
    version: '1.0.0',
    last_updated: null,
    known_domains: {},
    flagged_new: [],
    discovery_runs: [],
  };
}

function saveRegistry(registry) {
  const dir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

function classifyDomain(domain) {
  // Exact match
  for (const [provider, info] of Object.entries(KNOWN_LLM_PROVIDERS)) {
    if (info.domains.includes(domain)) {
      return { provider, risk: info.risk, match_type: 'exact' };
    }
  }

  // Pattern match
  for (const [provider, info] of Object.entries(KNOWN_LLM_PROVIDERS)) {
    for (const pattern of info.patterns) {
      if (pattern.test(domain)) {
        return { provider, risk: info.risk, match_type: 'pattern' };
      }
    }
  }

  return null;
}

function isLikelyLLMDomain(domain) {
  const llmKeywords = [
    'ai', 'llm', 'gpt', 'claude', 'gemini', 'model', 'inference',
    'completion', 'generate', 'chat', 'assistant', 'neural', 'ml',
    'openai', 'anthropic', 'mistral', 'cohere', 'hugging', 'ollama',
  ];

  const lower = domain.toLowerCase();
  return llmKeywords.some((kw) => lower.includes(kw));
}

async function fetchProxyLogs(since) {
  try {
    const resp = await axios.get(PROXY_LOG_URL, {
      params: { since: since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), limit: 10000 },
      timeout: 10000,
    });
    return resp.data.logs || resp.data || [];
  } catch (err) {
    console.warn(`  [discovery] Could not fetch proxy logs: ${err.message}`);
    return [];
  }
}

function extractDomainsFromLogs(logs) {
  const domainSet = new Set();
  for (const log of logs) {
    if (log.domain) domainSet.add(log.domain);
    if (log.host) domainSet.add(log.host.split(':')[0]);
    if (log.url) {
      try {
        const u = new URL(log.url);
        domainSet.add(u.hostname);
      } catch (_) {}
    }
    if (log.request_host) domainSet.add(log.request_host);
  }
  return Array.from(domainSet).filter((d) => d && d.includes('.'));
}

async function discoverFromProxyLogs(registry) {
  console.log('  Fetching proxy logs...');
  const logs = await fetchProxyLogs(registry.last_updated);
  console.log(`  Found ${logs.length} log entries`);

  const observedDomains = extractDomainsFromLogs(logs);
  console.log(`  Observed ${observedDomains.length} unique domains`);

  const newDomains = [];
  const flagged = [];

  for (const domain of observedDomains) {
    const existingEntry = registry.known_domains[domain];

    if (!existingEntry) {
      const classification = classifyDomain(domain);
      const likelyLLM = isLikelyLLMDomain(domain);

      const entry = {
        domain,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString(),
        classification: classification || null,
        likely_llm: likelyLLM,
        risk: classification ? classification.risk : (likelyLLM ? 'unknown-llm' : 'low'),
        flagged: classification !== null || likelyLLM,
        observation_count: 1,
      };

      registry.known_domains[domain] = entry;
      newDomains.push(domain);

      if (entry.flagged) {
        flagged.push(entry);
        console.log(`  [NEW] ${domain} — provider: ${classification?.provider || 'unknown'}, risk: ${entry.risk}`);
      }
    } else {
      // Update last seen and count
      existingEntry.last_seen = new Date().toISOString();
      existingEntry.observation_count = (existingEntry.observation_count || 0) + 1;
    }
  }

  return { newDomains, flagged, observedDomains };
}

function generateReport(registry, discovery) {
  const allKnown = Object.values(registry.known_domains);
  const highRisk = allKnown.filter((d) => d.risk === 'high');
  const mediumRisk = allKnown.filter((d) => d.risk === 'medium');
  const unknownLLM = allKnown.filter((d) => d.risk === 'unknown-llm');
  const unclassified = allKnown.filter((d) => d.risk === 'low' && !d.flagged);

  return {
    timestamp: new Date().toISOString(),
    summary: {
      total_known_domains: allKnown.length,
      new_domains_this_run: discovery.newDomains.length,
      newly_flagged: discovery.flagged.length,
      high_risk_count: highRisk.length,
      medium_risk_count: mediumRisk.length,
      unknown_llm_count: unknownLLM.length,
      unclassified_count: unclassified.length,
    },
    newly_flagged_domains: discovery.flagged,
    high_risk_domains: highRisk.map((d) => ({ domain: d.domain, provider: d.classification?.provider, first_seen: d.first_seen, last_seen: d.last_seen })),
    all_domains: allKnown,
    registry_path: REGISTRY_PATH,
  };
}

async function run() {
  console.log('=== Endpoint Discovery ===');
  console.log(`Proxy log source: ${PROXY_LOG_URL}\n`);

  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const registry = loadRegistry();

  // Seed registry with all known domains if empty
  if (Object.keys(registry.known_domains).length === 0) {
    console.log('  Seeding registry with known LLM domains...');
    for (const [provider, info] of Object.entries(KNOWN_LLM_PROVIDERS)) {
      for (const domain of info.domains) {
        registry.known_domains[domain] = {
          domain,
          first_seen: new Date().toISOString(),
          last_seen: new Date().toISOString(),
          classification: { provider, match_type: 'seed' },
          likely_llm: true,
          risk: info.risk,
          flagged: true,
          observation_count: 0,
          seeded: true,
        };
      }
    }
    console.log(`  Seeded ${Object.keys(registry.known_domains).length} domains`);
  }

  // Discover new domains from proxy logs
  const discovery = await discoverFromProxyLogs(registry);

  // Record this run
  registry.last_updated = new Date().toISOString();
  registry.discovery_runs = registry.discovery_runs || [];
  registry.discovery_runs.push({
    timestamp: new Date().toISOString(),
    observed: discovery.observedDomains.length,
    new: discovery.newDomains.length,
    flagged: discovery.flagged.length,
  });

  // Keep only last 30 runs in registry
  if (registry.discovery_runs.length > 30) {
    registry.discovery_runs = registry.discovery_runs.slice(-30);
  }

  // Save updated registry
  saveRegistry(registry);
  console.log(`\n  Registry saved to: ${REGISTRY_PATH}`);
  console.log(`  Total known domains: ${Object.keys(registry.known_domains).length}`);

  // Generate and save report
  const report = generateReport(registry, discovery);
  const reportPath = path.join(REPORTS_DIR, `endpoint-discovery-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved to: ${reportPath}`);

  // Print summary
  console.log('\n=== Discovery Summary ===');
  console.log(`  Total known domains:     ${report.summary.total_known_domains}`);
  console.log(`  New this run:            ${report.summary.new_domains_this_run}`);
  console.log(`  Newly flagged:           ${report.summary.newly_flagged}`);
  console.log(`  High risk:               ${report.summary.high_risk_count}`);
  console.log(`  Medium risk:             ${report.summary.medium_risk_count}`);
  console.log(`  Unknown LLM:             ${report.summary.unknown_llm_count}`);

  if (discovery.flagged.length > 0) {
    console.log('\n  Flagged new LLM domains:');
    discovery.flagged.forEach((d) => {
      console.log(`    ${d.domain} (${d.classification?.provider || 'unknown'}, risk=${d.risk})`);
    });
  }

  // Exit non-zero only if high-risk unrecognized domains found
  const unknownHighRisk = discovery.flagged.filter((d) => d.risk === 'unknown-llm' || (d.risk === 'high' && !d.classification));
  if (unknownHighRisk.length > 0) {
    console.error('\n  WARNING: Unknown high-risk LLM domains detected. Manual review required.');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

<template>
  <div class="reasoning-card">
    <div class="header">
      <div class="title-wrap">
        <span class="sparkle">✦</span>
        <h3 class="title">Gemini 3.8 Reasoning Depth Engine</h3>
      </div>
      <span class="badge">Dynamic Thinking Budget</span>
    </div>

    <p class="subtitle">
      Control thinking token depth per tool call using <code>effort: "low" | "medium" | "high"</code>.
    </p>

    <!-- Selector Tabs -->
    <div class="effort-tabs">
      <button 
        v-for="level in levels" 
        :key="level.id"
        :class="['tab-btn', { active: selected === level.id }]"
        @click="selected = level.id"
      >
        <span class="tab-indicator" :style="{ background: level.color }"></span>
        <span class="tab-label">{{ level.label }}</span>
        <span class="tab-tokens">{{ level.tokens }}</span>
      </button>
    </div>

    <!-- Active Details Display -->
    <div class="details-panel" :style="{ borderColor: current.color }">
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-label">Thinking Depth</span>
          <span class="stat-val" :style="{ color: current.color }">{{ current.depth }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Typical Latency</span>
          <span class="stat-val">{{ current.speed }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Recommended Model</span>
          <span class="stat-val font-mono">{{ current.recommendedModel }}</span>
        </div>
      </div>

      <div class="use-case">
        <div class="use-case-title">🎯 Ideal Workflows:</div>
        <p class="use-case-desc">{{ current.useCase }}</p>
      </div>

      <div class="code-preview">
        <div class="code-header">
          <span>MCP Tool Call Configuration</span>
          <span class="copy-hint font-mono">effort: "{{ current.id }}"</span>
        </div>
        <pre><code>{{ current.snippet }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const selected = ref('high')

const levels = [
  {
    id: 'low',
    label: 'Low Effort',
    tokens: '~500 tokens',
    color: '#0284c7',
    depth: 'Minimal (Direct & Fast)',
    speed: '< 1.5s',
    recommendedModel: 'gemini-3.8-flash-low',
    useCase: 'High-throughput code explanations, commit message generation, formatting, simple AST conversions, and quick summaries.',
    snippet: `await useGemini({
  prompt: "Explain the purpose of @package.json dependencies",
  model: "gemini-3.8-flash-low",
  effort: "low"
});`
  },
  {
    id: 'medium',
    label: 'Medium Effort',
    tokens: '~2,000 tokens',
    color: '#6366f1',
    depth: 'Balanced Step-by-Step',
    speed: '~2.5s',
    recommendedModel: 'gemini-3.8-flash-medium',
    useCase: 'Day-to-day pair programming: bug investigation, code refactoring across 3-5 files, unit test creation, and API contract design.',
    snippet: `await useGemini({
  prompt: "Refactor @src/utils/commandExecutor.ts to handle process signals",
  model: "gemini-3.8-flash-medium",
  effort: "medium"
});`
  },
  {
    id: 'high',
    label: 'High Effort',
    tokens: '~8,000+ tokens',
    color: '#a855f7',
    depth: 'Deep Algorithmic Thinking',
    speed: '~4.0s - 8.0s',
    recommendedModel: 'gemini-3.8-flash-high',
    useCase: 'Security vulnerability audits, race conditions, distributed architecture design, mathematical algorithms, and comprehensive system planning (gemini-plan).',
    snippet: `await useGeminiPlan({
  task: "Design distributed lock mechanism with Redis & auto-renew",
  context: "High-throughput financial ledger API with strict consistency",
  effort: "high"
});`
  }
]

const current = computed(() => levels.find(l => l.id === selected.value) || levels[2])
</script>

<style scoped>
.reasoning-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  padding: 24px;
  margin: 32px 0;
  box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(16px);
  transition: all 0.3s ease;
}

:root.dark .reasoning-card {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 27, 75, 0.6) 100%);
  border-color: rgba(148, 163, 184, 0.15);
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sparkle {
  color: var(--vp-c-brand-1);
  font-size: 18px;
  animation: pulse 2s infinite;
}

.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.badge {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 9999px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border: 1px solid var(--vp-c-brand-soft);
}

.subtitle {
  color: var(--vp-c-text-2);
  font-size: 14px;
  margin: 0 0 20px 0;
}

.effort-tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.25s ease;
}

.tab-btn:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-1px);
}

.tab-btn.active {
  background: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.15);
}

:root.dark .tab-btn.active {
  background: rgba(30, 27, 75, 0.9);
  border-color: rgba(192, 132, 252, 0.5);
  box-shadow: 0 0 20px rgba(192, 132, 252, 0.2);
}

.tab-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-bottom: 6px;
}

.tab-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--vp-c-text-1);
}

.tab-tokens {
  font-size: 11px;
  color: var(--vp-c-text-3);
  margin-top: 2px;
}

.details-panel {
  background: var(--vp-c-bg);
  border: 1px solid;
  border-radius: 12px;
  padding: 20px;
  transition: border-color 0.3s ease;
}

:root.dark .details-panel {
  background: rgba(10, 15, 30, 0.6);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--vp-c-divider);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--vp-c-text-3);
}

.stat-val {
  font-size: 14px;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.font-mono {
  font-family: monospace;
}

.use-case-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-brand-1);
  margin-bottom: 4px;
}

.use-case-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0 0 16px 0;
}

.code-preview {
  background: #0c1222;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  overflow: hidden;
}

.code-header {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  color: #94a3b8;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.copy-hint {
  color: #38bdf8;
}

pre {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
}

code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: #f1f5f9;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.9); }
}

@media (max-width: 640px) {
  .effort-tabs {
    grid-template-columns: 1fr;
  }
  .stats-row {
    grid-template-columns: 1fr;
    gap: 12px;
  }
}
</style>

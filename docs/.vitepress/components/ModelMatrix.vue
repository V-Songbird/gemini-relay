<template>
  <div class="matrix-grid">
    <div v-for="m in models" :key="m.id" :class="['model-card', { featured: m.featured }]">
      <div v-if="m.badge" class="card-badge" :style="{ background: m.badgeBg }">
        {{ m.badge }}
      </div>

      <div class="card-header">
        <h4 class="model-name font-mono">{{ m.name }}</h4>
        <span class="model-type">{{ m.type }}</span>
      </div>

      <p class="model-desc">{{ m.desc }}</p>

      <div class="specs">
        <div class="spec-row">
          <span>Reasoning Depth:</span>
          <strong :style="{ color: m.effortColor }">{{ m.effort }}</strong>
        </div>
        <div class="spec-row">
          <span>Alias:</span>
          <strong class="font-mono">{{ m.alias }}</strong>
        </div>
      </div>

      <div class="chips">
        <span v-for="tag in m.tags" :key="tag" class="chip">{{ tag }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
const models = [
  {
    id: 'flash-high',
    name: 'gemini-3.8-flash-high',
    featured: true,
    badge: 'MOST USED',
    badgeBg: 'linear-gradient(135deg, #0284c7, #7c3aed)',
    type: 'Flash family, high reasoning',
    desc: 'What gemini-plan picks when you name no model, and the only model gemini-image uses. ask-gemini and brainstorm send no model at all unless you name one.',
    effort: 'High',
    effortColor: '#0284c7',
    alias: 'flash',
    tags: ['Code Review', 'Planning', 'Image Gen']
  },
  {
    id: 'flash-medium',
    name: 'gemini-3.8-flash-medium',
    featured: false,
    type: 'Flash family, medium reasoning',
    desc: 'Everyday tasks with balanced reasoning depth — bug investigation, refactors across a handful of files, unit tests.',
    effort: 'Medium',
    effortColor: '#6366f1',
    alias: '—',
    tags: ['Refactors', 'Bug Hunts', 'Unit Tests']
  },
  {
    id: 'flash-low',
    name: 'gemini-3.8-flash-low',
    featured: false,
    badge: 'MINIMAL THINKING',
    badgeBg: 'linear-gradient(135deg, #10b981, #06b6d4)',
    type: 'Flash family, low reasoning',
    desc: 'The same Flash model with the least thinking depth baked into the id — for summaries, syntax checks, formatting and commit messages.',
    effort: 'Low',
    effortColor: '#10b981',
    alias: '—',
    tags: ['Summaries', 'Syntax Checks', 'Formatting']
  },
  {
    id: 'pro-high',
    name: 'gemini-3.1-pro-high',
    featured: false,
    badge: 'FLAGSHIP REASONING',
    badgeBg: 'linear-gradient(135deg, #a855f7, #ec4899)',
    type: 'Pro family, high reasoning',
    desc: 'Complex problem solving, formal mathematical algorithms, concurrency analysis, and mission-critical architecture.',
    effort: 'High',
    effortColor: '#9333ea',
    alias: 'pro',
    tags: ['Security Audits', 'Distributed Systems', 'Proofs']
  },
  {
    id: 'pro-low',
    name: 'gemini-3.1-pro-low',
    featured: false,
    type: 'Pro family, low reasoning',
    desc: 'Pro-grade knowledge retrieval with minimal thinking, for questions that need the Pro model but not its deep reasoning.',
    effort: 'Low',
    effortColor: '#10b981',
    alias: '—',
    tags: ['Knowledge Retrieval', 'Quick Answers']
  }
]
</script>

<style scoped>
.matrix-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;
  margin: 32px 0;
}

.model-card {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
}

.model-card:hover {
  transform: translateY(-4px);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 12px 25px -5px rgba(2, 132, 199, 0.15);
}

.model-card.featured {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 8px 25px -5px rgba(2, 132, 199, 0.2);
}

:root.dark .model-card {
  background: rgba(15, 23, 42, 0.7);
  box-shadow: none;
}

:root.dark .model-card.featured {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 27, 75, 0.7) 100%);
  border-color: rgba(0, 240, 255, 0.4);
  box-shadow: 0 0 30px rgba(0, 240, 255, 0.1);
}

.card-badge {
  position: absolute;
  top: -10px;
  right: 20px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 3px 10px;
  border-radius: 9999px;
  color: #ffffff;
}

.card-header {
  margin-bottom: 12px;
}

.model-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin: 0 0 4px 0;
}

.model-type {
  font-size: 12px;
  color: var(--vp-c-brand-1);
  font-weight: 500;
}

.model-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-2);
  margin: 0 0 20px 0;
  flex-grow: 1;
}

.specs {
  border-top: 1px solid var(--vp-c-divider);
  border-bottom: 1px solid var(--vp-c-divider);
  padding: 12px 0;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.spec-row {
  display: flex;
  justify-content: space-between;
  color: var(--vp-c-text-3);
}

.spec-row strong {
  color: var(--vp-c-text-1);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  font-size: 11px;
  background: var(--vp-c-bg-mute);
  color: var(--vp-c-text-2);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--vp-c-divider);
}

.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

@media (max-width: 960px) {
  .matrix-grid {
    grid-template-columns: 1fr;
  }
}
</style>

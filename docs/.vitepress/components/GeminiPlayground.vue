<template>
  <div class="playground-card">
    <!-- Header -->
    <div class="terminal-bar">
      <div class="terminal-controls">
        <span class="control red"></span>
        <span class="control yellow"></span>
        <span class="control green"></span>
      </div>
      <div class="terminal-title">
        <span class="icon">🤖</span> Claude Code &lt;—&gt; Gemini Relay Console
      </div>
      <div class="terminal-badge">
        <span class="pulse-dot"></span> agy v1.1.25 • Gemini 3.8
      </div>
    </div>

    <!-- Mode Selector -->
    <div class="scenario-nav">
      <button 
        v-for="s in scenarios" 
        :key="s.id"
        :class="['scenario-btn', { active: activeId === s.id }]"
        @click="activeId = s.id"
      >
        <span class="s-icon">{{ s.icon }}</span>
        <span>{{ s.name }}</span>
      </button>
    </div>

    <!-- Query Box -->
    <div class="prompt-box">
      <div class="prompt-label">
        <span class="agent-tag">Claude Code Query</span>
        <span class="tool-tag font-mono">{{ activeScenario.toolCall }}</span>
      </div>
      <div class="prompt-content font-mono">
        {{ activeScenario.userPrompt }}
      </div>
    </div>

    <!-- Response Stream -->
    <div class="response-stream">
      <div class="response-meta">
        <div class="meta-item">
          <span class="meta-label">Model:</span>
          <span class="meta-val font-mono">{{ activeScenario.model }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Thinking:</span>
          <span class="meta-val highlight font-mono">{{ activeScenario.thinkingTokens }} tokens</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Duration:</span>
          <span class="meta-val font-mono">{{ activeScenario.duration }}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Status:</span>
          <span class="meta-val status-ok">SUCCESS 200</span>
        </div>
      </div>

      <div class="stream-body font-mono">
        <div v-if="activeScenario.isImage" class="image-preview-wrapper">
          <div class="image-box">
            <div class="preview-hero">
              <span class="cosmic-icon">🌌</span>
              <div class="img-meta">
                <strong>assets/architecture_hero.png</strong>
                <span>Aspect Ratio: 16:9 • Generated via Google Imagen</span>
              </div>
            </div>
          </div>
          <pre class="image-text"><code>{{ activeScenario.response }}</code></pre>
        </div>
        <pre v-else><code>{{ activeScenario.response }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const activeId = ref('plan')

const scenarios = [
  {
    id: 'plan',
    name: 'Architectural Planning',
    icon: '🏗️',
    toolCall: 'gemini-plan(task, effort: "high")',
    model: 'gemini-3.8-flash-high',
    thinkingTokens: '4,180',
    duration: '3.4s',
    userPrompt: '"Use gemini-plan to architect a low-latency websocket streaming server with automatic token refresh and backpressure."',
    response: `### 📋 Architectural Blueprint: Resilient WebSocket Server
**Mode:** --mode plan | **Reasoning Effort:** High (4,180 thinking tokens)

#### Phase 1: Core Stream Engine & Backpressure
- Implement stream.Writable with highWaterMark: 64KB.
- Buffer overflow strategy: Pause socket frame ingestion when client buffer exceeds 80% threshold.

#### Phase 2: Autonomous Token Rotation
- Background lease manager checking JWT expiry at T-60s.
- Non-blocking handshake refresh without closing established TCP sockets.

#### Phase 3: Failure Modes & Recovery
- Exponential backoff with full jitter: min(30s, 100ms * 2^attempt + rand(0, 50ms)).`
  },
  {
    id: 'inlining',
    name: 'Zero-Context Inlining',
    icon: '📂',
    toolCall: 'ask-gemini(prompt: "@src/...")',
    model: 'gemini-3.8-flash-high',
    thinkingTokens: '1,850',
    duration: '1.9s',
    userPrompt: '"Audit @src/backends/agy.ts @src/utils/commandExecutor.ts for process leaks and unhandled promise rejections."',
    response: `Gemini response:
Inspected 2 files (45,800 tokens analyzed across workspace root):

✓ Concurrency Safety: Process exit handlers cleanly kill child process groups.
✓ Path Traversal Guard: Project root jail verified via assertSafeFileReferences().
! Recommendation (L162): Wrap childProcess.spawn in AbortController signal listener for immediate timeout cleanup.`
  },
  {
    id: 'image',
    name: 'Multimodal Image Creation',
    icon: '🎨',
    isImage: true,
    toolCall: 'gemini-image(prompt, aspectRatio: "16:9")',
    model: 'gemini-3.8-flash-high',
    thinkingTokens: '1,141',
    duration: '5.8s',
    userPrompt: '"Generate a 16:9 modern minimalist website hero illustration showing glowing cloud infrastructure and save to assets/hero.png"',
    response: `### 🎨 Gemini Image Generation Completed
- Prompt: "Modern minimalist cloud infrastructure with luminous cyan/purple nodes"
- Aspect Ratio: 16:9
- Backend: AGY (Google Imagen)
💾 Saved to Project: assets/architecture_hero.png`
  },
  {
    id: 'schema',
    name: 'Guaranteed JSON Schema',
    icon: '📐',
    toolCall: 'ask-gemini(prompt, jsonSchema)',
    model: 'gemini-3.8-flash-high',
    thinkingTokens: '920',
    duration: '1.2s',
    userPrompt: '"Audit @package.json and extract all outdated dependencies into structured JSON conforming to VulnerabilityAuditSchema"',
    response: `{
  "vulnerabilities": [
    {
      "package": "dompurify",
      "installedVersion": "3.2.0",
      "recommendedVersion": "3.4.11",
      "severity": "high",
      "fixedBy": "npm update dompurify"
    }
  ],
  "cleanDependenciesCount": 42
}`
  }
]

const activeScenario = computed(() => scenarios.find(s => s.id === activeId.value) || scenarios[0])
</script>

<style scoped>
.playground-card {
  background: #0b0f19;
  border: 1px solid rgba(15, 23, 42, 0.2);
  border-radius: 16px;
  overflow: hidden;
  margin: 32px 0;
  box-shadow: 0 20px 40px -10px rgba(15, 23, 42, 0.15), 0 0 0 1px rgba(15, 23, 42, 0.05);
}

:root.dark .playground-card {
  border-color: rgba(56, 189, 248, 0.2);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.1);
}

.terminal-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #0f172a;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.terminal-controls {
  display: flex;
  gap: 6px;
}

.control {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.red { background: #ef4444; }
.yellow { background: #eab308; }
.green { background: #22c55e; }

.terminal-title {
  font-size: 12px;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.terminal-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.12);
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid rgba(56, 189, 248, 0.25);
}

.pulse-dot {
  width: 6px;
  height: 6px;
  background: #00f0ff;
  border-radius: 50%;
  animation: glow 1.5s infinite alternate;
}

.scenario-nav {
  display: flex;
  background: #090d16;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  overflow-x: auto;
}

.scenario-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
  border-bottom: 2px solid transparent;
}

.scenario-btn:hover {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.03);
}

.scenario-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
  background: rgba(56, 189, 248, 0.08);
}

.prompt-box {
  padding: 16px;
  background: #0d1322;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.prompt-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.agent-tag {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #fb923c;
  font-weight: 700;
}

.tool-tag {
  font-size: 11px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
}

.prompt-content {
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.5;
}

.response-stream {
  padding: 16px;
  background: #080c16;
}

.response-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.1);
  font-size: 11px;
}

.meta-item {
  display: flex;
  gap: 4px;
}

.meta-label {
  color: #64748b;
}

.meta-val {
  color: #e2e8f0;
  font-weight: 500;
}

.meta-val.highlight {
  color: #c084fc;
}

.status-ok {
  color: #34d399;
}

.font-mono {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.preview-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  background: linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(168, 85, 247, 0.2));
  border: 1px solid rgba(56, 189, 248, 0.3);
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 12px;
}

.cosmic-icon {
  font-size: 32px;
}

.img-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: #e2e8f0;
}

pre {
  margin: 0;
  padding: 0;
  background: transparent;
}

code {
  font-size: 12px;
  line-height: 1.6;
  color: #e2e8f0;
}

@keyframes glow {
  from { opacity: 0.5; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1.1); }
}

@media (max-width: 640px) {
  .scenario-nav {
    flex-direction: column;
  }
  .response-meta {
    gap: 8px;
  }
}
</style>

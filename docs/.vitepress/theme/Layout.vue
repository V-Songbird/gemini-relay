<template>
  <Layout>
    <template #nav-bar-content-before>
      <div class="gemini-version-pill">
        <span class="pulse-cyan"></span>
        <span class="version-text">Gemini Relay • Antigravity</span>
        <span class="tag">v1.2.0</span>
      </div>
    </template>
  </Layout>
</template>

<script setup>
import DefaultTheme from 'vitepress/theme'

const { Layout } = DefaultTheme
</script>

<style scoped>
.gemini-version-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-brand-soft);
  border-radius: 9999px;
  padding: 4px 12px;
  margin-right: 16px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  backdrop-filter: blur(8px);
  transition: all 0.3s ease;
}

.pulse-cyan {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #0284c7;
  box-shadow: 0 0 6px #0284c7;
  animation: pulse-glow 2s infinite ease-in-out;
}

:root.dark .pulse-cyan {
  background: #00f0ff;
  box-shadow: 0 0 10px #00f0ff;
}

.version-text {
  color: var(--vp-c-text-1);
  font-weight: 600;
  letter-spacing: -0.01em;
}

.tag {
  background: linear-gradient(135deg, #0284c7, #7c3aed);
  color: #ffffff;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 9999px;
  letter-spacing: 0.04em;
}

@keyframes pulse-glow {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.5;
  }
}

@media (max-width: 860px) {
  .gemini-version-pill {
    display: none;
  }
}
</style>
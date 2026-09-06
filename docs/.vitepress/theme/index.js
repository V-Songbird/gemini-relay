import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import ReasoningVisualizer from '../components/ReasoningVisualizer.vue'
import GeminiPlayground from '../components/GeminiPlayground.vue'
import ModelMatrix from '../components/ModelMatrix.vue'
import DiagramModal from '../components/DiagramModal.vue'
import ConfigModal from '../components/ConfigModal.vue'
import TroubleshootingModal from '../components/TroubleshootingModal.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: Layout,
  enhanceApp({ app }) {
    app.component('ReasoningVisualizer', ReasoningVisualizer)
    app.component('GeminiPlayground', GeminiPlayground)
    app.component('ModelMatrix', ModelMatrix)
    app.component('DiagramModal', DiagramModal)
    app.component('ConfigModal', ConfigModal)
    app.component('TroubleshootingModal', TroubleshootingModal)
  },
  setup() {
    // Default to dark mode for the cosmic Antigravity theme
    if (typeof window !== 'undefined' && !localStorage.getItem('vitepress-theme-appearance')) {
      localStorage.setItem('vitepress-theme-appearance', 'dark')
      document.documentElement.classList.add('dark')
    }
  }
}
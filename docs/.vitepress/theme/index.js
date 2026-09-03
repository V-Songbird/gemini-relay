import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
import ReasoningVisualizer from '../components/ReasoningVisualizer.vue'
import GeminiPlayground from '../components/GeminiPlayground.vue'
import ModelMatrix from '../components/ModelMatrix.vue'
import ClientGrid from '../components/ClientGrid.vue'
import CodeBlock from '../components/CodeBlock.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  Layout: Layout,
  enhanceApp({ app }) {
    app.component('ReasoningVisualizer', ReasoningVisualizer)
    app.component('GeminiPlayground', GeminiPlayground)
    app.component('ModelMatrix', ModelMatrix)
    app.component('ClientGrid', ClientGrid)
    app.component('CodeBlock', CodeBlock)
  },
  setup() {
    // Default to dark mode for the cosmic Antigravity theme
    if (typeof window !== 'undefined' && !localStorage.getItem('vitepress-theme-appearance')) {
      localStorage.setItem('vitepress-theme-appearance', 'dark')
      document.documentElement.classList.add('dark')
    }
  }
}
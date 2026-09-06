import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'Gemini Relay',
    description: 'High-performance Gemini 3.8 Flash & 3.1 Pro bridge for Claude Code and AI agents',
    base: '/gemini-relay/',
    
    head: [
      ['link', { rel: 'icon', href: '/gemini-relay/favicon.ico' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '128x128', href: '/gemini-relay/icon.png' }],
      ['link', { rel: 'apple-touch-icon', sizes: '128x128', href: '/gemini-relay/icon.png' }]
    ],
    
    themeConfig: {
      logo: '/icon.png',
      
      nav: [
        { text: 'Home', link: '/' },
        { text: 'Agent Guide', link: '/AGENT_GUIDE' },
        { text: 'Quick Start', link: '/getting-started' },
        { text: 'Tools', link: '/usage/commands' }
      ],

      sidebar: [
        {
          text: 'Getting Started',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Quick Start', link: '/getting-started' },
            { text: 'Installation', link: '/installation' },
            { text: 'First Steps', link: '/first-steps' },
            { text: 'Agent Guide', link: '/AGENT_GUIDE' },
          ]
        },
        {
          text: 'Capabilities & Models',
          collapsed: false,
          items: [
            { text: 'Supported Models', link: '/concepts/models' },
            { text: 'How It Works', link: '/concepts/how-it-works' },
            { text: 'Context Inlining (@)', link: '/concepts/file-analysis' },
            { text: 'Sandbox Execution', link: '/concepts/sandbox' }
          ]
        },
        {
          text: 'Tool Catalog & Usage',
          collapsed: false,
          items: [
            { text: 'Tool Reference', link: '/usage/commands' },
            { text: 'Prompt Recipes', link: '/usage/natural-language' },
            { text: 'Workflow Examples', link: '/usage/examples' },
            { text: 'Best Practices', link: '/usage/best-practices' }
          ]
        },
        {
          text: 'Engine & Architecture',
          collapsed: false,
          items: [
            { text: 'Antigravity CLI (agy)', link: '/migration/antigravity-cli' },
            { text: 'MCP API Surface', link: '/api' },
            { text: 'Troubleshooting', link: '/resources/troubleshooting' },
            { text: 'FAQ', link: '/resources/faq' },
            { text: 'Roadmap', link: '/resources/roadmap' },
          ]
        }
      ],

      socialLinks: [
        { icon: 'github', link: 'https://github.com/V-Songbird/gemini-relay' }
      ],

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2026 V-Songbird'
      },

      search: {
        provider: 'local'
      }
    }
  })
)
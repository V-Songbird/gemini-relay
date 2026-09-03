#!/bin/bash
# Script to automatically deploy wiki content to GitHub

set -e

echo "🚀 Deploying Wiki to GitHub..."

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is required but not installed."
    echo "Install with: brew install gh"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wiki-enhanced.md" ]; then
    echo "❌ wiki-enhanced.md not found. Are you in the right directory?"
    exit 1
fi

# Clone the wiki repository
echo "📥 Cloning wiki repository..."
rm -rf .wiki-temp
git clone https://github.com/V-Songbird/gemini-mcp-tool.wiki.git .wiki-temp 2>/dev/null || {
    echo "⚠️  Wiki doesn't exist yet. Creating it through GitHub..."
    # Create initial wiki page through API
    gh api repos/V-Songbird/gemini-mcp-tool/wiki/pages \
        --method POST \
        -f title="Home" \
        -f body="Initializing wiki..." || true
    
    # Try cloning again
    git clone https://github.com/V-Songbird/gemini-mcp-tool.wiki.git .wiki-temp
}

cd .wiki-temp

# Function to extract section from wiki-enhanced.md
extract_section() {
    local section_name="$1"
    local output_file="$2"
    
    # Extract content between this section and the next section (or EOF)
    awk -v section="$section_name" '
        $0 ~ "## " section { found=1; next }
        $0 ~ "## " && found { found=0 }
        found { print }
    ' ../docs/resources/wiki-enhanced.md > "$output_file"
}

echo "📄 Creating wiki pages..."

# Home Page (Overview)
cat > Home.md << 'EOF'
# Gemini MCP Tool Wiki

Welcome to the comprehensive Gemini MCP Tool documentation!

## 🚀 Quick Navigation
* [[Getting Started|Getting-Started]] - Installation and basic setup
* [[Tool Reference|Tool-Reference]] - Complete guide to all MCP tools
* [[Change Mode Guide|Change-Mode-Guide]] - AI-assisted file editing
* [[Claude Code Integration|Claude-Code-Integration]] - Claude Code workflows
* [[Best Practices|Best-Practices]] - Tips and optimization strategies
* [[Troubleshooting|Troubleshooting]] - Common issues and solutions
* [[FAQ|FAQ]] - Frequently asked questions
* [[Architecture|Architecture]] - Internal design and technical details

## 🌟 What is Gemini MCP Tool?
A Model Context Protocol (MCP) server that connects AI assistants to the Google Gemini CLI, enabling 1M+ token context analysis, code understanding, and structured editing.

## 📦 Quick Install
```bash
claude mcp add gemini-cli -- npx -y gemini-mcp-tool
```
EOF

# Extract other sections
echo "  → Getting Started..."
extract_section "Getting Started" "Getting-Started.md"

echo "  → Tool Reference..."
extract_section "Tool Reference" "Tool-Reference.md"

echo "  → Change Mode Guide..."
extract_section "Change Mode Guide" "Change-Mode-Guide.md"

echo "  → Claude Code Integration..."
extract_section "Claude Code Integration" "Claude-Code-Integration.md"

echo "  → Best Practices..."
extract_section "Best Practices" "Best-Practices.md"

echo "  → Troubleshooting..."
extract_section "Troubleshooting" "Troubleshooting.md"

echo "  → FAQ..."
extract_section "Frequently Asked Questions" "FAQ.md"

echo "  → Architecture..."
extract_section "Architecture & Design" "Architecture.md"

echo "  → Roadmap..."
extract_section "Future Roadmap" "Roadmap.md"

# Create sidebar
cat > _Sidebar.md << 'EOF'
**Documentation**
* [[Home]]
* [[Getting Started|Getting-Started]]
* [[Tool Reference|Tool-Reference]]
* [[Change Mode Guide|Change-Mode-Guide]]
* [[Claude Code Integration|Claude-Code-Integration]]
* [[Best Practices|Best-Practices]]
* [[Troubleshooting|Troubleshooting]]
* [[FAQ]]
* [[Architecture]]
* [[Roadmap]]
* [[Community & Support|Community-&-Support]]

---

**Quick Links**
* [📦 NPM Package](https://www.npmjs.com/package/gemini-mcp-tool)
* [🐙 GitHub Repo](https://github.com/V-Songbird/gemini-mcp-tool)
* [📋 Report Issue](https://github.com/V-Songbird/gemini-mcp-tool/issues/new)
EOF

# Create footer
cat > _Footer.md << 'EOF'
---
📄 [MIT License](https://github.com/V-Songbird/gemini-mcp-tool/blob/main/LICENSE) | 
🔧 [Contribute](https://github.com/V-Songbird/gemini-mcp-tool/blob/main/CONTRIBUTING.md) | 
📦 [NPM](https://www.npmjs.com/package/gemini-mcp-tool) |
⭐ [Star on GitHub](https://github.com/V-Songbird/gemini-mcp-tool)
EOF

# Commit and push
echo "💾 Committing changes..."
git add -A
git commit -m "📚 Deploy comprehensive wiki documentation

- Added all major sections from wiki-enhanced.md
- Created navigation sidebar
- Added footer with quick links
- Structured content for easy navigation" || echo "No changes to commit"

echo "📤 Pushing to GitHub..."
git push origin master || git push origin main

cd ..
rm -rf .wiki-temp

echo "✅ Wiki deployed successfully!"
echo "🔗 View at: https://github.com/V-Songbird/gemini-mcp-tool/wiki"
echo ""
echo "📝 Note: It may take a few seconds for changes to appear on GitHub."

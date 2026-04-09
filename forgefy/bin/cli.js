#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs-extra'
import path from 'path'
import ora from 'ora'
import chalk from 'chalk'
import prompts from 'prompts'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const TEMPLATES_DIR = path.resolve(__dirname, '../templates')

const PROJECT_VARIANTS = [
  { id: 'base_landpage', title: 'Landpage' },
  { id: 'base_sistema_simples', title: 'Sistema simples' },
  { id: 'base_sistema_robusto', title: 'Sistema robusto' }
]

const VARIANT_CHOICES = PROJECT_VARIANTS.map((v) => ({
  title: v.title,
  value: v.id
}))

function getVariantLabel(variantId) {
  const found = PROJECT_VARIANTS.find((v) => v.id === variantId)
  return found ? found.title : variantId
}

const LIBS_BY_STACK = {
  next: {
    base_landpage: {
      deps: ['next-intl', 'sass', 'typescript'],
      devDeps: ['@types/node', '@types/react', '@types/react-dom']
    },
    base_sistema_simples: {
      deps: ['next-intl', 'sass', 'typescript'],
      devDeps: ['@types/node', '@types/react', '@types/react-dom']
    },
    base_sistema_robusto: {
      deps: [
        'leaflet',
        'moment',
        'next-intl',
        'react-toastify',
        'sass',
        'typescript'
      ],
      devDeps: [
        '@types/leaflet',
        '@types/node',
        '@types/react',
        '@types/react-dom'
      ]
    }
  },
  vue: {
    base_landpage: {
      deps: ['sass'],
      devDeps: []
    },
    base_sistema_simples: {
      deps: ['sass', 'vue-router'],
      devDeps: []
    },
    base_sistema_robusto: {
      deps: ['sass', 'vue-router', 'pinia'],
      devDeps: []
    }
  }
}

function applyBaseLayout(cwd, baseTemplate, spinner, label) {
  if (!fs.existsSync(baseTemplate)) {
    return
  }
  spinner.text = `Aplicando ${label} (public só da base, restante em src/)...`
  const projectPublic = path.join(cwd, 'public')
  if (fs.existsSync(projectPublic)) {
    fs.removeSync(projectPublic)
  }
  const basePublic = path.join(baseTemplate, 'public')
  if (fs.existsSync(basePublic)) {
    fs.copySync(basePublic, projectPublic, { overwrite: true })
  }
  const srcDir = path.join(cwd, 'src')
  fs.ensureDirSync(srcDir)
  for (const ent of fs.readdirSync(baseTemplate, { withFileTypes: true })) {
    if (ent.name === 'public') {
      continue
    }
    fs.copySync(
      path.join(baseTemplate, ent.name),
      path.join(srcDir, ent.name),
      { overwrite: true }
    )
  }
}

function rewriteNextBaseImportsInSrc(projectRoot, spinner) {
  const srcRoot = path.join(projectRoot, 'src')
  if (!fs.existsSync(srcRoot)) {
    return
  }
  spinner.text = 'Ajustando imports (next/base → @/)...'
  const exts = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.scss',
    '.sass',
    '.css'
  ])
  const prefixRe = /(["'`])next\/base\//g
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === 'node_modules' || ent.name === '.next') {
        continue
      }
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        walk(full)
        continue
      }
      if (!exts.has(path.extname(ent.name))) {
        continue
      }
      let content = fs.readFileSync(full, 'utf8')
      const nextContent = content.replace(prefixRe, '$1@/')
      if (nextContent !== content) {
        fs.writeFileSync(full, nextContent, 'utf8')
      }
    }
  }
  walk(srcRoot)
}

function applyNextTemplates(cwd, variant, stackTemplatesRoot, spinner) {
  const baseTemplate = path.join(stackTemplatesRoot, 'base')
  const variantTemplate = path.join(stackTemplatesRoot, variant)
  applyBaseLayout(cwd, baseTemplate, spinner, 'base Next.js')
  const appPath = path.join(cwd, 'src', 'app')
  const templateAppPath = path.join(variantTemplate, 'app')
  const hasVariantTemplate = fs.existsSync(variantTemplate)
  const hasVariantApp = fs.existsSync(templateAppPath)
  if (hasVariantApp) {
    if (fs.existsSync(appPath)) {
      fs.removeSync(appPath)
    }
    spinner.text = 'Aplicando estrutura do projeto...'
    fs.copySync(templateAppPath, appPath, { overwrite: true })
  }
  if (hasVariantTemplate) {
    const srcDir = path.join(cwd, 'src')
    for (const ent of fs.readdirSync(variantTemplate, { withFileTypes: true })) {
      if (ent.name === 'app' || ent.name === 'public') {
        continue
      }
      fs.copySync(
        path.join(variantTemplate, ent.name),
        path.join(srcDir, ent.name),
        { overwrite: true }
      )
    }
  }
  rewriteNextBaseImportsInSrc(cwd, spinner)
}

function applyVueTemplates(cwd, variant, stackTemplatesRoot, spinner) {
  const baseTemplate = path.join(stackTemplatesRoot, 'base')
  const variantTemplate = path.join(stackTemplatesRoot, variant)
  applyBaseLayout(cwd, baseTemplate, spinner, 'base Vue')
  if (!fs.existsSync(variantTemplate)) {
    return
  }
  const templateSrc = path.join(variantTemplate, 'src')
  const targetSrc = path.join(cwd, 'src')
  if (fs.existsSync(templateSrc)) {
    spinner.text = 'Aplicando estrutura do projeto (src)...'
    fs.copySync(templateSrc, targetSrc, { overwrite: true })
  }
  fs.copySync(variantTemplate, cwd, {
    overwrite: true,
    filter: (filePath) => {
      const rel = path.relative(variantTemplate, filePath)
      if (!rel) return true
      const first = rel.split(path.sep)[0]
      return first !== 'src' && first !== 'public'
    }
  })
}

function patchNextTurbopackRoot(projectRoot) {
  const candidates = ['next.config.ts', 'next.config.mjs', 'next.config.js']
  for (const name of candidates) {
    const filePath = path.join(projectRoot, name)
    if (!fs.existsSync(filePath)) {
      continue
    }
    let content = fs.readFileSync(filePath, 'utf8')
    if (/turbopack\s*:\s*\{[\s\S]*?root\s*:/s.test(content)) {
      return
    }
    if (name === 'next.config.ts') {
      if (!/\bimport\s+path\s+from\s+['"]path['"]/.test(content)) {
        content = content.replace(
          /^(import\s+type\s+\{\s*NextConfig\s*\}\s+from\s+['"]next['"];)\s*/m,
          '$1\nimport path from "path";\n\n'
        )
      }
      content = content.replace(
        /(const\s+nextConfig:\s*NextConfig\s*=\s*\{)/,
        '$1\n  turbopack: {\n    root: path.join(__dirname),\n  },'
      )
      fs.writeFileSync(filePath, content, 'utf8')
      return
    }
    if (name === 'next.config.mjs') {
      const prelude = []
      if (!/\bimport\s+path\s+from\s+['"]path['"]/.test(content)) {
        prelude.push('import path from "path";')
      }
      if (!/fileURLToPath/.test(content)) {
        prelude.push('import { fileURLToPath } from "url";')
      }
      if (!/\bconst __dirname\b/.test(content)) {
        prelude.push(
          'const __dirname = path.dirname(fileURLToPath(import.meta.url));'
        )
      }
      if (prelude.length) {
        content = `${prelude.join('\n')}\n\n${content}`
      }
      content = content.replace(
        /(const\s+nextConfig[^=]*=\s*\{)/,
        '$1\n  turbopack: {\n    root: path.join(__dirname),\n  },'
      )
      fs.writeFileSync(filePath, content, 'utf8')
      return
    }
    if (name === 'next.config.js') {
      if (!/require\(['"]path['"]\)/.test(content)) {
        content = `const path = require('path');\n${content}`
      }
      content = content.replace(
        /(module\.exports\s*=\s*\{)/,
        '$1\n  turbopack: {\n    root: path.join(__dirname),\n  },'
      )
      fs.writeFileSync(filePath, content, 'utf8')
      return
    }
  }
}

const STACKS = {
  next: {
    id: 'next',
    promptLabel: 'Next.js',
    bannerStack: 'Next.js',
    createMessage: 'Criando projeto Next.js...',
    createProject: (projectName) => {
      execSync(
        `npx create-next-app@latest ${projectName} --typescript --eslint --app --src-dir --import-alias "@/*"`,
        { stdio: 'inherit' }
      )
    },
    applyTemplates: applyNextTemplates
  },
  vue: {
    id: 'vue',
    promptLabel: 'Vue (Vite + TypeScript)',
    bannerStack: 'Vue 3 (Vite)',
    createMessage: 'Criando projeto Vue (Vite)...',
    createProject: (projectName) => {
      execSync(
        `npm create vite@latest ${projectName} -- --template vue-ts`,
        { stdio: 'inherit' }
      )
    },
    applyTemplates: applyVueTemplates
  }
}

const STACK_CHOICES = Object.values(STACKS).map((s) => ({
  title: s.promptLabel,
  value: s.id
}))

function showBanner(projectName, stackId, variant) {
  const stack = STACKS[stackId]
  const stackName = stack ? stack.bannerStack : stackId

  console.log(`
${chalk.cyan.bold(`
███████╗ ██████╗ ██████╗  ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝
█████╗  ██║   ██║██████╔╝██║  ███╗█████╗
██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝
██║     ╚██████╔╝██║  ██║╚██████╔╝███████
╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═════╝
   ███████╗██╗   ██╗
   ██╔════╝╚██╗ ██╔╝
   █████╗   ╚████╔╝ 
   ██╔══╝    ╚██╔╝  
   ██║        ██║   
   ╚═╝        ╚═╝   
`)}
${chalk.magenta.bold('⚡ FORGE FY CLI')}
${chalk.gray('────────────────────────────────────────')}
${chalk.yellow('📦 Projeto:')} ${projectName}
${chalk.yellow('⚡ Stack:')} ${stackName}
${chalk.yellow('🎯 Tipo de sistema:')} ${getVariantLabel(variant)}
${chalk.gray('────────────────────────────────────────')}
${chalk.green('✔ Projeto criado com sucesso!')}
${chalk.gray('👨‍💻 Desenvolvido por Caio Fortes')}
`)
}

async function main() {
  const response = await prompts([
    {
      type: 'text',
      name: 'projectName',
      message: 'Nome do projeto:',
      initial: 'my-app'
    },
    {
      type: 'select',
      name: 'stack',
      message: 'Linguagem / framework:',
      choices: STACK_CHOICES
    },
    {
      type: 'select',
      name: 'variant',
      message: 'Tipo de sistema:',
      choices: VARIANT_CHOICES
    }
  ])

  const { projectName, stack: stackId, variant } = response

  if (!projectName || !stackId || !variant) {
    console.log(chalk.red('❌ Operação cancelada'))
    process.exit(1)
  }

  const stack = STACKS[stackId]
  if (!stack) {
    console.log(chalk.red(`❌ Stack não suportada: ${stackId}`))
    process.exit(1)
  }

  const stackLibs = LIBS_BY_STACK[stackId]
  if (!stackLibs || !stackLibs[variant]) {
    console.log(
      chalk.red(
        `❌ Variante "${variant}" sem dependências definidas para stack "${stackId}". Ajuste LIBS_BY_STACK no CLI.`
      )
    )
    process.exit(1)
  }

  const targetDir = path.join(process.cwd(), projectName)

  if (fs.existsSync(targetDir)) {
    console.log(chalk.red('❌ Pasta já existe'))
    process.exit(1)
  }

  const spinner = ora(stack.createMessage).start()

  try {
    stack.createProject(projectName)

    process.chdir(projectName)

    if (stackId === 'next') {
      patchNextTurbopackRoot(process.cwd())
    }

    spinner.text = 'Instalando dependências do scaffold...'
    execSync('npm install', { stdio: 'inherit' })

    const { deps, devDeps } = stackLibs[variant]

    spinner.text = 'Instalando dependências extras...'

    if (deps.length) {
      execSync(`npm install ${deps.join(' ')}`, {
        stdio: 'inherit'
      })
    }

    if (devDeps.length) {
      execSync(`npm install -D ${devDeps.join(' ')}`, {
        stdio: 'inherit'
      })
    }

    const stackTemplatesRoot = path.join(TEMPLATES_DIR, stackId)
    stack.applyTemplates(process.cwd(), variant, stackTemplatesRoot, spinner)

    spinner.succeed('Projeto criado com sucesso!')

    showBanner(projectName, stackId, variant)

    console.log('\n👉 Próximos passos:')
    console.log(chalk.yellow(`cd ${projectName}`))
    console.log(chalk.yellow('npm run dev'))

  } catch (error) {
    spinner.fail('Erro ao criar projeto')
    console.error(error)
    process.exit(1)
  }
}

main()


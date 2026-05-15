#!/usr/bin/env node
// 纯构建脚本：先打前端（输出到 mailSilver/public），再编译后端 TS -> mailSilver/dist
// 用法：node build.mjs

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWindows = process.platform === 'win32'
const npmCmd = isWindows ? 'npm.cmd' : 'npm'

function run(label, cwd, args) {
  console.log(`\n[build] ${label}  (cwd=${cwd})`)
  console.log(`[build] $ ${npmCmd} ${args.join(' ')}`)
  const res = spawnSync(npmCmd, args, { cwd, stdio: 'inherit', shell: isWindows })
  if (res.status !== 0) {
    console.error(`[build] ${label} 失败，退出码 ${res.status}`)
    process.exit(res.status ?? 1)
  }
}

const webDir = resolve(__dirname, 'web')
const serverDir = resolve(__dirname, 'mailSilver')

for (const dir of [webDir, serverDir]) {
  if (!existsSync(resolve(dir, 'package.json'))) {
    console.error(`[build] 找不到 ${dir}/package.json`)
    process.exit(1)
  }
}

run('构建前端 (vite)', webDir, ['run', 'build'])
run('编译后端 (tsc)', serverDir, ['run', 'build'])

console.log('\n[build] 完成。产物：')
console.log('  - 前端: mailSilver/public/')
console.log('  - 后端: mailSilver/dist/')

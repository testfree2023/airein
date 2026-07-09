#!/usr/bin/env bash
# diagnose-hooks.sh — 诊断 hooks 运行状态，清理缓存
#
# 用法: bash ~/.claude/scripts/diagnose-hooks.sh

CLAUDE_DIR="$HOME/.claude"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Hooks 诊断 & 清理"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. 检查 settings.json 里 hooks 是否注册
echo "📋 1. 检查 hooks 注册..."
HOOK_COUNT=$(node -e "
const s=JSON.parse(require('fs').readFileSync('$CLAUDE_DIR/settings.json','utf8'));
const n=Object.keys(s.hooks||{}).length;
console.log(n);
" 2>/dev/null || echo "0")
if [ "$HOOK_COUNT" -gt 0 ]; then
  echo "  ✅ $HOOK_COUNT 个 hook events 已注册"
else
  echo "  ❌ 没有 hooks！需要跑 bash $CLAUDE_DIR/scripts/merge-hooks.sh $CLAUDE_DIR"
fi

# 2. 检查 airein-logger.js 是否有 getProjectDir 修复
echo ""
echo "📋 2. 检查 airein-logger.js 版本..."
if grep -q "getProjectDir" "$CLAUDE_DIR/scripts/lib/airein-logger.js" 2>/dev/null; then
  echo "  ✅ 已包含 getProjectDir 修复"
else
  echo "  ❌ 旧版本！需要重新 copy airein-logger.js"
fi

# 3. 检查 quality-config.js 是否有 getProjectDir 修复
echo ""
echo "📋 3. 检查 quality-config.js 版本..."
if grep -q "getProjectDir" "$CLAUDE_DIR/scripts/lib/quality-config.js" 2>/dev/null; then
  echo "  ✅ 已包含 getProjectDir 修复"
else
  echo "  ❌ 旧版本！需要重新 copy quality-config.js"
fi

# 4. 清理误创建的 ~/.claude/.claude/ 目录
echo ""
echo "🧹 4. 清理 ~/.claude/.claude/ ..."
if [ -d "$CLAUDE_DIR/.claude" ]; then
  rm -rf "$CLAUDE_DIR/.claude"
  echo "  ✅ 已删除 ~/.claude/.claude/"
else
  echo "  ✅ 无需清理"
fi

# 5. 测试 aireinLog 写入
echo ""
echo "📋 5. 测试 aireinLog 写入..."
node -e "
const path=require('path'),fs=require('fs');
// 模拟项目目录
const cwd=process.cwd();
const hasClaude=fs.existsSync(path.join(cwd,'.claude'));
console.log('  cwd:', cwd);
console.log('  has .claude:', hasClaude);

// 直接调用 aireinLog
const {aireinLog}=require('$CLAUDE_DIR/scripts/lib/airein-logger');
aireinLog('info','diagnose','Diagnostic test from diagnose-hooks.sh');

// 检查日志文件
const logsDir=path.join(cwd,'.claude','logs');
if(fs.existsSync(logsDir)){
  const files=fs.readdirSync(logsDir).filter(f=>f.startsWith('airein-'));
  console.log('  log files:', files.join(', ') || 'none');
  if(files.length>0){
    const latest=files.sort().reverse()[0];
    const content=fs.readFileSync(path.join(logsDir,latest),'utf8');
    const lines=content.trim().split('\n');
    console.log('  last log:', lines[lines.length-1]);
  }
} else {
  console.log('  ❌ .claude/logs/ not found in cwd');
}
" 2>&1 | head -10

# 6. 测试 cwd=~/.claude 时的项目解析
echo ""
echo "📋 6. 测试 cwd=~/.claude 时的项目解析..."
node -e "
process.chdir('$CLAUDE_DIR');
const {aireinLog}=require('$CLAUDE_DIR/scripts/lib/airein-logger');
aireinLog('info','diagnose-cwd-test','cwd is ~/.claude — should resolve to real project');
" 2>/dev/null
echo "  (检查上方测试 5 的日志目录是否有新条目)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  诊断完成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  如果步骤 2/3 显示旧版本，手动复制："
echo "    cd /path/to/airein/repo"
echo "    cp scripts/lib/airein-logger.js ~/.claude/scripts/lib/"
echo "    cp scripts/lib/quality-config.js ~/.claude/scripts/lib/"
echo "    cp scripts/hooks/session-end.js ~/.claude/scripts/hooks/"
echo "    cp scripts/hooks/session-start.js ~/.claude/scripts/hooks/"
echo ""

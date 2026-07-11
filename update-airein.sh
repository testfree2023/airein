#!/usr/bin/env bash
# update-airein.sh — 一键更新 Airein
#
# 薄编排器：clone → clean → sync → dashboard → verify
# 实际逻辑在 scripts/update/ 子脚本中，方便独立升级。
#
# 用法:
#   bash ~/.claude/update-airein.sh          # 标准更新
#   bash update-airein.sh                    # 从 clone 目录运行

set -euo pipefail

# ── argv 解析 ────────────────────────────────────────────────────
# P002：支持 --source <dir|tar.gz|zip> [--sha256 <hex>] 本地源升级（网络不畅/离线）。
SOURCE=""
SHA256=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source)
      [[ $# -ge 2 ]] || { echo "❌ --source 缺值" >&2; exit 1; }
      SOURCE="$2"; shift 2 ;;
    --source=*) SOURCE="${1#--source=}"; shift ;;
    --sha256)
      [[ $# -ge 2 ]] || { echo "❌ --sha256 缺值" >&2; exit 1; }
      SHA256="$2"; shift 2 ;;
    --sha256=*) SHA256="${1#--sha256=}"; shift ;;
    --help|-h) sed -n '2,9p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "❌ 未知参数: $1（update 仅支持 --source/--sha256）" >&2; exit 1 ;;
  esac
done

REPO="https://github.com/testfree2023/airein.git"   # SSH→HTTPS（P002：clone 回退更稳）
CLAUDE_DIR="$HOME/.claude"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_CLONE=""

# install-helpers（node 解析 + airein remote 校验）。update 可能从 CLAUDE_DIR 或 clone 跑。
HELPERS_LIB="$SCRIPT_DIR/scripts/lib/install-helpers.sh"
if [[ ! -f "$HELPERS_LIB" ]]; then
  HELPERS_LIB="$CLAUDE_DIR/scripts/lib/install-helpers.sh"
fi
if [[ ! -f "$HELPERS_LIB" ]]; then
  echo "❌ 安装器残缺：缺少 scripts/lib/install-helpers.sh" >&2
  exit 1
fi
# shellcheck source=scripts/lib/install-helpers.sh
. "$HELPERS_LIB"
NODE_BIN="$(resolve_node_bin)"
if [[ -z "$NODE_BIN" ]]; then
  echo "❌ Node.js 未安装（版本守卫需要）" >&2
  exit 1
fi
NODE_LIB_DIR="$(dirname "$HELPERS_LIB")"
if command -v cygpath >/dev/null 2>&1; then
  NODE_LIB_DIR="$(cygpath -m "$NODE_LIB_DIR")"
fi
# resolveSource 解压 tmpdir（跨进程 cleanup：node 退出后 trap 用此字符串删）
CLEANUP_DIR=""
cleanup_extract() {
  if [[ -n "$CLEANUP_DIR" && -d "$CLEANUP_DIR" ]]; then
    rm -rf "$CLEANUP_DIR" 2>/dev/null || true
  fi
}
trap cleanup_extract EXIT

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Airein — 更新"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 1. 确定 Airein 源 ──────────────────────────────────────────
# 优先级：① --source <dir|pkg>（本地解析，不联网）② HTTPS clone 回退（REPO 已 HTTPS）
AIREIN_SRC=""
PKG_VERSION=""

if [[ -n "$SOURCE" ]]; then
  echo "📂 解析本地源: $SOURCE"
  NODE_SOURCE="$SOURCE"
  if command -v cygpath >/dev/null 2>&1; then
    NODE_SOURCE="$(cygpath -m "$SOURCE")"
  fi
  RESOLVE_OUT="$(AIREIN_NODE_LIB="$NODE_LIB_DIR" AIREIN_SOURCE="$NODE_SOURCE" AIREIN_SHA256="$SHA256" \
    "$NODE_BIN" -e '
    const { resolveSource } = require(process.env.AIREIN_NODE_LIB + "/source-resolver");
    try {
      const r = resolveSource({
        source: process.env.AIREIN_SOURCE || undefined,
        sha256: process.env.AIREIN_SHA256 || undefined,
      });
      console.log("OK=1");
      console.log("SOURCE_DIR=" + r.sourceDir);
      console.log("VERSION=" + (r.version || ""));
      console.log("CLEANUP_DIR=" + r.cleanupDir);
    } catch (e) {
      console.log("OK=0");
      console.log("MESSAGE=" + e.message);
    }
  ')" || { echo "❌ resolveSource 执行失败（node 错误）" >&2; exit 1; }
  _ok=0
  while IFS= read -r _line; do
    case "$_line" in
      OK=1) _ok=1 ;;
      OK=0) _ok=0 ;;
      SOURCE_DIR=*) AIREIN_SRC="${_line#SOURCE_DIR=}" ;;
      VERSION=*) PKG_VERSION="${_line#VERSION=}" ;;
      CLEANUP_DIR=*) CLEANUP_DIR="${_line#CLEANUP_DIR=}" ;;
      MESSAGE=*) echo "❌ ${_line#MESSAGE=}" >&2 ;;
    esac
  done <<< "$RESOLVE_OUT"
  if [[ $_ok -ne 1 || -z "$AIREIN_SRC" ]]; then
    echo "❌ 本地源解析失败。请检查 --source 路径/格式（dir | .tar.gz | .zip）与 --sha256" >&2
    exit 1
  fi
  echo "  ✅ 源就绪: $AIREIN_SRC${PKG_VERSION:+（v$PKG_VERSION）}"
else
  echo "📥 获取最新版本（HTTPS clone）..."
  TEMP_CLONE="$(mktemp -d /tmp/airein-update-XXXXXX)"
  # P002：去掉 2>/dev/null 静默吞错——失败让 git 把原因写到 stderr，并指引 --source 离线。
  if git clone --depth 1 --quiet "$REPO" "$TEMP_CLONE/airein"; then
    AIREIN_SRC="$TEMP_CLONE/airein"
    echo "  ✅ 下载完成 → $TEMP_CLONE/airein"
  else
    echo "  ❌ clone 失败：$REPO" >&2
    echo "     网络不畅？从 GitHub 网页下载 source archive 后改用：" >&2
    echo "     bash update-airein.sh --source <dir|tar.gz|zip>" >&2
    rm -rf "$TEMP_CLONE"
    exit 1
  fi
  if [[ -f "$AIREIN_SRC/VERSION" ]]; then
    PKG_VERSION="$(tr -d '[:space:]' < "$AIREIN_SRC/VERSION")"
  fi
fi

# ── 1b. 版本守卫（checkGuard）──────────────────────────────────
INSTALLED_VERSION=""
if [[ -f "$CLAUDE_DIR/VERSION" ]]; then
  INSTALLED_VERSION="$(tr -d '[:space:]' < "$CLAUDE_DIR/VERSION")"
fi
if [[ -n "$PKG_VERSION" ]]; then
  GUARD_OUT="$(AIREIN_NODE_LIB="$NODE_LIB_DIR" AIREIN_PKG="$PKG_VERSION" AIREIN_INSTALLED="$INSTALLED_VERSION" \
    "$NODE_BIN" -e '
    const { checkGuard } = require(process.env.AIREIN_NODE_LIB + "/version-guard");
    try {
      const r = checkGuard({ pkgVer: process.env.AIREIN_PKG, installedVer: process.env.AIREIN_INSTALLED || undefined });
      console.log("GUARD_OK=" + (r.ok ? 1 : 0));
      console.log("MESSAGE=" + r.message);
    } catch (e) {
      console.log("GUARD_OK=ERR");
      console.log("MESSAGE=" + e.message);
    }
  ')" || { echo "❌ checkGuard 执行失败" >&2; exit 1; }
  _g_ok=""
  _g_msg=""
  while IFS= read -r _line; do
    case "$_line" in
      GUARD_OK=*) _g_ok="${_line#GUARD_OK=}" ;;
      MESSAGE=*) _g_msg="${_line#MESSAGE=}" ;;
    esac
  done <<< "$GUARD_OUT"
  if [[ "$_g_ok" == "ERR" ]]; then
    echo "❌ 版本守卫失败：$_g_msg" >&2; exit 1
  fi
  if [[ "$_g_ok" != "1" ]]; then
    echo "❌ 版本守卫拒绝（降级）：$_g_msg" >&2; exit 1
  fi
  if [[ -n "$_g_msg" ]]; then
    echo "  ℹ️  $_g_msg"
  fi
else
  echo "  ⚠️  源缺 VERSION 文件，跳过版本守卫（P002 前老源兼容）"
fi

# ── 2. 清理废弃文件 ──────────────────────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/update/clean-airein.sh" ]; then
  bash "$AIREIN_SRC/scripts/update/clean-airein.sh" "$CLAUDE_DIR"
else
  echo "🧹 clean-airein.sh 不存在，跳过清理"
fi

# ── 3. 同步文件 ──────────────────────────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/update/sync-airein.sh" ]; then
  bash "$AIREIN_SRC/scripts/update/sync-airein.sh" "$AIREIN_SRC" "$CLAUDE_DIR" "$(pwd)"
else
  echo "❌ sync-airein.sh 不存在，无法同步"
  rm -rf "$TEMP_CLONE"
  exit 1
fi

# ── 4. Dashboard 安装（委托给独立脚本）────────────────────────
echo ""
if [ -f "$AIREIN_SRC/scripts/dashboard/install-dashboard.sh" ]; then
  bash "$AIREIN_SRC/scripts/dashboard/install-dashboard.sh" "$AIREIN_SRC" "$@"
fi

# ── 5. 自我更新（最后一步）────────────────────────────────────
if [ -f "$AIREIN_SRC/update-airein.sh" ]; then
  cp "$AIREIN_SRC/update-airein.sh" "$CLAUDE_DIR/update-airein.sh" 2>/dev/null || true
fi

# ── 6. 清理临时目录 ──────────────────────────────────────────
rm -rf "$TEMP_CLONE"

# ── 7. 结果 ──────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Airein 更新完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  配置文件未覆盖（settings/quality/memory）"
echo ""

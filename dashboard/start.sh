#!/usr/bin/env bash
# start.sh — 启动/停止/重启 Dashboard 管理面板 (Linux/macOS)
#
# 用法:
#   bash start.sh              # 前台运行 (仅本机访问)
#   bash start.sh --lan        # 前台运行 (局域网可访问)
#   bash start.sh --open       # 前台运行 + 打开浏览器
#   bash start.sh --bg         # 后台运行
#   bash start.sh --bg --lan   # 后台运行 (局域网可访问)
#   bash start.sh stop         # 停止后台运行
#   bash start.sh restart      # 重启 (保留参数)
#   bash start.sh status       # 查看运行状态

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
PID_FILE="$SCRIPT_DIR/dashboard.pid"
PORT="${DASHBOARD_PORT:-3456}"

# ── 平台检测 ─────────────────────────────────────────────────
OS_TYPE="linux"
case "$(uname -s 2>/dev/null || echo unknown)" in
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
  Darwin) OS_TYPE="macos" ;;
esac

# ── 进程管理（跨平台）─────────────────────────────────────────
# Windows git bash 下 kill -0/kill 认不出原生 node 进程 pid（MSYS 与 Windows pid
# 空间不同），改用 tasklist/taskkill；Mac/Linux 保持 kill -0/kill。
is_process_alive() {
  local pid="$1"
  if [ "$OS_TYPE" = "windows" ]; then
    # tasklist -NH 无表头；进程存在则输出含 ".exe" 行，无匹配时输出「信息:...」不含 .exe
    tasklist //FI "PID eq $pid" -NH 2>/dev/null | grep -qi '\.exe'
  else
    kill -0 "$pid" 2>/dev/null
  fi
}

terminate_process() {
  local pid="$1"
  if [ "$OS_TYPE" = "windows" ]; then
    taskkill //PID "$pid" //F >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
}

# ── 端口检查函数 ─────────────────────────────────────────────
check_port() {
  local port="$1"
  local pid=""

  if [ "$OS_TYPE" = "windows" ]; then
    # Windows netstat -ano：LISTENING 行末列即 PID（\b 防 :3456 误匹配 :34560）
    pid=$(netstat -ano 2>/dev/null | grep -i LISTENING | grep -E ":$port\b" | awk '{print $NF}' | head -1)
  # 优先使用 lsof（macOS/Linux）
  elif command -v lsof &>/dev/null; then
    pid=$(lsof -ti:"$port" 2>/dev/null || true)
  # 备用：netstat（Linux）
  elif command -v netstat &>/dev/null; then
    pid=$(netstat -tulnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | grep -v '^-' || true)
  # 备用：ss（Linux）
  elif command -v ss &>/dev/null; then
    pid=$(ss -tulnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' || true)
  fi

  echo "$pid"
}

# ── 清理端口占用 ─────────────────────────────────────────────
cleanup_port() {
  local port="$1"
  local pid
  pid=$(check_port "$port")

  if [ -n "$pid" ]; then
    echo "⚠️  端口 $port 被占用 (PID: $pid)，尝试清理..."
    if is_process_alive "$pid"; then
      terminate_process "$pid"
      sleep 1
      # 再次检查
      if check_port "$port" >/dev/null; then
        echo "❌ 无法清理端口 $port，请手动处理"
        return 1
      else
        echo "✅ 端口 $port 已清理"
      fi
    else
      echo "⚠️  进程 $pid 已不存在，继续启动..."
    fi
  fi
  return 0
}

# ── status ───────────────────────────────────────────────────
if [ "${1:-}" = "status" ]; then
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if is_process_alive "$PID"; then
      echo "✅ Dashboard 运行中 (PID: $PID)"
      echo "   地址: http://localhost:$PORT"
      # 检查绑定地址（Windows 用 netstat 反查，Mac/Linux 用 lsof）
      if [ "$OS_TYPE" = "windows" ]; then
        BIND_ADDR=$(netstat -ano 2>/dev/null | grep -i LISTENING | grep -E ":$PORT\b" | awk '{print $2}' | cut -d: -f1 | head -1)
      else
        BIND_ADDR=$(lsof -p "$PID" 2>/dev/null | grep LISTEN | awk '{print $4}' | sed 's/\*$//' || echo "unknown")
      fi
      if [ -n "$BIND_ADDR" ]; then
        echo "   绑定: ${BIND_ADDR:-127.0.0.1}"
      fi
      exit 0
    else
      rm -f "$PID_FILE"
      echo "⚠️  PID 文件存在但进程已不在运行，清理 PID 文件"
      exit 1
    fi
  else
    # 检查端口是否有其他进程占用
    PID=$(check_port "$PORT")
    if [ -n "$PID" ]; then
      echo "⚠️  Dashboard 未通过本脚本启动，但端口 $PORT 被占用 (PID: $PID)"
      exit 2
    else
      echo "⚠️  Dashboard 未运行"
      exit 1
    fi
  fi
fi

# ── stop ─────────────────────────────────────────────────────
if [ "${1:-}" = "stop" ]; then
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if is_process_alive "$PID"; then
      terminate_process "$PID"
      rm -f "$PID_FILE"
      echo "✅ Dashboard 已停止 (PID: $PID)"
    else
      rm -f "$PID_FILE"
      echo "⚠️  进程 $PID 已不存在，清理 PID 文件"
    fi
  else
    # 尝试通过端口查找并停止
    PID=$(check_port "$PORT")
    if [ -n "$PID" ]; then
      echo "⚠️  未找到 PID 文件，但发现端口 $PORT 被占用 (PID: $PID)"
      read -p "是否停止此进程？ [y/N] " -n 1 -r
      echo
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        terminate_process "$PID"
        echo "✅ 已停止进程 $PID"
      fi
    else
      echo "⚠️  未找到运行中的 Dashboard"
    fi
  fi
  exit 0
fi

# ── restart ──────────────────────────────────────────────────
if [ "${1:-}" = "restart" ]; then
  # 记住之前的 --lan 参数
  RESTART_ARGS=""
  if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if is_process_alive "$PID"; then
      # 检查当前绑定地址判断是否是 lan 模式
      if [ -f "$SCRIPT_DIR/dashboard.log" ] && grep -q '0.0.0.0' "$SCRIPT_DIR/dashboard.log" 2>/dev/null; then
        RESTART_ARGS="--bg --lan"
      else
        RESTART_ARGS="--bg"
      fi
      terminate_process "$PID"
      rm -f "$PID_FILE"
      sleep 1
      echo "🔄 重启 Dashboard..."
    fi
  fi
  exec bash "$SCRIPT_DIR/start.sh" ${RESTART_ARGS:---bg}
fi

# ── 解析参数 ──────────────────────────────────────────────────
LAN_MODE=false
BG_MODE=false
OPEN_BROWSER=false

for arg in "$@"; do
  case "$arg" in
    --lan)    LAN_MODE=true ;;
    --bg)     BG_MODE=true ;;
    --open)   OPEN_BROWSER=true ;;
  esac
done

# ── 查找 Node.js ────────────────────────────────────────────
NODE=""
for candidate in node /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
  if command -v "$candidate" &>/dev/null; then
    NODE="$candidate"
    break
  fi
done

if [ -z "$NODE" ]; then
  echo "❌ 未找到 Node.js，请先安装: https://nodejs.org"
  exit 1
fi

if [ "$LAN_MODE" = true ]; then
  export DASHBOARD_BIND="0.0.0.0"
  HOST_DISPLAY="0.0.0.0 (局域网可访问，Host 白名单自动含本机 hostname/IP)"
else
  HOST_DISPLAY="127.0.0.1 (仅本机)"
fi

# ── 启动前端口检查 ───────────────────────────────────────────
if ! cleanup_port "$PORT"; then
  echo "❌ 无法清理端口 $PORT，启动失败"
  exit 1
fi

# ── 后台模式 ────────────────────────────────────────────────
if [ "$BG_MODE" = true ]; then
  nohup "$NODE" server.js > "$SCRIPT_DIR/dashboard.log" 2>&1 &
  WRAPPER_PID=$!
  # 反查真实监听 pid：Windows git bash 下 $! 是 nohup wrapper，非真实 node 进程 pid；
  # Mac/Linux 反查同样更准（直接拿监听进程）。10×0.3s 轮询，失败兜底 wrapper pid。
  PID=""
  for _ in {1..10}; do
    PID=$(check_port "$PORT")
    if [ -n "$PID" ]; then break; fi
    sleep 0.3
  done
  PID="${PID:-$WRAPPER_PID}"
  echo "$PID" > "$SCRIPT_DIR/dashboard.pid"
  echo "✅ Dashboard 后台启动 (PID: $PID)"
  echo "   绑定: $HOST_DISPLAY"
  echo "   地址: http://localhost:$PORT"
  if [ "$LAN_MODE" = true ]; then
    echo "   局域网: http://$(hostname 2>/dev/null || echo '<hostname>'):$PORT"
  fi
  echo "   日志: $SCRIPT_DIR/dashboard.log"
  echo "   停止: bash $0 stop"
  echo "   状态: bash $0 status"
  exit 0
fi

# ── 前台模式 ────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Dashboard — http://localhost:$PORT"
echo "  绑定: $HOST_DISPLAY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$OPEN_BROWSER" = true ]; then
  OPEN_CMD=""
  if command -v open &>/dev/null; then
    OPEN_CMD="open"
  elif command -v xdg-open &>/dev/null; then
    OPEN_CMD="xdg-open"
  fi
  if [ -n "$OPEN_CMD" ]; then
    sleep 1 && "$OPEN_CMD" "http://localhost:$PORT" &
  fi
fi

exec "$NODE" server.js

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
MODE_FILE="$SCRIPT_DIR/.dashboard-mode"
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
# Mac 上 lsof -ti:PORT 可能返回多行 PID（IPv4/IPv6）；stop 需全部处理。
check_port_pids() {
  local port="$1"
  if [ "$OS_TYPE" = "windows" ]; then
    netstat -ano 2>/dev/null | grep -i LISTENING | grep -E ":$port\b" | awk '{print $NF}' | sort -u
    return
  fi
  if command -v lsof &>/dev/null; then
    lsof -ti:"$port" 2>/dev/null | sort -u
    return
  fi
  if command -v ss &>/dev/null; then
    ss -tulnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | sort -u
    return
  fi
  if command -v netstat &>/dev/null; then
    netstat -tulnp 2>/dev/null | grep ":$port " | awk '{print $7}' | cut -d'/' -f1 | grep -v '^-' | sort -u
  fi
}

check_port() {
  check_port_pids "$1" | head -n1
}

read_pid_file() {
  if [ ! -f "$PID_FILE" ]; then
    echo ""
    return
  fi
  head -n1 "$PID_FILE" | tr -d '[:space:]'
}

stop_port_listeners() {
  local port="$1"
  local pid stopped=0
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    if is_process_alive "$pid"; then
      terminate_process "$pid"
      echo "✅ 已停止端口 $port 监听进程 (PID: $pid)"
      stopped=$((stopped + 1))
    fi
  done < <(check_port_pids "$port")
  echo "$stopped"
}

# 读取/保存 LAN 模式（restart 与 install-dashboard 自动重启时保留 --lan）
read_persisted_lan_mode() {
  if [ -f "$MODE_FILE" ] && grep -qx 'lan' "$MODE_FILE" 2>/dev/null; then
    echo "true"
  else
    echo "false"
  fi
}

write_persisted_lan_mode() {
  if [ "$1" = true ]; then
    echo "lan" > "$MODE_FILE"
  else
    echo "local" > "$MODE_FILE"
  fi
}

# 当前端口监听地址（Mac/Linux: lsof；Windows: netstat）
get_listen_addr() {
  local port="$1"
  if [ "$OS_TYPE" = "windows" ]; then
    netstat -ano 2>/dev/null | grep -i LISTENING | grep -E ":$port\b" | awk '{print $2}' | head -1
    return
  fi
  if command -v lsof &>/dev/null; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR==2 {print $NF}'
    return
  fi
  echo "unknown"
}

is_lan_listening() {
  local port="$1"
  local name host
  name=$(get_listen_addr "$port")
  case "$name" in
    *:*)
      host="${name%:*}"
      [ "$host" = "*" ] || [ "$host" = "0.0.0.0" ] || [ "$host" = "[::]" ] || [ "$host" = "::" ]
      ;;
    *) false ;;
  esac
}

cleanup_port() {
  local port="$1"
  local pid pids_found=0

  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    pids_found=1
    echo "⚠️  端口 $port 被占用 (PID: $pid)，尝试清理..."
    if is_process_alive "$pid"; then
      terminate_process "$pid"
    fi
  done < <(check_port_pids "$port")

  if [ "$pids_found" -eq 1 ]; then
    sleep 1
    if [ -n "$(check_port "$port")" ]; then
      echo "❌ 无法清理端口 $port，请手动处理"
      return 1
    fi
    echo "✅ 端口 $port 已清理"
  fi
  return 0
}

# ── status ───────────────────────────────────────────────────
if [ "${1:-}" = "status" ]; then
  PID="$(read_pid_file)"
  if [ -n "$PID" ] && is_process_alive "$PID"; then
    echo "✅ Dashboard 运行中 (PID 文件: $PID)"
  elif [ -n "$(check_port "$PORT")" ]; then
    echo "⚠️  Dashboard 在端口 $PORT 运行中（PID 文件无效或来自其他目录）"
    echo "   监听 PID: $(check_port_pids "$PORT" | tr '\n' ' ')"
    echo "   本脚本目录: $SCRIPT_DIR"
    echo "    canonical 安装: $HOME/dashboard （非 ~/.airein/dashboard）"
  elif [ -n "$PID" ]; then
    rm -f "$PID_FILE"
    echo "⚠️  PID 文件存在但进程已不在运行，清理 PID 文件"
    exit 1
  else
    echo "⚠️  Dashboard 未运行"
    exit 1
  fi
  LISTEN=$(get_listen_addr "$PORT")
  if is_lan_listening "$PORT"; then
    echo "   绑定: 0.0.0.0:$PORT (局域网可访问)"
    echo "   本机: http://127.0.0.1:$PORT"
    echo "   局域网: http://$(ipconfig getifaddr en0 2>/dev/null || hostname):$PORT"
  else
    echo "   绑定: 127.0.0.1:$PORT (仅本机；局域网请: bash start.sh --bg --lan)"
    echo "   地址: http://localhost:$PORT"
  fi
  if [ -n "$LISTEN" ] && [ "$LISTEN" != "unknown" ]; then
    echo "   监听: $LISTEN"
  fi
  exit 0
fi

# ── stop ─────────────────────────────────────────────────────
if [ "${1:-}" = "stop" ]; then
  STOPPED=0
  PID="$(read_pid_file)"
  if [ -n "$PID" ]; then
    if is_process_alive "$PID"; then
      terminate_process "$PID"
      echo "✅ 已停止 PID 文件中的进程 ($PID)"
      STOPPED=1
    else
      echo "⚠️  PID 文件中的进程 $PID 已不存在"
    fi
    rm -f "$PID_FILE"
  fi
  # 始终按端口清理（PID 漂移 / ~/dashboard 与 ~/.airein/dashboard 双安装）
  PORT_STOPPED=$(stop_port_listeners "$PORT" | tail -n1)
  STOPPED=$((STOPPED + ${PORT_STOPPED:-0}))
  if [ "$STOPPED" -eq 0 ]; then
    echo "⚠️  端口 $PORT 无 Dashboard 进程"
  fi
  exit 0
fi

# ── restart ──────────────────────────────────────────────────
if [ "${1:-}" = "restart" ]; then
  RESTART_ARGS="--bg"
  if [ "$(read_persisted_lan_mode)" = true ]; then
    RESTART_ARGS="--bg --lan"
  elif [ -f "$SCRIPT_DIR/dashboard.log" ] && grep -q 'Bound to 0.0.0.0' "$SCRIPT_DIR/dashboard.log" 2>/dev/null; then
    RESTART_ARGS="--bg --lan"
  fi
  if [ -f "$PID_FILE" ]; then
    PID="$(read_pid_file)"
    if [ -n "$PID" ] && is_process_alive "$PID"; then
      terminate_process "$PID"
    fi
    rm -f "$PID_FILE"
    stop_port_listeners "$PORT" >/dev/null || true
    sleep 1
    echo "🔄 重启 Dashboard (${RESTART_ARGS})..."
  fi
  exec bash "$SCRIPT_DIR/start.sh" $RESTART_ARGS
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

# P004：standalone ~/dashboard 从 ~/.airein 加载 lib（config.json / 环境变量）
if [ -f "$SCRIPT_DIR/config.json" ] && command -v "$NODE" &>/dev/null; then
  KERNEL_FROM_CFG=$("$NODE" -e "
    try {
      const c = require(process.argv[1]);
      if (c.kernelRoot) process.stdout.write(String(c.kernelRoot));
    } catch {}
  " "$SCRIPT_DIR/config.json" 2>/dev/null || true)
  if [ -n "$KERNEL_FROM_CFG" ]; then
    export AIREIN_KERNEL="$KERNEL_FROM_CFG"
  fi
fi
if [ -z "${AIREIN_KERNEL:-}" ] && [ -f "$HOME/.airein/scripts/lib/utils.js" ]; then
  export AIREIN_KERNEL="$HOME/.airein"
fi

if [ "$LAN_MODE" = true ]; then
  export DASHBOARD_BIND="0.0.0.0"
  HOST_DISPLAY="0.0.0.0 (局域网可访问，Host 白名单自动含本机 hostname/IP)"
  write_persisted_lan_mode true
else
  unset DASHBOARD_BIND
  export DASHBOARD_BIND="127.0.0.1"
  HOST_DISPLAY="127.0.0.1 (仅本机)"
  write_persisted_lan_mode false
fi

# ── 启动前端口检查 ───────────────────────────────────────────
if ! cleanup_port "$PORT"; then
  echo "❌ 无法清理端口 $PORT，启动失败"
  exit 1
fi

# ── 后台模式 ────────────────────────────────────────────────
if [ "$BG_MODE" = true ]; then
  nohup env DASHBOARD_BIND="$DASHBOARD_BIND" "$NODE" server.js > "$SCRIPT_DIR/dashboard.log" 2>&1 &
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
  echo "$PID" > "$PID_FILE"
  sleep 0.5
  if grep -q 'Cannot find module' "$SCRIPT_DIR/dashboard.log" 2>/dev/null \
    || grep -q 'cannot find airein kernel' "$SCRIPT_DIR/dashboard.log" 2>/dev/null; then
    echo "❌ Dashboard 启动失败，见日志:"
    tail -n 15 "$SCRIPT_DIR/dashboard.log"
    rm -f "$SCRIPT_DIR/dashboard.pid"
    exit 1
  fi
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

exec env DASHBOARD_BIND="$DASHBOARD_BIND" "$NODE" server.js

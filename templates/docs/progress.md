<!-- TEMPLATE: progress.md — 机器可读的进度追踪文件 -->
<!-- 用途：new-plan 创建计划时自动生成，由 hooks 和 skill 解析 -->
<!-- 注意：此文件不是审批文档，是内部状态文件 -->

# Progress: {Title}
status: in_progress
updated: {date}
plan: P{NNN}-{slug}
complexity: {pipeline name, e.g. "m-feature" or custom name}
grilling: in_progress

## Task Stats
total: {N}
completed: 0
in_progress: 0
pending: {N}

## Approval State
<!-- 每个审批文档一个条目，状态流转：none → draft → approved -->
<!-- 条目来自 pipeline 的 docs 列表，不可硬编码 -->
{for each doc in pipeline:}
{doc_name}: none

## Active Task
none

## Blockers
- none

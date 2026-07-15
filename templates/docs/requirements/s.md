<!-- TEMPLATE: requirements/s.md — S 规模产品需求说明书（PRD）结构模板 -->
<!-- 权威模板：供 new-plan 在 s-* 且 pipeline 含 requirements 时生成计划内 requirements.md -->
<!-- 定位：产品需求说明书（PRD），不是简易需求摘要 -->
<!-- 注意：HTML 注释是填写指引，生成时替换为实际内容 -->

# Requirements: {Title}

> **产品需求说明书（PRD）** · 规模：**S**  
> 禁止写成「简易需求摘要」。至少包含：价值、角色、场景、功能要点、可测验收、范围外。

## Problem Statement / Value
<!-- 一段话：用户痛点与本功能要交付的价值 -->

## Users & Roles
<!-- 至少一个角色（可简写） -->
- **Primary**: {角色} — {诉求}

## Core Scenarios
<!-- 至少 1 个核心场景 -->
1. **{场景名}**: {用户在什么情况下、做什么、期望什么}

## Feature Outline
<!-- 功能要点列表（S 可不拆 R1/R2） -->
- {功能点 1}
- {功能点 2}

## Acceptance Criteria
<!-- 每条必须可测试 -->
- [ ] WHEN {条件} THEN {预期结果}
- [ ] WHEN {条件} THEN {预期结果}

## Non-Functional (optional for S)
<!-- 无额外 NFR 时可写「无额外 NFR」 -->
- {性能 / 安全 / 兼容性，可省略项写「无」}

## Out of Scope
<!-- 明确不做，防止蔓延 -->
-

## Status: draft

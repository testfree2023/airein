---
# conventions 薄壳骨架（CC 原生条件规则）。
# 机制：frontmatter paths 决定编辑哪些文件时注入此规则；@include 从 docs/ 拉内容
# （薄壳是指针，docs/ 是单一真相源）。CC 要求 frontmatter 在文件第一行，故指引
# 写在本 YAML 注释里（parseYaml 忽略，不进 content，不被 @include 扫描）。
#
# 生成步骤（init-project / 手动）：
#   ① {scope} 替换为语言/技术栈小写 token，须匹配 design-conventions 模板文件名
#      （javascript/bash/python/typescript/go/rust/kotlin/java 等）；
#   ② {paths-globs} 替换为该 scope 源文件 glob 数组（如 scripts 库 + hooks）；
#   ③ @include 保持 @../../docs/conventions-{scope}.md（薄壳位于 .claude/rules/，
#      相对项目根 docs/）。
# 生成后校验：node scripts/lib/conventions-shell.js .claude/rules/conventions-{scope}.md
paths: ["{paths-globs}"]
---
@../../docs/conventions-{scope}.md

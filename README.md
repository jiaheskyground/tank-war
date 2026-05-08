# Tank War — 网页版坦克大战

经典 Battle City 风格的网页坦克大战游戏，使用原生 HTML + CSS + JavaScript 开发，无需任何构建工具或 npm 依赖。

## 快速开始

直接用浏览器打开 `index.html` 即可运行。

```bash
# Linux / macOS
open index.html

# 或者直接双击 index.html 文件
```

## 操作方式

| 操作 | 按键 |
|------|------|
| 移动 | W A S D 或 方向键 ↑ ↓ ← → |
| 射击 | 空格键 |
| 暂停/继续 | P 键 |

## 游戏玩法

- 控制你的坦克消灭所有敌方坦克
- 砖墙可被子弹摧毁，铁墙不可摧毁
- 草地可以穿过但会遮挡视野
- 水域无法进入
- 被击中会损失生命值，生命耗尽游戏结束
- 消灭敌人获得分数

## 技术说明

- 所有画面通过 Canvas 绘制，无需外部图片资源
- 音效使用 Web Audio API 振荡器生成
- 纯原生实现，零依赖

## 项目结构

```
tank-war/
├── index.html    # 主页面
├── style.css     # 样式
├── game.js       # 游戏逻辑
├── assets/       # 资源文件（预留）
└── README.md
``  直接打开（推荐）

  # 直接浏览器打开，无需服务器
  xdg-open /home/ljh/workspace/tank-war/index.html

  或者直接在文件管理器中双击 index.html 即可。这个项目没有跨域请求，不需要 HTTP 服务器。

  如果需要 HTTP 服务器

  cd /home/ljh/workspace/tank-war
  python3 -m http.server 8080
  # 然后浏览器访问 http://localhost:8080

  ▎ 注意：! 前缀可以让命令在会话中执行，例如在对话中输入 ! xdg-open /home/ljh/workspace/tank-war/index.html。`

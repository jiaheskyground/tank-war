# Tank War — 网页版坦克大战（联机版）

经典 Battle City 风格的网页坦克大战，支持单机和对战联机。

## 快速开始

```bash
npm install
npm start
```

浏览器访问 `http://localhost:8080`

## 联机对战

1. 打开浏览器，点击 **ONLINE BATTLE**
2. 点击 **CREATE ROOM** 创建房间
3. 复制邀请链接发给对手（或手动输入房间号）
4. 双方点击 **READY**
5. 倒计时结束后开始对战

## 操作方式

| 操作 | 按键 |
|------|------|
| 移动 | W A S D 或 方向键 |
| 射击 | 空格键 |
| 暂停 | P 键（仅单机模式） |

## 项目结构

```
tank-war/
├── server/           # 服务端（Express + WebSocket）
│   ├── server.js     # 主进程
│   ├── room.js       # 房间管理
│   ├── gameState.js  # 服务端权威游戏逻辑
│   ├── sync.js       # 快照同步
│   └── antiCheat.js  # 反作弊校验
├── public/           # 客户端
│   ├── index.html    # UI
│   ├── online.js     # 联机模式
│   ├── singleplayer.js # 单机模式
│   ├── renderer.js   # Canvas 渲染 + 音效
│   ├── network.js    # WebSocket 网络层
│   └── ui.js         # UI 控制器
├── shared/           # 共享逻辑
│   ├── constants.js  # 常量配置
│   ├── Tank.js       # 坦克
│   ├── Bullet.js     # 子弹
│   ├── Collision.js  # 碰撞检测
│   └── Map.js        # 地图生成
└── legacy/           # 原始单机版（归档）
```

## 技术说明

- 服务端权威架构，20tps 游戏循环
- WebSocket 实时通信，10Hz 快照同步
- 客户端预测 + 远程玩家插值
- 内置反作弊（速度/射速/瞬移检测）
- 断线自动重连（5 次指数退避）
- Canvas 渲染 + Web Audio API 音效

## 部署

### Railway

1. 将代码推送到 GitHub
2. 在 [Railway](https://railway.com) 中点击 **New Project → Deploy from GitHub Repo**
3. 选择仓库 `jiaheskyground/tank-war`
4. Railway 会自动检测 Node.js 项目并部署
5. 无需额外配置 — `npm start` 和 `PORT` 环境变量已就绪

### 环境变量

- `PORT` — Railway 自动设置，服务端默认 8080

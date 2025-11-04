# MoView 架构概览

## 系统目标
- **实时环境感知**：使用本地摄像头检测是否存在除用户之外的其他人。
- **活动状态识别**：通过黑白名单识别当前前台程序是否属于游戏。
- **自动上下文切换**：在满足条件时，自动将前台切换到预设的工作应用。
- **跨平台支持**：重点支持 macOS 与 Windows，后续可扩展 Linux。
- **资源友好**：保证在中低配置机器上也能达到可接受的实时性（目标 ≥15 FPS）。

## 分层架构

```
┌──────────────────────────────────────────┐
│               Electron Main              │
│ • 应用生命周期管理                        │
│ • 进程/窗口检测（active-win）             │
│ • 平台自动切换实现（AppleScript/PowerShell）│
│ • IPC 通信                               │
└──────────────────────────────────────────┘
              ▲                     ▲
              │ IPC                 │ IPC
┌────────────────────┐        ┌────────────────────┐
│    Preload 层      │        │     Renderer 层     │
│ • 安全暴露 API     │<──────►│ • UI & 设置          │
│ • 设置存取包装     │        │ • 摄像头预览         │
│ • 文件存储         │        │ • 本地推理循环       │
└────────────────────┘        │   (Human / TFJS)    │
                              └────────────────────┘
```

## 关键模块

| 模块 | 说明 |
| --- | --- |
| `PresenceDetector` | 基于 `@vladmandic/human` 进行人体/人脸检测，额外计算帧间差分以获取运动强度。 |
| `SafeFaceRegistry` | 由设置层持久化安全面孔的人脸向量，实现本地人脸识别与匹配阈值管理。 |
| `AppMonitor` | 使用 `active-win` 轮询当前前台进程，判断是否命中黑白名单。 |
| `ContextSwitchService` | 封装跨平台窗口前置逻辑：macOS 通过 AppleScript 激活并放大窗口，Windows 通过 PowerShell 调用 Win32 API 前置已存在窗口，必要时再启动。 |
| `SettingsStore` | 通过 `electron-store` 持久化黑白名单、检测参数、工作应用候选和安全面孔。 |
| `AutomationController` | 在 Renderer 中组合 `PresenceDetector` 与 `AppMonitor` 输出，管理冷却、帧计数和 IPC 通知。 |

## 数据流
1. Renderer 使用 `navigator.mediaDevices.getUserMedia` 获取摄像头流，Video 元素托管给 `PresenceDetector`。
2. `PresenceDetector` 对抽样帧做人体/人脸检测与帧间差分，输出置信度、运动强度与安全面孔匹配结果。
3. 结果通过 IPC 写回 Main 进程，合并 `AppMonitor` 的前台程序判定，形成完整的自动化状态。
4. `AppMonitor` 在 Main 进程轮询（默认 2s），判断是否在黑名单且不在白名单。
5. 当检测到访客且存在黑名单应用，Main 进程调用 `ContextSwitchService` 前置或启动目标工作软件，Renderer 同步 UI 状态。

## 性能策略
- **帧率限制**：`PresenceDetector` 采用请求动画帧 + 时间间隔控制（默认 10~15 FPS）。
- **多分辨率推理**：默认将帧缩放到 160px 宽用于运动检测，同时将完整帧交给 Human 推理。
- **模型懒加载**：仅在开启自动检测或捕获安全面孔时加载模型，降低启动开销。
- **硬件加速优先**：Human 优先使用 WebGL；如果不可用，自动回退到 WASM。

## 配置及扩展
- 黑名单/白名单：基于程序名、Bundle ID、进程路径匹配，支持用户自定义。
- 工作应用：可配置複数候选，优先激活第一个可用项。
- 自动化策略：可配置访客检测灵敏度、连续帧判定次数，减少误判。
- 日志与调试：Main 进程维护 rolling log（可选），方便定位误触发问题。

## 开发路线建议
1. **阶段一**：搭建 Electron + React/TypeScript 骨架，实现设置 UI 与基础 IPC。
2. **阶段二**：集成摄像头与本地推理（先选择 `@vladmandic/human`，保证可运行 MVP）。
3. **阶段三**：实现跨平台进程检测与上下文切换（active-win + AppleScript/PowerShell）。
4. **阶段四**：完善配置持久化、黑/白名单管理界面与数据校验。
5. **阶段五**：性能打磨、添加自动化测试、打包脚本（electron-builder）。

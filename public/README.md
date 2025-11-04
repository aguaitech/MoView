将 `@vladmandic/human` 所需的模型文件放在本目录（或其子目录）下。

推荐的目录结构：

```
public/
  human-models/
    face/
    body/
    ...
```

开发模式下，Vite 会直接从这里提供静态资源；构建时请确保将该目录复制到 `dist/renderer/human-models/`。

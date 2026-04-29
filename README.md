<p align="center">
  <img src="docs/assets/readme-banner.png" alt="ComicSlicer Banner" width="100%">
</p>

# ComicSlicer 漫画格子裁剪器

ComicSlicer 是一个基于 Tauri + Vite + React + Tailwind CSS 的桌面应用，用来把二格、四格或多格连续漫画自动裁剪成单独的漫画格图片。

应用支持读取用户上传图片的真实尺寸，按上下或左右排列切分格子，并允许手动拖动某一根截断线微调裁剪位置。裁剪完成后可以预览每一格，也可以选择保存位置批量导出 ZIP。

## 功能特性

- 上传 PNG、JPG、WEBP 等常见图片格式。
- 自动识别原图宽高，并填入目标导出尺寸。
- 支持自定义目标导出宽 `W` 和高 `H`。
- 支持二格、四格、多格漫画裁剪。
- 支持上下排列和左右排列。
- 支持单独拖动某一根截断线，不影响其他分割线。
- 支持一键重置分割线为等分。
- 支持逐格预览和单张下载。
- 支持通过系统保存对话框选择 ZIP 批量下载位置。

## 裁剪逻辑

1. 应用先读取上传图片的真实尺寸。
2. 目标导出尺寸 `W x H` 同时决定整张漫画主体区域的宽高比和导出像素尺寸。
3. 应用会先按目标宽高比从原图中居中裁出主体区域。
4. 再按漫画格数和排列方向生成分割线。
5. 用户可以拖动任意一根内部截断线进行微调。
6. 导出时，每个格子的像素尺寸会按目标尺寸和分割线比例计算。

例如：目标尺寸为 `1086 x 1448`，排列为上下，格数为 4，默认等分时每格导出尺寸为 `1086 x 362`。

## 使用方法

1. 点击“上传漫画图片”，选择一张连续漫画图。
2. 应用会自动识别原图尺寸，并填入目标导出尺寸。
3. 根据需要修改漫画格数、排列方向、目标宽高。
4. 如需微调，在预览图中拖动黄色截断线。
5. 查看下方单格预览。
6. 点击单张“下载”保存某一格，或点击“选择位置并批量保存”导出 ZIP。

## 开发环境

需要安装：

- Node.js
- Rust
- Windows WebView2 Runtime

安装依赖：

```bash
npm install
```

启动网页开发服务器：

```bash
npm run dev
```

启动 Tauri 桌面开发版：

```bash
npm run tauri dev
```

## 验证命令

运行单元测试：

```bash
npm test
```

构建前端：

```bash
npm run build
```

检查 Tauri/Rust 项目：

```bash
cd src-tauri
cargo check
```

## 打包

生成桌面安装包：

```bash
npm run tauri build
```

打包产物通常位于：

```text
src-tauri/target/release/bundle
```

## 项目结构

```text
.
├── src
│   ├── App.tsx              # 主界面、上传、预览、拖动分割线、导出逻辑
│   ├── cropLayout.ts        # 裁剪区域和导出尺寸计算
│   ├── cropLayout.test.ts   # 裁剪逻辑单元测试
│   ├── main.tsx             # React 入口
│   └── styles.css           # Tailwind 和界面样式
├── src-tauri
│   ├── capabilities         # Tauri 权限配置
│   ├── icons                # 应用图标
│   ├── src/main.rs          # Tauri 入口
│   ├── Cargo.toml           # Rust 依赖
│   └── tauri.conf.json      # Tauri 应用配置
├── package.json
└── vite.config.ts
```

## 常见问题

### 选择了 1086 x 1448，为什么原图显示是 1024 x 1536？

`1024 x 1536` 是上传图片的真实像素尺寸，`1086 x 1448` 是目标导出尺寸。应用会按目标尺寸的比例裁剪，并在导出时缩放到目标像素。

### 批量下载保存到哪里？

在 Tauri 桌面应用中，点击“选择位置并批量保存”会弹出系统保存对话框。选择路径后，页面会显示 ZIP 实际保存位置。

### 拖动分割线会影响其他线吗？

不会。拖动某一根内部截断线只会改变它相邻两格的大小，其他分割线保持不动。
## GitHub Actions 打包

仓库包含两个 workflow：

- `CI`：推送到 `main` 或创建 PR 时运行测试、前端构建和 `cargo check`。
- `Release`：手动运行或推送 `v*` tag 时构建 Windows 安装包，并生成自动更新签名文件。

自动更新需要在 GitHub 仓库的 `Settings -> Secrets and variables -> Actions` 中配置：

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

这两个值必须来自同一组 Tauri updater 签名密钥。私钥不要提交到仓库。

手动打包：进入 GitHub 仓库的 `Actions` 页面，选择 `Release`，点击 `Run workflow`。构建完成后可在 workflow 的 Artifacts 中下载 `ComicSlicer-windows`。

发布打包：创建并推送 tag，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub 会自动构建 Windows 安装包，并创建一个 draft release。

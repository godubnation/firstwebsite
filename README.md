# 个人主页

一个三屏响应式个人网页，包含个人介绍、学习记录、北京实时天气和 AI 图片背景去除工具。

## 功能

- 第一屏：个人头像、介绍、兴趣爱好、学习目标与北京实时天气
- 第二屏：可继续扩展的学习时间线
- 第三屏：拖拽或点击上传图片，对比原图与透明背景结果，并下载处理后的图片
- 图片背景去除使用 Replicate 上的 [`lucataco/remove-bg`](https://replicate.com/lucataco/remove-bg/api) 模型

## 配置

需要 Node.js 20 或更新版本，以及一个 Replicate API Token。

1. 复制环境变量示例：

   ```bash
   cp .env.example .env
   ```

2. 打开 `.env`，填写自己的 Token：

   ```dotenv
   REPLICATE_API_TOKEN=r8_你的真实Token
   PORT=3000
   ```

`.env` 已加入 `.gitignore`，不要把真实 Token 写入 HTML、JavaScript 或提交到版本库。

## 启动

```bash
npm start
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。不要直接双击打开 `dist/index.html`，因为图片处理功能需要后端接口。

## 使用图片工具

1. 滚动到第三屏“一键去除图片背景”。
2. 拖拽图片到上传区域，或点击选择文件。
3. 点击“去除背景”，等待处理完成。
4. 对比原图与结果，点击“下载结果”保存透明背景 PNG。

支持 JPG、PNG、WebP，单张图片最大 10 MB。上传的图片会发送给 Replicate 模型进行处理。

## 项目结构

```text
.
├── dist/
│   ├── index.html      # 页面、样式和前端交互
│   └── 大头.jpg         # 个人头像
├── server.mjs          # 静态文件服务器与 Replicate 安全代理
├── .env.example        # 环境变量示例
└── package.json        # 启动与检查命令
```

## 安全说明

- `REPLICATE_API_TOKEN` 只在 `server.mjs` 中从服务器环境读取，不会发送到浏览器。
- 后端仅接受 JPG、PNG、WebP 格式的数据 URL，并限制请求大小。
- 下载代理只允许访问 Replicate 的结果域名，避免任意地址转发。

## 修改页面

- 主题颜色：编辑 `dist/index.html` 顶部 `:root` 中的颜色变量。
- 个人文字：在第一屏 HTML 中修改昵称、介绍、兴趣和学习目标。
- 学习记录：复制一个 `<li class="record">` 节点后修改其中内容。

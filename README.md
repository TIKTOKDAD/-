# 抖音小程序评论后台

这是一个从 0 到 1 的可运行原型，包含三部分：

- Node.js 服务端
- Ant Design Pro 后台管理端
- 抖音小程序前端骨架

当前版本已经支持：

- 后台登录鉴权
- 平台管理
- 商标管理与 Logo 上传
- OpenAI 兼容接口配置
- 评论生成
- 默认用户映射
- 评论审核
- SQLite 本地持久化
- 抖音小程序生成页原型

---

## 1. 项目结构

```text
D:\tik
├─ src/                    # Node.js 服务端
├─ admin-pro/              # Ant Design Pro 后台前端源码
├─ miniapp/                # 抖音小程序源码
├─ data/
│  ├─ app.db               # SQLite 数据库（运行后自动生成）
│  ├─ uploads/             # 商标 Logo 上传目录
│  └─ store.json           # 旧版 JSON 初始化数据源
├─ scripts/
│  └─ smoke-test.js        # 冒烟测试脚本
├─ package.json            # 根目录脚本（服务端启动、冒烟测试）
└─ README.md
```

---

## 2. 技术栈

### 服务端

- Node.js ESM
- `node:sqlite`（Node 24 内置）
- 原生 `http` 服务
- SQLite 数据库存储

### 后台前端

- React
- Umi / Ant Design Pro
- Ant Design

### 小程序端

- 抖音小程序原生页面
- `tt.request` 调后端 API

---

## 3. 环境要求

从只有源代码开始，建议先准备下面这些：

### 必需

- Node.js 24.x 或更高
- npm 10.x 或更高

### 可选但推荐

- Git
- 抖音开发者工具
- PM2（如果你要长期运行服务）
- Nginx（如果你要做反向代理）

### 为什么建议 Node 24+

这个项目服务端使用的是 Node 24 自带的 `node:sqlite`。
如果 Node 版本太低，服务端无法正常启动。

你可以先执行：

```bash
node -v
npm -v
```

### 源代码怎么准备

如果你拿到的是压缩包：

1. 解压到一个固定目录，例如 `D:\tik`
2. 用终端进入这个目录
3. 按下面的步骤安装依赖和构建

如果你拿到的是 Git 仓库：

```bash
git clone <你的仓库地址> D:\tik
cd D:\tik
```

建议把项目放在一个没有中文空格、没有权限限制的目录里，避免构建工具或上传目录出现权限问题。

---

## 4. 从源代码开始，本地第一次跑起来

这一节就是“从一台空机器 + 一份源码”开始，怎么一步步跑起来。

### 最短命令清单

如果你只是想先尽快跑起来，可以直接按这个顺序执行：

```bash
cd D:\tik\admin-pro
npm install
npm run build

cd D:\tik
node src/server.js
```

注意：

- `npm run build` 要在 `admin-pro/` 目录执行
- `node src/server.js` 要回到项目根目录 `D:\tik` 执行
- 服务端文件在 `D:\tik\src\server.js`，不在 `D:\tik\admin-pro\src\server.js`

然后打开：

- [http://127.0.0.1:3000](http://127.0.0.1:3000)
- 默认账号：`admin`
- 默认密码：`ChangeMe123!`

### 第 1 步：进入项目根目录

```bash
cd D:\tik
```

### 第 2 步：安装后台前端依赖

根目录服务端没有第三方 npm 依赖。
真正需要安装依赖的是 `admin-pro/`。

如果你看到仓库里已经有 `admin-pro/package-lock.json`，那说明依赖版本已经被锁定，直接安装即可。

```bash
cd admin-pro
npm install
```

如果你在 CI 或全新服务器上部署，也可以使用：

```bash
npm ci
```

`npm ci` 会严格按锁文件安装，适合更稳定的部署场景。

安装完成后回到项目根目录：

```bash
cd ..
```

### 第 3 步：构建后台前端

服务端实际会托管 `admin-pro/dist` 里的静态文件。
所以第一次运行前，你要先把后台前端构建出来。

```bash
cd admin-pro
npm run build
cd ..
```

构建成功后，后台静态文件会输出到：

```text
admin-pro/dist/
```

如果这里没有生成文件，服务端虽然能启动，但后台页面会是空白或 404。

### 第 4 步：启动服务端

```bash
node src/server.js
```

正常启动后，终端会看到类似输出：

```text
Douyin review studio running at http://0.0.0.0:3000
SQLite database: D:\tik\data\app.db
```

第一次启动时如果数据库里还没有管理员，还会自动创建默认管理员账号。

### 第 5 步：打开后台

浏览器访问：

- 后台首页：[http://127.0.0.1:3000](http://127.0.0.1:3000)
- 健康检查：[http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)

### 第 6 步：使用默认管理员登录

首次启动默认管理员：

- 用户名：`admin`
- 密码：`ChangeMe123!`

建议登录后第一时间去后台“AI 配置 / 账号安全”里修改密码。

---

## 5. 本地开发时怎么运行

如果你是“开发模式”，一般分两种：

### 方案 A：最接近部署环境的方式

适合联调和验收。

1. 构建后台前端
2. 启动 Node 服务端
3. 浏览器直接访问 `http://127.0.0.1:3000`

命令：

```bash
cd D:\tik\admin-pro
npm run build

cd D:\tik
node src/server.js
```

### 方案 B：后台前端热更新开发

适合改后台界面时使用。

先开服务端：

```bash
cd D:\tik
node src/server.js
```

再单独开后台前端开发服务器：

```bash
cd D:\tik\admin-pro
npm run dev
```

Umi 开发服务器会在终端输出访问地址。
你直接打开它输出的地址即可。

说明：

- 后台开发模式下，前端会通过代理把 `/api` 请求转到 `http://127.0.0.1:3000`
- 小程序和正式预览仍然建议使用服务端托管的版本

### 项目里常用命令

根目录常用命令：

```bash
cd D:\tik
node src/server.js
node scripts/smoke-test.js
```

也可以使用根目录脚本：

```bash
cd D:\tik
npm run start
npm run smoke
```

后台前端常用命令：

```bash
cd D:\tik\admin-pro
npm install
npm run dev
npm run build
```

---

## 6. 环境变量说明

服务端支持下面这些环境变量：

- `PORT`：监听端口，默认 `3000`
- `HOST`：监听地址，默认 `0.0.0.0`
- `ADMIN_USERNAME`：首次启动默认管理员用户名
- `ADMIN_PASSWORD`：首次启动默认管理员密码
- `SESSION_TTL_HOURS`：后台登录态有效时长，默认 `168`

### Windows PowerShell 示例

```powershell
$env:PORT='3000'
$env:HOST='0.0.0.0'
$env:ADMIN_USERNAME='admin'
$env:ADMIN_PASSWORD='ChangeMe123!'
node src/server.js
```

### Linux / macOS 示例

```bash
PORT=3000 HOST=0.0.0.0 ADMIN_USERNAME=admin ADMIN_PASSWORD='ChangeMe123!' node src/server.js
```

---

## 7. OpenAI 兼容接口怎么配置

进入后台后，在“AI 配置”页面填写：

- `baseUrl`
- `apiKey`
- `model`
- `temperature`

### 兼容逻辑

当前服务端会：

1. 优先尝试 `POST /v1/responses`
2. 如果你的兼容网关没有实现这个接口，会自动回退到 `POST /v1/chat/completions`

所以：

- 新网关可以直接接 `responses`
- 老网关只支持 `chat/completions` 也能继续用

### 如果没配置 AI 网关

系统不会报死，而是返回本地 `mock` 评论，方便你继续联调完整业务流程。

---

## 8. 数据文件都在哪里

### SQLite 数据库

```text
data/app.db
```

### 上传的商标 Logo

```text
data/uploads/
```

### 旧版初始化 JSON

```text
data/store.json
```

### 生产环境最重要的备份目录

至少备份：

- `data/app.db`
- `data/uploads/`

如果这两个丢了：

- 平台、商标、评论记录会丢
- 上传的 Logo 文件会丢

---

## 9. 抖音小程序怎么接入

小程序源码目录：

```text
miniapp/
```

建议你重点看这几个文件：

```text
miniapp/config/env.js                 # 环境预设：本机 / 局域网 / 预发布 / 正式 / 自定义
miniapp/app.js                        # 小程序运行时环境切换与持久化
miniapp/pages/index/index.js          # 页面里的环境切换、健康检查、评论生成
miniapp/project.config.json           # 项目公开配置
miniapp/project.private.config.json   # 本地开发私有配置（如 urlCheck）
```

### 先改哪几个地方

#### 1. 修改环境预设

环境预设在：

```js
miniapp/config/env.js
```

你至少要按自己的情况替换这些值：

- `lan.baseUrl`：改成你电脑的局域网 IP，例如 `http://192.168.1.20:3000`
- `staging.baseUrl`：改成你的预发布 HTTPS 域名
- `production.baseUrl`：改成你的正式 HTTPS 域名

#### 2. 开发者工具本地联调

本项目已经在：

```text
miniapp/project.private.config.json
```

里把：

```json
"urlCheck": false
```

打开了，方便你在开发者工具里先做本机或局域网联调。

说明：

- 这只适合开发阶段
- 真机正式联调和上线前，仍然要按抖音开放平台要求配置合法域名

#### 3. 页面里也能直接切环境

现在小程序首页已经加了：

- 环境切换
- 自定义接口地址
- 健康检查
- 当前接口地址复制
- 真机调试检查项提示

### 在开发者工具里调试时

如果你是在本机模拟器里调试，通常可以先试：

```js
apiBaseUrl: 'http://127.0.0.1:3000'
```

### 在真机调试时

不要再用 `127.0.0.1`，要改成你电脑的局域网 IP，例如：

```js
apiBaseUrl: 'http://192.168.1.20:3000'
```

同时你还需要：

- 在抖音开发者工具里配置合法请求域名
- 确保手机和电脑在同一局域网
- 确保电脑防火墙允许对应端口访问

### 真机调试推荐顺序

1. 先启动后端：`node src/server.js`
2. 后台确认平台、商标、AI 配置都已保存
3. 打开抖音开发者工具并导入 `miniapp/`
4. 首页先切到“局域网联调”或“自定义地址”
5. 点击“健康检查”确认接口可达
6. 再去生成评论
7. 如果要走正式真机环境，再把请求域名配置到抖音开放平台后台

---

## 10. 怎么做一次完整联调

建议按这个顺序：

### 第 1 步：启动后端

```bash
cd D:\tik
node src/server.js
```

### 第 2 步：登录后台

打开：

[http://127.0.0.1:3000](http://127.0.0.1:3000)

### 第 3 步：先在后台配置基础数据

至少先配这些：

- 平台
- 商标
- OpenAI 兼容接口

### 第 4 步：确认公开目录接口能返回数据

```bash
curl http://127.0.0.1:3000/api/public/catalog
```

### 第 5 步：在小程序里测试评论生成

小程序调用的核心接口是：

```text
POST /api/comments/generate
```

### 第 6 步：回后台看审核记录

后台“评论管理”会看到小程序生成出来的评论记录。

---

## 11. 冒烟测试怎么跑

项目自带一个冒烟脚本，用来快速验证关键链路没有坏。

```bash
cd D:\tik
node scripts/smoke-test.js
```

它会验证：

- 未登录时后台接口会被拦截
- 默认管理员可以登录
- 可以修改密码
- 可以更新 AI 配置
- 可以生成评论
- 可以自动生成默认用户
- 可以上传 Logo
- 可以新增平台和商标
- 可以更新商标并联动刷新所属平台更新时间
- 可以人工审核评论

如果输出里看到：

```text
Smoke test passed
```

说明核心流程是通的。

---

## 12. 从源代码到部署上线

这一节按“生产部署”来写。

### 部署思路

最简单的部署方式是：

1. 服务器装 Node.js 24+
2. 把源码传上去
3. 在 `admin-pro/` 安装依赖并执行构建
4. 启动 `node src/server.js`
5. 用 Nginx 或云负载均衡把域名转到 Node 服务

### 最低可运行部署步骤

假设你已经把代码上传到服务器 `/opt/douyin-review-studio`：

```bash
cd /opt/douyin-review-studio/admin-pro
npm install
npm run build

cd /opt/douyin-review-studio
PORT=3000 HOST=0.0.0.0 node src/server.js
```

### Linux 服务器从 0 到 1 的推荐顺序

1. 安装 Node.js 24+
2. 把源码上传到服务器
3. 进入 `admin-pro/` 安装依赖
4. 执行 `npm run build`
5. 回到项目根目录启动 `node src/server.js`
6. 确认 `3000` 端口已监听
7. 配置 Nginx 反向代理
8. 开放服务器防火墙端口
9. 用域名访问后台并登录验证

如果你用的是云服务器，还要检查安全组是否放行了 `80` / `443`，以及内网访问的 `3000` 端口。

### Windows 服务器的最小部署思路

如果你部署在 Windows 机器上，也可以按这个思路：

```powershell
cd D:\tik\admin-pro
npm install
npm run build

cd D:\tik
$env:PORT='3000'
$env:HOST='0.0.0.0'
node src/server.js
```

如果是长期运行，建议不要直接开着一个终端窗口不管，而是改用 PM2 或 Windows 服务管理方式。

### 推荐的长期运行方式：PM2

先全局安装：

```bash
npm install -g pm2
```

然后启动项目：

```bash
cd /opt/douyin-review-studio
pm2 start src/server.js --name douyin-review-studio --interpreter node
pm2 save
```

查看日志：

```bash
pm2 logs douyin-review-studio
```

重启：

```bash
pm2 restart douyin-review-studio
```

停止：

```bash
pm2 stop douyin-review-studio
```

### 推荐反向代理：Nginx

如果你要用域名，例如 `admin.example.com`，可以把请求反代到 `3000` 端口。

示例：

```nginx
server {
    listen 80;
    server_name admin.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 部署后首次检查

部署好后至少确认这几件事：

- `GET /api/health` 返回 `ok`
- 后台登录页能打开
- 默认管理员能登录
- 平台管理能读取数据
- 评论生成接口能调用
- `data/app.db` 已成功创建
- 上传 Logo 后 `data/uploads/` 里能看到文件

---

## 13. 更新发布时怎么做

如果你已经在线上跑着一个版本，后续升级一般按这个顺序：

### 第 1 步：拉取或替换最新源码

### 第 2 步：重新构建后台前端

```bash
cd admin-pro
npm install
npm run build
cd ..
```

### 第 3 步：重启服务端

如果你是直接跑：

```bash
node src/server.js
```

如果你是 PM2：

```bash
pm2 restart douyin-review-studio
```

### 第 4 步：验证健康检查

```bash
curl http://127.0.0.1:3000/api/health
```

如果你更新了后端里和数据库结构相关的代码，建议升级后马上手动验证：

- 后台登录是否正常
- 平台和商标是否还能读取
- 评论生成是否正常
- Logo 上传是否正常

---

## 14. 常见问题

### 1. 后台打开是空白页

通常是因为你还没有执行：

```bash
cd admin-pro
npm install
npm run build
```

服务端只负责托管 `admin-pro/dist`，如果没构建，后台静态资源就不存在。

### 2. Node 能启动，但提示 SQLite 相关问题

先检查 Node 版本：

```bash
node -v
```

建议使用 Node 24+。

### 3. 看到 SQLite experimental warning 正常吗？

正常。

Node 24 的 `node:sqlite` 目前会打印 experimental warning，但不影响项目运行。

### 4. 小程序里图片不显示

优先检查：

- 后台商标 `logoUrl` 是否正确
- 小程序 `apiBaseUrl` 是否配置成了正确的服务端地址
- 真机环境下是否配置了合法域名

### 5. 配了 AI 网关但还是返回 `mock`

通常是：

- `baseUrl` 没填
- `apiKey` 没填
- 配置保存失败
- 网关不可达

可以先在后台重新保存一次 AI 配置，再看评论生成结果里的来源字段。

---

## 15. 当前能力总结

这个仓库现在已经可以完成：

- 从后台维护平台和商标
- 上传商标 Logo
- 配置 OpenAI 兼容网关
- 生成评论并审核
- 在小程序端调用公开接口生成评论

如果你接下来要继续往正式项目推进，比较建议做：

- 角色权限和多账号后台
- 评论回传平台或发布流程
- Excel / CSV 导入
- 操作日志
- 更完整的小程序多页流程

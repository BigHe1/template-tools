# 模板工具箱

> 企业微信报单消息编辑器 + Word/HTML 合同占位符处理器 — 一站式模板编辑工作台。

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![Flask](https://img.shields.io/badge/flask-3.x-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

## 项目概述

**模板工具箱**是一个轻量级的 Web 应用，将两个日常工作场景中的高频工具整合为统一入口：

| 工具 | 场景 | 原形态 |
|---|---|---|
| **报单模板编辑器** | 编辑企业微信消息模板，支持 Markdown/Markdown V2 实时预览和变量插入 | Flask 独立应用 |
| **合同模板编辑器** | 处理 Word 文档和 HTML 片段中的占位符，自动转换为输入框/复选框 | Tkinter 桌面程序 |

通过统一的技术架构、共享的 UI 组件和一致的操作体验，降低工具维护成本，提升日常模板编辑效率。

### 核心目标

- **统一入口**：一个地址访问全部工具，顶部导航栏一键切换
- **模块复用**：主题系统、Toast 通知、弹窗、AJAX 工具等公共模块只维护一份
- **Web 化迁移**：将桌面端 Tkinter 合同编辑器迁移为 Web 应用，免安装使用
- **易于扩展**：清晰的分层架构，新增工具只需添加模块 + 路由 + 页面

## 技术选型说明

### 后端

| 技术 | 版本 | 选型理由 |
|---|---|---|
| **Python** | 3.10+ | 两个原始工具均基于 Python，保持语言一致性降低迁移成本 |
| **Flask** | 3.x | 轻量级 Web 框架，无冗余抽象层，适合工具型应用；Jinja2 模板引擎内建支持；部署简单，单文件即可运行 |
| **python-docx** | 0.8+ | 业界成熟的 Word 文档处理库，支持段落/表格遍历、run 级别精确替换、图片节点保留 |

### 前端

| 技术 | 选型理由 |
|---|---|
| **原生 HTML/CSS/JS** | 无需前端构建工具链，零依赖，页面直接渲染；减少学习成本，方便后续维护者快速上手 |
| **CSS 自定义属性** | 完整的明暗主题系统通过 `:root` 和 `[data-theme="dark"]` 实现，主题切换零闪烁 |
| **Jinja2 模板继承** | `base.html` 定义全局布局和资源加载，各工具页面通过 `{% extends %}` 复用，避免代码重复 |
| **Apple 设计语言** | 采用 SF Pro 字体、半透明模糊面板、柔和的圆角和阴影层次，提供一致的视觉品质 |

### 架构设计

```
┌─────────────────────────────────────────┐
│              浏览器客户端                 │
│   ┌──────────┐  ┌────────────────────┐   │
│   │ 报单编辑器 │  │   合同编辑器        │   │
│   │ wx_editor │  │ contract_editor   │   │
│   └─────┬────┘  └─────────┬──────────┘   │
│         │                 │               │
│   ┌─────┴─────┬──────────┴──────┐        │
│   │ common.js │  common.css     │ ← 共享  │
│   └───────────┴─────────────────┘        │
└─────────────────┬───────────────────────┘
                  │ HTTP/JSON
┌─────────────────┴───────────────────────┐
│              Flask 路由层 (app.py)        │
│   /wx    /contract    /api/wx/*          │
│          /api/contract/*                 │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────┴───────────────────────┐
│            业务逻辑层 (modules/)          │
│   wx_engine  wx_variables               │
│   contract_processor  word_processor    │
└─────────────────────────────────────────┘
```

## 功能介绍

### 报单模板编辑器（`/wx`）

面向企业微信消息模板编辑场景，工作流为：**选变量 → 编辑内容 → 实时预览 → 导出使用**。

#### 变量面板
- 按 **公司 / 个人 / 团队 / 客户** 四个维度分类展示 40+ 个预定义变量
- 支持搜索过滤（搜索变量名、中文标签或分类名）
- 点击变量标签即可插入到光标位置

#### 富文本编辑
- **Markdown 模式**：支持标题 H1–H6、**加粗**、`> 引用`、`[链接](url)`、`<font color="info">彩色文字</font>`
- **Markdown V2 模式**：额外支持多级引用（1–3 级）
- 工具栏操作：选中文本后一键应用样式；支持 `Ctrl+B` 快捷键加粗
- 实时字符/字节数统计，超 4096 字节上限时警告提示

#### 实时预览
- 调用后端渲染引擎，500ms 防抖延迟避免频繁请求
- 手机对话框样式预览，模拟企业微信消息气泡效果
- 支持手动刷新

#### 模板管理
- 内置 3 套示例模板（捷报通报、捷报速报、业绩日报）
- 支持自定义模板的 **保存 / 加载 / 删除**，数据持久化到 `localStorage`
- 最近使用的模板自动加载

#### 示例数据导出
- 一键填充所有变量为示例值，生成可直接发送的最终文本

### 合同模板编辑器（`/contract`）

面向 Word/HTML 模板中占位符的处理场景，工作流为：**输入 → 配置 → 处理 → 输出**。

#### HTML 处理
- **输入**：粘贴包含 `▦数字▦` 占位符的 HTML 代码
- **自动清理**：识别并修复带样式的占位符（如 `▦<span>123</span>▦` → `▦123▦`）
- **智能替换**：根据指定的复选框数字列表，对应占位符转为 `<input type="checkbox">` 标签，其余转为 `<input type="text">` 标签
- **自动美化**：清理多余标签、统一空白、修复属性格式
- 结果支持 **复制到剪贴板** 和 **下载为 HTML**

#### Word 文档处理
- **上传**：支持点击或拖拽上传 `.docx` 文件（上限 50MB）
- **占位符配置**：可自定义文本框占位符（默认 `▦▦`）和复选框占位符（默认 `??`）
- **智能替换**：遍历段落、表格、嵌套表格中的 run 节点；检测包含图片的 run 并启用安全拆分模式保留图片
- **结果输出**：下载处理后的 Word 文档；复选框位置自动同步到 HTML 处理的数字列表

#### 操作日志
- 记录每一步操作的时间戳和结果，支持清空

### 全局功能

| 功能 | 说明 |
|---|---|
| **明暗主题切换** | 跟随系统偏好，手动切换后持久化到 localStorage，主题切换无闪烁 |
| **Toast 通知** | 统一的消息提示组件，自动消失 |
| **弹窗系统** | Modal 层 + 遮罩，ESC 键关闭 |
| **响应式布局** | 适配桌面端（宽屏双栏）和移动端（单栏堆叠） |
| **Web 字体栈** | SF Pro / PingFang SC / Microsoft YaHei 优先，苹方中文回退 |

## 项目结构

```
template_tools/
├── app.py                        # Flask 统一入口，路由注册，PyInstaller 打包兼容
├── requirements.txt              # Python 依赖清单
├── README.md                     # 项目文档（本文件）
├── .gitignore                    # Git 忽略规则
│
├── modules/                      # 后端业务逻辑模块
│   ├── __init__.py               # 包初始化
│   ├── wx_engine.py              # 企微 Markdown/Markdown V2 渲染引擎
│   ├── wx_variables.py           # 变量列表数据模型 + 示例填充值
│   ├── contract_processor.py     # HTML 占位符清洗与替换引擎
│   └── word_processor.py         # Word 文档解析与占位符替换（保留图片）
│
├── static/                       # 前端静态资源
│   ├── css/
│   │   ├── common.css            # 共享样式：主题变量、布局、按钮、Toast、弹窗、表单
│   │   ├── wx_editor.css         # 报单编辑器专属：变量面板、工具栏、预览区
│   │   └── contract_editor.css   # 合同编辑器专属：双栏布局、上传区、日志区
│   └── js/
│       ├── common.js             # 共享逻辑：主题管理、Toast、弹窗、剪贴板、AJAX 封装
│       ├── wx_editor.js          # 报单编辑器：变量渲染、富文本操作、模板管理
│       └── contract_editor.js    # 合同编辑器：HTML/Word 处理、文件上传下载
│
├── templates/                    # Jinja2 页面模板
│   ├── base.html                 # 基础布局：HTML 骨架、导航栏、主题切换
│   ├── home.html                 # 首页：工具导航卡片
│   ├── wx_editor.html            # 报单编辑器页面
│   └── contract_editor.html      # 合同编辑器页面
│
└── uploads/                      # Word 文件临时上传目录（运行时自动创建）
    └── .gitkeep                  # 保持目录结构
```

### 关键文件职责

| 文件 | 作用 |
|---|---|
| `app.py` | 应用生命周期管理：路由注册、Flask 配置、启动入口 |
| `common.css` | CSS 变量定义和通用组件，所有页面共享 |
| `common.js` | `TemplateTools` 命名空间，提供约 15 个公共 API |
| `base.html` | 所有页面的父模板，定义导航栏和资源加载顺序 |
| `wx_engine.py` | 将企微 Markdown 语法转换为 HTML，支持两种消息类型 |
| `word_processor.py` | 核心 Word 处理引擎，从原 Tkinter 版本完整迁移 |

## 快速开始

### 环境要求

| 依赖 | 版本要求 |
|---|---|
| Python | 3.10 或更高 |
| pip | 随 Python 发行 |
| 操作系统 | Windows / macOS / Linux |

### 安装

```bash
# 1. 克隆仓库
git clone https://github.com/BigHe1/template-tools.git
cd template-tools

# 2. （推荐）创建虚拟环境
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt
```

### 启动

```bash
# 默认端口 5000
python app.py

# 自定义端口
PORT=8080 python app.py
```

启动后浏览器自动打开 `http://127.0.0.1:5000`。

### 路由一览

| 路径 | 说明 |
|---|---|
| `GET /` | 首页 — 工具导航 |
| `GET /wx` | 报单模板编辑器 |
| `GET /contract` | 合同模板编辑器 |
| `POST /api/wx/preview` | 报单 Markdown 实时预览 |
| `POST /api/wx/export` | 报单示例数据填充导出 |
| `POST /api/contract/process-html` | HTML 占位符处理 |
| `POST /api/contract/process-word` | Word 文档上传处理 |
| `GET /api/contract/download-word/<token>` | Word 处理结果下载 |

### 打包为独立应用（可选）

项目代码已兼容 PyInstaller 打包：

```bash
pip install pyinstaller
pyinstaller --onefile --add-data "templates;templates" --add-data "static;static" --add-data "modules;modules" app.py
```

## 常见问题与注意事项

### Q: 启动时报 `ModuleNotFoundError: No module named 'flask'`

**A:** 确保已激活虚拟环境并执行 `pip install -r requirements.txt`。如果使用系统 Python，确认 flask 已安装：`pip list | grep flask`。

### Q: 合同编辑器上传 Word 后提示「缺少 python-docx 依赖」

**A:** 执行 `pip install python-docx`。requirements.txt 中已包含此依赖，通常安装时已自动处理。

### Q: Word 文档处理后图片丢失

**A:** 该问题已通过「安全拆分模式」修复。如果仍遇到特定文档图片丢失，可能是文档中的图片以非标准方式嵌入（如 OLE 对象），请在 GitHub Issues 中提交样例文件。

### Q: 报单编辑器预览不更新

**A:** 预览采用 500ms 防抖机制，输入停止后半秒自动刷新。如需立即刷新，点击预览面板的「刷新」按钮。

### Q: 如何新增变量

**A:** 编辑 `modules/wx_variables.py`，在 `VARIABLES` 列表中追加条目：

```python
{"var": "{newVar}", "label": "新变量描述", "category": "公司"},
```

对应示例值在 `SAMPLE_VALUES` 字典中添加。无需重启应用，刷新页面即可。

### Q: 如何新增工具模块

**A:** 按以下步骤：

1. `modules/` 下新建业务逻辑模块
2. `templates/` 下新建页面模板（继承 `base.html`）
3. `static/js/` 和 `static/css/` 下新建专属资源
4. `app.py` 中注册路由
5. `templates/home.html` 导航卡片中添加入口

### Q: 主题切换后刷新页面变回浅色

**A:** 主题偏好存储在 `localStorage`，清除浏览器数据会重置。正常刷新不会影响。

### Q: 模板保存后丢失

**A:** 模板数据存储在浏览器 `localStorage` 中，不会随服务器重启丢失。但如果清除浏览器数据或更换设备，需要重新保存。

### 注意事项

1. **安全性**：本应用设计为本地使用，未实现用户认证和权限管理。如需部署到公网，请添加反向代理和访问控制。
2. **文件上传限制**：Word 文档上传上限为 50MB（可在 `app.py` 中调整 `MAX_CONTENT_LENGTH`）。
3. **并发处理**：Flask 内置开发服务器为单线程模式，生产环境请使用 Gunicorn 或 Waitress。
4. **Word 兼容性**：仅支持 `.docx` 格式（Office 2007+），不支持旧版 `.doc` 二进制格式。
5. **企微消息长度**：企业微信 Markdown 消息上限为 4096 字节，编辑器会实时提示。

## 许可证

MIT License

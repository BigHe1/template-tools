# -*- coding: utf-8 -*-
"""
模板工具箱 — 统一入口
整合：报单模板编辑器 + 合同模板编辑器
"""

import os
import sys
import uuid
from flask import Flask, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename

# ── PyInstaller 打包兼容：定位静态资源和模板目录 ──
if getattr(sys, 'frozen', False):
    _base_dir = sys._MEIPASS
else:
    _base_dir = os.path.dirname(os.path.abspath(__file__))

_template_dir = os.path.join(_base_dir, 'templates')
_static_dir = os.path.join(_base_dir, 'static')

app = Flask(__name__, template_folder=_template_dir, static_folder=_static_dir)

# 上传临时目录
UPLOAD_FOLDER = os.path.join(_base_dir, 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB

# 注册公共模块
from modules.wx_variables import VARIABLES, SAMPLE_VALUES
from modules.wx_engine import render_markdown, render_markdown_v2
from modules.contract_processor import process_html
from modules.word_processor import WordProcessor


# ============================================================
# 首页 & 导航
# ============================================================

@app.route("/")
def home():
    """首页 - 工具导航"""
    return render_template("home.html")


# ============================================================
# 报单模板编辑器
# ============================================================

@app.route("/wx")
def wx_editor():
    """报单模板编辑器页面"""
    return render_template("wx_editor.html", variables=VARIABLES)


@app.route("/api/wx/variables")
def wx_variables():
    """返回可用变量列表"""
    return jsonify({"status": "ok", "data": VARIABLES})


@app.route("/api/wx/preview", methods=["POST"])
def wx_preview():
    """渲染企微 Markdown 预览"""
    data = request.get_json(force=True)
    content = data.get("content", "")
    msg_type = data.get("type", "markdown")

    if msg_type == "markdown_v2":
        html = render_markdown_v2(content)
    else:
        html = render_markdown(content)

    return jsonify({"status": "ok", "html": html})


@app.route("/api/wx/export", methods=["POST"])
def wx_export():
    """导出最终文本（变量替换为示例值）"""
    data = request.get_json(force=True)
    content = data.get("content", "")

    result = content
    for var_name, sample_val in SAMPLE_VALUES.items():
        result = result.replace(var_name, sample_val)

    return jsonify({"status": "ok", "text": result})


# ============================================================
# 合同模板编辑器
# ============================================================

@app.route("/contract")
def contract_editor():
    """合同模板编辑器页面"""
    return render_template("contract_editor.html")


@app.route("/api/contract/process-html", methods=["POST"])
def contract_process_html():
    """处理 HTML 占位符：清理 → 替换为输入框/复选框"""
    data = request.get_json(force=True)
    content = data.get("content", "")
    checkbox_numbers = data.get("checkbox_numbers", "")

    result = process_html(content, checkbox_numbers)
    return jsonify(result)


@app.route("/api/contract/process-word", methods=["POST"])
def contract_process_word():
    """处理 Word 文档：上传 → 替换占位符 → 返回结果"""
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "未上传文件"})

    file = request.files['file']
    if file.filename == '':
        return jsonify({"status": "error", "message": "文件名为空"})

    ph1 = request.form.get("ph1", "▦▦")
    ph2 = request.form.get("ph2", "??")
    is_download = request.form.get("download", "0") == "1"

    # 读取文件内容
    file_bytes = file.read()

    processor = WordProcessor()
    result = processor.process_from_bytes(file_bytes, ph1=ph1, ph2=ph2)

    if result["status"] != "ok":
        return jsonify(result)

    # 如果需要下载
    if is_download:
        import io
        # 生成下载文件名
        original_name = secure_filename(file.filename)
        name_parts = os.path.splitext(original_name)
        download_name = f"{name_parts[0]}_已替换{name_parts[1]}"

        return send_file(
            io.BytesIO(result["result_bytes"]),
            mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            as_attachment=True,
            download_name=download_name,
        )

    # 保存临时文件供后续下载
    tmp_name = f"{uuid.uuid4().hex}.docx"
    tmp_path = os.path.join(app.config['UPLOAD_FOLDER'], tmp_name)
    with open(tmp_path, 'wb') as f:
        f.write(result["result_bytes"])

    # 返回 JSON 结果（包含文件临时标识）
    return jsonify({
        "status": "ok",
        "total": result["total"],
        "checkbox_numbers": result["checkbox_numbers"],
        "all_numbers": result["all_numbers"],
        "message": result["message"],
        "download_token": tmp_name,
        "filename": secure_filename(file.filename).replace('.docx', '_已替换.docx'),
    })


@app.route("/api/contract/download-word/<token>")
def contract_download_word(token):
    """下载临时处理后文件"""
    tmp_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(token))
    if not os.path.exists(tmp_path):
        return jsonify({"status": "error", "message": "文件已过期或不存在"}), 404

    return send_file(
        tmp_path,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        as_attachment=True,
        download_name='processed.docx',
    )


# ============================================================
# 启动入口
# ============================================================

if __name__ == "__main__":
    import webbrowser
    import threading

    port = int(os.environ.get("PORT", 5000))
    url = f"http://127.0.0.1:{port}"

    print(f"  +---------------------------------------+")
    print(f"  |     Template Tools v2.0               |")
    print(f"  |                                       |")
    print(f"  |  WX Editor     /wx                   |")
    print(f"  |  Contract Ed.  /contract             |")
    print(f"  |                                       |")
    print(f"  |  URL: {url}                  |")
    print(f"  |  Ctrl+C to quit                      |")
    print(f"  +---------------------------------------+")

    def open_browser():
        import time
        time.sleep(0.8)
        webbrowser.open(url)

    threading.Thread(target=open_browser, daemon=True).start()

    app.run(host="127.0.0.1", port=port, debug=False)

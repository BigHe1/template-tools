"""
企业微信 Markdown 渲染引擎
严格遵循官方文档: https://developer.work.weixin.qq.com/document/path/91770
"""

import re

# 企微支持的颜色映射 (markdown 旧版)
WX_COLORS = {
    "info": "#2eab49",      # 绿色
    "comment": "#999999",   # 灰色
    "warning": "#e15541",   # 橙红色
}


def escape_html(text: str) -> str:
    """HTML 转义"""
    return (
        text.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
    )


def render_markdown(text: str) -> str:
    """渲染企微 markdown 类型（旧版）消息为 HTML"""

    # 0. 先用占位符保护 <font color="..."> 标签
    font_placeholders = {}

    def protect_font(m: re.Match) -> str:
        key = f"__FONT_PLACEHOLDER_{len(font_placeholders)}__"
        font_placeholders[key] = m.group(0)
        return key

    text = re.sub(
        r'<font\s+color\s*=\s*["\']?(info|comment|warning)["\']?\s*>.*?</font>',
        protect_font, text, flags=re.DOTALL | re.IGNORECASE,
    )

    # 1. HTML 转义（font 标签已保护）
    html = escape_html(text)

    # 2. 恢复 font 标签并转换为 span
    for key, original in font_placeholders.items():
        inner_match = re.search(
            r'<font\s+color\s*=\s*["\']?(info|comment|warning)["\']?\s*>(.*?)</font>',
            original, re.DOTALL | re.IGNORECASE,
        )
        if inner_match:
            color = inner_match.group(1)
            inner_content = inner_match.group(2)
            hex_color = WX_COLORS.get(color, "")
            if hex_color:
                html = html.replace(key, f'<span style="color:{hex_color};font-weight:inherit">{inner_content}</span>')
            else:
                html = html.replace(key, inner_content)
        else:
            html = html.replace(key, original)

    # 行内代码 ``
    html = re.sub(r'`([^`\n]+?)`', r'<code>\1</code>', html)

    # 加粗 **...**
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)

    # 链接 [text](url)
    html = re.sub(
        r'\[(.+?)\]\((https?://[^\s)]+)\)',
        r'<a href="\2" target="_blank" rel="noopener">\1</a>', html,
    )

    # 标题 # ~ ######
    lines = html.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        h_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if h_match:
            level = len(h_match.group(1))
            content = h_match.group(2)
            indent = line[:len(line) - len(stripped)]
            lines[i] = f'{indent}<h{level}>{content}</h{level}>'
    html = '\n'.join(lines)

    # 引用 >
    lines = html.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith('&gt;') or stripped.startswith('>'):
            raw = stripped
            if raw.startswith('&gt;'):
                raw = raw[4:]
            else:
                raw = raw[1:]
            raw = raw.strip()
            indent = line[:len(line) - len(stripped)]
            lines[i] = f'{indent}<blockquote>{raw}</blockquote>'
    html = '\n'.join(lines)

    # 换行
    html = html.replace('\n', '<br>')

    return html


def render_markdown_v2(text: str) -> str:
    """渲染企微 markdown_v2 类型（新版）消息为 HTML"""
    code_blocks = {}
    tables = {}

    def protect_code(m: re.Match) -> str:
        key = f"__CODE_BLOCK_{len(code_blocks)}__"
        code_blocks[key] = m.group(0)
        return key

    def protect_table(m: re.Match) -> str:
        key = f"__TABLE_BLOCK_{len(tables)}__"
        tables[key] = m.group(0)
        return key

    text = re.sub(r'```[\s\S]*?```', protect_code, text)
    text = re.sub(r'(?:^|\n)(?:\|.+\|\s*\n)+(?:\|.+\|\s*)', protect_table, text, flags=re.MULTILINE)

    html = escape_html(text)
    lines = html.split('\n')

    # 多级引用合并块
    in_quote = False
    quote_level = 0
    quote_lines = []
    result_lines = []

    def flush_quote():
        nonlocal in_quote, quote_lines, quote_level
        if in_quote and quote_lines:
            text_block = '<br>'.join(quote_lines)
            result_lines.append(f'<blockquote class="lvl-{min(quote_level, 3)}">{text_block}</blockquote>')
        in_quote = False
        quote_lines = []
        quote_level = 0

    for line in lines:
        stripped = line.strip()

        # 分割线
        if re.match(r'^---\s*$', stripped):
            flush_quote()
            result_lines.append('<hr>')
            continue

        # 引用检测 (支持三级)
        quote_match = re.match(r'^((?:&gt;|>)\s*)+', stripped)
        if quote_match:
            ql = len(re.findall(r'&gt;|>', quote_match.group()))
            after = re.sub(r'^(?:&gt;|>)\s*', '', stripped)
            while re.match(r'^(?:&gt;|>)\s*', after):
                after = re.sub(r'^(?:&gt;|>)\s*', '', after)
            if in_quote and ql == quote_level:
                quote_lines.append(after)
            else:
                flush_quote()
                in_quote = True
                quote_level = min(ql, 3)
                quote_lines = [after]
            continue

        flush_quote()

        # 标题
        h_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if h_match:
            level = len(h_match.group(1))
            content = h_match.group(2)
            result_lines.append(f'<h{level}>{content}</h{level}>')
            continue

        # 无序列表项
        ul_match = re.match(r'^([ ]*)([-])\s+(.+)$', stripped)
        if ul_match:
            indent = len(ul_match.group(1))
            depth = indent // 2 + 1
            content = ul_match.group(3)
            cls = f'ul-d{depth}' if depth > 1 else ''
            result_lines.append(f'<ul class="{cls}"><li>{content}</li></ul>')
            continue

        # 有序列表项
        ol_match = re.match(r'^([ ]*)(\d+)\.\s+(.+)$', stripped)
        if ol_match:
            indent = len(ol_match.group(1))
            depth = indent // 2 + 1
            content = ol_match.group(3)
            cls = f'ol-d{depth}' if depth > 1 else ''
            result_lines.append(f'<ol class="{cls}"><li>{content}</li></ol>')
            continue

        result_lines.append(stripped if stripped else '<br>')

    flush_quote()

    html = '\n'.join(result_lines)

    # 恢复代码块
    for key, original in code_blocks.items():
        inner = re.search(r'```\s*\n?(.*?)\n?```', original, re.DOTALL)
        if inner:
            code = inner.group(1)
            code = code.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            html = html.replace(key, f'<pre><code>{code}</code></pre>')
        else:
            html = html.replace(key, original)

    # 恢复表格
    for key, original in tables.items():
        table_html = _parse_table(original)
        html = html.replace(key, table_html)

    # 行内代码
    html = re.sub(r'`([^`\n]+?)`', r'<code>\1</code>', html)

    # 图片
    html = re.sub(
        r'!\[(.+?)\]\((https?://[^\s)]+)\)',
        r'<img src="\2" alt="\1" style="max-width:100%;border-radius:8px;">', html,
    )

    # 链接
    html = re.sub(
        r'\[(.+?)\]\((https?://[^\s)]+)\)',
        r'<a href="\2" target="_blank" rel="noopener">\1</a>', html,
    )

    # 加粗
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)

    # 斜体
    html = re.sub(r'(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)', r'<em>\1</em>', html)

    # 换行
    html = html.replace('\n', '<br>')

    return html


def _parse_table(table_text: str) -> str:
    """解析 Markdown 表格为 HTML"""
    rows = [r.strip() for r in table_text.strip().split('\n') if r.strip()]
    rows = [r for r in rows if r.startswith('|') and r.endswith('|')]
    if len(rows) < 2:
        return table_text

    html_rows = []
    alignments = []

    # header
    cells = [c.strip() for c in rows[0].split('|')[1:-1]]
    html_rows.append('<tr>' + ''.join(f'<th>{c}</th>' for c in cells) + '</tr>')

    # align row
    if len(rows) >= 2:
        align_cells = [c.strip() for c in rows[1].split('|')[1:-1]]
        for ac in align_cells:
            if ac.startswith(':') and ac.endswith(':'):
                alignments.append('center')
            elif ac.endswith(':'):
                alignments.append('right')
            else:
                alignments.append('left')

    # data rows
    for row in rows[2:]:
        cells_list = [c.strip() for c in row.split('|')[1:-1]]
        td_html = ''
        for j, c in enumerate(cells_list):
            al = alignments[j] if j < len(alignments) else 'left'
            td_html += f'<td style="text-align:{al}">{c}</td>'
        html_rows.append(f'<tr>{td_html}</tr>')

    return '<table>' + ''.join(html_rows) + '</table>'

"""
合同模板 — HTML 处理引擎
清理带样式占位符，转为输入框/复选框标签
"""

import re


def generate_checkbox_tag(number: str) -> str:
    """生成复选框 HTML 标签"""
    return (
        f'{{|-<span leipiplugins="checkboxs" title="{number}">'
        f'<input name="data_{number}" value="{number}" type="checkbox"/>'
        f'{number}&nbsp;</span>-|}}'
    )


def generate_text_input_tag(number: str) -> str:
    """生成文本输入框 HTML 标签"""
    return (
        f'<input name="data_{number}" type="text" title="{number}" value="" '
        f'leipiplugins="text" required="0" orgalign="left" orgwidth="150" '
        f'orgtype="text" style="text-align:left; width:150px;"/>'
    )


def clean_styled_placeholder(content: str) -> tuple:
    """清理带样式的占位符，如 ▦<span>123</span>▦ -> ▦123▦"""
    log_messages = []
    pattern = re.compile(r'▦(?:<[^>]+>)*(\d+)(?:<[^>]+>)*▦', re.DOTALL)

    def replace_styled(match):
        number = match.group(1)
        log_messages.append(f"清理带样式占位符 → ▦{number}▦")
        return f"▦{number}▦"

    result = pattern.sub(replace_styled, content)
    return result, log_messages


def clean_invalid_content(content: str) -> str:
    """清理多余标签和空白"""
    content = re.sub(r'<ins.*?</ins>|<p[^>]*>\s*</p>|<span[^>]*>\s*</span>', '', content, flags=re.DOTALL)
    content = re.sub(r'<br clear="all".*?>', '<br/>', content)
    content = re.sub(r'style=";', 'style="', content)
    content = re.sub(r'<span[^>]*>(<input.*?>)<\/span>', r'\1', content)
    content = re.sub(r'\s+', ' ', content)
    return content.replace(' <p', '\n<p').replace(' </p>', '</p>\n')


def replace_placeholder(match: re.Match, checkbox_numbers: set) -> str:
    """根据占位符数字决定生成复选框还是文本输入框"""
    placeholder = match.group()
    match_num = re.search(r'\d+', placeholder)
    if not match_num:
        return placeholder

    number = match_num.group()
    if number in checkbox_numbers:
        return generate_checkbox_tag(number)
    else:
        return generate_text_input_tag(number)


def process_html(content: str, checkbox_text: str = "") -> dict:
    """
    处理 HTML 内容：
    1. 清理带样式占位符
    2. 根据复选框数字替换为对应组件
    3. 清理多余标签

    返回: { "status": "ok", "html": "...", "stats": {...}, "logs": [...] }
    """
    if not content.strip():
        return {"status": "error", "message": "请输入 HTML 内容"}

    logs = []

    # 解析复选框数字
    checkbox_set = set()
    if checkbox_text.strip():
        for n in checkbox_text.split(","):
            n = n.strip()
            if n:
                checkbox_set.add(n)

    try:
        # 1. 清理带样式占位符
        content, clean_logs = clean_styled_placeholder(content)
        logs.extend(clean_logs)

        # 2. 替换占位符
        pattern = re.compile(r'▦\d+▦')
        all_placeholders = pattern.findall(content)
        new_content = pattern.sub(lambda m: replace_placeholder(m, checkbox_set), content)

        # 3. 清理多余标签
        new_content = clean_invalid_content(new_content)

        total = len(all_placeholders)
        check_cnt = sum(1 for p in all_placeholders if re.search(r'\d+', p).group() in checkbox_set)

        logs.append(f"完成｜占位符：{total}｜复选框：{check_cnt}｜文本框：{total - check_cnt}")

        return {
            "status": "ok",
            "html": new_content,
            "stats": {
                "total": total,
                "checkboxes": check_cnt,
                "text_inputs": total - check_cnt,
            },
            "logs": logs,
        }

    except Exception as e:
        logs.append(f"处理失败：{str(e)}")
        return {"status": "error", "message": str(e), "logs": logs}

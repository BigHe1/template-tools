/**
 * 报单模板编辑器 — 核心逻辑
 * 依赖: TemplateTools (common.js)
 */
(function() {
    'use strict';

    var T = TemplateTools;
    var $ = T.$, $$ = T.$$;

    // ============================================================
    // 状态管理
    // ============================================================
    var state = {
        msgType: 'markdown',
        previewTimer: null,
        lastContent: '',
        selectedColor: null,
        savedSelection: null,
        searchQuery: '',
    };

    // ============================================================
    // DOM 引用
    // ============================================================
    var editor, previewContent, charCount, cursorInfo, msgTypeBadge;

    function cacheDOMElements() {
        editor = $('#templateEditor');
        previewContent = $('#previewContent');
        charCount = $('#charCount');
        cursorInfo = $('#cursorInfo');
        msgTypeBadge = $('#msgTypeBadge');
    }

    // ============================================================
    // 注入导航栏扩展元素
    // ============================================================
    function injectNavExtras() {
        var tmpl = $('#wx-nav-extras');
        if (!tmpl) return;
        var actions = document.querySelector('.navbar-actions');
        if (!actions) return;
        var firstChild = actions.firstChild;
        var frag = document.createDocumentFragment();
        var div = document.createElement('div');
        div.innerHTML = tmpl.innerHTML;
        while (div.firstChild) {
            frag.appendChild(div.firstChild);
        }
        actions.insertBefore(frag, firstChild);
    }

    // ============================================================
    // 变量数据
    // ============================================================
    var variables = window.WX_VARIABLES || [];

    // ============================================================
    // 变量渲染（支持搜索过滤）
    // ============================================================
    function renderVariables(filter) {
        filter = filter || '';
        var body = $('#variablesBody');
        var categories = {};
        var query = filter.toLowerCase().trim();

        variables.forEach(function(v) {
            if (query) {
                var matchVar = v.var.toLowerCase().indexOf(query) !== -1;
                var matchLabel = v.label.toLowerCase().indexOf(query) !== -1;
                var matchCat = v.category.toLowerCase().indexOf(query) !== -1;
                if (!matchVar && !matchLabel && !matchCat) return;
            }
            if (!categories[v.category]) categories[v.category] = [];
            categories[v.category].push(v);
        });

        var html = '';
        var emojiMap = { '公司': '🏢', '个人': '👤', '团队': '👥', '客户': '🤝' };
        var catOrder = ['公司', '个人', '团队', '客户'];
        var visibleCount = 0;

        catOrder.forEach(function(cat) {
            var vars = categories[cat];
            if (!vars || vars.length === 0) return;
            visibleCount += vars.length;

            html += '<div class="var-category">';
            html += '<div class="var-category-title">' + (emojiMap[cat] || '📌') + ' ' + cat + ' (' + vars.length + ')</div>';
            html += '<div class="var-tags">';
            vars.forEach(function(v) {
                html += '<span class="var-tag" data-var="' + v.var + '" title="' + v.label + ' — 点击插入">' +
                    '<span class="var-icon">+</span>' + v.var +
                    '<span class="var-label">' + v.label + '</span></span>';
            });
            html += '</div></div>';
        });

        if (visibleCount === 0) {
            html = '<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;">没有匹配的变量</div>';
        }

        body.innerHTML = html;
        $('#varCount').textContent = String(visibleCount);

        body.querySelectorAll('.var-tag').forEach(function(tag) {
            tag.addEventListener('click', function() {
                insertAtCursor(tag.dataset.var);
                T.showToast('已插入 ' + tag.dataset.var);
            });
        });
    }

    // ============================================================
    // 光标位置插入
    // ============================================================
    function insertAtCursor(text) {
        var start = editor.selectionStart;
        var end = editor.selectionEnd;
        var before = editor.value.substring(0, start);
        var after = editor.value.substring(end);
        editor.value = before + text + after;
        editor.selectionStart = editor.selectionEnd = start + text.length;
        editor.focus();
        schedulePreview();
        updateStatus();
    }

    // ============================================================
    // 富文本操作
    // ============================================================
    function getSelection() {
        var s = editor.selectionStart;
        var e = editor.selectionEnd;
        if (s === e && state.savedSelection && state.savedSelection.start !== state.savedSelection.end) {
            s = state.savedSelection.start;
            e = state.savedSelection.end;
        }
        return { start: s, end: e };
    }

    function wrapSelection(prefix, suffix) {
        var sel = getSelection();
        var start = sel.start, end = sel.end;
        var selected = editor.value.substring(start, end);

        if (selected.length === 0) {
            T.showToast('请先选中文本');
            return;
        }

        var before = editor.value.substring(Math.max(0, start - prefix.length), start);
        var after = editor.value.substring(end, end + suffix.length);

        if (before === prefix && after === suffix) {
            editor.value = editor.value.substring(0, start - prefix.length) +
                selected + editor.value.substring(end + suffix.length);
            editor.selectionStart = start - prefix.length;
            editor.selectionEnd = end - prefix.length;
        } else {
            editor.value = editor.value.substring(0, start) +
                prefix + selected + suffix + editor.value.substring(end);
            editor.selectionStart = start + prefix.length;
            editor.selectionEnd = end + prefix.length;
        }
        editor.focus();
        schedulePreview();
        updateStatus();
        updateToolbarState();
    }

    function applyHeading(level) {
        var start = editor.selectionStart;
        var end = editor.selectionEnd;

        if (start === end) {
            var text = editor.value;
            var lineStart = text.lastIndexOf('\n', start - 1) + 1;
            var headingMark = '#'.repeat(level) + ' ';
            var afterLineStart = text.substring(lineStart);
            var cleaned = afterLineStart.replace(/^#{1,6}\s+/, '');
            editor.value = text.substring(0, lineStart) + headingMark + cleaned + text.substring(lineStart + afterLineStart.length);
            editor.selectionStart = editor.selectionEnd = lineStart + headingMark.length + cleaned.length;
            editor.focus();
            schedulePreview();
            updateStatus();
            return;
        }

        var headingMark = '#'.repeat(level) + ' ';
        var selected = editor.value.substring(start, end);
        var before = editor.value.substring(0, start);
        var existingHeading = before.match(/#{1,6}\s*$/);
        var beforeTrimmed = existingHeading
            ? before.substring(0, before.length - existingHeading[0].length)
            : before;

        editor.value = beforeTrimmed + headingMark + selected + editor.value.substring(end);
        var newStart = beforeTrimmed.length;
        editor.selectionStart = editor.selectionEnd = newStart + headingMark.length + selected.length;
        editor.focus();
        schedulePreview();
        updateStatus();
        closeHeadingPopover();
    }

    function toggleBold() {
        wrapSelection('**', '**');
        updateToolbarState();
    }

    function applyColor(color) {
        var sel = getSelection();
        var start = sel.start, end = sel.end;
        var selected = editor.value.substring(start, end);

        if (selected.length === 0) {
            T.showToast('请先选中文本');
            return;
        }

        state.selectedColor = color;

        var beforeText = editor.value.substring(0, start);
        var afterText = editor.value.substring(end);
        var beforeMatch = beforeText.match(/<font\s+color\s*=\s*["']?\w+["']?\s*>\s*$/);
        var afterMatch = afterText.match(/^\s*<\/font>/);

        var newText;
        if (beforeMatch && afterMatch) {
            var newBefore = beforeText.replace(/<font\s+color\s*=\s*["']?\w+["']?\s*>\s*$/, '<font color="' + color + '">');
            var newAfter = afterText.replace(/^\s*<\/font>/, '</font>');
            editor.value = newBefore + selected + newAfter;
        } else {
            newText = '<font color="' + color + '">' + selected + '</font>';
            editor.value = beforeText + newText + afterText;
        }

        editor.selectionStart = start;
        editor.selectionEnd = end;
        editor.focus();
        schedulePreview();
        updateStatus();
        updateToolbarState();
    }

    function toggleQuoteLevel(level) {
        level = level || 1;
        var sel = getSelection();
        var start = sel.start, end = sel.end;

        if (start === end) {
            T.showToast('请先选中文本行');
            return;
        }

        var text = editor.value;
        var lineStart = text.lastIndexOf('\n', start - 1) + 1;
        var lineEnd = text.indexOf('\n', end);
        var actualEnd = lineEnd === -1 ? text.length : lineEnd;
        var lineContent = text.substring(lineStart, actualEnd);

        var prefix = '> '.repeat(level);

        if (lineContent.indexOf(prefix) === 0) {
            var cleaned = lineContent.replace(new RegExp('^(>\\s?){' + level + '}'), '');
            editor.value = text.substring(0, lineStart) + cleaned + text.substring(actualEnd);
            editor.selectionStart = lineStart;
            editor.selectionEnd = lineStart + cleaned.length;
        } else {
            var cleaned2 = lineContent.replace(/^(>?\s?)+/, '');
            editor.value = text.substring(0, lineStart) + prefix + cleaned2 + text.substring(actualEnd);
            editor.selectionStart = lineStart;
            editor.selectionEnd = lineStart + prefix.length + cleaned2.length;
        }
        editor.focus();
        schedulePreview();
        updateStatus();
    }

    function toggleQuote() {
        toggleQuoteLevel(1);
    }

    function insertLink() {
        var sel = getSelection();
        var start = sel.start, end = sel.end;
        var selected = editor.value.substring(start, end);

        if (selected.length > 0) {
            var url = prompt('输入链接地址（https://...）：', 'https://');
            if (url) {
                editor.value = editor.value.substring(0, start) +
                    '[' + selected + '](' + url + ')' + editor.value.substring(end);
                editor.selectionStart = start;
                editor.selectionEnd = end + 4 + url.length + selected.length;
                editor.focus();
                schedulePreview();
                updateStatus();
            }
        } else {
            var url2 = prompt('输入链接地址（https://...）：', 'https://');
            var text2 = prompt('输入显示文本：', '链接文字');
            if (url2 && text2) {
                insertAtCursor('[' + text2 + '](' + url2 + ')');
            }
        }
    }

    function clearFormat() {
        var sel = getSelection();
        var start = sel.start, end = sel.end;
        var selected = editor.value.substring(start, end);

        if (selected.length === 0) {
            T.showToast('请先选中文本');
            return;
        }

        var cleaned = selected
            .replace(/\*\*(.+?)\*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1')
            .replace(/`(.+?)`/g, '$1')
            .replace(/\[(.+?)\]\(.+?\)/g, '$1')
            .replace(/^#{1,6}\s+/gm, '')
            .replace(/^>\s?/gm, '')
            .replace(/<font\s+color\s*=\s*["']?\w+["']?\s*>(.+?)<\/font>/gi, '$1');

        editor.value = editor.value.substring(0, start) + cleaned + editor.value.substring(end);
        editor.selectionStart = start;
        editor.selectionEnd = start + cleaned.length;
        editor.focus();
        schedulePreview();
        updateStatus();
    }

    // ============================================================
    // 预览渲染
    // ============================================================
    function schedulePreview() {
        if (state.previewTimer) clearTimeout(state.previewTimer);
        state.previewTimer = setTimeout(refreshPreview, 500);
    }

    function refreshPreview() {
        var content = editor.value;
        if (content === state.lastContent) return;
        state.lastContent = content;

        T.fetchJSON('/api/wx/preview', {
            method: 'POST',
            body: { content: content, type: state.msgType },
        }).then(function(data) {
            if (data.status === 'ok') {
                previewContent.innerHTML = data.html || '<span style="color:#86868b;">预览内容为空</span>';
            }
        }).catch(function(e) {
            console.error('预览渲染失败', e);
        });
    }

    // ============================================================
    // 导出（填充示例变量）
    // ============================================================
    function exportWithSamples() {
        T.fetchJSON('/api/wx/export', {
            method: 'POST',
            body: { content: editor.value },
        }).then(function(data) {
            if (data.status === 'ok') {
                editor.value = data.text;
                state.lastContent = '';
                refreshPreview();
                updateStatus();
                T.showToast('已用示例数据填充所有变量');
            }
        }).catch(function(e) {
            console.error('导出失败', e);
        });
    }

    // ============================================================
    // 状态更新
    // ============================================================
    function updateStatus() {
        var text = editor.value;
        var pos = editor.selectionStart;

        var before = text.substring(0, pos);
        var lines = before.split('\n');
        var row = lines.length;
        var col = lines[lines.length - 1].length + 1;

        cursorInfo.textContent = '行 ' + row + ', 列 ' + col;

        var byteLen = new TextEncoder().encode(text).length;
        var maxBytes = 4096;
        charCount.textContent = text.length + ' 字 / ' + byteLen + ' 字节 (上限 4096)';

        charCount.classList.remove('warning', 'danger');
        if (byteLen > maxBytes) {
            charCount.classList.add('danger');
        } else if (byteLen > maxBytes * 0.85) {
            charCount.classList.add('warning');
        }
    }

    function updateToolbarState() {
        var start = editor.selectionStart;
        var end = editor.selectionEnd;
        var selected = editor.value.substring(start, end);
        var btnBold = $('#btnBold');
        if (selected.indexOf('**') === 0 && selected.lastIndexOf('**') === selected.length - 2 && selected.length > 4) {
            btnBold.dataset.active = 'true';
        } else {
            btnBold.dataset.active = 'false';
        }
    }

    // ============================================================
    // 消息类型切换
    // ============================================================
    function setMsgType(type) {
        state.msgType = type;
        $$('.msg-type-btn').forEach(function(b) {
            b.classList.toggle('active', b.dataset.type === type);
        });
        msgTypeBadge.textContent = type === 'markdown' ? 'Markdown' : 'Markdown V2';

        var colorGroup = $('#colorGroup');
        var colorDivider = $('#colorDivider');
        var quoteGroup = $('#quoteGroup');

        if (type === 'markdown_v2') {
            if (colorGroup) colorGroup.style.display = 'none';
            if (colorDivider) colorDivider.style.display = 'none';
            if (quoteGroup) {
                quoteGroup.innerHTML = '<button class="tool-btn" id="btnQuote" title="一级引用">❝</button>' +
                    '<button class="tool-btn" id="btnQuote2" title="二级引用">❞</button>' +
                    '<button class="tool-btn" id="btnQuote3" title="三级引用">❞❞</button>';
                bindQuoteButtons();
            }
        } else {
            if (colorGroup) colorGroup.style.display = '';
            if (colorDivider) colorDivider.style.display = '';
            if (quoteGroup) {
                quoteGroup.innerHTML = '<button class="tool-btn" id="btnQuote" title="引用 (>)">❝</button>';
                bindQuoteButtons();
            }
        }

        state.lastContent = '';
        refreshPreview();
    }

    function bindQuoteButtons() {
        var btn = $('#btnQuote');
        if (btn) {
            btn.onclick = function() { toggleQuoteLevel(1); };
        }
        var btn2 = $('#btnQuote2');
        if (btn2) {
            btn2.onclick = function() { toggleQuoteLevel(2); };
        }
        var btn3 = $('#btnQuote3');
        if (btn3) {
            btn3.onclick = function() { toggleQuoteLevel(3); };
        }
    }

    // ── 标题弹窗 ──
    function toggleHeadingPopover() {
        var pop = $('#headingPopover');
        if (pop) pop.style.display = pop.style.display === 'none' ? 'block' : 'none';
    }

    function closeHeadingPopover() {
        var pop = $('#headingPopover');
        if (pop) pop.style.display = 'none';
    }

    // ============================================================
    // 示例模板数据
    // ============================================================
    var EXAMPLE_TEMPLATES = [
        {
            name: '📋 捷报通报（公司+个人+团队完整版）',
            content: '<font color="warning">**捷报！捷报！全员看过来！！(本月剩余天数：{days}天)**</font>\n>销冠的单，可能会迟到，但永远不会缺席！\n掌声祝贺{CompanyName}：今日第<font color="warning">**{companyOrderNum}**</font>单；本月第<font color="warning">**{companyOrderNumMonth}**</font>单；今日任务<font color="warning">**{dayTask}**</font>；今日累计业绩<font color="warning">**{totalAmountDay}**</font>；本月任务<font color="warning">**{monthTask}**</font>；本月累计业绩<font color="warning">**{totalAmountMonth}**</font>；本月业绩差额<font color="info">**{companyMonthTaskDiff}**</font>；本月完成率<font color="warning">**{companyMonthTaskRate}**</font>；本月代账第<font color="warning">**{companyAccountNumMonth}**单</font>！\n签单人：<font color="warning">**{SalesmanName}**</font>，签定本月第<font color="warning">**{orderNum}**</font>单；今日任务<font color="warning">**{dayPersonTask}**</font>；今日累计业绩<font color="warning">**{totalAmountDay1}**</font>；本月任务<font color="warning">**{monthPersonTask}**</font>；本月累计业绩<font color="warning">**{totalAmountMonth1}**</font>；本月业绩差额<font color="info">**{personMonthTaskDiff}**</font>；本月完成率<font color="warning">**{personMonthTaskRate}**</font>；本月代账第<font color="warning">**{accountNumMonth}**单</font>！\n签单团队：<font color="warning">**{departmentName}**</font>，签定本月第<font color="warning">**{teamOrderNum}**</font>单；今日任务<font color="warning">**{teamDayTask}**</font>；今日累计业绩<font color="warning">**{teamAmountDay}**</font>；本月任务<font color="warning">**{teamMonthTask}**</font>；本月累计业绩<font color="warning">**{teamAmountMonth}**</font>；本月业绩差额<font color="info">**{teamMonthTaskDiff}**</font>；本月完成率<font color="warning">**{teamMonthTaskRate}**</font>！\n客户名称：{Customer}\n客户来源：{CustomerSource}\nSEM来源：{semSource}\n关键词：{keyword}\n签单产品：{ProductName}\n签单类型：{SigningType}\n收款时间：{TaxationFormDate}\n合同金额：<font color="warning">**{ContactAmount}**</font>\n实际收款：<font color="warning">**{Amount}**</font>\n签单业绩：<font color="warning">**{PerformanceAmount}**</font>\n备注：<font color="info">**{Remark}**</font>\n你是能震山的虎、有远见的鹰、最善战的狼！\n你是销售中心开单王！！\n继续加油，再接再厉，勇创新高！'
        },
        {
            name: '📢 捷报速报（简洁版）',
            content: '<font color="warning">**捷报！捷报！！(本月剩余{days}天)**</font>\n> 掌声祝贺{CompanyName}：今日第<font color="warning">**{companyOrderNum}**</font>单；本月第<font color="warning">**{companyOrderNumMonth}**</font>单\n签单人：<font color="warning">**{SalesmanName}**</font>，本月第<font color="warning">**{orderNum}**</font>单\n签单团队：<font color="warning">**{departmentName}**</font>\n客户名称：{Customer}\n签单产品：{ProductName}\n合同金额：<font color="warning">**{ContactAmount}**</font>\n实际收款：<font color="warning">**{Amount}**</font>\n继续加油，再接再厉，勇创新高！'
        },
        {
            name: '📊 业绩日报模板',
            content: '# 业绩日报 ({days}天倒计时)\n\n**公司维度**\n- 今日任务：{dayTask}\n- 今日累计业绩：<font color="warning">**{totalAmountDay}**</font>\n- 本月累计业绩：<font color="warning">**{totalAmountMonth}**</font>\n- 本月完成率：<font color="info">**{companyMonthTaskRate}**</font>\n\n**个人维度**\n- 签单人：{SalesmanName}（本月第{orderNum}单）\n- 今日累计：<font color="warning">**{totalAmountDay1}**</font>\n- 本月完成率：<font color="info">**{personMonthTaskRate}**</font>\n\n> 数据更新时间：{TaxationFormDate}'
        },
    ];

    // ============================================================
    // 模板持久化管理
    // ============================================================
    var STORAGE_KEY = 'wx_template_saved';

    function getSavedTemplates() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch(e) { return []; }
    }

    function saveTemplatesToStorage(templates) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    }

    function refreshTemplateSelect() {
        var sel = $('#templateSelect');
        if (!sel) return;
        var saved = getSavedTemplates();

        sel.innerHTML = '<option value="">我的模板...</option>';

        if (EXAMPLE_TEMPLATES.length > 0) {
            var optgroup1 = document.createElement('optgroup');
            optgroup1.label = '📦 示例模板';
            EXAMPLE_TEMPLATES.forEach(function(t, i) {
                var opt = document.createElement('option');
                opt.value = '__example__' + i;
                opt.textContent = t.name;
                optgroup1.appendChild(opt);
            });
            sel.appendChild(optgroup1);
        }

        if (saved.length > 0) {
            var optgroup2 = document.createElement('optgroup');
            optgroup2.label = '💾 我的模板';
            saved.forEach(function(t, i) {
                var opt = document.createElement('option');
                opt.value = '__saved__' + i;
                opt.textContent = t.name;
                optgroup2.appendChild(opt);
            });
            sel.appendChild(optgroup2);
        }
    }

    function loadTemplateByName(value) {
        if (!value) return;
        var content = null, name = '';

        if (value.indexOf('__example__') === 0) {
            var idx = parseInt(value.replace('__example__', ''));
            content = EXAMPLE_TEMPLATES[idx].content;
            name = EXAMPLE_TEMPLATES[idx].name;
        } else if (value.indexOf('__saved__') === 0) {
            var idx2 = parseInt(value.replace('__saved__', ''));
            var saved = getSavedTemplates();
            content = saved[idx2].content;
            name = saved[idx2].name;
        }

        if (content) {
            editor.value = content;
            state.lastContent = '';
            refreshPreview();
            updateStatus();
            T.showToast('已加载模板：' + name);
            setTimeout(function() { $('#templateSelect').value = ''; }, 200);
        }
    }

    function openSaveModal() {
        if (!editor.value.trim()) {
            T.showToast('模板内容为空，无法保存');
            return;
        }
        var input = $('#saveModalInput');
        input.value = '';
        var existingSaved = getSavedTemplates();
        if (existingSaved.length === 1) {
            input.placeholder = '例如：' + existingSaved[0].name;
        } else {
            input.placeholder = '输入模板名称...';
        }
        T.openModal('#saveModal');
        input.focus();
    }

    function confirmSaveTemplate() {
        var name = $('#saveModalInput').value.trim();
        if (!name) { T.showToast('请输入模板名称'); return; }

        var saved = getSavedTemplates();
        var existingIdx = saved.findIndex(function(t) { return t.name === name; });
        var now = new Date().toISOString().slice(0, 16).replace('T', ' ');

        if (existingIdx >= 0) {
            saved[existingIdx].content = editor.value;
            saved[existingIdx].updatedAt = now;
        } else {
            saved.push({ name: name, content: editor.value, createdAt: now, updatedAt: now });
        }

        saveTemplatesToStorage(saved);
        T.closeModal('#saveModal');
        refreshTemplateSelect();
        T.showToast('模板"' + name + '"已保存');
    }

    function deleteSelectedTemplate() {
        var saved = getSavedTemplates();
        if (saved.length === 0) {
            T.showToast('没有可删除的模板');
            return;
        }

        if (saved.length === 1) {
            if (!confirm('确定删除模板"' + saved[0].name + '"？此操作不可撤销。')) return;
            saveTemplatesToStorage([]);
            refreshTemplateSelect();
            T.showToast('模板已删除');
            return;
        }

        var names = saved.map(function(t, i) { return (i + 1) + '. ' + t.name; }).join('\n');
        var choice = prompt('选择要删除的模板（输入序号）：\n\n' + names);
        if (!choice) return;
        var idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= saved.length) {
            T.showToast('无效的选择');
            return;
        }
        var delName = saved[idx].name;
        if (!confirm('确定删除模板"' + delName + '"？')) return;
        saved.splice(idx, 1);
        saveTemplatesToStorage(saved);
        refreshTemplateSelect();
        T.showToast('模板"' + delName + '"已删除');
    }

    // ============================================================
    // 事件绑定
    // ============================================================
    function bindEvents() {
        // 缓存选区
        editor.addEventListener('blur', function() {
            state.savedSelection = { start: editor.selectionStart, end: editor.selectionEnd };
        });

        var toolbar = $('#toolbar');
        if (toolbar) {
            toolbar.addEventListener('mousedown', function() {
                state.savedSelection = { start: editor.selectionStart, end: editor.selectionEnd };
            });
        }

        // 编辑器输入
        editor.addEventListener('input', function() {
            schedulePreview();
            updateStatus();
            updateToolbarState();
        });

        editor.addEventListener('click', function() {
            state.savedSelection = null;
            updateStatus();
            updateToolbarState();
        });

        editor.addEventListener('keyup', function() {
            state.savedSelection = null;
            updateStatus();
            updateToolbarState();
        });

        editor.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                toggleBold();
            }
        });

        // 工具栏
        bindButton('#btnBold', toggleBold);
        bindButton('#btnQuote', toggleQuote);
        bindButton('#btnLink', insertLink);
        bindButton('#btnClearFormat', clearFormat);

        // 标题弹窗
        bindButton('#btnHeading', function(e) {
            e.stopPropagation();
            toggleHeadingPopover();
        });

        $$('.heading-opt').forEach(function(btn) {
            btn.addEventListener('mousedown', function(e) {
                e.preventDefault();
                applyHeading(parseInt(btn.dataset.level));
            });
        });

        document.addEventListener('click', function(e) {
            if (!e.target.closest('#headingPopover') && !e.target.closest('#btnHeading')) {
                closeHeadingPopover();
            }
        });

        // 颜色选择
        $$('.color-swatch').forEach(function(sw) {
            sw.addEventListener('click', function() {
                applyColor(sw.dataset.color);
                $$('.color-swatch').forEach(function(s) { s.classList.remove('active'); });
                sw.classList.add('active');
            });
        });

        // 消息类型
        $$('.msg-type-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { setMsgType(btn.dataset.type); });
        });

        // 刷新/导出
        bindButton('#btnRefresh', function() {
            state.lastContent = '';
            refreshPreview();
            T.showToast('预览已刷新');
        });
        bindButton('#btnExport', exportWithSamples);

        // 变量搜索
        var varSearchInput = $('#varSearchInput');
        if (varSearchInput) {
            varSearchInput.addEventListener('input', function() {
                state.searchQuery = this.value;
                renderVariables(state.searchQuery);
            });
        }

        // 模板管理
        bindButton('#btnSaveTemplate', openSaveModal);
        bindButton('#btnDeleteTemplate', deleteSelectedTemplate);
        var templateSelect = $('#templateSelect');
        if (templateSelect) {
            templateSelect.addEventListener('change', function() {
                if (this.value) loadTemplateByName(this.value);
            });
        }
        bindButton('#btnCancelSave', function() { T.closeModal('#saveModal'); });
        bindButton('#btnConfirmSave', confirmSaveTemplate);
    }

    function bindButton(selector, handler) {
        var el = $(selector);
        if (el) el.addEventListener('click', handler);
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        injectNavExtras();
        cacheDOMElements();
        renderVariables();
        bindEvents();
        bindQuoteButtons();
        refreshTemplateSelect();
        updateStatus();

        // 加载模板
        var saved = getSavedTemplates();
        if (saved.length > 0) {
            var latest = saved.reduce(function(a, b) { return a.updatedAt > b.updatedAt ? a : b; });
            editor.value = latest.content;
            T.showToast('已加载最近模板：' + latest.name);
        } else {
            editor.value = '<font color="warning">**捷报！捷报！全员看过来！！(本月剩余天数：{days}天)**</font>\n> 销冠的单，可能会迟到，但永远不会缺席！\n掌声祝贺{CompanyName}：今日第<font color="warning">**{companyOrderNum}**</font>单；本月第<font color="warning">**{companyOrderNumMonth}**</font>单\n\n签单人：<font color="warning">**{SalesmanName}**</font>，本月第<font color="warning">**{orderNum}**</font>单\n签单团队：<font color="warning">**{departmentName}**</font>\n\n客户名称：{Customer}\n客户来源：{CustomerSource}\n签单产品：{ProductName}\n签单类型：{SigningType}\n合同金额：<font color="warning">**{ContactAmount}**</font>\n实际收款：<font color="warning">**{Amount}**</font>\n签单业绩：<font color="warning">**{PerformanceAmount}**</font>\n\n你是最善战的狼！继续加油，再接再厉，勇创新高！';
        }

        state.lastContent = '';
        refreshPreview();
        updateStatus();
    }

    // 页面就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

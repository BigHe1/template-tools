/**
 * 合同模板编辑器 — 核心逻辑
 * 依赖: TemplateTools (common.js)
 */
(function() {
    'use strict';

    var T = TemplateTools;
    var $ = T.$, $$ = T.$$;

    // ============================================================
    // 状态
    // ============================================================
    var selectedFile = null;
    var wordResultBlob = null;
    var wordResultFilename = '';
    var lastHtmlResult = '';

    // ============================================================
    // 日志
    // ============================================================
    function addLog(msg, type) {
        type = type || 'info';
        var area = $('#logArea');
        if (!area) return;
        var entry = document.createElement('div');
        entry.className = 'log-entry ' + type;
        var now = new Date();
        var ts = ('0' + now.getHours()).slice(-2) + ':' +
            ('0' + now.getMinutes()).slice(-2) + ':' +
            ('0' + now.getSeconds()).slice(-2);
        entry.textContent = '[' + ts + '] ' + msg;
        area.appendChild(entry);
        area.scrollTop = area.scrollHeight;
    }

    function clearLog() {
        var area = $('#logArea');
        if (area) area.innerHTML = '';
    }

    // ============================================================
    // HTML 处理
    // ============================================================
    function processHtml() {
        var content = $('#htmlInput').value.trim();
        if (!content) {
            T.showToast('请先输入 HTML 内容');
            return;
        }

        var checkboxText = $('#checkboxNumbers').value.trim();
        addLog('开始处理 HTML...', 'info');

        T.fetchJSON('/api/contract/process-html', {
            method: 'POST',
            body: { content: content, checkbox_numbers: checkboxText },
        }).then(function(data) {
            if (data.status === 'ok') {
                $('#htmlOutput').textContent = data.html;
                lastHtmlResult = data.html;

                // 显示统计
                var stats = data.stats;
                var statsRow = $('#htmlStats');
                if (statsRow) statsRow.style.display = 'flex';
                $('#statTotal').textContent = stats.total;
                $('#statCheck').textContent = stats.checkboxes;
                $('#statInput').textContent = stats.text_inputs;

                // 同步日志
                if (data.logs) {
                    data.logs.forEach(function(l) { addLog(l, 'success'); });
                }
                T.showToast('处理完成：' + stats.total + ' 个占位符');
            } else {
                addLog(data.message || '处理失败', 'error');
                T.showToast(data.message || '处理失败');
            }
        }).catch(function(e) {
            addLog('请求失败: ' + e.message, 'error');
            T.showToast('服务器请求失败');
        });
    }

    function copyHtmlResult() {
        if (!lastHtmlResult) {
            T.showToast('请先处理 HTML');
            return;
        }
        T.copyToClipboard(lastHtmlResult);
        addLog('HTML 结果已复制到剪贴板', 'success');
    }

    function downloadHtmlResult() {
        if (!lastHtmlResult) {
            T.showToast('请先处理 HTML');
            return;
        }
        var blob = new Blob([lastHtmlResult], { type: 'text/html;charset=utf-8' });
        T.downloadBlob(blob, 'contract_processed.html');
        addLog('HTML 文件已下载', 'success');
    }

    function pasteFromClipboard() {
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText().then(function(text) {
                if (text) {
                    $('#htmlInput').value = text;
                    T.showToast('已从剪贴板粘贴');
                    addLog('HTML 内容已从剪贴板粘贴', 'info');
                }
            }).catch(function() {
                T.showToast('无法读取剪贴板，请手动粘贴');
            });
        } else {
            T.showToast('浏览器不支持自动粘贴，请使用 Ctrl+V');
        }
    }

    function clearHtmlInput() {
        $('#htmlInput').value = '';
        $('#htmlOutput').textContent = '';
        lastHtmlResult = '';
        var statsRow = $('#htmlStats');
        if (statsRow) statsRow.style.display = 'none';
        T.showToast('已清空');
    }

    // ============================================================
    // Word 文档处理
    // ============================================================
    function handleFileSelect(e) {
        var file = e.target.files[0];
        if (!file) return;

        selectedFile = file;
        var uploadZone = $('#uploadZone');
        var fileName = $('#selectedFileName');

        if (uploadZone) uploadZone.classList.add('has-file');
        if (fileName) {
            fileName.textContent = file.name + ' (' + formatFileSize(file.size) + ')';
            fileName.style.display = 'block';
        }

        $('#btnProcessWord').disabled = false;
        addLog('已选择文件: ' + file.name, 'info');
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    function processWord() {
        if (!selectedFile) {
            T.showToast('请先选择 Word 文件');
            return;
        }

        var ph1 = $('#wordPh1').value.trim() || '▦▦';
        var ph2 = $('#wordPh2').value.trim() || '??';

        addLog('开始处理 Word 文档... 占位符: ' + ph1 + ', ' + ph2, 'info');
        $('#wordStatus').textContent = '处理中...';

        var formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('ph1', ph1);
        formData.append('ph2', ph2);

        fetch('/api/contract/process-word', {
            method: 'POST',
            body: formData,
        }).then(function(resp) {
            return resp.json();
        }).then(function(data) {
            if (data.status === 'ok') {
                addLog(data.message || '处理成功', 'success');
                $('#wordStatus').textContent = '完成';

                var resultBox = $('#wordResult');
                if (resultBox) {
                    resultBox.innerHTML = '<span class="highlight">✓ 替换完成</span><br>' +
                        '共替换 <span class="highlight">' + data.total + '</span> 处<br>' +
                        '复选框位置: <span class="highlight">' +
                        (data.checkbox_numbers && data.checkbox_numbers.length > 0
                            ? data.checkbox_numbers.join(', ') : '无') + '</span>';
                }

                // 保存结果元数据，供下载用
                wordResultBlob = null;
                wordResultFilename = data.filename || 'processed.docx';

                var wordActions = $('#wordActions');
                if (wordActions) wordActions.style.display = 'block';

                // 自动同步复选框数字到 HTML 处理
                if (data.checkbox_numbers && data.checkbox_numbers.length > 0) {
                    $('#checkboxNumbers').value = data.checkbox_numbers.join(',');
                    addLog('已自动填入复选框数字', 'info');
                }

                T.showToast('文档处理完成');
            } else {
                addLog(data.message || '处理失败', 'error');
                $('#wordStatus').textContent = '失败';
                T.showToast(data.message || '处理失败');
            }
        }).catch(function(e) {
            addLog('请求失败: ' + e.message, 'error');
            $('#wordStatus').textContent = '错误';
            T.showToast('服务器请求失败');
        });
    }

    function downloadWordResult() {
        // 重新请求下载
        if (!selectedFile) {
            T.showToast('请先选择 Word 文件');
            return;
        }

        var ph1 = $('#wordPh1').value.trim() || '▦▦';
        var ph2 = $('#wordPh2').value.trim() || '??';

        addLog('正在准备下载...', 'info');

        var formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('ph1', ph1);
        formData.append('ph2', ph2);
        formData.append('download', '1');

        fetch('/api/contract/process-word', {
            method: 'POST',
            body: formData,
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var disposition = resp.headers.get('Content-Disposition');
            var filename = 'processed.docx';
            if (disposition) {
                var match = disposition.match(/filename="?(.+?)"?$/);
                if (match) filename = match[1];
            }
            return resp.blob().then(function(blob) { return { blob: blob, filename: filename }; });
        }).then(function(result) {
            T.downloadBlob(result.blob, result.filename);
            addLog('文档已下载: ' + result.filename, 'success');
            T.showToast('文档已开始下载');
        }).catch(function(e) {
            addLog('下载失败: ' + e.message, 'error');
            T.showToast('下载失败');
        });
    }

    // ============================================================
    // 事件绑定
    // ============================================================
    function bindEvents() {
        // HTML 处理
        bindClick('#btnProcessHtml', processHtml);
        bindClick('#btnCopyResult', copyHtmlResult);
        bindClick('#btnDownloadHtml', downloadHtmlResult);
        bindClick('#btnPasteHtml', pasteFromClipboard);
        bindClick('#btnClearHtml', clearHtmlInput);

        // Word 处理
        var fileInput = $('#wordFileInput');
        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelect);
        }

        var uploadZone = $('#uploadZone');
        if (uploadZone) {
            uploadZone.addEventListener('click', function() {
                fileInput.click();
            });
            // 拖拽支持
            uploadZone.addEventListener('dragover', function(e) {
                e.preventDefault();
                uploadZone.style.borderColor = 'var(--accent)';
                uploadZone.style.background = 'var(--accent-light)';
            });
            uploadZone.addEventListener('dragleave', function(e) {
                e.preventDefault();
                uploadZone.style.borderColor = selectedFile ? 'var(--success)' : 'var(--border)';
                uploadZone.style.background = selectedFile ? 'rgba(52,199,89,0.06)' : 'var(--bg-tertiary)';
            });
            uploadZone.addEventListener('drop', function(e) {
                e.preventDefault();
                uploadZone.style.borderColor = selectedFile ? 'var(--success)' : 'var(--border)';
                uploadZone.style.background = selectedFile ? 'rgba(52,199,89,0.06)' : 'var(--bg-tertiary)';
                if (e.dataTransfer.files.length > 0) {
                    fileInput.files = e.dataTransfer.files;
                    handleFileSelect({ target: { files: e.dataTransfer.files } });
                }
            });
        }

        bindClick('#btnProcessWord', processWord);
        bindClick('#btnDownloadWord', downloadWordResult);
        bindClick('#btnClearLog', clearLog);

        // 快捷键
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                processHtml();
            }
        });

        addLog('合同模板编辑器就绪', 'info');
    }

    function bindClick(selector, handler) {
        var el = $(selector);
        if (el) el.addEventListener('click', handler);
    }

    // ============================================================
    // 初始化
    // ============================================================
    function init() {
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/**
 * 模板工具集 — 共享 JavaScript 模块
 * 主题切换 · Toast 通知 · 弹窗 · 剪贴板 · AJAX 工具
 */

const TemplateTools = (function() {
    'use strict';

    // ── DOM 工具 ──
    const $ = (sel, ctx) => (ctx || document).querySelector(sel);
    const $$ = (sel, ctx) => (ctx || document).querySelectorAll(sel);

    // ── 主题管理 ──
    const THEME_KEY = 'template_tools_theme';

    function getTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'dark' || saved === 'light') return saved;
        // 跟随系统偏好
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function setTheme(theme) {
        document.body.dataset.theme = theme;
        localStorage.setItem(THEME_KEY, theme);
        updateThemeToggleIcon(theme);
    }

    function toggleTheme() {
        const current = getTheme();
        const next = current === 'light' ? 'dark' : 'light';
        setTheme(next);
    }

    function updateThemeToggleIcon(theme) {
        const btn = $('#themeToggle');
        if (btn) {
            btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色主题' : '切换到深色主题');
        }
    }

    // ── Toast 通知 ──
    let toastTimer = null;

    function showToast(msg, duration) {
        duration = duration || 1800;
        const toast = $('#toast');
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            toast.classList.remove('show');
        }, duration);
    }

    // ── 弹窗 ──
    function openModal(modalId) {
        const modal = $(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    function closeModal(modalId) {
        const modal = $(modalId);
        if (modal) modal.classList.add('hidden');
    }

    // ── 剪贴板复制 ──
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(function() {
                showToast('已复制到剪贴板');
            }).catch(function() {
                fallbackCopy(text);
            });
        } else {
            return fallbackCopy(text);
        }
    }

    function fallbackCopy(text) {
        return new Promise(function(resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showToast('已复制到剪贴板');
                resolve();
            } catch (e) {
                showToast('复制失败，请手动复制');
                reject(e);
            }
            document.body.removeChild(ta);
        });
    }

    // ── AJAX 封装 ──
    function fetchJSON(url, options) {
        options = options || {};
        return fetch(url, {
            method: options.method || 'GET',
            headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
            body: options.body ? JSON.stringify(options.body) : undefined,
        }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        });
    }

    // ── 文件上传 ──
    function uploadFile(url, file, extraFields) {
        var formData = new FormData();
        formData.append('file', file);
        if (extraFields) {
            Object.keys(extraFields).forEach(function(key) {
                formData.append(key, extraFields[key]);
            });
        }
        return fetch(url, { method: 'POST', body: formData }).then(function(resp) {
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.json();
        });
    }

    // ── 文件下载 ──
    function downloadBlob(blob, filename) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ── 高亮当前工具页面 ──
    function highlightActiveTab() {
        var path = window.location.pathname;
        $$('.tool-tab').forEach(function(tab) {
            var href = tab.getAttribute('href');
            if (href && path.startsWith(href)) {
                tab.classList.add('active');
            }
        });
    }

    // ── 初始化 ──
    function init() {
        // 加载并应用主题
        var theme = getTheme();
        setTheme(theme);

        // 绑定主题切换按钮
        var toggleBtn = $('#themeToggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', toggleTheme);
        }

        // 高亮当前工具
        highlightActiveTab();

        // 弹窗关闭：点击遮罩
        $$('.modal-overlay').forEach(function(overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay) {
                    overlay.classList.add('hidden');
                }
            });
        });

        // ESC 关闭弹窗
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                $$('.modal-overlay:not(.hidden)').forEach(function(m) {
                    m.classList.add('hidden');
                });
            }
        });
    }

    // 页面就绪后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ── 公开 API ──
    return {
        $: $,
        $$: $$,
        getTheme: getTheme,
        setTheme: setTheme,
        toggleTheme: toggleTheme,
        showToast: showToast,
        openModal: openModal,
        closeModal: closeModal,
        copyToClipboard: copyToClipboard,
        fetchJSON: fetchJSON,
        uploadFile: uploadFile,
        downloadBlob: downloadBlob,
    };
})();

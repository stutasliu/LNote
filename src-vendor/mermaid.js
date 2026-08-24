/* =========================================================
 * src-vendor/mermaid.js —— mermaid 独立懒加载包
 *
 * mermaid（约 2.5MB）是启动 bundle 里最大的依赖，且只在用户
 * 真正渲染「流程图 / 思维导图 / mermaid 块」时才需要。因此把它
 * 从 vendor-bundle.js 拆出，启动时不加载，由 index.html 中的
 * window.__mermaidReady(cb) 在首次需要时动态注入并初始化。
 * ========================================================= */
import mermaid from 'mermaid';
window.mermaid = mermaid;
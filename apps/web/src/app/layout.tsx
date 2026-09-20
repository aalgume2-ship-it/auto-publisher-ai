import type { Metadata } from 'next';
import './globals.css';
import './studio.css';
import '../components/creative/creative.css';
import ErrorBoundary from '../components/ErrorBoundary';
import HydrationMarker from '../components/HydrationMarker';

export const metadata: Metadata = {
  title: 'Lumen — AI Marketing Studio',
  description: 'حوّل منتجك إلى حملة تسويقية كاملة بالذكاء الاصطناعي: فيديوهات، تصاميم، نصوص، كابشنز ونشر.',
};

/**
 * Boot sentinel — inline (chunk-independent) watchdog. Surfaces a red bar
 * when scripts fail to load, the app crashes at runtime, or React never
 * hydrates, so users see the real problem instead of dead buttons.
 */
const bootSentinel = `(function(){
  var shown = false;
  function bar(msg){
    if (shown) return; shown = true;
    var d = document.createElement('div');
    d.id = 'lumen-boot-bar';
    d.setAttribute('dir','rtl');
    d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#b3261e;color:#fff;font:600 14px system-ui,sans-serif;padding:12px 16px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.45)';
    d.appendChild(document.createTextNode(msg + ' '));
    var b = document.createElement('button');
    b.textContent = '\\u21bb إعادة التحميل';
    b.style.cssText = 'margin-inline-start:10px;padding:6px 14px;border:0;border-radius:8px;background:#fff;color:#b3261e;font:700 13px system-ui;cursor:pointer';
    b.onclick = function(){
      try { if (window.caches && caches.keys) { caches.keys().then(function(ks){ ks.forEach(function(k){ caches.delete(k); }); }); } } catch(e){}
      location.reload();
    };
    d.appendChild(b);
    var add = function(){ document.body.appendChild(d); };
    document.body ? add() : document.addEventListener('DOMContentLoaded', add);
  }
  window.addEventListener('error', function(e){
    if (e && e.target && e.target.tagName === 'SCRIPT' && e.target.src) {
      bar('\\u26a0\\ufe0f تعذّر تحميل ملفات الموقع (شبكة أو ذاكرة مؤقتة).');
      return;
    }
    if (e && e.message) bar('\\u26a0\\ufe0f خطأ في تشغيل الموقع: ' + e.message);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var m = e && e.reason && e.reason.message ? String(e.reason.message) : '';
    if (m) bar('\\u26a0\\ufe0f خطأ: ' + m);
  });
  setTimeout(function(){
    if (!window.__lumen_hydrated) {
      bar('\\u26a0\\ufe0f لم يكتمل تشغيل الموقع. اضغط إعادة التحميل \\u2014 وإن تكرر: Ctrl+Shift+R');
    }
  }, 6000);
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&family=Noto+Kufi+Arabic:wght@400;500;700;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: bootSentinel }} />
      </head>
      <body>
        <HydrationMarker />
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </body>
    </html>
  );
}

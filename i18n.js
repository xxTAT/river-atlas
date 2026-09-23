const RIVER_LANGUAGE_KEY = 'river-atlas-language';
let storedRiverLanguage = '';
try { storedRiverLanguage = localStorage.getItem(RIVER_LANGUAGE_KEY) || ''; } catch (error) { storedRiverLanguage = ''; }
const riverLanguage = storedRiverLanguage === 'zh' ? 'zh' : 'en';

function applyRiverLanguage() {
  document.documentElement.lang = riverLanguage === 'zh' ? 'zh-CN' : 'en';
  if (riverLanguage === 'zh') {
    const titles = { home: 'RIVER RNA 结构图谱', results: '结果探索 · RIVER Atlas', viewer: '在线结构可视化 · RIVER Atlas', heatmap: '互作热图 · RIVER Atlas', structure: '结构详情 · RIVER Atlas', content: document.title };
    document.title = titles[document.body?.dataset.page] || document.title;
  }
  if (riverLanguage === 'zh') {
    document.querySelectorAll('[data-zh]').forEach((element) => { element.textContent = element.dataset.zh; });
    document.querySelectorAll('[data-zh-html]').forEach((element) => { element.innerHTML = element.dataset.zhHtml; });
    document.querySelectorAll('[data-zh-placeholder]').forEach((element) => { element.placeholder = element.dataset.zhPlaceholder; });
    document.querySelectorAll('[data-zh-aria-label]').forEach((element) => { element.setAttribute('aria-label', element.dataset.zhAriaLabel); });
    document.querySelectorAll('[data-zh-title]').forEach((element) => { element.title = element.dataset.zhTitle; });
  }
  const nav = document.querySelector('.nav-wrap');
  if (!nav || nav.querySelector('.language-switch')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'language-switch';
  button.textContent = riverLanguage === 'zh' ? 'EN' : '中文';
  button.setAttribute('aria-label', riverLanguage === 'zh' ? 'Switch to English' : '切换到中文版');
  button.title = riverLanguage === 'zh' ? 'English' : '中文版';
  button.addEventListener('click', () => {
    try { localStorage.setItem(RIVER_LANGUAGE_KEY, riverLanguage === 'zh' ? 'en' : 'zh'); } catch (error) {}
    window.location.reload();
  });
  nav.appendChild(button);
}

window.RiverI18n = {
  language: riverLanguage,
  isChinese: riverLanguage === 'zh',
  pick: (english, chinese) => riverLanguage === 'zh' ? chinese : english
};

applyRiverLanguage();

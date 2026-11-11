import { useLang } from '../i18n.js';

export default function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button type="button" className={lang === 'en' ? 'on' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
      <button type="button" className={lang === 'zh' ? 'on' : ''} aria-pressed={lang === 'zh'} onClick={() => setLang('zh')}>中文</button>
    </div>
  );
}

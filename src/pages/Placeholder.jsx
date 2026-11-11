// A page that exists in the live Creator app but has not been built here yet. It is honest about that, and it
// lists what the live page has, so nothing is forgotten when it is built. The parity test treats these pages as
// "not yet", and fails the moment one stops being a placeholder without being added to the checks.
export default function Placeholder({ spec }) {
  const list = (title, items) =>
    items.length > 0 && (
      <div className="ph-block">
        <h2>{title}</h2>
        <ul className="ph-chips">{items.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    );
  return (
    <section className="screen" data-placeholder="true">
      <header className="screen-head">
        <div>
          <h1>{spec.title || spec.label}</h1>
          <p className="muted">{spec.blurb}</p>
        </div>
      </header>
      <div className="ph-banner" role="note">
        <strong>Not built yet.</strong> This tab exists in the live Supply Chain App and is listed here so the menu matches. Below is what the live page has.
      </div>
      {list('Inner tabs', spec.tabs)}
      {list('Stat cards', spec.stats)}
      {list('Buttons', spec.buttons)}
      {list('Widgets', spec.widgets || [])}
    </section>
  );
}

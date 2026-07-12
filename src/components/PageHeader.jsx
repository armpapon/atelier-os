export function PageHeader({ eyebrow, title, em, sub, meta, actions }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="page-header__eyebrow">{eyebrow}</div>}
        <h1 className="page-header__title">
          {title}{em && <> <em>{em}</em></>}
        </h1>
        {sub && <div className="page-header__sub">{sub}</div>}
      </div>
      <div className="page-header__aside" style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        {meta && <div className="page-header__meta">{meta}</div>}
        {actions}
      </div>
    </div>
  );
}

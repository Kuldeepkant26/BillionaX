
export const PageHead = ({ title, subtitle, actions }) => (
  <header className="flex items-start justify-between gap-4 flex-wrap mb-5">
    <div>
      <h1 className="display text-[26px] tracking-[-0.6px]">{title}</h1>
      {subtitle && <p className="text-muted text-[12.5px] mt-1">{subtitle}</p>}
    </div>
    {actions && (
      <div className="flex items-center gap-[9px] flex-wrap [&_.input]:w-auto [&_.input]:min-w-[150px]">
        {actions}
      </div>
    )}
  </header>
);

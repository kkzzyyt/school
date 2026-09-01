interface PageHeadingProps {
  kicker?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function PageHeading({ kicker, title, description, action }: PageHeadingProps) {
  return (
    <div className="page-heading">
      <div>
        {kicker && <div className="page-kicker">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {action}
    </div>
  );
}

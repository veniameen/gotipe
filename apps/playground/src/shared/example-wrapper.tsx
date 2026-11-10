interface ExampleWrapperProps {
  title: string;
  description: string;
  tags?: string[];
  children: React.ReactNode;
}

export function ExampleWrapper({ title, description, tags, children }: ExampleWrapperProps) {
  return (
    <div className="gotipe-example-wrapper">
      <div className="gotipe-example-header">
        <div className="gotipe-example-heading">
          <h2 className="gotipe-example-title">{title}</h2>
          {tags?.map((tag) => (
            <span key={tag} className="gotipe-example-tag">
              {tag}
            </span>
          ))}
        </div>
        <p className="gotipe-example-description">{description}</p>
      </div>
      {children}
    </div>
  );
}

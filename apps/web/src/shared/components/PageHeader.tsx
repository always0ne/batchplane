type PageHeaderProps = {
  title: string;
  subtitle: string;
};

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6">
      <h1 className="text-3xl font-bold tracking-normal text-bp-graphite">
        {title}
      </h1>
      <p className="mt-2 max-w-3xl text-base text-bp-muted">{subtitle}</p>
    </header>
  );
}

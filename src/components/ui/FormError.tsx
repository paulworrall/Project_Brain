export function FormError({ children }: { children?: string | string[] }) {
  if (!children || (Array.isArray(children) && children.length === 0)) {
    return null;
  }

  const messages = Array.isArray(children) ? children : [children];

  return (
    <p className="mt-1.5 text-sm text-danger" role="alert">
      {messages.join(" ")}
    </p>
  );
}

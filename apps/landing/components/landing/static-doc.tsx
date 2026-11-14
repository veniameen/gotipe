import type { ReactNode } from "react";

/**
 * A document as the server sends it, in the library's own document markup (`gotipe-content`), so
 * it reads like the editor that replaces it and stays readable without JavaScript. Its title is an
 * `h2` drawn as the page title (`site-static-title`): the landing keeps a single `h1`.
 */
export function StaticDoc({ children }: { children: ReactNode }) {
  return (
    <div className="gotipe-editor site-static-doc">
      <div className="gotipe-content">{children}</div>
    </div>
  );
}

export function StaticTodos({ items }: { items: readonly (readonly [boolean, string])[] }) {
  return (
    <ul className="gotipe-todo-list">
      {items.map(([done, text]) => (
        <li key={text} className="gotipe-todo-item">
          <input type="checkbox" checked={done} disabled readOnly aria-label={text} />
          <span className="gotipe-todo-item-content">{text}</span>
        </li>
      ))}
    </ul>
  );
}

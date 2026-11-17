/**
 * The light of a primary call to action (styles/site.css): the rim's light behind the pill, lit at
 * its right end and, mirrored, at its left, and the lamp inside the pill. The lamp rests near the
 * pill's end and follows the pointer along it (motion/controller.tsx); the rim is lit at the end the
 * lamp is at. Decoration, hidden from assistive technology. The call carries `data-lamp`, its label
 * a span of its own.
 */
export function Lamp() {
  return (
    <>
      <span className="site-rim" aria-hidden="true">
        <span />
      </span>
      <span className="site-rim is-left" aria-hidden="true">
        <span />
      </span>
      <span className="site-lamp" aria-hidden="true" />
    </>
  );
}

/**
 * The light a second call catches from the lamp beside it (styles/site.css, `.site-catch`): a lit
 * near edge and a glow, as strong as the lamp is near. Decoration, hidden from assistive technology.
 */
export function Catch() {
  return <span className="site-catch" aria-hidden="true" />;
}
